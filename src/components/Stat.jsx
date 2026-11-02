import CountUp from './CountUp.jsx'

export default function Stat({ label, value, tone = 'plain', index = 0 }) {
  return (
    <div className={`stat stat-${tone} rise`} style={{ '--i': index }}>
      <p>{label}</p>
      <strong>
        <CountUp value={value} delay={160 + index * 80} />
      </strong>
    </div>
  )
}
