# Alpine backend

The FastAPI service behind the Alpine frontend. It handles company research, interview sessions, grading, next-session plans and the voice models, and stores its data in SQLite.

For setup, see the [quick start](../README.md#quick-start). With the server running, interactive API docs are at http://localhost:8100/docs.

## API

Errors come back as `{ "error": { "code", "message" } }`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Status, demo mode, models and scoring dimensions |
| `POST` | `/api/research` | Create a job and return company facts with sources |
| `POST` | `/api/session` | Start a session, or return the one `/api/next` already planned |
| `GET` | `/api/session/{id}` | Read one session |
| `POST` | `/api/session/{id}/start` | Mark a session as in progress |
| `POST` | `/api/session/{id}/transcript` | Save the text transcript |
| `POST` | `/api/grade` | Grade a completed session |
| `POST` | `/api/next` | Plan the follow-up session from a graded one |
| `GET` | `/api/progress/{job_id}` | Scores per graded session for one job |
| `GET` | `/api/sessions` | Finished sessions and the next planned one, for the dashboard |
| `GET` | `/api/jobs/{job_id}/export` | Export everything stored for a job |
| `DELETE` | `/api/jobs/{job_id}` | Delete a job with its facts, sessions, scores and plans |
| `GET` | `/api/voice/status` | Whether the speech models are ready |
| `POST` | `/api/voice/asr` | Speech to text |
| `POST` | `/api/voice/chat` | The interviewer's streamed reply |
| `POST` | `/api/voice/tts` | Text to speech |

## Configuration

Copy `.env.example` to `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LLM_BASE_URL` | see `.env.example` | OpenAI-compatible endpoint, including `/v1` |
| `LLM_API_KEY` | empty | Provider key. While it is empty, the grader and research send no LLM requests |
| `LLM_MODELS` | see `.env.example` | Comma-separated models, asked in parallel. The first valid JSON answer wins |
| `LLM_TIMEOUT_S` | `40` | Timeout per request, in seconds |
| `DEMO_MODE` | `true` | Cached research for Acme Robotics, and a rule-based grader when no model answers |
| `GRADER_RUNS` | `3` | Grading runs per session. The score is the median |
| `DATABASE_PATH` | `interviewverse.db` | SQLite file, named after the product's former name |
| `CORS_ORIGINS` | `http://localhost:5173,https://localhost:5174` | Allowed browser origins |
| `VOICE_ENABLED` | `true` | Set to `false` on machines without the speech models |
| `ASR_ENGINE` | `whisper` | Speech recognition engine |
| `TTS_ENGINE` | `kokoro` | Text-to-speech engine |
| `KOKORO_VOICE` | `am_michael` | Kokoro voice |
| `MAX_TRANSCRIPT_CHARS` | `20000` | Longest transcript accepted |
| `MAX_DESCRIPTION_CHARS` | `12000` | Longest job post kept |

## Code map

| Module | Responsibility |
| --- | --- |
| `app/main.py` | App setup and core routes |
| `app/research.py` | Company facts, each with its source |
| `app/questions.py` | Question bank and the first session's question set |
| `app/grader.py` | Scoring runs, median and the rule-based demo fallback |
| `app/planner.py` | Next session: 3 weak-spot questions, 1 repeated anchor, 1 new |
| `app/llm.py` | LLM requests, including the parallel model race |
| `app/voice.py`, `app/speech.py` | Voice routes and the Whisper and Kokoro models |
| `app/db.py`, `app/models.py`, `app/config.py` | Storage, request bodies and settings |

## Tests

`tests/test_flow.py` runs the full flow against a fake model, so it needs no network or API key. From the repository root:

```powershell
npm test
```
