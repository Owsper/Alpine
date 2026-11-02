import { Link } from 'react-router-dom'
import { company, facts } from '../data.js'

export default function Research() {
  return (
    <div className="page">
      <h1>What we found about {company}</h1>
      <p className="lede">Every fact links to its source. The interviewer only uses what is listed here.</p>
      <span className="tag tag-amber">Demo data</span>
      <section className="facts" aria-label="Facts">
        {facts.map((fact) => (
          <article className="card fact" key={fact.tag}>
            <span className="tag">{fact.tag}</span>
            <p>{fact.text}</p>
            <small>
              <a href={`https://${fact.source}`} target="_blank" rel="noreferrer">
                {fact.source}
              </a>{' '}
              · retrieved {fact.retrieved}
            </small>
          </article>
        ))}
      </section>
      <div className="actions">
        <button className="btn" type="button">
          Edit facts
        </button>
        <Link className="btn btn-primary" to="/interview">
          Start interview
        </Link>
      </div>
    </div>
  )
}
