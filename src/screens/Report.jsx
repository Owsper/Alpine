import { FileText, Lightbulb, Play, Target, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import RadarChart from '../components/RadarChart.jsx'
import { dimensions } from '../data.js'
import { useFlow } from '../flow.jsx'

const scores = dimensions.map((d) => ({ name: d.name, score: d.session1 }))

function Highlight({ icon: Icon, label, value, tone }) {
  return (
    <div className={`highlight highlight-${tone}`}>
      <span className="highlight-icon">
        <Icon size={34} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

export default function Report() {
  const { completeStep } = useFlow()

  return (
    <div className="report">
      <h1>Session 1 report</h1>
      <p className="lede">Review your results, see key feedback, and practice again with a focused interview.</p>
      <section className="card report-summary" aria-label="Summary">
        <div className="overall">
          <p>Overall score</p>
          <strong>2.5 / 5</strong>
        </div>
        <Highlight icon={Trophy} label="Strongest area" value="Relevance" tone="good" />
        <Highlight icon={Target} label="Focus next" value="STAR, Evidence" tone="warn" />
      </section>
      <div className="report-details">
        <section className="card scores">
          <h2>Scores by dimension</h2>
          <RadarChart scores={scores} />
        </section>
        <section className="card feedback">
          <h2>Key feedback</h2>
          <article className="feedback-panel">
            <p className="feedback-chip">
              <span>Evidence</span>
              <span aria-hidden="true">·</span>
              <span>Score 2</span>
            </p>
            <blockquote>“I just kind of picked it up as we went.”</blockquote>
            <div className="feedback-tip">
              <span className="feedback-tip-icon">
                <Lightbulb size={28} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <p>Add a concrete result and say what you personally did. Try Situation, Task, Action, Result.</p>
            </div>
          </article>
          <div className="actions">
            <Link className="btn btn-primary" to="/progress" onClick={() => completeStep(3)}>
              <Play size={20} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
              Generate my next interview
            </Link>
            <button className="btn" type="button">
              <FileText size={22} strokeWidth={1.75} aria-hidden="true" />
              View transcript
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
