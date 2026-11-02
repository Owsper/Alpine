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

export default function App() {
  const { pathname } = useLocation()
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
            <Routes>
              <Route path="/" element={<JobPosting />} />
              <Route path="/research" element={<Research />} />
              <Route path="/interview" element={<Interview />} />
              <Route path="/report" element={<Report />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </div>
  )
}
