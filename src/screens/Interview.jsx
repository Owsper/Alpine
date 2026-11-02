import { Camera, CameraOff, Check, Clock, Maximize2, Mic, MicOff, PhoneOff, Play, Sparkle, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import femaleInterviewer from '../assets/interviewer-female.webp'
import maleInterviewer from '../assets/interviewer-male.webp'
import { currentQuestion, generateQuestions } from '../data.js'
import { useFlow } from '../flow.jsx'

const INTERVIEWERS = [
  { id: 'male', label: 'Male', src: maleInterviewer },
  { id: 'female', label: 'Female', src: femaleInterviewer },
]

function questionState(i, started) {
  if (!started) return undefined
  if (i < currentQuestion.index) return 'done'
  if (i === currentQuestion.index) return 'current'
  return undefined
}

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
  const [now, setNow] = useState(() => Date.now())
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [spotlight, setSpotlight] = useState('interviewer')
  const videoRef = useRef(null)
  const swapRef = useRef(null)
  const micRef = useRef(null)
  const swapped = useRef(false)
  const justStarted = useRef(false)
  const { completeStep, facts, interviewer, setInterviewer, interviewStartedAt, startInterview, finishInterview } = useFlow()
  const questions = generateQuestions(facts)
  const started = interviewStartedAt !== null
  const elapsed = started ? Math.max(0, Math.floor((now - interviewStartedAt) / 1000)) : 0
  const activeInterviewer = INTERVIEWERS.find((option) => option.id === interviewer) ?? INTERVIEWERS[0]
  const MicIcon = micOn ? Mic : MicOff
  const CameraIcon = cameraOn ? Camera : CameraOff
  const interviewerIsMain = spotlight === 'interviewer'

  useEffect(() => {
    if (!started) return undefined
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [started])

  // The Start button disappears when pressed, so focus moves to a harmless control rather than End session.
  useEffect(() => {
    if (!started || !justStarted.current) return
    justStarted.current = false
    micRef.current?.focus()
  }, [started])

  // The preview stays on this device. The stream is stopped as soon as the camera is turned off or the page is left.
  useEffect(() => {
    if (!cameraOn) return undefined
    let stream
    let cancelled = false

    async function start() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop())
          return
        }
        stream = media
        videoRef.current.srcObject = media
      } catch (error) {
        if (cancelled) return
        setCameraOn(false)
        setCameraError(cameraErrorMessage(error))
      }
    }
    start()

    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [cameraOn])

  // The button that was pressed disappears in a swap, so keyboard focus moves to the new small tile.
  useEffect(() => {
    if (!swapped.current) return
    swapped.current = false
    swapRef.current?.focus()
  }, [spotlight])

  function toggleCamera() {
    setCameraError('')
    setCameraOn((on) => !on)
  }

  function handleStart() {
    justStarted.current = true
    startInterview()
  }

  function swapTiles(next) {
    swapped.current = true
    setSpotlight(next)
  }

  function swapButton(next, label) {
    return (
      <button className="tile-swap" type="button" ref={swapRef} aria-label={label} title={label} onClick={() => swapTiles(next)}>
        <span className="tile-swap-icon">
          <Maximize2 size={14} strokeWidth={2.25} aria-hidden="true" />
        </span>
      </button>
    )
  }

  return (
    <div className="interview">
      <h1 className="sr-only">Interview</h1>
      <section className="stage" aria-label="Interview call">
        <div className="call-video">
          <div className={`call-tile interviewer-tile ${interviewerIsMain ? 'main' : 'pip'}`}>
            <img src={activeInterviewer.src} width="1672" height="941" alt={`${activeInterviewer.label} AI interviewer`} fetchPriority="high" />
            {interviewerIsMain ? (
              started && <span className="speaking">Speaking…</span>
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
              <p>Check your camera and mic. The timer starts when you do.</p>
              <button className="lobby-start" type="button" onClick={handleStart}>
                <Play size={20} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
                Start interview
              </button>
            </div>
          )}
          <div className="stage-top">
            <span className="stage-pill">
              {interviewerIsMain ? (
                <>
                  <Sparkle size={20} strokeWidth={1.75} aria-hidden="true" />
                  AI interviewer
                </>
              ) : (
                <>
                  <User size={20} strokeWidth={1.75} aria-hidden="true" />
                  You
                </>
              )}
            </span>
            <span className="stage-pill timer" role="timer" aria-label="Elapsed time">
              <Clock size={20} strokeWidth={1.75} aria-hidden="true" />
              {formatElapsed(elapsed)}
            </span>
          </div>
        </div>
        {cameraError && (
          <p className="call-notice" role="alert">
            {cameraError}
          </p>
        )}
        <div className="call-controls" role="group" aria-label="Call controls">
          <button className={micOn ? 'call-button' : 'call-button off'} type="button" ref={micRef} onClick={() => setMicOn(!micOn)}>
            <MicIcon size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="call-label">{micOn ? 'Mic on' : 'Mic off'}</span>
          </button>
          <button className={cameraOn ? 'call-button' : 'call-button off'} type="button" onClick={toggleCamera}>
            <CameraIcon size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="call-label">{cameraOn ? 'Camera on' : 'Camera off'}</span>
          </button>
          {started && (
            <Link
              className="call-button call-end"
              to="/report"
              onClick={() => {
                completeStep(2)
                finishInterview()
              }}
            >
              <PhoneOff size={20} strokeWidth={1.75} aria-hidden="true" />
              End session
            </Link>
          )}
        </div>
      </section>
      <aside className="card session">
        <h2>Session</h2>
        <ol className="questions">
          {questions.map((question, i) => {
            const state = questionState(i, started)
            return (
              <li key={question} className={state} aria-current={state === 'current' ? 'step' : undefined}>
                <span className="question-marker">
                  {state === 'done' && <Check size={13} strokeWidth={3.5} aria-label="Completed" />}
                </span>
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
                <input
                  type="radio"
                  name="interviewer"
                  value={option.id}
                  checked={activeInterviewer.id === option.id}
                  onChange={() => setInterviewer(option.id)}
                />
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
