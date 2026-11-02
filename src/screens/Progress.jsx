import { Link } from 'react-router-dom'
import Stat from '../components/Stat.jsx'
import { dimensions } from '../data.js'

function formatDelta(delta) {
  return delta > 0 ? `+${delta}` : String(delta)
}

export default function Progress() {
  return (
    <div className="page progress">
      <h1>Progress: session 1 vs session 2</h1>
      <div className="stats">
        <Stat label="Session 1" value="2.5" />
        <Stat label="Session 2" value="3.5" />
        <Stat label="Change" value="+1.0" tone="good" />
      </div>
      <section className="card compare" aria-label="Scores by dimension">
        <ul className="compare-rows">
          {dimensions.map((d) => {
            const delta = d.session2 - d.session1
            return (
              <li key={d.name}>
                <b>{d.name}</b>
                <div className="bars" role="img" aria-label={`Session 1: ${d.session1}, session 2: ${d.session2}`}>
                  <span className="before" style={{ '--score': d.session1 }} />
                  <span className="after" style={{ '--score': d.session2, '--from': d.session1 / d.session2 }} />
                </div>
                <span className={delta === 0 ? 'delta flat' : 'delta'}>{formatDelta(delta)}</span>
              </li>
            )
          })}
        </ul>
        <p className="legend">
          <span>Gray: session 1</span>
          <span>Teal: session 2</span>
          <span>Demo data</span>
        </p>
      </section>
      <div className="actions">
        <Link className="btn btn-primary" to="/interview">
          Start next interview
        </Link>
        <button className="btn" type="button">
          Download report
        </button>
      </div>
    </div>
  )
}
