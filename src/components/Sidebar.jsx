import { ChartNoAxesColumn, Check, FileText, MessageCircleMore, Search, TrendingUp } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { steps } from '../data.js'
import { useFlow } from '../flow.jsx'

const icons = {
  '/': FileText,
  '/research': Search,
  '/interview': MessageCircleMore,
  '/report': ChartNoAxesColumn,
  '/progress': TrendingUp,
}

export default function Sidebar() {
  const { unlocked } = useFlow()

  return (
    <aside className="sidebar">
      <Link className="brand" to="/" translate="no">
        InterviewVerse
      </Link>
      <nav className="sidebar-nav" aria-label="Main">
        {steps.map((step, i) => {
          const Icon = icons[step.to]
          const done = i < unlocked
          const content = (
            <>
              <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
              {i + 1}. {step.label}
              {done && (
                <span className="nav-check">
                  <Check size={12} strokeWidth={3.5} aria-hidden="true" />
                  <span className="sr-only">Completed</span>
                </span>
              )}
            </>
          )
          return i > unlocked ? (
            <span key={step.to} className="locked" aria-disabled="true">
              {content}
            </span>
          ) : (
            <NavLink key={step.to} to={step.to} end className={done ? 'done' : undefined}>
              {content}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}
