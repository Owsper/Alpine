import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Blueprint from '../components/Blueprint.jsx'
import SplitText from '../components/SplitText.jsx'
import { useFlow } from '../flow.jsx'
import { useReducedMotion } from '../motion.js'

const REQUIRED = {
  company: 'Enter the company name.',
  role: 'Enter the role you are applying for.',
  posting: 'Paste the posting text or a URL.',
}

const DEMO = {
  company: 'Acme Robotics',
  role: 'Software engineer, working student',
  posting:
    'Join the fleet-control team. You will build services in Go and TypeScript, write design docs, and review code before it ships. 20 h/week, Munich.',
}

function Field({ name, label, error, shakeKey, index, as: Control = 'input', hint, ...controlProps }) {
  const errorId = `${name}-error`

  return (
    <div className="field rise" style={{ '--i': index }}>
      <label htmlFor={name}>{label}</label>
      <div className={error ? 'control is-invalid' : 'control'} key={error ? shakeKey : 'ok'}>
        <Control
          id={name}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...controlProps}
        />
        <span className="control-glow" aria-hidden="true" />
      </div>
      {hint}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}

export default function JobPosting() {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const { job, setJobField, completeStep, resetInterview } = useFlow()
  const [errors, setErrors] = useState({})
  const [shakeKey, setShakeKey] = useState(0)
  const [typing, setTyping] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearInterval(timer.current), [])

  function handleSubmit(event) {
    event.preventDefault()
    const missing = Object.keys(REQUIRED).filter((name) => !job[name].trim())

    setErrors(Object.fromEntries(missing.map((name) => [name, REQUIRED[name]])))
    if (missing.length > 0) {
      setShakeKey((k) => k + 1)
      event.currentTarget.elements[missing[0]].focus()
      return
    }
    completeStep(0)
    resetInterview()
    navigate('/research')
  }

  function handleChange(event) {
    const { name, value } = event.target
    setJobField(name, value)
    setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current))
  }

  // Types the sample posting in, so a live demo never starts with an empty form.
  function fillDemo() {
    clearInterval(timer.current)
    setErrors({})
    const order = Object.keys(DEMO)
    if (reduce) return order.forEach((name) => setJobField(name, DEMO[name]))

    let field = 0
    let length = 0
    setTyping(true)
    order.forEach((name) => setJobField(name, ''))
    timer.current = setInterval(() => {
      const name = order[field]
      length += name === 'posting' ? 4 : 1
      // Sliced now: the state update runs later, after `length` may already be reset.
      setJobField(name, DEMO[name].slice(0, length))
      if (length >= DEMO[name].length) {
        field += 1
        length = 0
        if (field === order.length) {
          clearInterval(timer.current)
          setTyping(false)
        }
      }
    }, 18)
  }

  function fieldProps(name, index) {
    return { name, index, shakeKey, error: errors[name], value: job[name], onChange: handleChange }
  }

  const count = job.posting.length

  return (
    <div className="job-posting">
      <SplitText as="h1" text="Prepare your interview" step={26} />
      <p className="lede rise" style={{ '--i': 2 }}>
        Paste a job posting. We research the company and build questions for this exact role.
      </p>
      <div className="job-posting-grid">
      <form className="card prepare-form rise" style={{ '--i': 3 }} onSubmit={handleSubmit} noValidate>
        <div className="form-head">
          <h2>Job details</h2>
          <button className="btn btn-ghost" type="button" onClick={fillDemo} disabled={typing}>
            <span className="sparkle" aria-hidden="true">✦</span>
            {typing ? 'Typing…' : 'Fill demo'}
          </button>
        </div>
        <Field
          {...fieldProps('company', 4)}
          label="Company"
          type="text"
          autoComplete="organization"
          placeholder="Acme Robotics"
        />
        <Field
          {...fieldProps('role', 5)}
          label="Role"
          type="text"
          autoComplete="organization-title"
          placeholder="Software engineer, working student"
        />
        <Field
          {...fieldProps('posting', 6)}
          label="Job posting"
          as="textarea"
          autoComplete="off"
          placeholder="Paste the posting text or a URL…"
          hint={
            <span className={count ? 'counter is-on' : 'counter'} aria-hidden="true">
              {count} characters
            </span>
          }
        />
        <button className="btn btn-primary btn-large btn-cta rise" style={{ '--i': 8 }} type="submit">
          <span>Prepare interview</span>
          <ArrowRight className="btn-arrow" size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </form>
      <Blueprint job={job} />
      </div>
    </div>
  )
}
