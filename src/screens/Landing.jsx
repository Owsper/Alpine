import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SplitText from '../components/SplitText.jsx'
import VoiceField from '../components/VoiceField.jsx'
import { useReducedMotion } from '../motion.js'
import '../landing.css'

const ROTATING = ['out loud', 'under pressure', 'for this exact role']
const STAGE_MS = 2600
const STAGES = 4

const SCORES = [
  { name: 'STAR structure', value: 4 },
  { name: 'Relevance', value: 4 },
  { name: 'Evidence', value: 2, weak: true },
]

// One real-sounding answer, marked up the way the grader reads it: each note points at the words it is about.
const ANSWER = [
  { text: 'Last spring our fleet service had to move from Python to Go in three weeks. ' },
  { text: 'I had never written Go,', note: 'situation', label: 'Situation · clear and short', tone: 'good' },
  { text: ' so ' },
  { text: 'we split the work and someone set up the tooling.', note: 'action', label: 'Action · who is “someone”? Say what you did.', tone: 'warn' },
  { text: ' ' },
  { text: 'It went fine in the end.', note: 'result', label: 'Result · no number. How fast, how many, how much?', tone: 'warn' },
]

function useRotatingWord(reduce) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (reduce) return undefined
    const timer = setInterval(() => setIndex((i) => (i + 1) % ROTATING.length), 2600)
    return () => clearInterval(timer)
  }, [reduce])
  return index
}

/** A self-playing miniature of one practice turn: question, answer, transcript, scores. */
function SessionSheet({ reduce }) {
  const [stage, setStage] = useState(reduce ? STAGES - 1 : 0)

  useEffect(() => {
    if (reduce) return undefined
    const timer = setInterval(() => setStage((s) => (s + 1) % STAGES), STAGE_MS)
    return () => clearInterval(timer)
  }, [reduce])

  const on = (n) => (stage >= n ? ' is-on' : '')

  return (
    <figure className="sheet" aria-label="Example of one practice turn">
      <figcaption className="sheet-head">
        <span>Question 2 of 5</span>
        <span>04:12</span>
      </figcaption>

      <p className={`sheet-q${on(0)}`}>
        <b>Interviewer</b>
        Tell me about a time you had to learn something new, fast.
      </p>

      <div className={`sheet-voice${on(1)}`} aria-hidden="true">
        <b>You</b>
        <span className="wave">
          {Array.from({ length: 32 }, (_, i) => (
            <i key={i} style={{ '--i': i }} />
          ))}
        </span>
      </div>

      <p className={`sheet-said${on(2)}`}>
        <span>“I picked up Go in two weeks by shipping one small service a day.”</span>
      </p>

      <dl className={`sheet-scores${on(3)}`}>
        {SCORES.map((score, i) => (
          <div key={score.name} className={score.weak ? 'is-weak' : undefined} style={{ '--i': i }}>
            <dt>{score.name}</dt>
            <dd>
              <span className="score-meter" aria-hidden="true">
                <span style={{ '--to': score.value / 5 }} />
              </span>
              {score.value} / 5
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  )
}

export default function Landing() {
  const reduce = useReducedMotion()
  const word = useRotatingWord(reduce)
  let wordIndex = 0

  return (
    <div className="landing">
      <header className="l-nav">
        <Link className="l-brand" to="/" translate="no">
          InterviewVerse
        </Link>
        <a className="l-nav-link" href="#marked-up">
          How answers are scored
        </a>
        <Link className="l-nav-cta" to="/start">
          Start practising
        </Link>
      </header>

      <main>
        <section className="l-hero">
          <div className="l-copy">
            <h1 className="l-title">
              <SplitText text="Rehearse the interview" step={28} />{' '}
              <span className="rotator" aria-live="polite">
                <span className="rotator-word" key={word}>
                  {ROTATING[word]}.
                </span>
                <svg className="scribble" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true" key={`s-${word}`}>
                  <path d="M3 14 C 60 4, 120 18, 180 9 S 270 6, 297 12" pathLength="1" />
                </svg>
              </span>
            </h1>
            <p className="l-lede">
              Paste a job posting and answer an AI interviewer by voice. Every score quotes the sentence that earned it, and your
              next interview goes after the answers that were weakest.
            </p>
            <div className="l-actions">
              <Link className="l-cta" to="/start">
                Start practising
                <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
              </Link>
              <a className="l-text-link" href="#marked-up">
                See a marked-up answer
              </a>
            </div>
          </div>
          <SessionSheet reduce={reduce} />
        </section>

        <div className="l-field">
          <VoiceField rows={16} cols={96} />
          <p>Your voice, turned into text. The audio itself is never kept.</p>
        </div>

        <section className="l-markup" id="marked-up" aria-labelledby="markup-title">
          <h2 id="markup-title">One answer, marked up</h2>
          <p className="l-section-lede">
            This is how the grader reads you. Notes point at your own words, so you know exactly what to change before the next
            round.
          </p>
          <div className="markup">
            <blockquote className="markup-answer">
              {ANSWER.map((part, i) => {
                // Each word lights up in reading order, the way the grader works through the answer.
                const words = part.text.split(/(\s+)/).map((w, j) =>
                  w.trim() ? (
                    <span className="word" key={j} style={{ '--w': wordIndex++ }}>
                      {w}
                    </span>
                  ) : (
                    w
                  ),
                )
                return part.note ? (
                  <mark key={i} className={`hl hl-${part.tone}`} data-note={part.note}>
                    {words}
                  </mark>
                ) : (
                  <span key={i}>{words}</span>
                )
              })}
            </blockquote>
            <ol className="markup-notes">
              {ANSWER.filter((part) => part.note).map((part) => (
                <li key={part.note} className={`note-${part.tone}`}>
                  {part.label}
                </li>
              ))}
            </ol>
          </div>
          <p className="markup-verdict">
            Evidence <b>2 / 5</b> — the next interview asks you two more questions that need a measurable result.
          </p>
        </section>

        <section className="l-never" aria-labelledby="never-title">
          <h2 id="never-title">What it will never do</h2>
          <ul>
            <li style={{ '--i': 0 }}>
              <b>Read your face.</b> The camera is an optional mirror for you. Nothing analyses it.
            </li>
            <li style={{ '--i': 1 }}>
              <b>Keep your voice.</b> Audio is turned into text and dropped. Only the transcript is stored.
            </li>
            <li style={{ '--i': 2 }}>
              <b>Pretend to be human.</b> The interviewer says it is an AI in its first sentence, and only cites facts you can check.
            </li>
          </ul>
        </section>

        <section className="l-close">
          <p>Five questions, about ten minutes. Bring a job posting.</p>
          <Link className="l-cta" to="/start">
            Start practising
            <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
          </Link>
        </section>
      </main>

      <footer className="l-foot">
        <span translate="no">InterviewVerse</span>
        <span>Practice tool · scores are guidance, not a hiring decision</span>
      </footer>
    </div>
  )
}
