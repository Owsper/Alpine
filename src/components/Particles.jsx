import { useMemo } from 'react'
import { random } from '../motion.js'

// A drifting dust field. Each dot is its own CSS animation, so it runs off the main thread.
export default function Particles({ count, seed = 7, className = '' }) {
  const dots = useMemo(() => {
    const next = random(seed)
    return Array.from({ length: count }, () => ({
      '--x': `${next() * 100}%`,
      '--y': `${next() * 100}%`,
      '--size': `${1 + next() * 3}px`,
      '--dx': `${(next() - 0.5) * 60}px`,
      '--dy': `${-20 - next() * 70}px`,
      '--duration': `${6 + next() * 10}s`,
      '--delay': `${-next() * 16}s`,
      '--alpha': 0.25 + next() * 0.6,
    }))
  }, [count, seed])

  return (
    <div className={`particles ${className}`} aria-hidden="true">
      {dots.map((style, i) => (
        <span key={i} style={style} />
      ))}
    </div>
  )
}
