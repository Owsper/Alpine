const CENTER = { x: 193, y: 138 }
const UNIT = 21 // radius of one score point
const RINGS = [1, 3, 5]
const LINE_HEIGHT = 19

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

// Labels sit clockwise from the top. Those at the sides wrap, because they have the least room.
const LABELS = [
  { x: CENTER.x, y: CENTER.y - 126, textAnchor: 'middle' },
  { x: CENTER.x + 105, y: CENTER.y - 65, textAnchor: 'start', wrap: true },
  { x: CENTER.x + 105, y: CENTER.y + 59, textAnchor: 'start', wrap: true },
  { x: CENTER.x, y: CENTER.y + 124, textAnchor: 'middle' },
  { x: CENTER.x - 101, y: CENTER.y + 59, textAnchor: 'end', wrap: true },
  { x: CENTER.x - 101, y: CENTER.y - 65, textAnchor: 'end', wrap: true },
]

function Label({ name, x, y, wrap, textAnchor }) {
  const lines = wrap ? name.split(' ') : [name]
  const top = y - ((lines.length - 1) * LINE_HEIGHT) / 2

  return (
    <text textAnchor={textAnchor}>
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
      <g fill="none" stroke="#d9dbd8">
        {RINGS.map((ring) => (
          <polygon key={ring} points={toPoints(scores.map(() => ring * UNIT))} />
        ))}
        {scores.map((s, i) => {
          const { x, y } = vertex(i, 5 * UNIT)
          return <line key={s.name} x1={CENTER.x} y1={CENTER.y} x2={x} y2={y} />
        })}
      </g>
      <g className="radar-shape" style={{ transformOrigin: `${CENTER.x}px ${CENTER.y}px` }}>
        <polygon
          points={toPoints(scores.map((s) => s.score * UNIT))}
          fill="#0a8457"
          fillOpacity="0.24"
          stroke="#095f42"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {scores.map((s, i) => {
          const { x, y } = vertex(i, s.score * UNIT)
          return <circle key={s.name} cx={x} cy={y} r="5" fill="#098457" />
        })}
      </g>
      {scores.map((s, i) => (
        <Label key={s.name} name={s.name} {...LABELS[i]} />
      ))}
    </svg>
  )
}
