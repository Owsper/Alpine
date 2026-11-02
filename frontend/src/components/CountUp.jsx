import { useEffect, useState } from 'react'
import { useReducedMotion } from '../motion.js'

const NUMBER = /^([+-]?)(\d+(?:\.\d+)?)(.*)$/

// Counts the leading number of a value like "2.5 / 5" or "+1.0"; other text is shown as is.
export default function CountUp({ value, duration = 900, delay = 0 }) {
  const reduce = useReducedMotion()
  const match = String(value).match(NUMBER)
  const animate = Boolean(match) && !reduce
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (!animate) return undefined
    const target = Number(match[2])
    let frame
    let start
    const tick = (now) => {
      start ??= now + delay
      const t = Math.min(Math.max((now - start) / duration, 0), 1)
      setShown(target * (1 - (1 - t) ** 4))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, animate]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!animate) return value
  const decimals = match[2].split('.')[1]?.length ?? 0
  return (
    <span aria-label={value}>
      <span aria-hidden="true">
        {match[1]}
        {shown.toFixed(decimals)}
        {match[3]}
      </span>
    </span>
  )
}
