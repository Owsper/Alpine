import { useEffect } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { startAmbient } from './ambient.js'
import { SUMMIT, summarise, useDashboard } from './dashboard.js'
import Overview from './views/Overview.jsx'
import Practice from './views/Practice.jsx'
import Sessions from './views/Sessions.jsx'

const NAV = [
  { to: '/overview', label: 'Overview', icon: 'M2 20 L9 7 L13 14 L16 10 L22 20 Z' },
  { to: '/sessions', label: 'Sessions', icon: 'M3 12 H6 V6 H9 V18 H12 V3 H15 V21 H18 V9 H21 V12' },
  { to: '/practice', label: 'Practice', icon: 'M12 2 L17 7 V13 L12 18 L7 13 V7 Z M12 18 V22 M7 22 H17' },
]

export default function App() {
  const { pathname } = useLocation()
  const data = useDashboard()
  const { metres } = summarise(data.sessions, data.dimensions)
  const view = pathname.split('/')[1] || 'overview'

  useEffect(startAmbient, [])

  // Back from an interview or a plan, the numbers should already include it.
  const { reload } = data
  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = `${view[0].toUpperCase()}${view.slice(1)} · Alpine`
    reload()
  }, [view, reload])

  return (
    <>
      <nav className="rail" aria-label="App">
        <a className="logo" href="/" aria-label="Alpine home">
          <svg viewBox="0 0 26 22">
            <path d="M1 21 L9 6 L14 14 L18 8 L25 21 Z" />
          </svg>
        </a>
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `nv ${isActive ? 'on' : ''}`}>
            <svg viewBox="0 0 24 24">
              <path d={item.icon} />
            </svg>
            {item.label}
          </NavLink>
        ))}
        <div className="alt" aria-hidden="true">
          <div className="alt-bar">
            <div className="alt-fill" style={{ height: `${(metres / SUMMIT) * 100}%` }} />
          </div>
          <b>{metres.toLocaleString('en-US')}</b>
          <small>metres</small>
        </div>
      </nav>
      <main>
        {/* .view.on is what the sphere follows; keyed so each view plays its entrance */}
        <section className="view on" key={view}>
          <Routes>
            <Route path="/overview" element={<Overview data={data} />} />
            <Route path="/sessions/:id?" element={<Sessions data={data} />} />
            <Route path="/practice" element={<Practice data={data} />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes>
        </section>
      </main>
    </>
  )
}
