import { useMemo } from 'react'
import { random } from '../motion.js'

// Voice bars around the interviewer. They only move while someone is speaking.
export default function Waveform({ bars = 72, active }) {
  const style = useMemo(() => {
    const next = random(42)
    return Array.from({ length: bars }, (_, i) => ({
      '--angle': `${(i / bars) * 360}deg`,
      '--peak': 0.35 + next() * 0.65,
      '--delay': `${-next() * 900}ms`,
      '--duration': `${520 + next() * 520}ms`,
    }))
  }, [bars])

  return (
    <div className={active ? 'waveform is-active' : 'waveform'} aria-hidden="true">
      {style.map((s, i) => (
        <span key={i} style={s} />
      ))}
    </div>
  )
}
