"""Request bodies. Responses are plain dicts shaped in main.py so both the dashboard and the
voice module get exactly the fields agreed in the contract."""

from pydantic import BaseModel, Field, HttpUrl


class ResearchRequest(BaseModel):
    company: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=20)
    posting_url: HttpUrl | None = None
    company_url: HttpUrl | None = None


class SessionRequest(BaseModel):
    job_id: str


class Turn(BaseModel):
    questionId: str
    role: str = Field(pattern="^(interviewer|candidate)$")
    text: str
    startedAt: float
    endedAt: float


class TranscriptRequest(BaseModel):
    turns: list[Turn]
    durationSec: float = Field(ge=0)


class SessionRef(BaseModel):
    session_id: str
