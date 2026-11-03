import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setLevel } from '../ambient.js'
import { api } from '../api.js'
import { fmtTime } from '../dashboard.js'
import { Mic } from '../voice/audio.ts'
import { config } from '../voice/config.ts'
import { InterviewFlow } from '../voice/interviewFlow.ts'
import { Speaker, transcribe } from '../voice/localVoice.ts'

const ROLES = ['Software engineer', 'Backend engineer', 'Product designer', 'Data analyst', 'Product manager', 'Security analyst']
const PAUSE_S = 1.5
const DRAFT_KEY = 'interviewverse-job-draft'

function loadDraft() {
  try {
    return { company: '', role: '', posting: '', ...JSON.parse(sessionStorage.getItem(DRAFT_KEY)) }
  } catch {
    return { company: '', role: '', posting: '' }
  }
}

export default function Practice({ data }) {
  const navigate = useNavigate()
  // job → facts → live → done
  const [stage, setStage] = useState('job')
  const [job, setJob] = useState(loadDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [jobId, setJobId] = useState(null)
  const [facts, setFacts] = useState([])
  const [result, setResult] = useState(null)
  const { upcoming, reload } = data

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(job))
    } catch {
      // Without storage the draft just does not survive a refresh.
    }
  }, [job])

  async function research(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const found = await api.research(job)
      setJobId(found.job.id)
      setFacts(found.facts.map((fact, i) => ({ ...fact, id: i, keep: true })))
      setStage('facts')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  function startPlanned() {
    setJobId(upcoming.jobId)
    setFacts(upcoming.facts.map((fact, i) => ({ ...fact, id: i, keep: true })))
    setStage('live')
  }

  if (stage === 'live')
    return (
      <Live
        jobId={jobId}
        facts={facts.filter((f) => f.keep)}
        onCancel={() => setStage('job')}
        onDone={(summary) => {
          setResult(summary)
          setStage('done')
          // Graded in the background; the report is ready by the time Sessions opens.
          api.grade(summary.sessionId).then(reload, reload)
        }}
      />
    )

  if (stage === 'done')
    return (
      <div className="sum">
        <article className="card rise" style={{ '--d': 0 }}>
          <h2>Take finished</h2>
          <p className="sub">
            {result.role} at {result.company}, take {result.number}
          </p>
          <div className="stats">
            <div>
              <b>{fmtTime(result.elapsed)}</b>
              <small>length</small>
            </div>
            {result.share > 0 && (
              <>
                <div>
                  <b>{result.share}%</b>
                  <small>speaking</small>
                </div>
                <div>
                  <b>{result.pauses}</b>
                  <small>pauses over {PAUSE_S} s</small>
                </div>
                <div>
                  <b>{result.longest.toFixed(1)} s</b>
                  <small>longest pause</small>
                </div>
              </>
            )}
          </div>
          <p className="note">Your answers are saved as text and being graded now. The audio was never stored.</p>
          <div className="actions" style={{ marginTop: 18 }}>
            <button className="btn solid" type="button" data-burst onClick={() => navigate(`/sessions/${result.sessionId}`)}>
              <span>See the report</span>
            </button>
            <button className="btn ghost" type="button" onClick={() => setStage('job')}>
              Practise again
            </button>
          </div>
        </article>
      </div>
    )

  return (
    <div className="setup" data-anchor data-ax=".8" data-ay=".3" data-ar=".3" data-orb='{"amp":0.1,"m":0,"alpha":0.95,"warm":0.2,"tilt":0.3}'>
      <header className="top rise" style={{ '--d': 0 }}>
        <div>
          <h1>Practice</h1>
          <p>Paste the job. We check the company, you check our facts, then you answer out loud.</p>
        </div>
      </header>

      {stage === 'job' && upcoming && (
        <div className="card rise" style={{ '--d': 1, marginBottom: 16 }}>
          <h2>Your next interview is ready</h2>
          <p className="sub" style={{ marginBottom: 16 }}>
            Take {upcoming.number} for {upcoming.role} at {upcoming.company}, built from the weak spots of your last take.
          </p>
          <button className="btn solid" type="button" data-burst onClick={startPlanned}>
            <span>Start take {upcoming.number}</span>
          </button>
        </div>
      )}

      {stage === 'job' && (
        <form className="card rise" style={{ '--d': 2 }} onSubmit={research}>
          <div className="steps-mini">
            <b>1 · The job</b>
            <span>2 · The facts</span>
            <span>3 · The interview</span>
          </div>
          <h2>Role</h2>
          <div className="chips">
            {ROLES.map((role) => (
              <button key={role} type="button" className={`chip ${job.role === role ? 'on' : ''}`} onClick={() => setJob({ ...job, role })}>
                {role}
              </button>
            ))}
          </div>
          <div className="two">
            <label className="field">
              <span>Role title</span>
              <input className="input" required value={job.role} onChange={(e) => setJob({ ...job, role: e.target.value })} placeholder="Software engineer, working student" />
            </label>
            <label className="field">
              <span>Company</span>
              <input className="input" required value={job.company} onChange={(e) => setJob({ ...job, company: e.target.value })} placeholder="Acme Robotics" />
            </label>
          </div>
          <label className="field">
            <span>Job post</span>
            <textarea className="input" required value={job.posting} onChange={(e) => setJob({ ...job, posting: e.target.value })} placeholder="Paste the job description here." />
          </label>
          <button className="btn solid" type="submit" disabled={busy}>
            <span>{busy ? 'Researching the company…' : 'Research the company'}</span>
          </button>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
        </form>
      )}

      {stage === 'facts' && (
        <div className="card rise" style={{ '--d': 1 }}>
          <div className="steps-mini">
            <span>1 · The job</span>
            <b>2 · The facts</b>
            <span>3 · The interview</span>
          </div>
          <h2>What we found about {job.company}</h2>
          <p className="sub">The interviewer only uses the facts you keep. Untick anything that is wrong.</p>
          <div className="facts">
            {facts.map((fact) => (
              <label key={fact.id} className={`fact ${fact.keep ? '' : 'off'}`}>
                <input type="checkbox" checked={fact.keep} onChange={() => setFacts(facts.map((f) => (f.id === fact.id ? { ...f, keep: !f.keep } : f)))} />
                <span>{fact.claim}</span>
                <small>
                  {fact.source_url?.startsWith('http') ? (
                    <a href={fact.source_url} target="_blank" rel="noreferrer">
                      {fact.source_label}
                    </a>
                  ) : (
                    fact.source_label || 'The job post you pasted'
                  )}
                </small>
              </label>
            ))}
            {!facts.length && <p className="empty">Nothing reliable found. The interview still works from the job post.</p>}
          </div>
          <div className="actions">
            <button className="btn solid" type="button" data-burst onClick={() => setStage('live')}>
              <span>Ask me a question</span>
            </button>
            <button className="btn ghost" type="button" onClick={() => setStage('job')}>
              Back
            </button>
          </div>
          <p className="note" style={{ marginTop: 14 }}>
            Your browser will ask for the microphone. Audio is turned into text on this machine and dropped; only the transcript is kept.
          </p>
        </div>
      )}
    </div>
  )
}

