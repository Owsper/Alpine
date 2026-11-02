// Talks to the Tech Lead's backend. Until it is live, the voice server's mock answers on the same routes.

export interface Question {
  id: string
  text: string
  kind: 'weak' | 'anchor' | 'new'
}

export interface Session {
  sessionId: string
  company: string
  role: string
  questions: Question[]
  facts: { claim: string; source_url: string }[]
}

export interface TranscriptTurn {
  questionId: string
  role: 'interviewer' | 'candidate'
  text: string
  startedAt: number
  endedAt: number
}

export interface Transcript {
  turns: TranscriptTurn[]
  durationSec: number
}

const BASE = ''

export async function loadSession(id: string): Promise<Session> {
  const response = await fetch(`${BASE}/api/session/${encodeURIComponent(id)}`)
  if (!response.ok) throw new Error(`Could not load the interview (${response.status}).`)
  return (await response.json()) as Session
}

export async function sendTranscript(id: string, transcript: Transcript): Promise<void> {
  const response = await fetch(`${BASE}/api/session/${encodeURIComponent(id)}/transcript`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transcript),
  })
  if (!response.ok) throw new Error(`Could not save the transcript (${response.status}).`)
}
