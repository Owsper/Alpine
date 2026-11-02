import { ChartNoAxesColumn, Check, FileText, MessageCircleMore, PanelLeftClose, PanelLeftOpen, Search, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { steps } from '../data.js'
import { useFlow } from '../flow.jsx'

const COLLAPSED_KEY = 'interviewverse-sidebar-collapsed'

const icons = {
  '/start': FileText,
  '/research': Search,
  '/interview': MessageCircleMore,
  '/report': ChartNoAxesColumn,
  '/progress': TrendingUp,
}

function loadCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

export default function Sidebar() {
  const { unlocked } = useFlow()
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose
  const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar'

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next))
    } catch {
      // Without storage the sidebar still works; it just opens expanded next time.
    }
  }

  return (
    <aside className={collapsed ? 'sidebar collapsed' : 'sidebar'}>
      <Link className="brand" to="/" translate="no" aria-label="InterviewVerse" title="InterviewVerse">
        <span className="sidebar-label">InterviewVerse</span>
      </Link>
      <nav className="sidebar-nav" aria-label="Main">
        {steps.map((step, i) => {
          const Icon = icons[step.to]
          const done = i < unlocked
          const label = `${i + 1}. ${step.label}`
          const content = (
            <>
              <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
              <span className="sidebar-label">{label}</span>
              {done && (
                <span className="nav-check">
                  <Check size={12} strokeWidth={3.5} aria-hidden="true" />
                  <span className="sr-only">Completed</span>
                </span>
              )}
            </>
          )
          return i > unlocked ? (
            <span key={step.to} className="locked" aria-disabled="true" title={collapsed ? label : undefined}>
              {content}
            </span>
          ) : (
            <NavLink key={step.to} to={step.to} end className={done ? 'done' : undefined} title={collapsed ? label : undefined}>
              {content}
            </NavLink>
          )
        })}
      </nav>
      <button className="sidebar-toggle" type="button" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-label={toggleLabel} title={toggleLabel}>
        <ToggleIcon size={20} strokeWidth={1.75} aria-hidden="true" />
        <span className="sidebar-label">Collapse</span>
      </button>
    </aside>
  )
}
