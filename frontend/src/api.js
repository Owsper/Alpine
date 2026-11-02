// The backend (FastAPI, port 8100 in development, proxied by Vite under /api).
// Every error comes back as { error: { code, message } }; it is thrown as an Error with that message.

async function call(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('The InterviewVerse server is not reachable. Is it running?')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error?.message ?? data.detail ?? `Request failed (${response.status}).`)
  return data
}

// Grading runs the model several times, so a second request for the same session (React's dev
// double effect, a quick re-render) shares the one already in flight instead of grading again.
const grading = new Map()
function grade(sessionId) {
  if (!grading.has(sessionId)) {
    const request = call('/grade', { method: 'POST', body: { session_id: sessionId } })
    grading.set(sessionId, request)
    request.finally(() => grading.delete(sessionId)).catch(() => undefined)
  }
  return grading.get(sessionId)
}

export const api = {
  research: (job) => call('/research', { method: 'POST', body: { company: job.company, role: job.role, description: job.posting } }),
  session: (jobId) => call('/session', { method: 'POST', body: { job_id: jobId } }),
  start: (sessionId) => call(`/session/${sessionId}/start`, { method: 'POST' }),
  grade,
  next: (sessionId) => call('/next', { method: 'POST', body: { session_id: sessionId } }),
  progress: (jobId) => call(`/progress/${jobId}`),
  voiceStatus: () => call('/voice/status'),
}

// The backend names STAR plainly; the dashboard spells it out.
export const DIMENSION_LABELS = { STAR: 'STAR structure' }
export const label = (dimension) => DIMENSION_LABELS[dimension] ?? dimension

/** Backend facts in the shape the Research screen already renders. */
export function toFacts(facts) {
  return facts.map((fact, i) => ({
    id: `f${i}`,
    tag: fact.source_label,
    text: fact.claim,
    url: fact.source_url.startsWith('http') ? fact.source_url : null,
    source: fact.source_url.startsWith('http') ? fact.source_url.replace(/^https?:\/\//, '') : 'The job posting you pasted',
    retrieved: new Date(fact.retrieved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  }))
}
