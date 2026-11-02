import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { facts as researchedFacts } from './data.js'

const STORAGE_KEY = 'interviewverse-flow'
const POSITIONS_KEY = 'interviewverse-positions'
const INITIAL = { job: { company: '', role: '', posting: '' }, furthest: 0, interviewer: 'male', interviewStartedAt: null, interviewsCompleted: 0, facts: researchedFacts }

const FlowContext = createContext(null)

// Finished positions outlive the tab and are only ever appended to. Returns false if the save failed.
function savePosition(position) {
  try {
    const raw = localStorage.getItem(POSITIONS_KEY)
    let saved = []
    try {
      saved = JSON.parse(raw) ?? []
      if (!Array.isArray(saved)) throw new Error('Not a list')
    } catch {
      // Unreadable data is set aside rather than overwritten.
      localStorage.setItem(`${POSITIONS_KEY}-backup-${Date.now()}`, raw)
      saved = []
    }
    localStorage.setItem(POSITIONS_KEY, JSON.stringify([...saved, position]))
    return true
  } catch {
    return false
  }
}

// Kept for the tab's lifetime so that a refresh mid-flow doesn't send the user back to the start.
function loadFlow() {
  try {
    return { ...INITIAL, ...JSON.parse(sessionStorage.getItem(STORAGE_KEY)) }
  } catch {
    return INITIAL
  }
}

export function FlowProvider({ children }) {
  const [flow, setFlow] = useState(loadFlow)

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(flow))
    } catch {
      // Without storage the flow still works; it just restarts on refresh.
    }
  }, [flow])

  const value = useMemo(() => {
    const jobComplete = Object.values(flow.job).every((field) => field.trim())
    return {
      job: flow.job,
      facts: flow.facts,
      saveFacts: (facts) => setFlow((current) => ({ ...current, facts })),
      interviewer: flow.interviewer,
      setInterviewer: (interviewer) => setFlow((current) => ({ ...current, interviewer })),
      // Stored as a time, not a count, so the clock survives refreshes and leaving the page mid-interview.
      interviewStartedAt: flow.interviewStartedAt,
      startInterview: () => setFlow((current) => ({ ...current, interviewStartedAt: Date.now() })),
      resetInterview: () => setFlow((current) => ({ ...current, interviewStartedAt: null })),
      interviewsCompleted: flow.interviewsCompleted,
      finishInterview: () =>
        setFlow((current) => ({ ...current, interviewStartedAt: null, interviewsCompleted: current.interviewsCompleted + 1 })),
      // Blanking a required field locks later steps; refilling it restores them. Removing every fact does the same past Research.
      unlocked: jobComplete ? (flow.facts.length > 0 ? flow.furthest : Math.min(flow.furthest, 1)) : 0,
      setJobField: (name, text) => setFlow((current) => ({ ...current, job: { ...current.job, [name]: text } })),
      completeStep: (index) => setFlow((current) => ({ ...current, furthest: Math.max(current.furthest, index + 1) })),
      startNewPosition: (results) => {
        const saved = savePosition({ id: String(Date.now()), savedAt: new Date().toISOString(), job: flow.job, facts: flow.facts, results })
        // The interviewer is a preference, so it carries over to the new position.
        if (saved) setFlow({ ...INITIAL, interviewer: flow.interviewer })
        return saved
      },
    }
  }, [flow])

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
}

export function useFlow() {
  return useContext(FlowContext)
}
