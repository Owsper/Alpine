import { Link, NavLink } from 'react-router-dom'
import { steps } from '../data.js'

export default function TopBar() {
  return (
    <header className="topbar">
      <Link className="brand" to="/" translate="no">
        InterviewVerse
      </Link>
      <nav className="steps" aria-label="Steps">
        {steps.map((step, i) => (
          <NavLink key={step.to} to={step.to} end>
            <span>{i + 1}</span> {step.label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
