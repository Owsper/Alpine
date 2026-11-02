import { FileText, Lightbulb, Play, Target, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import CountUp from '../components/CountUp.jsx'
import RadarChart from '../components/RadarChart.jsx'
import SplitText from '../components/SplitText.jsx'
import { averageScore, dimensions, sessionResults } from '../data.js'
import { useFlow } from '../flow.jsx'

function Highlight({ icon: Icon, label, value, tone, index }) {
  return (
    <div className={`highlight highlight-${tone} rise`} style={{ '--i': index }}>
      <span className="highlight-icon">
        <Icon size={30} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

export default function Report() {
  const { completeStep, interviewsCompleted } = useFlow()
  const session = Math.max(1, interviewsCompleted)
  const result = sessionResults[Math.min(session, sessionResults.length) - 1]
  const scores = dimensions.map((d) => ({ name: d.name, score: d[result.key] }))

  return (
    <div className="report">
      <SplitText as="h1" text={`Session ${session} report`} step={30} />
      <p className="lede rise" style={{ '--i': 1 }}>
        Review your results, see key feedback, and practice again with a focused interview.
      </p>
      <section className="card report-summary rise" style={{ '--i': 2 }} aria-label="Summary">
        <div className="overall">
          <p>Overall score</p>
          <strong>
            <CountUp value={`${averageScore(result.key).toFixed(1)} / 5`} delay={300} />
          </strong>
        </div>
        <Highlight icon={Trophy} label="Strongest area" value={result.strongest} tone="good" index={3} />
        <Highlight icon={Target} label="Focus next" value={result.focus} tone="warn" index={4} />
      </section>
      <div className="report-details">
        <section className="card scores rise" style={{ '--i': 5 }}>
          <h2>Scores by dimension</h2>
          <RadarChart scores={scores} />
        </section>
        <section className="card feedback rise" style={{ '--i': 6 }}>
          <h2>Key feedback</h2>
          <article className="feedback-panel">
            <p className="feedback-chip">
              <span>Evidence</span>
              <span aria-hidden="true">·</span>
              <span>Score {scores.find((s) => s.name === 'Evidence').score}</span>
            </p>
            <blockquote>
              <span className="quote-mark">“I just kind of picked it up as we went.”</span>
            </blockquote>
            <div className="feedback-tip">
              <span className="feedback-tip-icon">
                <Lightbulb size={24} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <p>
                Add a concrete result and say what you personally did. Try{' '}
                {['Situation', 'Task', 'Action', 'Result'].map((word, i) => (
                  <span className="star-chip" style={{ '--i': i }} key={word}>
                    {word}
                  </span>
                ))}
                .
              </p>
            </div>
          </article>
          <div className="actions">
            <Link className="btn btn-primary btn-cta" to="/progress" onClick={() => completeStep(3)}>
              <Play size={18} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
              <span>Generate my next interview</span>
            </Link>
            <button className="btn" type="button">
              <FileText size={20} strokeWidth={1.75} aria-hidden="true" />
              View transcript
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