/** The live interview: the voice engine from src/voice, drawn in the Alpine live layout. */
function Live({ jobId, facts, onCancel, onDone }) {
  const [phase, setPhase] = useState('starting')
  const [caption, setCaption] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [hearing, setHearing] = useState(false)
  const [heard, setHeard] = useState('')
  const [index, setIndex] = useState(-1)
  const [session, setSession] = useState(null)
  const [notice, setNotice] = useState('')
  const [typed, setTyped] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [, setTick] = useState(0)
  const flow = useRef(null)
  const mic = useRef(null)
  const speaker = useRef(null)
  const level = useRef(0)
  const hearingRef = useRef(false)
  const stats = useRef({ t0: 0, speak: 0, silence: 0, pauses: 0, longest: 0, last: 0 })
  const interviewerTalking = useRef(false)
  hearingRef.current = hearing

  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const status = await api.voiceStatus().catch(() => null)
        if (status && status.enabled && !status.ready) setNotice('The voice models are still loading. Questions appear as text and you can type your answers until they are ready.')
        const fresh = await api.session(jobId)
        await api.start(fresh.sessionId)
        if (cancelled) return
        const reviewed = { ...fresh, facts: facts.map((fact) => ({ claim: fact.claim, source_url: fact.source_url ?? '' })) }
        setSession(reviewed)

        const out = new Speaker()
        await out.unlock()
        out.onStart = () => {
          setSpeaking(true)
          interviewerTalking.current = true
          if (mic.current) mic.current.interviewerSpeaking = true
        }
        out.onIdle = () => {
          setSpeaking(false)
          interviewerTalking.current = false
          if (mic.current) mic.current.interviewerSpeaking = false
        }
        speaker.current = out

        const interview = new InterviewFlow(reviewed, out, {
          onState: (state) => {
            if (state === 'saving') setPhase('saving')
            if (state === 'done') finish(reviewed)
            if (state === 'error') {
              setPhase('live')
              setNotice('Your answers could not be saved. Press End session to try again.')
            }
          },
          onCaption: setCaption,
          onQuestion: setIndex,
          onLog: (line) => console.info('[interview]', line),
        })
        flow.current = interview

        let speechStartedAt = 0
        const input = new Mic({
          onLevel: (rms) => onLevel(rms),
          onSpeechStart: () => {
            speechStartedAt = Date.now()
            setHearing(true)
          },
          onConfirmedSpeech: () => {
            if (out.speaking) out.stop()
            interview.onSpeech()
          },
          onUtterance: (wav) => {
            setHearing(false)
            const startedAt = speechStartedAt
            const endedAt = Date.now()
            transcribe(wav).then(
              (text) => {
                if (!text) return interview.release()
                setHeard(text)
                void interview.onAnswer(text, startedAt, endedAt)
              },
              () => {
                interview.release()
                setNotice('Speech recognition is unavailable right now. You can type your answer below.')
              },
            )
          },
        })
        try {
          await input.start()
          mic.current = input
        } catch {
          setNotice('The microphone is blocked. You can type your answers below instead.')
        }
        if (cancelled) return input.stop()
        stats.current = { t0: performance.now(), speak: 0, silence: 0, pauses: 0, longest: 0, last: performance.now() }
        setPhase('live')
        void interview.start()
      } catch (failure) {
        if (!cancelled) setNotice(failure.message)
      }
    }
    void start()
    const clock = setInterval(() => setTick((t) => t + 1), 250)
    return () => {
      cancelled = true
      clearInterval(clock)
      mic.current?.stop()
      speaker.current?.stop()
      setLevel(0)
    }
    // Runs once per interview; facts and jobId are fixed for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (mic.current) mic.current.paused = !micOn
  }, [micOn])

  // Speaking time and pauses count only while it is the candidate's turn.
  function onLevel(rms) {
    const now = performance.now()
    const s = stats.current
    const dt = Math.min(0.2, (now - s.last) / 1000)
    s.last = now
    level.current = Math.min(1, rms * 8)
    setLevel(level.current * 0.8)
    if (interviewerTalking.current || !s.t0) return
    if (rms > config.vad.startRms) {
      s.speak += dt
      if (s.silence > PAUSE_S) {
        s.pauses++
        s.longest = Math.max(s.longest, s.silence)
      }
      s.silence = 0
    } else s.silence += dt
  }

  function finish(reviewed) {
    mic.current?.stop()
    const s = stats.current
    const elapsed = (performance.now() - s.t0) / 1000
    onDone({
      sessionId: reviewed.sessionId,
      role: reviewed.role,
      company: reviewed.company,
      number: reviewed.number,
      elapsed,
      share: elapsed > 0 ? Math.round((s.speak / elapsed) * 100) : 0,
      pauses: s.pauses,
      longest: s.longest,
    })
  }

  function submitTyped(event) {
    event.preventDefault()
    const text = typed.trim()
    if (!text || !flow.current) return
    setTyped('')
    setHeard(text)
    speaker.current?.stop()
    void flow.current.onAnswer(text, Date.now(), Date.now(), true)
  }

  const s = stats.current
  const elapsed = s.t0 ? (performance.now() - s.t0) / 1000 : 0
  const pausing = s.silence > PAUSE_S && !interviewerTalking.current
  const status = phase === 'starting' ? 'Preparing the interviewer' : phase === 'saving' ? 'Saving your answers' : speaking ? 'Interviewer is asking' : hearing ? 'Listening to you' : 'Your turn'

  return (
    <div className={`live ${hearing ? 'rec' : ''}`} data-anchor data-ax=".88" data-ay=".45" data-ar=".2" data-orb='{"amp":0.12,"m":0,"alpha":0.75,"warm":0.5,"tilt":0.3}'>
      <div className="st">
        <i />
        <span>{status}</span>
      </div>
      {session && (
        <ol className="qlist" aria-label={`Question ${index + 1} of ${session.questions.length}`}>
          {session.questions.map((q, i) => (
            <li key={q.id} className={i < index ? 'done' : i === index ? 'now' : ''} />
          ))}
        </ol>
      )}
      <p className="lq" aria-live="polite">
        {caption}
      </p>
      <LiveWave level={level} hearing={hearingRef} />
      <div className="clock">{fmtTime(elapsed)}</div>
      {/* Speaking stats only mean something once the microphone has heard the candidate. */}
      <div className="stats" style={{ visibility: s.speak > 0.5 ? 'visible' : 'hidden' }}>
        <div>
          <b>{elapsed > 0 ? Math.round((s.speak / elapsed) * 100) : 0}%</b>
          <small>speaking</small>
        </div>
        <div>
          <b>{s.pauses + (pausing ? 1 : 0)}</b>
          <small>pauses over {PAUSE_S} s</small>
        </div>
        <div>
          <b>{Math.max(s.longest, pausing ? s.silence : 0).toFixed(1)} s</b>
          <small>longest pause</small>
        </div>
      </div>
      <p className="heard">
        {heard && (
          <>
            You said: <b>{heard}</b>
          </>
        )}
      </p>
      {phase === 'live' && (
        <form className="typed" onSubmit={submitTyped}>
          <input className="input" aria-label="Type your answer" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Prefer typing? Write your answer here" />
          <button className="btn ghost" type="submit" disabled={!typed.trim()}>
            Send
          </button>
        </form>
      )}
      <div className="actions" style={{ justifyContent: 'center' }}>
        {phase === 'live' && (
          <button className="btn solid" type="button" onClick={() => flow.current?.wrapUp()}>
            <span>End session</span>
          </button>
        )}
        {phase === 'live' && (
          <button className="btn ghost" type="button" aria-pressed={!micOn} onClick={() => setMicOn(!micOn)}>
            {micOn ? 'Mute mic' : 'Unmute mic'}
          </button>
        )}
        {phase === 'starting' && (
          <button className="btn ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <p className="note">The interviewer is an AI. It speaks first, then listens; pause for a moment when you finish an answer.</p>
      {notice && (
        <p className="alert" role="alert">
          {notice}
        </p>
      )}
    </div>
  )
}

/** The live level bars from the design, driven by the microphone. */
function LiveWave({ level, hearing }) {
  const canvas = useRef(null)
  useEffect(() => {
    const cv = canvas.current
    const ctx = cv.getContext('2d')
    const css = getComputedStyle(document.documentElement)
    const glacier = css.getPropertyValue('--glacier').trim()
    const glow = css.getPropertyValue('--alpenglow').trim()
    let frame
    let shown = 0
    const draw = (now) => {
      const dpr = Math.min(devicePixelRatio || 1, 2)
      const w = cv.clientWidth
      const h = cv.clientHeight
      if (cv.width !== Math.round(w * dpr)) {
        cv.width = Math.round(w * dpr)
        cv.height = Math.round(h * dpr)
      }
      shown += (level.current - shown) * 0.35
      const t = now / 1000
      const N = 64
      const bw = w / N
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = hearing.current && shown > 0.07 ? glow : glacier
      for (let i = 0; i < N; i++) {
        const env = Math.sin(((i + 0.5) / N) * Math.PI)
        const n = ((Math.sin(t * 5 + i * 0.7) + Math.sin(t * 3.1 - i * 1.3) * 0.7) / 1.7) * 0.5 + 0.5
        const bh = Math.max(2, (0.06 + shown * 0.95) * h * (0.25 + 0.75 * n) * (0.3 + 0.7 * env))
        ctx.globalAlpha = 0.4 + 0.6 * env
        ctx.fillRect(i * bw + bw * 0.2, h / 2 - bh / 2, bw * 0.6, bh)
      }
      ctx.globalAlpha = 1
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [level, hearing])
  return <canvas id="lw" ref={canvas} aria-hidden="true" />
}
