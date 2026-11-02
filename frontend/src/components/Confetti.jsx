import { useMemo } from 'react'
import { random, useReducedMotion } from '../motion.js'

const COLORS = ['var(--teal)', 'var(--violet)', 'var(--violet-mid)', '#d9f99d', 'var(--green)']

// One burst for an earned moment (a better score). Plays once per mount.
export default function Confetti({ count = 120, seed = 3 }) {
  const reduce = useReducedMotion()
  const pieces = useMemo(() => {
    const next = random(seed)
    return Array.from({ length: count }, (_, i) => {
      const angle = next() * Math.PI * 2
      const distance = 80 + next() * 260
      return {
        '--tx': `${Math.cos(angle) * distance}px`,
        '--ty': `${Math.sin(angle) * distance * 0.7 - 60}px`,
        '--fall': `${120 + next() * 160}px`,
        '--spin': `${(next() - 0.5) * 1080}deg`,
        '--delay': `${next() * 120}ms`,
        '--w': `${5 + next() * 5}px`,
        '--h': `${8 + next() * 8}px`,
        background: COLORS[i % COLORS.length],
      }
    })
  }, [count, seed])

  if (reduce) return null
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((style, i) => (
        <span key={i} style={style} />
      ))}
    </div>
  )
}
