"""Alpine API.

Flow: POST /api/research -> POST /api/session -> (voice) transcript -> POST /api/grade -> POST /api/next.
Session states move one way only: created -> in_progress -> completed -> graded.
Run with: .venv/Scripts/python -m uvicorn app.main:app --port 8100
"""

import asyncio
import logging
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config, db, grader, planner, questions, research, voice
from .llm import LLMError
from .models import ResearchRequest, SessionRef, SessionRequest, TranscriptRequest

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger("api")

@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    if config.VOICE_ENABLED:
        voice.load_in_background()
    yield


app = FastAPI(title="Alpine API", version="0.1.0", lifespan=lifespan)
app.include_router(voice.router)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

# One grading at a time per session, so a double click or a retry never grades twice.
grade_locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

ORDER = ["created", "in_progress", "completed", "graded"]


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


@app.exception_handler(ApiError)
async def api_error(_: Request, error: ApiError) -> JSONResponse:
    return JSONResponse({"error": {"code": error.code, "message": error.message}}, status_code=error.status)


@app.exception_handler(LLMError)
async def llm_error(_: Request, error: LLMError) -> JSONResponse:
    return JSONResponse({"error": {"code": "ai_unavailable", "message": str(error)}}, status_code=503)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
    details = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in error.errors()]
    return JSONResponse({"error": {"code": "invalid_request", "message": "Some fields are missing or invalid.", "details": details}}, status_code=422)


# Helpers


def get_job(conn, job_id: str) -> dict:
    job = db.row(conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone())
    if not job:
        raise ApiError(404, "job_not_found", "No job with this id.")
    return job


def get_session(conn, session_id: str) -> dict:
    session = db.row(conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone())
    if not session:
        raise ApiError(404, "session_not_found", "No session with this id.")
    return session


def advance(conn, session: dict, to: str) -> None:
    """Moves a session forward; moving backwards or skipping a state is refused."""
    if ORDER.index(to) < ORDER.index(session["status"]):
        raise ApiError(409, "invalid_state", f"Session is already {session['status']}.")
    conn.execute("UPDATE sessions SET status = ? WHERE id = ?", (to, session["id"]))
    session["status"] = to


def facts_for(conn, job_id: str) -> list[dict]:
    return db.rows(conn.execute("SELECT claim, source_url, source_label, retrieved_at FROM facts WHERE job_id = ? ORDER BY rowid", (job_id,)))


def scores_for(conn, session_id: str) -> list[dict]:
    return db.rows(
        conn.execute("SELECT dimension, value, evidence_quote, fix, runs, source FROM scores WHERE session_id = ?", (session_id,))
    )


def public_session(session: dict, job: dict, facts: list[dict]) -> dict:
    """The shape the voice module and the dashboard both read."""
    return {
        "sessionId": session["id"],
        "jobId": job["id"],
        "number": session["number"],
        "status": session["status"],
        "company": job["company"],
        "role": job["title"],
        "questions": [{"id": q["id"], "text": q["text"], "kind": q["kind"]} for q in session["questions"]],
        "facts": [{"claim": f["claim"], "source_url": f["source_url"]} for f in facts],
    }


def create_session(conn, job: dict, question_list: list[dict]) -> dict:
    number = conn.execute("SELECT COALESCE(MAX(number), 0) + 1 FROM sessions WHERE job_id = ?", (job["id"],)).fetchone()[0]
    session = {"id": db.new_id(), "job_id": job["id"], "number": number, "questions": question_list, "transcript": None, "status": "created", "created_at": db.now()}
    conn.execute(
        "INSERT INTO sessions (id, job_id, number, questions, transcript, status, created_at) VALUES (?, ?, ?, ?, NULL, 'created', ?)",
        (session["id"], job["id"], number, db.dumps(question_list), session["created_at"]),
    )
    return session


# Routes


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "demo_mode": config.DEMO_MODE, "models": config.LLM_MODELS, "dimensions": config.DIMENSIONS}


