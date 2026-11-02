"""JSON completions from the OpenAI-compatible relay.

Every configured model is asked at once; the first answer that parses as the expected JSON wins and the
rest are cancelled. Measured on this relay: single models spike from 1 s to 20 s, the race rarely does.
"""

import asyncio
import json
import logging
import re

import httpx

from . import config

log = logging.getLogger("llm")


class LLMError(RuntimeError):
    """No model produced usable output. The message is safe to show to users."""


def parse_json(text: str) -> dict:
    """Pulls the first JSON object out of a reply, tolerating code fences and leading prose."""
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in reply")
    return json.loads(text[start : end + 1])


async def _ask(client: httpx.AsyncClient, model: str, system: str, user: str, max_tokens: int) -> dict:
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": max_tokens,
        "temperature": 0.2,
        # GLM otherwise spends its budget reasoning and returns no content.
        "chat_template_kwargs": {"enable_thinking": False},
    }
    response = await client.post(
        f"{config.LLM_BASE_URL}/chat/completions",
        json=payload,
        headers={"Authorization": f"Bearer {config.LLM_API_KEY}"},
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"].get("content") or ""
    return parse_json(content)


async def _stream(client: httpx.AsyncClient, model: str, messages: list[dict[str, str]], max_tokens: int):
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.4,
        "stream": True,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    headers = {"Authorization": f"Bearer {config.LLM_API_KEY}"}
    async with client.stream("POST", f"{config.LLM_BASE_URL}/chat/completions", json=payload, headers=headers) as response:
        response.raise_for_status()
        async for line in response.aiter_lines():
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                return
            try:
                delta = json.loads(data)["choices"][0]["delta"]
            except (json.JSONDecodeError, KeyError, IndexError):
                continue
            if text := delta.get("content"):
                yield text


async def _first(stream) -> str:
    try:
        return await anext(stream)
    except StopAsyncIteration:
        raise RuntimeError("stream ended without any text") from None


async def stream_text(messages: list[dict[str, str]], max_tokens: int = 160):
    """Streams a short spoken reply. Every model starts at once; the first to produce text is used."""
    if not config.LLM_API_KEY:
        raise LLMError("The AI provider is not configured.")
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=5, read=20, write=5, pool=5)) as client:
        streams = {m: _stream(client, m, messages, max_tokens) for m in config.LLM_MODELS}
        pending = {asyncio.create_task(_first(s)): m for m, s in streams.items()}
        winner, first = None, None
        try:
            while pending and winner is None:
                done, _ = await asyncio.wait(pending, timeout=12, return_when=asyncio.FIRST_COMPLETED)
                if not done:
                    raise LLMError("The interviewer did not answer in time.")
                for task in done:
                    model = pending.pop(task)
                    if task.exception() is None and winner is None:
                        winner, first = model, task.result()
            if winner is None:
                raise LLMError("The interviewer could not answer.")
        finally:
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for model, s in streams.items():
                if model != winner:
                    await s.aclose()
        yield first
        async for piece in streams[winner]:
            yield piece


async def complete_json(system: str, user: str, max_tokens: int = 900) -> dict:
    if not config.LLM_API_KEY:
        raise LLMError("The AI provider is not configured.")
    async with httpx.AsyncClient(timeout=config.LLM_TIMEOUT_S) as client:
        tasks = {asyncio.create_task(_ask(client, m, system, user, max_tokens)): m for m in config.LLM_MODELS}
        try:
            for finished in asyncio.as_completed(tasks):
                try:
                    return await finished
                except Exception as error:  # noqa: BLE001  (one model failing is expected; try the next)
                    log.warning("model failed: %s", error)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
    raise LLMError("The AI provider did not answer. Please try again.")
