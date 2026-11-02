export default function Stat({ label, value, tone = 'plain' }) {
  return (
    <div className={`stat stat-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  )
}
