"""Model wrappers.

Recognition: Whisper large-v3 int8 (default) or Qwen3-ASR-1.7B, on the GPU.
Speech: Kokoro-82M on the CPU (default, ~3x faster than real time here) or Qwen3-TTS 0.6B on the GPU,
which measured 2x slower than real time on the RTX 3050 and is kept only as an option.
One engine voices the whole interview, so the interviewer never changes voice mid-conversation.
"""

import os
from pathlib import Path

import numpy as np
import torch

ASR_ENGINE = os.environ.get("ASR_ENGINE", "whisper")
TTS_ENGINE = os.environ.get("TTS_ENGINE", "kokoro")
TTS_SPEAKER = os.environ.get("TTS_SPEAKER", "Ryan")
KOKORO_VOICE = os.environ.get("KOKORO_VOICE", "am_michael")
MODELS = Path(__file__).resolve().parent.parent / "models"
# Kokoro runs on the CPU, so it can synthesize while the GPU is busy recognising speech.
TTS_ON_GPU = TTS_ENGINE == "qwen"
LANGUAGE = "English"
ASR_RATE = 16000
# Phrases Whisper is known to produce from near-silence; dropped only when the clip is short.
HALLUCINATIONS = {"thank you", "thanks for watching", "thank you for watching", "you", "hmm", "bye", "hello", "okay"}

_asr = None
_tts = None


def load() -> None:
    global _asr, _tts
    if ASR_ENGINE == "whisper":
        from faster_whisper import WhisperModel

        # int8 keeps Whisper near 1.5 GB so it fits beside the TTS model in 6 GB.
        _asr = WhisperModel("large-v3", device="cuda", compute_type="int8_float16")
        # The first GPU call is several times slower; pay it now instead of on the first answer.
        list(_asr.transcribe(np.zeros(ASR_RATE, dtype=np.float32), language="en")[0])
    else:
        from qwen_asr import Qwen3ASRModel

        _asr = Qwen3ASRModel.from_pretrained(
            "Qwen/Qwen3-ASR-1.7B", dtype=torch.bfloat16, device_map="cuda:0", max_new_tokens=256
        )

    if TTS_ON_GPU:
        from qwen_tts import Qwen3TTSModel

        _tts = Qwen3TTSModel.from_pretrained(
            "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", dtype=torch.bfloat16, device_map="cuda:0"
        )
    else:
        from kokoro_onnx import Kokoro

        _tts = Kokoro(str(MODELS / "kokoro-v1.0.onnx"), str(MODELS / "voices-v1.0.bin"))
        _tts.create("Warming up.", voice=KOKORO_VOICE, lang="en-us")  # the first call is the slow one


def describe() -> dict:
    used = torch.cuda.memory_allocated() / 2**30 if torch.cuda.is_available() else 0
    voice = TTS_SPEAKER if TTS_ON_GPU else KOKORO_VOICE
    return {"asr": ASR_ENGINE, "tts": TTS_ENGINE, "voice": voice, "vram_gb": round(used, 2), "ready": _tts is not None}


def _resample(audio: np.ndarray, rate: int) -> np.ndarray:
    if rate == ASR_RATE:
        return audio
    positions = np.linspace(0, len(audio) - 1, int(len(audio) * ASR_RATE / rate))
    return np.interp(positions, np.arange(len(audio)), audio).astype(np.float32)


def transcribe(audio: np.ndarray, rate: int) -> str:
    audio = _resample(audio, rate)
    if ASR_ENGINE == "whisper":
        segments, _ = _asr.transcribe(
            audio, language="en", beam_size=1, vad_filter=True, condition_on_previous_text=False
        )
        # Whisper invents text for silence ("Thank you.", "Hello."); its own confidence scores give it away.
        kept = [s.text.strip() for s in segments if s.no_speech_prob < 0.6 and s.avg_logprob > -1.0]
        text = " ".join(kept).strip()
        if text.lower().strip(" .!?") in HALLUCINATIONS and len(audio) < ASR_RATE * 2:
            return ""
        return text
    results = _asr.transcribe(audio=(audio, ASR_RATE), language=LANGUAGE)
    return results[0].text.strip()


def synthesize(text: str) -> tuple[np.ndarray, int]:
    if TTS_ON_GPU:
        wavs, rate = _tts.generate_custom_voice(text=text, language=LANGUAGE, speaker=TTS_SPEAKER)
        return np.asarray(wavs[0], dtype=np.float32), rate
    audio, rate = _tts.create(text, voice=KOKORO_VOICE, speed=1.0, lang="en-us")
    return np.asarray(audio, dtype=np.float32), rate
