import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, label } from '../api.js'
import { CountUp } from '../components/alpine.jsx'
import { fmtTime, isFiller } from '../dashboard.js'
import { buildReportPdf, downloadPdf } from '../reportPdf.js'

const BARS = 96

/**
 * Audio is never stored, so the replay walks the transcript: every word gets a moment inside its
 * turn's recorded start and end, and the waveform shows who was talking when.
 */
function buildTimeline(turns) {
  const timed = turns.filter((t) => t.startedAt > 0)
  if (!timed.length) return { duration: 0, words: [], speaking: [] }
  const t0 = Math.min(...timed.map((t) => t.startedAt))
  const words = []
  const spans = []
  for (const turn of turns) {
    const list = turn.text.split(/\s+/).filter(Boolean)
    const start = Math.max(0, (turn.startedAt - t0) / 1000)
    const end = Math.max(start + list.length * 0.18, (turn.endedAt - t0) / 1000)
    spans.push({ role: turn.role, start, end })
    list.forEach((word, k) => words.push({ word, role: turn.role, t: start + ((end - start) * k) / list.length, filler: turn.role === 'candidate' && isFiller(word) }))
  }
  const duration = Math.max(...spans.map((s) => s.end), 1)
  const speaking = Array.from({ length: BARS }, (_, k) => {
    const t = ((k + 0.5) / BARS) * duration
    return spans.find((s) => t >= s.start && t <= s.end)?.role ?? null
  })
  return { duration, words, speaking }
}

export default function Sessions({ data }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { sessions, loading, reload } = data
  const selected = sessions.find((s) => s.sessionId === id) ?? sessions[0]

  return (
    <>
      <header className="top rise" style={{ '--d': 0 }}>
        <div>
          <h1>Sessions</h1>
          <p>Pick one. Press play, or click the waveform to jump.</p>
        </div>
      </header>
      {!loading && !sessions.length ? (
        <div className="card rise" style={{ '--d': 1, maxWidth: 720 }} data-anchor data-ax=".9" data-ay=".2" data-ar=".5" data-orb='{"amp":0.05,"m":1,"alpha":0.7,"warm":0.2,"tilt":0.2}'>
          <p className="empty">
            <b>No sessions yet.</b>
            Finish a practice interview and it shows up here with its transcript and report.
          </p>
          <button className="btn solid" type="button" onClick={() => navigate('/practice')}>
            <span>Start a session</span>
          </button>
        </div>
      ) : (
        <div className="sess">
          <div className="card rise" style={{ '--d': 1 }}>
            <div className="list">
              {sessions.map((s) => (
                <button key={s.sessionId} className={`li ${s.sessionId === selected?.sessionId ? 'on' : ''}`} type="button" onClick={() => navigate(`/sessions/${s.sessionId}`)}>
                  <b>
                    {s.role} at {s.company}
                  </b>
                  <small>
                    Take {s.number} · {s.day} · {fmtTime(s.durationSec)}
                  </small>
                  <span className="sc">{s.overall == null ? '–' : s.overall.toFixed(1)}</span>
                </button>
              ))}
            </div>
          </div>
          {selected && (
            <Replay
              key={selected.sessionId}
              session={selected}
              // The take before this one for the same job, so the PDF can show the change.
              previous={sessions.find((s) => s.jobId === selected.jobId && s.graded && s.number < selected.number)}
              reload={reload}
            />
          )}
        </div>
      )}
    </>
  )
}

