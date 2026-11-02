"""Storage. Plain SQL that also runs on Postgres, so moving to Supabase (EU) is a schema copy plus
swapping this module's connection. Only text is stored: no audio, no video."""

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  description TEXT NOT NULL,
  posting_url TEXT,
  company_url TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  claim TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_label TEXT NOT NULL,
  retrieved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  questions TEXT NOT NULL,
  transcript TEXT,
  status TEXT NOT NULL CHECK (status IN ('created', 'in_progress', 'completed', 'graded')),
  created_at TEXT NOT NULL,
  UNIQUE (job_id, number)
);
CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL,
  value INTEGER CHECK (value BETWEEN 1 AND 5),
  evidence_quote TEXT,
  fix TEXT,
  runs TEXT NOT NULL,
  source TEXT NOT NULL,
  UNIQUE (session_id, dimension)
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  weak_dims TEXT NOT NULL,
  question_mix TEXT NOT NULL,
  next_session_id TEXT,
  created_at TEXT NOT NULL
);
"""

JSON_COLUMNS = {"questions", "transcript", "runs", "weak_dims", "question_mix"}


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def new_id() -> str:
    return uuid.uuid4().hex[:16]


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DATABASE_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


@contextmanager
def tx():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def row(r: sqlite3.Row | None) -> dict | None:
    if r is None:
        return None
    out = dict(r)
    for key in JSON_COLUMNS & out.keys():
        if out[key] is not None:
            out[key] = json.loads(out[key])
    return out


def rows(rs) -> list[dict]:
    return [row(r) for r in rs]


def dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False)
