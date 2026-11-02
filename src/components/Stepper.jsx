import { Check } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { steps } from '../data.js'
import { useFlow } from '../flow.jsx'

function stepState(i, current) {
  if (i === current) return 'current'
  return i < current ? 'done' : undefined
}

export default function Stepper() {
  const { pathname } = useLocation()
  const { unlocked } = useFlow()
  const current = steps.findIndex((step) => step.to === pathname)

  return (
    <nav aria-label="Interview steps">
      <ol className="stepper">
        {steps.map((step, i) => {
          const content = (
            <>
              <span className="stepper-number">
                {i < current ? <Check size={17} strokeWidth={2.5} aria-label={`Step ${i + 1} completed`} /> : i + 1}
              </span>
              {step.label}
            </>
          )
          return (
            <li key={step.to} className={stepState(i, current)}>
              {i > unlocked ? (
                <div className="stepper-step locked" aria-disabled="true">
                  {content}
                </div>
              ) : (
                <Link className="stepper-step" to={step.to} aria-current={i === current ? 'step' : undefined}>
                  {content}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
