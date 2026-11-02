import { useMemo } from 'react'
import '../blueprint.css'
import VoiceField from './VoiceField.jsx'

// Skills the panel looks for in the posting, so the candidate sees the interview take shape as they type.
const SKILLS = ['Go', 'TypeScript', 'JavaScript', 'Python', 'Java', 'React', 'SQL', 'AWS', 'Kubernetes', 'Docker', 'design docs', 'code review', 'testing', 'CI/CD', 'leadership', 'communication', 'machine learning', 'APIs']

function detectSkills(text) {
  return SKILLS.filter((skill) => new RegExp(`(^|[^a-z])${skill.replace(/[/.]/g, '\\$&')}([^a-z]|$)`, 'i').test(text))
}

export default function Blueprint({ job }) {
  const skills = useMemo(() => detectSkills(job.posting), [job.posting])
  const company = job.company.trim()
  const role = job.role.trim()
  const filled = [company, role, job.posting.trim().length > 40].filter(Boolean).length
  const ready = filled === 3

  const questions = [
    company && 'Tell me about yourself.',
    skills[0] && `Tell me about a project where you used ${skills[0]}.`,
    role && 'Describe a time you disagreed with a teammate.',
    skills[1] && `How do you approach ${skills[1]} under a deadline?`,
    company && `Why do you want to work at ${company}?`,
  ]

  return (
    <aside className="blueprint" aria-label="Interview preview">
      <p className="bp-meta">
        <span>Your interview</span>
        <span role="status" aria-atomic="true" className={ready ? 'is-ready' : undefined}>
          {ready ? 'ready' : `${filled} of 3 fields`}
        </span>
      </p>

      <VoiceField rows={8} cols={40} className="bp-field" />

      <div className="bp-who">
        <span className="bp-mono" aria-hidden="true">
          {(company[0] || '·').toUpperCase()}
        </span>
        <div>
          <strong>{company || 'Company'}</strong>
          <span>{role || 'Role'}</span>
        </div>
      </div>

      <div className="bp-block">
        <h3>From the posting</h3>
        {skills.length === 0 ? (
          <p className="bp-empty">Skills appear here as you paste the posting.</p>
        ) : (
          <ul className="bp-skills">
            {skills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="bp-block">
        <h3>Questions</h3>
        <ol className="bp-questions">
          {questions.map((question, i) => (
            <li key={i} className={question ? 'is-set' : undefined}>
              {question ? <span key={question}>{question}</span> : <span className="bp-pending">Waiting for details</span>}
            </li>
          ))}
        </ol>
      </div>
    </aside>
  )
}
