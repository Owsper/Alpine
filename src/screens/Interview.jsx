import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { currentQuestion, questions, sessionStartSeconds } from '../data.js'

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
  const number = currentQuestion.index + 1
  const count = `Question ${number} of ${questions.length}`

  useEffect(() => {
    const timer = setInterval(() => setElapsed((seconds) => seconds + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="interview">
      <h1 className="sr-only">Interview</h1>
      <section className="stage" aria-label="AI interviewer">
        <div className="stage-top">
          <span className="tag">AI interviewer</span>
          <span className="timer" role="timer" aria-label="Elapsed time">
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
          {questions.map((question, i) => (
            <li key={question} className={questionState(i)} aria-current={i === currentQuestion.index ? 'step' : undefined}>
              {question}
            </li>
          ))}
        </ol>
        <button className={micOn ? 'btn' : 'btn btn-muted'} type="button" onClick={() => setMicOn(!micOn)}>
          {micOn ? 'Mic on' : 'Mic off'}
        </button>
        <Link className="btn" to="/report">
          End session
        </Link>
      </aside>
    </div>
  )
}
