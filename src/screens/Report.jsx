import { Link } from 'react-router-dom'
import RadarChart from '../components/RadarChart.jsx'
import Stat from '../components/Stat.jsx'
import { dimensions } from '../data.js'

const scores = dimensions.map((d) => ({ name: d.name, score: d.session1 }))

export default function Report() {
  return (
    <div className="report">
      <section className="report-body">
        <h1>Session 1 report</h1>
        <div className="stats">
          <Stat label="Overall" value="2.5 / 5" />
          <Stat label="Strongest" value="Relevance" tone="good" />
          <Stat label="Focus next" value="STAR, Evidence" tone="warn" />
        </div>
        <article className="card feedback">
          <div className="feedback-meta">
            <span>Evidence</span>
            <span aria-hidden="true">·</span>
            <span>score 2</span>
          </div>
          <blockquote>“I just kind of picked it up as we went.”</blockquote>
          <p className="feedback-tip">
            Add a concrete result and say what you personally did. Try Situation, Task, Action, Result.
          </p>
        </article>
        <div className="actions">
          <Link className="btn btn-primary" to="/progress">
            Generate my next interview
          </Link>
          <button className="btn" type="button">
            View transcript
          </button>
        </div>
      </section>
      <section className="card scores">
        <h2>Scores by dimension</h2>
        <RadarChart scores={scores} />
      </section>
    </div>
  )
}
