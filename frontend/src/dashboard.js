// Everything the dashboard shows, derived from real sessions (GET /api/sessions). No sample numbers:
// when there is nothing to show yet, views render an empty state instead.

import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'

/** Every minute of the candidate's own speech climbs this far; the summit is the Matterhorn's 4,478 m. */
export const METRES_PER_MINUTE = 150
export const SUMMIT = 4478
export const CAMPS = [['Basecamp', 0], ['Treeline', 0.2], ['Ridge', 0.45], ['Glacier', 0.7], ['Summit', 1]]

const FILLER = /\b(u+m+|u+h+|e+r+m+|hmm+|you know)\b/gi
export const isFiller = (word) => /^(u+m+|u+h+|e+r+m+|hmm+)$/i.test(word.replace(/[^a-z]/gi, ''))

export const fmtTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

function dayLabel(iso) {
  const date = new Date(iso)
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return date.toLocaleDateString('en-GB', { weekday: 'short' })
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** One session with the numbers every view needs. */
function enrich(session) {
  const turns = session.transcript?.turns ?? []
  const mine = turns.filter((turn) => turn.role === 'candidate')
  const words = mine.flatMap((turn) => turn.text.split(/\s+/).filter(Boolean))
  const speakingSec = mine.reduce((sum, turn) => sum + Math.max(0, (turn.endedAt - turn.startedAt) / 1000), 0)
  const scored = session.scores.filter((s) => s.value != null)
  const overall = scored.length ? scored.reduce((sum, s) => sum + s.value, 0) / scored.length : null
  const weakest = [...scored].sort((a, b) => a.value - b.value)[0] ?? null
  return {
    ...session,
    turns,
    title: session.questions?.[0]?.text ?? `Session ${session.number}`,
    day: dayLabel(session.createdAt),
    durationSec: session.transcript?.durationSec ?? 0,
    speakingSec,
    wordCount: words.length,
    fillers: mine.reduce((sum, turn) => sum + (turn.text.match(FILLER)?.length ?? 0), 0),
    overall,
    weakest,
    graded: session.status === 'graded',
  }
}

export function useDashboard() {
  const [state, setState] = useState({ loading: true, error: '', sessions: [], upcoming: null, dimensions: [] })

  const reload = useCallback(() => {
    api.sessions().then(
      (data) => setState({ loading: false, error: '', sessions: data.sessions.map(enrich), upcoming: data.upcoming, dimensions: data.dimensions }),
      (error) => setState((current) => ({ ...current, loading: false, error: error.message })),
    )
  }, [])

  useEffect(reload, [reload])
  return { ...state, reload }
}

/** Totals and series for the overview, oldest to newest where order matters. */
export function summarise(sessions, dimensions) {
  const chronological = [...sessions].reverse()
  const graded = chronological.filter((s) => s.graded)
  const speakingMin = sessions.reduce((sum, s) => sum + s.speakingSec, 0) / 60
  const metres = Math.min(SUMMIT, Math.round(speakingMin * METRES_PER_MINUTE))

  const today = startOfDay(new Date())
  const days = new Set(sessions.map((s) => startOfDay(new Date(s.createdAt)).getTime()))
  const week = Array.from({ length: 7 }, (_, i) => days.has(today.getTime() - (6 - i) * 86_400_000))
  let streak = 0
  for (let d = today.getTime(); days.has(d); d -= 86_400_000) streak++

  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = today.getTime() + 86_400_000 - (11 - i) * 7 * 86_400_000
    return sessions.filter((s) => {
      const t = new Date(s.createdAt).getTime()
      return t < end && t >= end - 7 * 86_400_000
    }).length
  })

  const series = Object.fromEntries(dimensions.map((dim) => [dim, graded.map((s) => s.scores.find((x) => x.dimension === dim)?.value ?? null)]))
  const latest = graded.at(-1) ?? null
  const previous = graded.at(-2) ?? null
  const rings = latest
    ? dimensions.map((dim) => {
        const now = latest.scores.find((s) => s.dimension === dim)?.value ?? null
        const before = previous?.scores.find((s) => s.dimension === dim)?.value ?? null
        return { label: dim, value: now, delta: now != null && before != null ? now - before : null }
      })
    : []

  return { chronological, graded, metres, speakingMin, week, streak, weeks, series, latest, rings, fillers: chronological.map((s) => s.fillers) }
}
