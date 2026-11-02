import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cleanFacts, company, isEdited } from '../data.js'
import { useFlow } from '../flow.jsx'

export default function Research() {
  const { completeStep, facts, saveFacts } = useFlow()
  const [draft, setDraft] = useState(null)
  const [status, setStatus] = useState('')
  const draftRef = useRef(null)
  const factsRef = useRef(null)
  const pendingFocus = useRef(null)
  const editing = draft !== null
  const shownFacts = editing ? draft : facts
  const hasFacts = cleanFacts(shownFacts).length > 0

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
      <h1>What we found about {company}</h1>
      <p className="lede">Every fact links to its source. The interviewer only uses what is listed here.</p>
      <span className="tag tag-amber">Demo data</span>
      <section className="facts" aria-label="Facts" ref={factsRef}>
        {shownFacts.map((fact, i) => (
          <article className="card fact" id={`fact-${fact.id}`} key={fact.id}>
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
                  <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
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
          <button className="fact-add" type="button" onClick={addFact}>
            <Plus size={20} strokeWidth={2.25} aria-hidden="true" />
            Add fact
          </button>
        )}
      </section>
      <p className="sr-only" role="status">
        {status}
      </p>
      <div className="actions">
        <button className="btn" type="button" onClick={toggleEditing}>
          {editing ? 'Done' : 'Edit facts'}
        </button>
        {hasFacts ? (
          <Link
            className="btn btn-primary"
            to="/interview"
            onClick={() => {
              finishEditing()
              completeStep(1)
            }}
          >
            Start interview
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
    </div>
  )
}
