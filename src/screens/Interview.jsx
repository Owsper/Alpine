import { Check, Clock, Mic, MicOff, Sparkle, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { currentQuestion, questions, sessionStartSeconds } from '../data.js'
import { useFlow } from '../flow.jsx'

function questionState(i) {
  if (i < currentQuestion.index) return 'done'
  if (i === currentQuestion.index) return 'current'
  return undefined
}

function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export default function Interview() {
  const [elapsed, setElapsed] = useState(sessionStartSeconds)
  const [micOn, setMicOn] = useState(true)
  const { completeStep } = useFlow()
  const number = currentQuestion.index + 1
  const count = `Question ${number} of ${questions.length}`
  const MicIcon = micOn ? Mic : MicOff

  useEffect(() => {
    const timer = setInterval(() => setElapsed((seconds) => seconds + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="interview">
      <h1 className="sr-only">Interview</h1>
      <section className="stage" aria-label="AI interviewer">
        <div className="stage-top">
          <span className="stage-pill">
            <Sparkle size={20} strokeWidth={1.75} aria-hidden="true" />
            AI interviewer
          </span>
          <span className="stage-pill timer" role="timer" aria-label="Elapsed time">
            <Clock size={20} strokeWidth={1.75} aria-hidden="true" />
            {formatElapsed(elapsed)}
          </span>
        </div>
        <div className="speaker">
          <div className="orb" aria-hidden="true" />
          <span>Speaking…</span>
        </div>
        <div className="prompt">
          <small>{count}</small>
          <p>{currentQuestion.text}</p>
        </div>
      </section>
      <aside className="card session">
        <h2>Session</h2>
        <p className="session-count">{count}</p>
        <div className="meter" role="progressbar" aria-label={count} aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={number}>
          <span style={{ width: `${(number / questions.length) * 100}%` }} />
        </div>
        <ol className="questions">
          {questions.map((question, i) => {
            const state = questionState(i)
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
        <button className={micOn ? 'btn btn-mic-on' : 'btn btn-muted'} type="button" onClick={() => setMicOn(!micOn)}>
          <MicIcon size={20} strokeWidth={1.75} aria-hidden="true" />
          {micOn ? 'Mic on' : 'Mic off'}
        </button>
        <Link className="btn" to="/report" onClick={() => completeStep(2)}>
          <Square size={18} strokeWidth={1.75} aria-hidden="true" />
          End session
        </Link>
      </aside>
    </div>
  )
}
