import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import SplitText from '../components/SplitText.jsx'
import VoiceField from '../components/VoiceField.jsx'
import { cleanFacts, company, isEdited } from '../data.js'
import { useFlow } from '../flow.jsx'
import { useReducedMotion } from '../motion.js'

const TASKS = ['Reading the job posting', 'Visiting the company site', 'Checking the careers page', 'Writing your question plan']
const TASK_MS = 480

export default function Research() {
  const reduce = useReducedMotion()
  const { completeStep, facts, saveFacts } = useFlow()
  const [done, setDone] = useState(reduce ? TASKS.length : 0)
  const [draft, setDraft] = useState(null)
  const [status, setStatus] = useState('')
  const draftRef = useRef(null)
  const factsRef = useRef(null)
  const pendingFocus = useRef(null)
  const finished = done >= TASKS.length
  const editing = draft !== null
  const shownFacts = editing ? draft : facts
  const hasFacts = cleanFacts(shownFacts).length > 0

  // Mirrors the real research step, which takes a few seconds on the backend.
  useEffect(() => {
    if (finished) return undefined
    const timer = setTimeout(() => setDone((d) => d + 1), TASK_MS)
    return () => clearTimeout(timer)
  }, [done, finished])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  // Leaving through the sidebar or stepper keeps edits in progress rather than silently dropping them.
  useEffect(
    () => () => {
      if (draftRef.current) saveFacts(cleanFacts(draftRef.current))
    },
    [],
  )

  // The button that was pressed can disappear, so keyboard focus moves to the nearest useful control.
  useEffect(() => {
    if (!pendingFocus.current) return
    factsRef.current?.querySelector(pendingFocus.current)?.focus()
    pendingFocus.current = null
  }, [draft])

  function finishEditing() {
    if (!editing) return
    saveFacts(cleanFacts(draft))
    setDraft(null)
  }

  function toggleEditing() {
    if (editing) {
      finishEditing()
      setStatus('Facts saved')
    } else {
      setDraft(facts)
      setStatus('Editing facts')
    }
  }

  function changeFact(id, text) {
    setDraft((current) => current.map((fact) => (fact.id === id ? { ...fact, text } : fact)))
  }

  function removeFact(index) {
    const next = draft[index + 1]
    pendingFocus.current = next ? `#fact-${next.id} .fact-remove` : '.fact-add'
    setDraft(draft.filter((_, i) => i !== index))
    setStatus('Fact removed')
  }

  function addFact() {
    const id = `added-${Date.now()}`
    pendingFocus.current = `#fact-${id} textarea`
    setDraft([...draft, { id, text: '', added: true }])
    setStatus('Fact added')
  }

  return (
    <div className="page research">
      <SplitText as="h1" text={`What we found about ${company}`} step={18} />
      <p className="lede rise" style={{ '--i': 2 }}>
        Every fact links to its source. The interviewer only uses what is listed here.
      </p>

      <section className={finished ? 'scan is-finished' : 'scan'} aria-label="Research progress">
        <ol>
          {TASKS.map((task, i) => (
            <li key={task} className={i < done ? 'is-done' : i === done ? 'is-running' : undefined} style={{ '--i': i }}>
              <span className="scan-icon" aria-hidden="true">
                <span className="scan-spinner" />
                <svg viewBox="0 0 12 12">
                  <path d="M2.5 6.2 5 8.5l4.5-5" pathLength="1" />
                </svg>
              </span>
              {task}
            </li>
          ))}
        </ol>
        {!finished && (
          <button className="link-btn" type="button" onClick={() => setDone(TASKS.length)}>
            Skip
          </button>
        )}
      </section>

      {/* While the research runs, the field shows the pages being read; it gives way to the facts */}
      {!finished && <VoiceField rows={6} cols={60} className="scan-field" />}

      {finished && (
        <>
          <span className="tag tag-amber pop">Demo data</span>
          <section className="facts" aria-label="Facts" ref={factsRef}>
            {shownFacts.map((fact, i) => (
              <article className="card fact rise" id={`fact-${fact.id}`} key={fact.id} style={{ '--i': i + 1 }}>
                <span className="fact-shine" aria-hidden="true" />
                <div className="fact-top">
                  {fact.added ? (
                    <span className="tag tag-you">Added by you</span>
                  ) : (
                    <>
                      <span className="tag">{fact.tag}</span>
                      {isEdited(fact) && <span className="tag tag-you">Edited by you</span>}
                    </>
                  )}
                  {editing && (
                    <button className="fact-remove" type="button" aria-label={`Remove fact ${i + 1}`} title="Remove fact" onClick={() => removeFact(i)}>
                      <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {editing ? (
                  <textarea
                    aria-label={`Fact ${i + 1}`}
                    rows={4}
                    maxLength={300}
                    placeholder="Write a fact for the interviewer to use…"
                    value={fact.text}
                    onChange={(event) => changeFact(fact.id, event.target.value)}
                  />
                ) : (
                  <p>{fact.text}</p>
                )}
                {!fact.added && (
                  <small>
                    <span>
                      <a href={`https://${fact.source}`} target="_blank" rel="noreferrer">
                        {fact.source}
                      </a>
                      {' ·'}
                    </span>
                    <span>retrieved {fact.retrieved}</span>
                  </small>
                )}
              </article>
            ))}
            {editing && (
              <button className="fact-add pop" type="button" onClick={addFact}>
                <Plus size={20} strokeWidth={2.25} aria-hidden="true" />
                Add fact
              </button>
            )}
          </section>
          <div className="actions rise" style={{ '--i': 5 }}>
            <button className="btn" type="button" onClick={toggleEditing}>
              {editing ? 'Done' : 'Edit facts'}
            </button>
            {hasFacts ? (
              <Link
                className="btn btn-primary btn-cta"
                to="/interview"
                onClick={() => {
                  finishEditing()
                  completeStep(1)
                }}
              >
                <span>Start interview</span>
                <ArrowRight className="btn-arrow" size={18} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            ) : (
              <button className="btn btn-primary" type="button" disabled aria-describedby="facts-empty">
                Start interview
              </button>
            )}
          </div>
          {!hasFacts && (
            <p className="facts-empty" id="facts-empty">
              Add at least one fact to start the interview.
            </p>
          )}
        </>
      )}
      <p className="sr-only" role="status">
        {finished ? status || `Found ${facts.length} facts.` : TASKS[done]}
      </p>
    </div>
  )
}
