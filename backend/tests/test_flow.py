"""End-to-end flow against a fake model: research -> session -> transcript -> grade -> next."""

import json

import pytest
from fastapi.testclient import TestClient

from app import config, db, llm

ANSWER = (
    "Last spring our fleet service had to move from Python to Go in three weeks. "
    "I had never written Go, so I built one small service a day. "
    "In the end I cut our p95 latency by 40 percent."
)


def fake_grade(_system: str, user: str, max_tokens: int = 0) -> dict:
    if "<transcript>" not in user:
        return {"facts": ["The team builds services in Go."]}
    return {
        "scores": [
            {"dimension": "STAR", "value": 4, "evidence_quote": "I had never written Go", "fix": "Name the result first."},
            {"dimension": "Evidence", "value": 2, "evidence_quote": "cut our p95 latency by 40 percent", "fix": "Say how you measured it."},
            {"dimension": "Relevance", "value": 4, "evidence_quote": "move from Python to Go", "fix": "Tie it to the role."},
            {"dimension": "Company fit", "value": 2, "evidence_quote": "this quote is invented", "fix": "x"},
            {"dimension": "Conciseness", "value": 3, "evidence_quote": "I built one small service a day", "fix": "Shorter."},
            {"dimension": "Role knowledge", "value": 3, "evidence_quote": "fleet service", "fix": "More depth."},
        ]
    }


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setattr(config, "LLM_API_KEY", "test")
    monkeypatch.setattr(config, "VOICE_ENABLED", False)

    async def fake(system, user, max_tokens=900):
        return fake_grade(system, user, max_tokens)

    monkeypatch.setattr(llm, "complete_json", fake)
    from app.main import app

    db.init()
    with TestClient(app) as c:
        yield c


def answer_turns(session: dict) -> list[dict]:
    turns = []
    for i, q in enumerate(session["questions"]):
        turns.append({"questionId": q["id"], "role": "interviewer", "text": q["text"], "startedAt": i, "endedAt": i + 1})
        turns.append({"questionId": q["id"], "role": "candidate", "text": ANSWER, "startedAt": i + 1, "endedAt": i + 2})
    return turns


def test_full_flow(client):
    research = client.post("/api/research", json={"company": "Nimbus Logistics", "role": "Backend engineer", "description": "We build services in Go and TypeScript for our fleet."})
    assert research.status_code == 201
    job_id = research.json()["job"]["id"]
    assert all(f["source_url"] for f in research.json()["facts"]), "every fact needs a source"

    session = client.post("/api/session", json={"job_id": job_id}).json()
    assert len(session["questions"]) == 5 and session["number"] == 1 and session["status"] == "created"

    assert client.post(f"/api/session/{session['sessionId']}/start").json()["status"] == "in_progress"
    assert client.post(f"/api/session/{session['sessionId']}/transcript", json={"turns": answer_turns(session), "durationSec": 300}).json() == {"ok": True}

    graded = client.post("/api/grade", json={"session_id": session["sessionId"]}).json()
    by_dim = {s["dimension"]: s for s in graded["scores"]}
    assert by_dim["Company fit"]["value"] is None, "an invented quote must not produce a score"
    assert by_dim["STAR"]["value"] == 4 and by_dim["STAR"]["runs"] == [4, 4, 4]
    assert graded["top_weaknesses"][0] == "Evidence"

    again = client.post("/api/grade", json={"session_id": session["sessionId"]}).json()
    assert again["cached"] is True, "a second grade request returns the stored result instead of grading twice"

    nxt = client.post("/api/next", json={"session_id": session["sessionId"]}).json()
    kinds = [q["kind"] for q in nxt["session"]["questions"]]
    assert sorted(kinds) == ["anchor", "new", "weak", "weak", "weak"]
    assert nxt["session"]["number"] == 2
    assert client.post("/api/session", json={"job_id": job_id}).json()["sessionId"] == nxt["session"]["sessionId"]

    exported = client.get(f"/api/jobs/{job_id}/export").json()
    assert len(exported["sessions"]) == 2
    assert client.delete(f"/api/jobs/{job_id}").json()["ok"] is True
    assert client.get(f"/api/session/{session['sessionId']}").json()["error"]["code"] == "session_not_found"


def test_demo_company_uses_cached_facts(client):
    facts = client.post("/api/research", json={"company": "Acme Robotics", "role": "SWE", "description": "Fleet control in Go and TypeScript."}).json()["facts"]
    assert len(facts) == 3 and facts[0]["source_url"].startswith("https://acme-robotics.example")


def test_errors_have_one_shape(client):
    response = client.post("/api/research", json={"company": "", "role": "x"})
    body = response.json()
    assert response.status_code == 422 and body["error"]["code"] == "invalid_request"
    assert client.post("/api/grade", json={"session_id": "missing"}).json()["error"]["code"] == "session_not_found"


def test_transcript_is_locked_after_grading(client):
    job_id = client.post("/api/research", json={"company": "Acme Robotics", "role": "SWE", "description": "Fleet control in Go and TypeScript."}).json()["job"]["id"]
    session = client.post("/api/session", json={"job_id": job_id}).json()
    turns = answer_turns(session)
    client.post(f"/api/session/{session['sessionId']}/transcript", json={"turns": turns, "durationSec": 120})
    client.post("/api/grade", json={"session_id": session["sessionId"]})
    locked = client.post(f"/api/session/{session['sessionId']}/transcript", json={"turns": turns, "durationSec": 120})
    assert locked.status_code == 409 and locked.json()["error"]["code"] == "already_graded"


def test_sessions_list_feeds_the_dashboard(client):
    job_id = client.post("/api/research", json={"company": "Acme Robotics", "role": "SWE", "description": "Fleet control in Go and TypeScript."}).json()["job"]["id"]
    session = client.post("/api/session", json={"job_id": job_id}).json()
    assert client.get("/api/sessions").json()["sessions"] == []
    client.post(f"/api/session/{session['sessionId']}/transcript", json={"turns": answer_turns(session), "durationSec": 120})
    client.post("/api/grade", json={"session_id": session["sessionId"]})
    client.post("/api/next", json={"session_id": session["sessionId"]})
    listed = client.get("/api/sessions").json()
    assert [s["sessionId"] for s in listed["sessions"]] == [session["sessionId"]]
    assert listed["sessions"][0]["transcript"]["turns"] and len(listed["sessions"][0]["scores"]) == 6
    assert "runs" not in listed["sessions"][0]["scores"][0]
    assert listed["upcoming"]["jobId"] == job_id and listed["upcoming"]["status"] == "created"
