import { Link } from 'react-router-dom'
import { company, facts } from '../data.js'
import { useFlow } from '../flow.jsx'

export default function Research() {
  const { completeStep } = useFlow()

  return (
    <div className="page research">
      <h1>What we found about {company}</h1>
      <p className="lede">Every fact links to its source. The interviewer only uses what is listed here.</p>
      <span className="tag tag-amber">Demo data</span>
      <section className="facts" aria-label="Facts">
        {facts.map((fact) => (
          <article className="card fact" key={fact.tag}>
            <span className="tag">{fact.tag}</span>
            <p>{fact.text}</p>
            <small>
              <span>
                <a href={`https://${fact.source}`} target="_blank" rel="noreferrer">
                  {fact.source}
                </a>
                {' ·'}
              </span>
              <span>retrieved {fact.retrieved}</span>
            </small>
          </article>
        ))}
      </section>
      <div className="actions">
        <button className="btn" type="button">
          Edit facts
        </button>
        <Link className="btn btn-primary" to="/interview" onClick={() => completeStep(1)}>
          Start interview
        </Link>
      </div>
    </div>
  )
}