function Replay({ session, previous, reload }) {
  const navigate = useNavigate()
  const { duration, words, speaking } = useMemo(() => buildTimeline(session.turns), [session.turns])
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [grading, setGrading] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState('')
  const wave = useRef(null)
  const dragging = useRef(false)

  // An interview that was saved but never graded gets graded when it is opened.
  useEffect(() => {
    if (session.graded) return undefined
    let cancelled = false
    setGrading(true)
    api.grade(session.sessionId).then(
      () => !cancelled && reload(),
      (failure) => {
        if (cancelled) return
        setError(failure.message)
        setGrading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [session.sessionId, session.graded, reload])

  useEffect(() => {
    if (!playing) return undefined
    let last = performance.now()
    let frame
    const tick = (now) => {
      const dt = (now - last) / 1000
      last = now
      setPos((p) => Math.min(duration, p + dt))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, duration])

  useEffect(() => {
    if (playing && pos >= duration) setPlaying(false)
  }, [playing, pos, duration])

  function seek(event) {
    const r = wave.current.getBoundingClientRect()
    setPos(Math.min(1, Math.max(0, (event.clientX - r.left) / r.width)) * duration)
  }

  async function planNext() {
    setPlanning(true)
    try {
      await api.next(session.sessionId)
      reload()
      navigate('/practice')
    } catch (failure) {
      setError(failure.message)
      setPlanning(false)
    }
  }

  function downloadReport() {
    const scored = session.scores.filter((s) => s.value != null)
    const before = (dim) => previous?.scores.find((s) => s.dimension === dim)?.value
    const comparing = previous && scored.every((s) => before(s.dimension) != null)
    const strongest = [...scored].sort((a, b) => b.value - a.value)[0]
    const pdf = buildReportPdf({
      job: { company: session.company, role: session.role },
      date: new Date(session.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      title: comparing ? `Take ${previous.number} vs take ${session.number}` : `Interview report, take ${session.number}`,
      stats: [
        { label: 'Overall', value: session.overall == null ? '–' : `${session.overall.toFixed(1)} / 5`, good: comparing && session.overall > previous.overall },
        { label: 'Filler words', value: String(session.fillers) },
        { label: 'You spoke', value: fmtTime(session.speakingSec) },
      ],
      rows: scored.map((s) =>
        comparing ? { name: label(s.dimension), before: before(s.dimension), after: s.value } : { name: label(s.dimension), before: s.value },
      ),
      previous: comparing ? previous.number : session.number,
      latest: session.number,
      strongest: strongest ? label(strongest.dimension) : '–',
      focus: session.weakest ? label(session.weakest.dimension) : '–',
      focusFix: session.weakest?.fix ?? '',
    })
    downloadPdf(pdf, session.company)
  }

  const played = Math.floor((pos / Math.max(duration, 1)) * BARS)
  const current = words.reduce((k, w, i) => (w.t <= pos ? i : k), -1)
  const byTurn = []
  words.forEach((w, i) => {
    const turn = byTurn.at(-1)
    if (turn && turn.role === w.role) turn.words.push({ ...w, i })
    else byTurn.push({ role: w.role, words: [{ ...w, i }] })
  })
  const scores = [...session.scores].sort((a, b) => (a.value ?? 9) - (b.value ?? 9))

  return (
    <article className="card alt2 rise" style={{ '--d': 2 }} data-anchor data-ax=".92" data-ay=".1" data-ar=".5" data-orb='{"amp":0.05,"m":1,"alpha":0.7,"warm":0.2,"tilt":0.2}'>
      <div className="hd">
        <div>
          <h2>
            {session.role} at {session.company}, take {session.number}
          </h2>
          <p className="sub">
            {session.day} · {fmtTime(session.durationSec)} · replay of the transcript, audio is not stored
          </p>
        </div>
      </div>
      <div className="player">
        <button
          className="pp"
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            if (pos >= duration) setPos(0)
            setPlaying(!playing)
          }}
        >
          <svg viewBox="0 0 20 20">{playing ? <path d="M4 2 H8 V18 H4 Z M12 2 H16 V18 H12 Z" /> : <path d="M4 2 L17 10 L4 18 Z" />}</svg>
        </button>
        <div className="time">
          {fmtTime(pos)} / {fmtTime(duration)}
        </div>
        <div
          className="wf"
          ref={wave}
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            seek(e)
          }}
          onPointerMove={(e) => dragging.current && seek(e)}
          onPointerUp={() => {
            dragging.current = false
          }}
        >
          <div className="wf-bars">
            {speaking.map((who, k) => (
              <i key={k} className={k < played ? 'pl' : ''} style={{ height: `${who === 'candidate' ? 40 + Math.abs(Math.sin(k * 0.9)) * 58 : who ? 18 + Math.abs(Math.sin(k * 0.5)) * 20 : 4}%` }} />
            ))}
          </div>
          {words
            .filter((w) => w.filler)
            .map((w, k) => (
              <div className="mk" key={k} style={{ left: `${(w.t / duration) * 100}%` }}>
                {w.word.replace(/[^a-z]/gi, '').toLowerCase()}
              </div>
            ))}
          <div className="wf-head" style={{ left: `${(pos / Math.max(duration, 1)) * 100}%` }} />
        </div>
      </div>

      <div className="tr">
        {byTurn.map((turn, t) => (
          <p key={t} className={turn.role === 'candidate' ? 'me' : 'ai'}>
            <span className="who">{turn.role === 'candidate' ? 'You' : 'Interviewer'}</span>
            {turn.words.map((w) => (
              <span key={w.i} className={`${w.filler ? 'f' : ''} ${w.t <= pos ? 'said' : ''} ${w.i === current && playing ? 'now' : ''}`}>
                {w.word}{' '}
              </span>
            ))}
          </p>
        ))}
        {!words.length && <span className="said">This session has no timed transcript.</span>}
      </div>

      <div className="mini">
        <div>
          <b>{session.overall == null ? '–' : <CountUp to={session.overall} ms={1000} format={(v) => v.toFixed(1)} />}</b>
          <small>overall, of 5</small>
        </div>
        <div>
          <b>{session.fillers}</b>
          <small>filler words</small>
        </div>
        <div>
          <b>{fmtTime(session.speakingSec)}</b>
          <small>you spoke</small>
        </div>
        <div>
          <b>{session.wordCount}</b>
          <small>words</small>
        </div>
      </div>

      {session.graded ? (
        <>
          <div className="dims">
            {scores.map((s) => (
              <div className="dim" key={s.dimension}>
                <b>{label(s.dimension)}</b>
                <span className="sc">{s.value ?? '–'}</span>
                <p>
                  {s.evidence_quote && (
                    <>
                      <q>{s.evidence_quote}</q>{' '}
                    </>
                  )}
                  {s.fix}
                </p>
              </div>
            ))}
          </div>
          {session.weakest && (
            <p className="coach">
              <b>Next take:</b> {session.weakest.fix ?? `Work on ${label(session.weakest.dimension).toLowerCase()} first.`}
            </p>
          )}
          <div className="actions" style={{ marginTop: 18 }}>
            <button className="btn solid" type="button" data-burst onClick={planNext} disabled={planning}>
              <span>{planning ? 'Planning…' : 'Generate my next interview'}</span>
            </button>
            <button className="btn ghost" type="button" onClick={downloadReport}>
              Download report (PDF)
            </button>
          </div>
          <p className="foot-note">Scores are practice guidance from an AI, not a hiring decision. Each one quotes your own words.</p>
        </>
      ) : (
        <p className="coach">{grading ? 'Grading this take… it takes a few seconds.' : 'Not graded yet.'}</p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </article>
  )
}
