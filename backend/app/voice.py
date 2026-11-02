"""Voice routes: speech to text, the interviewer's streamed reply, and text to speech.

Models load in a background thread at startup, so the rest of the API answers immediately; until they are
ready these routes return 503 and the frontend falls back to the browser's own speech synthesis.
Audio passes through memory only and is never written to disk.
"""

import asyncio
import io
import json
import logging
import threading
import time

import numpy as np
import soundfile as sf
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from . import config, llm

log = logging.getLogger("voice")
router = APIRouter(prefix="/api/voice")

# One GPU: recognition and GPU synthesis take turns instead of fighting over VRAM.
gpu = threading.Lock()
state = {"ready": False, "error": None}


def load_in_background() -> None:
    def load() -> None:
        try:
            from . import speech

            with gpu:
                speech.load()
            state["ready"] = True
            log.info("voice models ready: %s", speech.describe())
        except Exception as error:  # noqa: BLE001  (missing GPU or model files must not take the API down)
            state["error"] = str(error)
            log.warning("voice models unavailable: %s", error)

    threading.Thread(target=load, name="voice-models", daemon=True).start()


def require_ready():
    if not state["ready"]:
        raise HTTPException(503, state["error"] or "Voice models are still loading.")
    from . import speech

    return speech


def on_gpu(fn, *args):
    def run():
        with gpu:
            return fn(*args)

    return asyncio.to_thread(run)


@router.get("/status")
def status() -> dict:
    return {"ready": state["ready"], "error": state["error"], "enabled": config.VOICE_ENABLED}


@router.post("/asr")
async def asr(request: Request) -> dict:
    speech = require_ready()
    body = await request.body()
    try:
        audio, rate = sf.read(io.BytesIO(body), dtype="float32")
    except Exception as error:  # noqa: BLE001  (any decode failure is the client's bad input)
        raise HTTPException(400, f"Expected a WAV file: {error}") from error
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    started = time.perf_counter()
    text = await on_gpu(speech.transcribe, audio, rate)
    log.info("ASR %.0f ms: %r", (time.perf_counter() - started) * 1000, text)
    return {"text": text}


class ChatRequest(BaseModel):
    messages: list[dict[str, str]]


@router.post("/chat")
async def chat(body: ChatRequest) -> StreamingResponse:
    async def events():
        try:
            async for piece in llm.stream_text(body.messages):
                yield f"data: {json.dumps({'text': piece})}\n\n"
        except Exception as error:  # noqa: BLE001  (reported to the client instead of dropping the stream)
            log.warning("chat failed: %s", error)
            yield f"data: {json.dumps({'error': 'The interviewer could not answer. Please try again.'})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


class TtsRequest(BaseModel):
    text: str


@router.post("/tts")
async def tts(body: TtsRequest) -> Response:
    speech = require_ready()
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Nothing to say")
    run = on_gpu if speech.TTS_ON_GPU else asyncio.to_thread
    audio, rate = await run(speech.synthesize, text)
    out = io.BytesIO()
    sf.write(out, np.asarray(audio, dtype=np.float32), rate, format="WAV", subtype="PCM_16")
    return Response(out.getvalue(), media_type="audio/wav")