@app.post("/api/research", status_code=201)
async def post_research(body: ResearchRequest, request: Request) -> dict:
    job = {
        "client_id": request.headers.get("x-alpine-client"),
        "id": db.new_id(),
        "title": body.role.strip(),
        "company": body.company.strip(),
        "description": body.description.strip()[: config.MAX_DESCRIPTION_CHARS],
        "posting_url": str(body.posting_url) if body.posting_url else None,
        "company_url": str(body.company_url) if body.company_url else None,
        "created_at": db.now(),
    }
    with db.tx() as conn:
        conn.execute(
            "INSERT INTO jobs (id, title, company, description, posting_url, company_url, created_at, client_id) VALUES (:id, :title, :company, :description, :posting_url, :company_url, :created_at, :client_id)",
            job,
        )
    facts = await research.research(job)
    return {"job": {k: job[k] for k in ("id", "title", "company", "created_at")}, "facts": [{k: f[k] for k in ("claim", "source_url", "source_label", "retrieved_at")} for f in facts]}


@app.post("/api/session", status_code=201)
def post_session(body: SessionRequest) -> dict:
    """Starts a session. If /next already planned one for this job, that plan's questions are used."""
    with db.tx() as conn:
        job = get_job(conn, body.job_id)
        pending = db.row(conn.execute("SELECT * FROM sessions WHERE job_id = ? AND status = 'created' ORDER BY number DESC LIMIT 1", (job["id"],)).fetchone())
        session = pending or create_session(conn, job, questions.first_session(job))
        return public_session(session, job, facts_for(conn, job["id"]))


@app.get("/api/session/{session_id}")
def get_session_route(session_id: str) -> dict:
    with db.tx() as conn:
        session = get_session(conn, session_id)
        job = get_job(conn, session["job_id"])
        return public_session(session, job, facts_for(conn, job["id"]))


@app.post("/api/session/{session_id}/start")
def start_session(session_id: str) -> dict:
    with db.tx() as conn:
        session = get_session(conn, session_id)
        if session["status"] == "created":
            advance(conn, session, "in_progress")
        return {"sessionId": session_id, "status": session["status"]}


@app.post("/api/session/{session_id}/transcript")
def save_transcript(session_id: str, body: TranscriptRequest) -> dict:
    """Text only. Saving again before grading replaces it (a reconnect may resend); after grading it is locked."""
    transcript = body.model_dump()
    if sum(len(t["text"]) for t in transcript["turns"]) > config.MAX_TRANSCRIPT_CHARS:
        raise ApiError(413, "transcript_too_long", "The transcript is longer than this practice session allows.")
    with db.tx() as conn:
        session = get_session(conn, session_id)
        if session["status"] == "graded":
            raise ApiError(409, "already_graded", "This session has already been graded.")
        conn.execute("UPDATE sessions SET transcript = ? WHERE id = ?", (db.dumps(transcript), session_id))
        advance(conn, session, "completed")
    return {"ok": True}


@app.post("/api/grade")
async def post_grade(body: SessionRef) -> dict:
    async with grade_locks[body.session_id]:
        with db.tx() as conn:
            session = get_session(conn, body.session_id)
            if session["status"] == "graded":
                scores = scores_for(conn, session["id"])
                return {"sessionId": session["id"], "scores": scores, **grader.summary(scores), "cached": True}
            if session["status"] != "completed" or not session["transcript"]:
                raise ApiError(409, "no_transcript", "Save the transcript before grading.")

        scores, source = await grader.grade(session["transcript"], session["questions"])

        with db.tx() as conn:
            conn.execute("DELETE FROM scores WHERE session_id = ?", (session["id"],))
            conn.executemany(
                "INSERT INTO scores (id, session_id, dimension, value, evidence_quote, fix, runs, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [(db.new_id(), session["id"], s["dimension"], s["value"], s["evidence_quote"], s["fix"], db.dumps(s["runs"]), source) for s in scores],
            )
            advance(conn, session, "graded")
        stored = [{**s, "source": source} for s in scores]
        return {"sessionId": session["id"], "scores": stored, **grader.summary(scores), "cached": False}


