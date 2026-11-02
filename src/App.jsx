import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Stepper from './components/Stepper.jsx'
import { steps } from './data.js'
import { useFlow } from './flow.jsx'
import JobPosting from './screens/JobPosting.jsx'
import Research from './screens/Research.jsx'
import Interview from './screens/Interview.jsx'
import Report from './screens/Report.jsx'
import Progress from './screens/Progress.jsx'
import Landing from './screens/Landing.jsx'

export default function App() {
  const location = useLocation()
  const { pathname } = location
  const { unlocked } = useFlow()
  const mainRef = useRef(null)
  const previousPath = useRef(pathname)
  const stepIndex = steps.findIndex((s) => s.to === pathname)

  useEffect(() => {
    const step = steps[stepIndex]
    document.title = step ? `${step.label} · InterviewVerse` : 'InterviewVerse'

    // A client-side route change keeps scroll and focus unless they are moved by hand.
    if (previousPath.current !== pathname) {
      previousPath.current = pathname
      window.scrollTo(0, 0)
      mainRef.current?.focus()
    }
  }, [pathname, stepIndex])

  // The landing page stands on its own, without the sidebar and stepper of the app.
  if (pathname === '/') {
    return (
      <>
        <Landing />
      </>
    )
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Sidebar />
      <div className="app-content">
        <Stepper />
        <main className="screen" id="main" tabIndex={-1} ref={mainRef}>
          {stepIndex > unlocked ? (
            <Navigate to={steps[unlocked].to} replace />
          ) : (
            // Keyed by path so every screen plays its entrance once when you arrive
            <div className="route" key={pathname}>
              <Routes location={location}>
                <Route path="/start" element={<JobPosting />} />
                <Route path="/research" element={<Research />} />
                <Route path="/interview" element={<Interview />} />
                <Route path="/report" element={<Report />} />
                <Route path="/progress" element={<Progress />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
