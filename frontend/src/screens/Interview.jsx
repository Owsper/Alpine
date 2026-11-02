import { Camera, CameraOff, Check, Clock, Maximize2, Mic as MicIconOn, MicOff, PhoneOff, Play, Send, Sparkle, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import femaleInterviewer from '../assets/interviewer-female.webp'
import maleInterviewer from '../assets/interviewer-male.webp'
import VoiceField from '../components/VoiceField.jsx'
import { cleanFacts, generateQuestions } from '../data.js'
import { useFlow } from '../flow.jsx'
import { Mic } from '../voice/audio.ts'
import { InterviewFlow } from '../voice/interviewFlow.ts'
import { Speaker, transcribe } from '../voice/localVoice.ts'

const INTERVIEWERS = [
  { id: 'male', label: 'Male', src: maleInterviewer },
  { id: 'female', label: 'Female', src: femaleInterviewer },
]

function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function cameraErrorMessage(error) {
  if (error?.name === 'NotAllowedError') return 'Your camera is blocked. Allow it in your browser’s site settings, then try again.'
  if (error?.name === 'NotFoundError') return 'No camera found on this device.'
  return 'Your camera couldn’t start. Check that no other app is using it, then try again.'
}

export default function Interview() {
  const navigate = useNavigate()
  const [now, setNow] = useState(() => Date.now())
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(false)
  const [notice, setNotice] = useState('')
  const [spotlight, setSpotlight] = useState('interviewer')
  // lobby → starting → live → saving
  const [phase, setPhase] = useState('lobby')
  const [session, setSession] = useState(null)
  const [questionIndex, setQuestionIndex] = useState(-1)
  const [caption, setCaption] = useState('')
  const [lastAnswer, setLastAnswer] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [hearing, setHearing] = useState(false)
  const [typed, setTyped] = useState('')
  const videoRef = useRef(null)
  const swapRef = useRef(null)
  const micButtonRef = useRef(null)
  const swapped = useRef(false)
  const interview = useRef(null)
  const mic = useRef(null)
  const speaker = useRef(null)
  const { completeStep, facts, interviewer, setInterviewer, interviewStartedAt, startInterview, finishInterview, resetInterview, jobId, setIds } = useFlow()
  const started = phase === 'live' || phase === 'saving'
  const elapsed = started && interviewStartedAt ? Math.max(0, Math.floor((now - interviewStartedAt) / 1000)) : 0
  const activeInterviewer = INTERVIEWERS.find((option) => option.id === interviewer) ?? INTERVIEWERS[0]
  const questionTexts = session ? session.questions.map((q) => q.text) : generateQuestions(facts)
  const MicIcon = micOn ? MicIconOn : MicOff
  const CameraIcon = cameraOn ? Camera : CameraOff
  const interviewerIsMain = spotlight === 'interviewer'

  useEffect(() => {
    if (!started) return undefined
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [started])

  // Leaving the page ends the microphone and any speech in progress.
  useEffect(
    () => () => {
      mic.current?.stop()
      speaker.current?.stop()
    },
    [],
  )

  useEffect(() => {
    if (mic.current) mic.current.paused = !micOn
  }, [micOn])

  // The preview stays on this device. The stream is stopped as soon as the camera is turned off or the page is left.
  useEffect(() => {
    if (!cameraOn) return undefined
    let stream
    let cancelled = false
    navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(
      (media) => {
        if (cancelled) return media.getTracks().forEach((track) => track.stop())
        stream = media
        videoRef.current.srcObject = media
      },
      (error) => {
        if (cancelled) return
        setCameraOn(false)
        setNotice(cameraErrorMessage(error))
      },
    )
    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [cameraOn])

  useEffect(() => {
    if (!swapped.current) return
    swapped.current = false
    swapRef.current?.focus()
  }, [spotlight])

  function finish() {
    mic.current?.stop()
    completeStep(2)
    finishInterview()
    navigate('/report')
  }

  async function handleStart() {
    if (!jobId) {
      setNotice('Research the job first, so the interviewer knows what to ask.')
      return
    }
    setNotice('')
    setPhase('starting')
    try {
      const fresh = await api.session(jobId)
      await api.start(fresh.sessionId)
      // The interviewer may only use the facts the candidate reviewed and kept on the Research screen.
      const reviewed = { ...fresh, facts: cleanFacts(facts).map((fact) => ({ claim: fact.text, source_url: fact.url ?? fact.source ?? '' })) }
      setSession(reviewed)
      setIds({ sessionId: fresh.sessionId })

      const out = new Speaker()
      await out.unlock()
      out.onStart = () => {
        setSpeaking(true)
        if (mic.current) mic.current.interviewerSpeaking = true
      }
      out.onIdle = () => {
        setSpeaking(false)
        if (mic.current) mic.current.interviewerSpeaking = false
      }
      speaker.current = out

      const flow = new InterviewFlow(reviewed, out, {
        onState: (state) => {
          if (state === 'saving') setPhase('saving')
          if (state === 'done') finish()
          if (state === 'error') {
            setPhase('live')
            setNotice('Your answers could not be saved. Press End session to try again.')
          }
        },
        onCaption: setCaption,
        onQuestion: setQuestionIndex,
        onLog: (line) => console.info('[interview]', line),
      })
      interview.current = flow

      let speechStartedAt = 0
      const input = new Mic({
        onLevel: () => {},
        onSpeechStart: () => {
          speechStartedAt = Date.now()
          setHearing(true)
        },
        // Barge-in: once it is clearly the candidate talking, the interviewer stops.
        onConfirmedSpeech: () => {
          if (out.speaking) out.stop()
          flow.onSpeech()
        },
        onUtterance: (wav) => {
          setHearing(false)
          const startedAt = speechStartedAt
          const endedAt = Date.now()
          transcribe(wav).then(
            (text) => {
              if (!text) return flow.release()
              setLastAnswer(text)
              void flow.onAnswer(text, startedAt, endedAt)
            },
            () => {
              flow.release()
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

      startInterview()
      setPhase('live')
      micButtonRef.current?.focus()
      void flow.start()
    } catch (error) {
      setPhase('lobby')
      setNotice(error.message)
    }
  }

  function submitTyped(event) {
    event.preventDefault()
    const text = typed.trim()
    if (!text || !interview.current) return
    setTyped('')
    setLastAnswer(text)
    speaker.current?.stop()
    void interview.current.onAnswer(text, Date.now(), Date.now(), true)
  }

  function endSession() {
    if (interview.current) void interview.current.wrapUp()
    else {
      resetInterview()
      navigate('/report')
    }
  }

  function swapButton(next, label) {
    return (
      <button
        className="tile-swap"
        type="button"
        ref={swapRef}
        aria-label={label}
        title={label}
        onClick={() => {
          swapped.current = true
          setSpotlight(next)
        }}
      >
        <span className="tile-swap-icon">
          <Maximize2 size={14} strokeWidth={2.25} aria-hidden="true" />
        </span>
      </button>
    )
  }

  const status = phase === 'saving' ? 'Saving…' : speaking ? 'Speaking…' : hearing ? 'Listening to you…' : 'Your turn'

  return (
    <div className="interview">
      <h1 className="sr-only">Interview</h1>
      <section className="stage rise" style={{ '--i': 0 }} aria-label="Interview call">
        <div className="call-video">
          <div className={`call-tile interviewer-tile ${interviewerIsMain ? 'main' : 'pip'}`}>
            <img src={activeInterviewer.src} width="1672" height="941" alt={`${activeInterviewer.label} AI interviewer`} fetchPriority="high" />
            {interviewerIsMain ? (
              started && (
                <span className="speaking">
                  {speaking && (
                    <span className="eq" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                  {status}
                </span>
              )
            ) : (
              <>
                <span className="tile-name">Interviewer</span>
                {swapButton('interviewer', 'Show the interviewer in the full view')}
              </>
            )}
          </div>
          <div className={`call-tile self-tile ${interviewerIsMain ? 'pip' : 'main'}`}>
            {cameraOn ? (
              <video ref={videoRef} autoPlay muted playsInline aria-label="Your camera preview" />
            ) : (
              <div className="self-placeholder">
                <span className="self-avatar">
                  <User strokeWidth={1.75} aria-hidden="true" />
                </span>
                {!interviewerIsMain && <p>Your camera is off</p>}
              </div>
            )}
            {interviewerIsMain && (
              <>
                <span className="tile-name">You</span>
                {swapButton('self', 'Show yourself in the full view')}
              </>
            )}
          </div>
          {!started && (
            <div className="lobby">
              <h2>Ready to start your interview?</h2>
              <p>The interviewer is an AI. It speaks first, then listens. Pause for a second when you finish an answer.</p>
              <button className="lobby-start" type="button" onClick={handleStart} disabled={phase === 'starting'}>
                <Play size={20} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
                {phase === 'starting' ? 'Preparing…' : 'Start interview'}
              </button>
            </div>
          )}
          {started && caption && (
            <p className="call-caption" aria-live="polite">
              {caption}
            </p>
          )}
          <div className="stage-top">
            <span className="stage-pill">
              <span className="live-dot" aria-hidden="true" />
              <Sparkle size={18} strokeWidth={1.75} aria-hidden="true" />
              AI interviewer
            </span>
            <span className="stage-pill timer" role="timer" aria-label="Elapsed time">
              <Clock size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className="timer-digits">
                {formatElapsed(elapsed)
                  .split('')
                  .map((char, i) => (
                    <span key={`${i}-${char}`} className="timer-digit">
                      {char}
                    </span>
                  ))}
              </span>
            </span>
          </div>
        </div>
        <VoiceField rows={8} cols={80} className="call-field" />
        {started && (
          <form className="type-answer" onSubmit={submitTyped}>
            <label className="sr-only" htmlFor="typed-answer">
              Type your answer
            </label>
            <input id="typed-answer" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={lastAnswer ? `You said: ${lastAnswer}` : 'Prefer typing? Write your answer here…'} />
            <button type="submit" aria-label="Send answer" disabled={!typed.trim()}>
              <Send size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </form>
        )}
        {notice && (
          <p className="call-notice" role="alert">
            {notice}
          </p>
        )}
        <div className="call-controls" role="group" aria-label="Call controls">
          <button className={micOn ? 'call-button' : 'call-button off'} type="button" ref={micButtonRef} aria-pressed={micOn} onClick={() => setMicOn(!micOn)}>
            <MicIcon size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="call-label">{micOn ? 'Mic on' : 'Mic off'}</span>
          </button>
          <button
            className={cameraOn ? 'call-button' : 'call-button off'}
            type="button"
            onClick={() => {
              setNotice('')
              setCameraOn((on) => !on)
            }}
          >
            <CameraIcon size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="call-label">{cameraOn ? 'Camera on' : 'Camera off'}</span>
          </button>
          {started && (
            <button className="call-button call-end" type="button" onClick={endSession} disabled={phase === 'saving'}>
              <PhoneOff size={20} strokeWidth={1.75} aria-hidden="true" />
              {phase === 'saving' ? 'Saving…' : 'End session'}
            </button>
          )}
        </div>
      </section>
      <aside className="card session rise" style={{ '--i': 1 }}>
        <h2>Session{session ? ` ${session.number}` : ''}</h2>
        <ol className="questions">
          {questionTexts.map((question, i) => {
            const state = !started ? undefined : i < questionIndex ? 'done' : i === questionIndex ? 'current' : undefined
            return (
              <li key={question} className={state} style={{ '--i': i }} aria-current={state === 'current' ? 'step' : undefined}>
                <span className="question-marker">{state === 'done' && <Check size={13} strokeWidth={3.5} aria-label="Completed" />}</span>
                {question}
              </li>
            )
          })}
        </ol>
        <fieldset className="interviewer-choice">
          <legend>Interviewer</legend>
          <div className="interviewer-options">
            {INTERVIEWERS.map((option) => (
              <label key={option.id}>
                <input type="radio" name="interviewer" value={option.id} checked={activeInterviewer.id === option.id} onChange={() => setInterviewer(option.id)} />
                <img src={option.src} width="1672" height="941" alt="" />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      </aside>
    </div>
  )
}
