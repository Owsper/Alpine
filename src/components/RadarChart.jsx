const CENTER = { x: 193, y: 138 }
const UNIT = 21 // radius of one score point
const RINGS = [1, 2, 3, 4, 5]
const LINE_HEIGHT = 19

// Labels sit clockwise from the top. Those at the sides wrap, because they have the least room.
const LABELS = [
  { x: CENTER.x, y: CENTER.y - 126, textAnchor: 'middle' },
  { x: CENTER.x + 105, y: CENTER.y - 65, textAnchor: 'start', wrap: true },
  { x: CENTER.x + 105, y: CENTER.y + 59, textAnchor: 'start', wrap: true },
  { x: CENTER.x, y: CENTER.y + 124, textAnchor: 'middle' },
  { x: CENTER.x - 101, y: CENTER.y + 59, textAnchor: 'end', wrap: true },
  { x: CENTER.x - 101, y: CENTER.y - 65, textAnchor: 'end', wrap: true },
]

function vertex(i, radius) {
  const angle = (i * Math.PI) / 3
  return {
    x: CENTER.x + radius * Math.sin(angle),
    y: CENTER.y - radius * Math.cos(angle),
  }
}

function toPoints(radii) {
  return radii
    .map((radius, i) => {
      const { x, y } = vertex(i, radius)
      return `${x},${y}`
    })
    .join(' ')
}

function Label({ name, index, x, y, wrap, textAnchor }) {
  const lines = wrap ? name.split(' ') : [name]
  const top = y - ((lines.length - 1) * LINE_HEIGHT) / 2

  return (
    <text className="radar-label" style={{ '--i': index }} textAnchor={textAnchor}>
      {lines.map((line, i) => (
        <tspan key={line} x={x} y={top + i * LINE_HEIGHT}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

export default function RadarChart({ scores }) {
  const description = scores.map((s) => `${s.name} ${s.score}`).join(', ')

  return (
    <svg className="radar" viewBox="0 0 384 280" role="img" aria-label={`Radar chart out of 5. ${description}.`}>
      <g fill="none">
        {RINGS.map((ring, r) => (
          <polygon
            key={ring}
            className={ring % 2 ? 'radar-ring' : 'radar-ring is-minor'}
            style={{ '--i': r }}
            points={toPoints(scores.map(() => ring * UNIT))}
          />
        ))}
        {scores.map((s, i) => {
          const { x, y } = vertex(i, 5 * UNIT)
          return (
            <line key={s.name} className="radar-spoke" style={{ '--i': i }} pathLength="1" x1={CENTER.x} y1={CENTER.y} x2={x} y2={y} />
          )
        })}
      </g>
      <polygon
        className="radar-shape"
        points={toPoints(scores.map((s) => s.score * UNIT))}
        fillOpacity="0.2"
        strokeWidth="2"
        strokeLinejoin="round"
        pathLength="1"
      />
      {scores.map((s, i) => {
        const { x, y } = vertex(i, s.score * UNIT)
        return (
          <g key={s.name} className="radar-point" style={{ '--i': i, transformOrigin: `${x}px ${y}px` }}>
            <circle cx={x} cy={y} r="9" className="radar-halo" />
            <circle cx={x} cy={y} r="4" strokeWidth="2" />
          </g>
        )
      })}
      {scores.map((s, i) => (
        <Label key={s.name} name={s.name} index={i} {...LABELS[i]} />
      ))}
    </svg>
  )
}