@app.post("/api/next", status_code=201)
def post_next(body: SessionRef) -> dict:
    """Plans the follow-up session from a graded one and creates it, ready for /api/session."""
    with db.tx() as conn:
        session = get_session(conn, body.session_id)
        if session["status"] != "graded":
            raise ApiError(409, "not_graded", "Grade this session before planning the next one.")
        existing = db.row(conn.execute("SELECT * FROM plans WHERE session_id = ?", (session["id"],)).fetchone())
        job = get_job(conn, session["job_id"])
        if existing and existing["next_session_id"]:
            next_session = get_session(conn, existing["next_session_id"])
            return {"plan": {"weak_dims": existing["weak_dims"], "question_mix": existing["question_mix"]}, "session": public_session(next_session, job, facts_for(conn, job["id"]))}

        weak = grader.summary(scores_for(conn, session["id"]))["top_weaknesses"]
        asked = {q["text"] for s in db.rows(conn.execute("SELECT questions FROM sessions WHERE job_id = ?", (job["id"],))) for q in s["questions"]}
        next_questions = planner.plan(job, session["questions"], weak, asked)
        next_session = create_session(conn, job, next_questions)
        mix = {kind: sum(q["kind"] == kind for q in next_questions) for kind in planner.MIX}
        conn.execute(
            "INSERT INTO plans (id, session_id, weak_dims, question_mix, next_session_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (db.new_id(), session["id"], db.dumps(weak), db.dumps(mix), next_session["id"], db.now()),
        )
        return {"plan": {"weak_dims": weak, "question_mix": mix}, "session": public_session(next_session, job, facts_for(conn, job["id"]))}


@app.get("/api/progress/{job_id}")
def progress(job_id: str) -> dict:
    """Scores per graded session, for the dashboard's comparison view."""
    with db.tx() as conn:
        get_job(conn, job_id)
        sessions = db.rows(conn.execute("SELECT id, number FROM sessions WHERE job_id = ? AND status = 'graded' ORDER BY number", (job_id,)))
        return {"jobId": job_id, "sessions": [{"sessionId": s["id"], "number": s["number"], "scores": scores_for(conn, s["id"])} for s in sessions]}


@app.get("/api/sessions")
def list_sessions(request: Request) -> dict:
    """Every finished session across jobs, newest first, plus the next planned one, for the dashboard.
    With ISOLATE_CLIENTS on, only the jobs this browser researched are listed."""
    owner, params = "", ()
    if config.ISOLATE_CLIENTS:
        owner, params = " AND j.client_id = ?", (request.headers.get("x-alpine-client") or "-",)
    with db.tx() as conn:
        sessions = db.rows(
            conn.execute(
                "SELECT s.*, j.title AS role, j.company AS company FROM sessions s JOIN jobs j ON j.id = s.job_id "
                f"WHERE s.status IN ('completed', 'graded'){owner} ORDER BY s.created_at DESC",
                params,
            )
        )
        finished = [
            {
                "sessionId": s["id"],
                "jobId": s["job_id"],
                "number": s["number"],
                "status": s["status"],
                "createdAt": s["created_at"],
                "role": s["role"],
                "company": s["company"],
                "questions": s["questions"],
                "transcript": s["transcript"],
                "scores": [{k: v for k, v in score.items() if k != "runs"} for score in scores_for(conn, s["id"])],
            }
            for s in sessions
        ]
        planned = db.row(
            conn.execute(
                f"SELECT s.* FROM sessions s JOIN jobs j ON j.id = s.job_id WHERE s.status = 'created'{owner} ORDER BY s.created_at DESC LIMIT 1",
                params,
            ).fetchone()
        )
        upcoming = None
        if planned:
            job = get_job(conn, planned["job_id"])
            upcoming = public_session(planned, job, facts_for(conn, job["id"]))
        return {"sessions": finished, "upcoming": upcoming, "dimensions": config.DIMENSIONS}


@app.get("/api/jobs/{job_id}/export")
def export_job(job_id: str) -> dict:
    """Everything stored for one job, so a user can take their data with them."""
    with db.tx() as conn:
        job = get_job(conn, job_id)
        sessions = db.rows(conn.execute("SELECT * FROM sessions WHERE job_id = ? ORDER BY number", (job_id,)))
        for s in sessions:
            s["scores"] = scores_for(conn, s["id"])
        return {"job": job, "facts": facts_for(conn, job_id), "sessions": sessions, "exported_at": db.now()}


@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: str) -> dict:
    """Deletes the job and, through cascades, its facts, sessions, transcripts, scores and plans."""
    with db.tx() as conn:
        get_job(conn, job_id)
        conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
    return {"ok": True, "deleted": job_id}


# Mounted last so the API routes above take precedence over the static files.
if config.STATIC_DIR:
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=config.STATIC_DIR, html=True), name="frontend")
