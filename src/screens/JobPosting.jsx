import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFlow } from '../flow.jsx'

const REQUIRED = {
  company: 'Enter the company name.',
  role: 'Enter the role you are applying for.',
  posting: 'Paste the posting text or a URL.',
}

function Field({ name, label, error, as: Control = 'input', ...controlProps }) {
  const errorId = `${name}-error`

  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <Control
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...controlProps}
      />
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
  const { job, setJobField, completeStep, resetInterview } = useFlow()
  const [errors, setErrors] = useState({})

  function handleSubmit(event) {
    event.preventDefault()
    const missing = Object.keys(REQUIRED).filter((name) => !job[name].trim())

    setErrors(Object.fromEntries(missing.map((name) => [name, REQUIRED[name]])))
    if (missing.length > 0) {
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

  function fieldProps(name) {
    return { name, error: errors[name], value: job[name], onChange: handleChange }
  }

  return (
    <div className="job-posting">
      <h1>Prepare your interview</h1>
      <p className="lede">Paste a job posting. We research the company and build questions for this exact role.</p>
      <form className="card prepare-form" onSubmit={handleSubmit} noValidate>
        <Field
          {...fieldProps('company')}
          label="Company"
          type="text"
          autoComplete="organization"
          placeholder="Acme Robotics"
        />
        <Field
          {...fieldProps('role')}
          label="Role"
          type="text"
          autoComplete="organization-title"
          placeholder="Software engineer, working student"
        />
        <Field
          {...fieldProps('posting')}
          label="Job posting"
          as="textarea"
          autoComplete="off"
          placeholder="Paste the posting text or a URL…"
        />
        <button className="btn btn-primary btn-large" type="submit">
          Prepare interview
          <ArrowRight size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}
