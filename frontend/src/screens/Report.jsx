import { FileText, Lightbulb, Play, Target, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, label } from '../api.js'
import CountUp from '../components/CountUp.jsx'
import RadarChart from '../components/RadarChart.jsx'
import SplitText from '../components/SplitText.jsx'
import { averageScore, dimensions, sessionResults } from '../data.js'
import { useFlow } from '../flow.jsx'

function Highlight({ icon: Icon, label: title, value, tone, index }) {
  return (
    <div className={`highlight highlight-${tone} rise`} style={{ '--i': index }}>
      <span className="highlight-icon">
        <Icon size={30} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

/** Demo numbers, used only when there is no graded session to show (and labelled as such). */
function demoReport() {
  const result = sessionResults[0]
  return {
    demo: true,
    scores: dimensions.map((d) => ({ dimension: d.name, value: d[result.key], evidence_quote: d.name === 'Evidence' ? 'I just kind of picked it up as we went.' : null, fix: d.name === 'Evidence' ? 'Add a concrete result and say what you personally did.' : null })),
    overall: averageScore(result.key),
    top_strengths: [result.strongest],
    top_weaknesses: result.focus.split(', '),
  }
}

export default function Report() {
  const navigate = useNavigate()
  const { completeStep, sessionId, setIds } = useFlow()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [planning, setPlanning] = useState(false)

  useEffect(() => {
    if (!sessionId) {
      setReport(demoReport())
      return undefined
    }
    let cancelled = false
    setError('')
    api.grade(sessionId).then(
      (result) => !cancelled && setReport(result),
      (failure) => !cancelled && setError(failure.message),
    )
    return () => {
      cancelled = true
    }
  }, [sessionId, attempt])

  async function nextInterview() {
    if (report?.demo) {
      completeStep(3)
      navigate('/progress')
      return
    }
    setPlanning(true)
    try {
      const planned = await api.next(sessionId)
      setIds({ gradedSessionId: sessionId, sessionId: planned.session.sessionId })
      completeStep(3)
      navigate('/progress')
    } catch (failure) {
      setError(failure.message)
      setPlanning(false)
    }
  }

  if (!report) {
    return (
      <div className="report">
        <SplitText as="h1" text="Grading your answers" step={30} />
        {error ? (
          <p className="call-notice" role="alert">
            {error}{' '}
            <button className="link-btn" type="button" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </p>
        ) : (
          <p className="lede" role="status">
            Three independent reads of your transcript, then the median. Every score needs a quote from what you said.
          </p>
        )}
      </div>
    )
  }

  const scored = report.scores.filter((s) => s.value !== null)
  const weakest = [...scored].sort((a, b) => a.value - b.value)[0]
  const radar = report.scores.map((s) => ({ name: label(s.dimension), score: s.value ?? 0 }))

  return (
    <div className="report">
      <SplitText as="h1" text="Your interview report" step={30} />
      <p className="lede rise" style={{ '--i': 1 }}>
        {report.demo ? 'Demo data: finish an interview to see your own scores.' : 'Each score quotes the sentence it was based on. No quote, no score.'}
      </p>
      <section className="card report-summary rise" style={{ '--i': 2 }} aria-label="Summary">
        <div className="overall">
          <p>Overall score</p>
          <strong>
            <CountUp value={`${(report.overall ?? 0).toFixed(1)} / 5`} delay={300} />
          </strong>
        </div>
        <Highlight icon={Trophy} label="Strongest area" value={report.top_strengths.map(label).join(', ') || '—'} tone="good" index={3} />
        <Highlight icon={Target} label="Focus next" value={report.top_weaknesses.map(label).join(', ') || '—'} tone="warn" index={4} />
      </section>
      <div className="report-details">
        <section className="card scores rise" style={{ '--i': 5 }}>
          <h2>Scores by dimension</h2>
          <RadarChart scores={radar} />
        </section>
        <section className="card feedback rise" style={{ '--i': 6 }}>
          <h2>Key feedback</h2>
          {weakest && (
            <article className="feedback-panel">
              <p className="feedback-chip">
                <span>{label(weakest.dimension)}</span>
                <span aria-hidden="true">·</span>
                <span>Score {weakest.value}</span>
              </p>
              {weakest.evidence_quote && (
                <blockquote>
                  <span className="quote-mark">“{weakest.evidence_quote}”</span>
                </blockquote>
              )}
              {weakest.fix && (
                <div className="feedback-tip">
                  <span className="feedback-tip-icon">
                    <Lightbulb size={24} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <p>{weakest.fix}</p>
                </div>
              )}
            </article>
          )}
          <ul className="score-quotes">
            {report.scores
              .filter((s) => s !== weakest)
              .map((s, i) => (
                <li key={s.dimension} style={{ '--i': i }}>
                  <b>
                    {label(s.dimension)} <span>{s.value ?? '—'}</span>
                  </b>
                  {s.evidence_quote ? `“${s.evidence_quote}”` : 'No evidence in your answers yet.'}
                </li>
              ))}
          </ul>
          <div className="actions">
            <button className="btn btn-primary btn-cta" type="button" onClick={nextInterview} disabled={planning}>
              <Play size={18} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
              <span>{planning ? 'Planning…' : 'Generate my next interview'}</span>
            </button>
            <button className="btn" type="button" onClick={() => window.print()}>
              <FileText size={20} strokeWidth={1.75} aria-hidden="true" />
              Print report
            </button>
          </div>
          {error && (
            <p className="call-notice" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
