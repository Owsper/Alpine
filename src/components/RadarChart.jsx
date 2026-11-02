const CENTER = { x: 229.5, y: 165 }
const UNIT = 22 // radius of one score point
const RINGS = [1, 3, 5]
const LABEL_RADIUS = 132

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

function labelProps(i) {
  if (i === 0) return { x: CENTER.x, y: 33, textAnchor: 'middle' }
  if (i === 3) return { x: CENTER.x, y: 297, textAnchor: 'middle' }
  const { x, y } = vertex(i, LABEL_RADIUS)
  return { x, y, textAnchor: i < 3 ? 'start' : 'end' }
}

export default function RadarChart({ scores }) {
  const description = scores.map((s) => `${s.name} ${s.score}`).join(', ')

  return (
    <svg className="radar" viewBox="0 0 470 320" role="img" aria-label={`Radar chart out of 5. ${description}.`}>
      <g fill="none" stroke="#dadad8">
        {RINGS.map((ring) => (
          <polygon key={ring} points={toPoints(scores.map(() => ring * UNIT))} />
        ))}
        {scores.map((s, i) => {
          const { x, y } = vertex(i, 5 * UNIT)
          return <line key={s.name} x1={CENTER.x} y1={CENTER.y} x2={x} y2={y} />
        })}
      </g>
      <polygon
        className="radar-shape"
        points={toPoints(scores.map((s) => s.score * UNIT))}
        fill="#1d9e75"
        fillOpacity="0.2"
        stroke="#1d9e75"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {scores.map((s, i) => (
        <text key={s.name} {...labelProps(i)}>
          {s.name}
        </text>
      ))}
    </svg>
  )
}
