# Alpine

Practice a job interview out loud with an AI interviewer, get scores that quote what you said, and a next
interview aimed at your weakest answers.

```
Alpine/
  backend/    FastAPI: research, sessions, grading, next-session plans, and the voice models
  frontend/   React + Vite: landing page and the app (Overview, Sessions, Practice with the voice interview)
```

## How the parts feed each other

1. **Job posting** (frontend) → `POST /api/research` (backend) finds company facts, each with its source.
2. **Research** screen shows those facts; you can edit or remove them. Only the facts you keep reach the interviewer.
3. **Interview** asks the backend for a session (`POST /api/session`): five questions built for this job.
   The voice module runs the conversation on the backend's models — Whisper hears you, Kokoro speaks, the
   LLM writes at most one follow-up per question using only your reviewed facts — and saves the text transcript
   to the same session. You can also type answers.
4. **Report** grades that transcript (`POST /api/grade`): six dimensions, three runs, the median, and a quote
   for every score.
5. **Generate my next interview** (`POST /api/next`) turns your two weakest dimensions into the next session:
   three questions on them, one repeated anchor, one new angle.
6. **Progress** (`GET /api/progress/{job}`) compares the last two graded sessions on the same dimensions.

## Run

Requirements: Python 3.13 with the backend's `.venv` (torch with CUDA, faster-whisper, kokoro-onnx, fastapi),
Node 20+, and an NVIDIA GPU for speech recognition. Without the voice models the app still works with typed answers.

```bash
# backend environment (once)
cd backend
python -m venv .venv
.venv\Scripts\pip install torch --index-url https://download.pytorch.org/whl/cu128
.venv\Scripts\pip install -r requirements.txt
# Kokoro voice files (not in git, ~340 MB) into backend/models/
curl -L -o models/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -L -o models/voices-v1.0.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
cd ..

npm install                 # once, at the root (installs the launcher)
npm --prefix frontend install
cp backend/.env.example backend/.env    # then set LLM_API_KEY
npm run dev                 # backend on :8100, frontend on :5173
```

Open http://localhost:5173. API docs: http://localhost:8100/docs. Backend tests: `npm test`.

The first start loads the speech models in the background (about a minute); `GET /api/voice/status` says when
they are ready. Until then the interviewer's text still appears as subtitles and you can type your answers.

## Privacy rules built in

- The camera is an optional local mirror; nothing analyses it.
- Audio is turned into text and dropped; only the transcript is stored.
- The interviewer says it is an AI in its first sentence and only uses facts that have a source.
- No face, emotion, confidence or personality analysis. Scores are practice guidance, not a hiring decision.

## Configuration

`backend/.env` — see `backend/.env.example`: relay URL and key, the models raced for each request, demo mode,
voice engine choices, database path.
