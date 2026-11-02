import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
  const [errors, setErrors] = useState({})

  function handleSubmit(event) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const missing = Object.keys(REQUIRED).filter((name) => !data.get(name).trim())

    setErrors(Object.fromEntries(missing.map((name) => [name, REQUIRED[name]])))
    if (missing.length > 0) {
      form.elements[missing[0]].focus()
      return
    }
    navigate('/research')
  }

  function clearError(event) {
    const { name } = event.target
    setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current))
  }

  return (
    <div className="page">
      <h1>Prepare your interview</h1>
      <p className="lede">Paste a job posting. We research the company and build questions for this exact role.</p>
      <form className="card prepare-form" onSubmit={handleSubmit} onInput={clearError} noValidate>
        <Field
          name="company"
          label="Company"
          error={errors.company}
          type="text"
          autoComplete="organization"
          placeholder="Acme Robotics"
        />
        <Field
          name="role"
          label="Role"
          error={errors.role}
          type="text"
          autoComplete="organization-title"
          placeholder="Software engineer, working student"
        />
        <Field
          name="posting"
          label="Job posting"
          error={errors.posting}
          as="textarea"
          autoComplete="off"
          placeholder="Paste the posting text or a URL…"
        />
        <p className="note">We never use your camera. Audio is not stored unless you opt in.</p>
        <button className="btn btn-primary" type="submit">
          Prepare interview
        </button>
      </form>
    </div>
  )
}
