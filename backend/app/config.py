"""Settings, read once from the environment (.env in development)."""

import os

from dotenv import load_dotenv

load_dotenv()


def _flag(name: str, default: str) -> bool:
    return os.environ.get(name, default).strip().lower() in {"1", "true", "yes", "on"}


DATABASE_PATH = os.environ.get("DATABASE_PATH", "interviewverse.db")

LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://relay.crunchman.info/v1").rstrip("/")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
# Asked in parallel; the first model to return valid JSON wins. The relay's latency spikes per model.
LLM_MODELS = [m.strip() for m in os.environ.get("LLM_MODELS", "zai-org/GLM-5.3-Flash,nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B").split(",") if m.strip()]
LLM_TIMEOUT_S = float(os.environ.get("LLM_TIMEOUT_S", "40"))

# Demo mode: cached research for the demo company and a rule-based grader if every model fails,
# so an outage at the relay never stops a live demo.
DEMO_MODE = _flag("DEMO_MODE", "true")
DEMO_COMPANY = "Acme Robotics"

GRADER_RUNS = int(os.environ.get("GRADER_RUNS", "3"))
MAX_TRANSCRIPT_CHARS = int(os.environ.get("MAX_TRANSCRIPT_CHARS", "20000"))
MAX_DESCRIPTION_CHARS = int(os.environ.get("MAX_DESCRIPTION_CHARS", "12000"))

CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173,https://localhost:5174").split(",") if o.strip()]

# Speech models (Whisper + Kokoro) load in the background; off for tests and machines without them.
VOICE_ENABLED = _flag("VOICE_ENABLED", "true")

DIMENSIONS = ["STAR", "Relevance", "Role knowledge", "Company fit", "Conciseness", "Evidence"]
