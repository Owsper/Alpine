// The Alpine design's charts and widgets as React components (ported from interviewverse-dashboard.html).

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CAMPS, SUMMIT } from '../dashboard.js'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const RING = 213.6

/** 0 → 1 over `ms`, easing out, restarted whenever `key` changes. */
function useIntro(ms, delay = 0, key = 0) {
  const [e, setE] = useState(0)
  useEffect(() => {
    setE(0)
    const t0 = performance.now()
    let frame
    const step = (now) => {
      const p = clamp((now - t0 - delay) / ms, 0, 1)
      setE(1 - Math.pow(1 - p, 3))
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [ms, delay, key])
  return e
}

/** Counts up from 0 to `to` once, easing out. */
export function CountUp({ to, ms = 1400, format = (v) => Math.round(v).toLocaleString('en-US') }) {
  const e = useIntro(ms, 0, to)
  return format(to * e)
}

/** Score rings. Values are 1–5; the ring fills to value / 5. */
export function Rings({ items }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)))
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <div className="rings">
      {items.map((item, k) => (
        <div className="ring" data-k={k % 3} key={item.label}>
          <svg viewBox="0 0 80 80">
            <circle className="bg" cx="40" cy="40" r="34" />
            <circle className="fg" cx="40" cy="40" r="34" style={{ strokeDashoffset: on && item.value != null ? RING * (1 - item.value / 5) : RING }} />
          </svg>
          <span className="v">{item.value == null ? '–' : <CountUp to={item.value} ms={1100} format={(v) => v.toFixed(item.value % 1 ? 1 : 0)} />}</span>
          <small>{item.label}</small>
          {item.delta != null && item.delta !== 0 && (
            <em className={item.delta < 0 ? 'dn' : ''}>
              {item.delta > 0 ? '+' : ''}
              {item.delta} on last take
            </em>
          )}
        </div>
      ))}
    </div>
  )
}

/** The streak diamonds: the last seven days, today last. */
export function Streak({ week, streak }) {
  return (
    <div className="streak" aria-label={`${streak} day streak`}>
      {week.map((on, i) => (
        <span key={i} className={`sd ${on ? 'on' : ''} ${i === 6 ? 'today' : ''}`} />
      ))}
      <span>{streak ? `${streak} day streak` : 'Practise today to start a streak'}</span>
    </div>
  )
}

const PROFILE = [[0, 140], [40, 118], [70, 126], [120, 86], [150, 100], [205, 52], [240, 70], [300, 34], [330, 50], [390, 24], [430, 44], [470, 66], [520, 40], [560, 18], [600, 8]]
const PROFILE_D = PROFILE.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ')
const pick = (p) => ({ x: p.x, y: p.y })

/** The altitude profile with camps, drawn up to the climber's position. */
export function Profile({ metres }) {
  const base = useRef(null)
  const [geo, setGeo] = useState(null)
  const e = useIntro(1700, 300)
  const prog = clamp(metres / SUMMIT, 0, 1)

  useLayoutEffect(() => {
    const path = base.current
    const L = path.getTotalLength()
    setGeo({ camps: CAMPS.map(([name, f]) => ({ name, f, ...pick(path.getPointAtLength(L * Math.min(f, 0.995))) })), me: pick(path.getPointAtLength(L * prog)) })
  }, [prog])

  return (
    <svg id="prof" viewBox="0 0 600 150" preserveAspectRatio="none" aria-hidden="true">
      <path className="area" d={PROFILE_D + ' L600 150 L0 150 Z'} style={{ opacity: 0.08 * e }} />
      <path className="base" ref={base} d={PROFILE_D} />
      <path className="fillp" pathLength="1" d={PROFILE_D} style={{ strokeDasharray: `${prog * e} 2`, strokeDashoffset: 0 }} />
      {geo?.camps.map((c) => (
        <g key={c.name}>
          <circle className="camp" cx={c.x} cy={c.y} r="4" />
          <text x={clamp(c.x, 26, 574)} y={c.y - 12} textAnchor={c.f === 0 ? 'start' : c.f === 1 ? 'end' : 'middle'}>
            {c.name}
          </text>
        </g>
      ))}
      {geo && <rect className="me" x={geo.me.x - 6} y={geo.me.y - 6} width="12" height="12" transform={`rotate(45 ${geo.me.x} ${geo.me.y})`} opacity={e > 0.98 ? 1 : 0} />}
    </svg>
  )
}

/** Score per take for one dimension (1–5), with the hover crosshair and tooltip. */
export function LineChart({ data, name, colour = 'var(--glacier)' }) {
  const svg = useRef(null)
  const [w, setW] = useState(600)
  const [hover, setHover] = useState(null)
  const e = useIntro(1300, 0, name)
  const h = 230
  const pad = { l: 34, r: 12, t: 14, b: 26 }

  useLayoutEffect(() => {
    const measure = () => setW(Math.max(300, svg.current?.getBoundingClientRect().width || 600))
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [])

  const points = data.map((v, i) => ({ v, i })).filter((p) => p.v != null)
  const iw = w - pad.l - pad.r
  const ih = h - pad.t - pad.b
  const X = (i) => pad.l + (data.length === 1 ? iw / 2 : (i * iw) / (data.length - 1))
  const Y = (v) => pad.t + ih - ((v - 1) / 4) * ih
  const d = points.map((p, k) => (k ? 'L' : 'M') + X(p.i).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ')

  function move(event) {
    const r = svg.current.getBoundingClientRect()
    const x = ((event.clientX - r.left) / r.width) * w
    const nearest = points.reduce((best, p) => (Math.abs(X(p.i) - x) < Math.abs(X(best.i) - x) ? p : best), points[0])
    setHover({ ...nearest, left: (X(nearest.i) / w) * r.width, top: (Y(nearest.v) / h) * r.height })
  }

  return (
    <div className="cwrap">
      <svg id="chart" ref={svg} viewBox={`0 0 ${w} ${h}`} aria-label={`${name} score by take`} onPointerMove={points.length ? move : undefined} onPointerLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line className="gd" x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} />
            <text x={pad.l - 8} y={Y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {data.map((_, i) => (
          <text key={i} x={X(i)} y={h - 6} textAnchor="middle">
            T{i + 1}
          </text>
        ))}
        {points.length > 1 && <path className="ar" d={d + ` L${X(points.at(-1).i)} ${pad.t + ih} L${X(points[0].i)} ${pad.t + ih} Z`} fill={colour} style={{ opacity: 0.11 * e }} />}
        <path className="ln" d={d} pathLength="1" style={{ stroke: colour, strokeDashoffset: 1 - e }} />
        {points.map((p, k) => (
          <circle key={p.i} className={`dt ${e >= k / Math.max(points.length - 1, 1) - 0.02 ? 'on' : ''}`} cx={X(p.i)} cy={Y(p.v)} r="5" style={{ stroke: colour }} />
        ))}
        {hover && (
          <>
            <line className="cr" x1={X(hover.i)} x2={X(hover.i)} y1={pad.t} y2={pad.t + ih} style={{ opacity: 1 }} />
            <circle className="hot" cx={X(hover.i)} cy={Y(hover.v)} r="7" style={{ opacity: 1 }} />
          </>
        )}
      </svg>
      <div className="tip" style={hover ? { opacity: 1, left: hover.left, top: hover.top } : undefined}>
        {hover && (
          <>
            Take {hover.i + 1}: <b>{hover.v}</b> / 5 {name.toLowerCase()}
          </>
        )}
      </div>
    </div>
  )
}

/** The ridge of peaks used for weekly activity and filler words. */
export function Peaks({ values, max, axis, read, empty }) {
  const [readout, setReadout] = useState(null)
  const w = 600
  const h = 150
  const bw = w / Math.max(values.length, 1)
  return (
    <>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" style={{ width: '100%', height: 150, overflow: 'visible' }}>
        {values.map((v, i) => {
          const ph = Math.max(10, (v / Math.max(max, 1)) * (h - 22))
          const x = i * bw
          return (
            <g key={i}>
              <polygon
                className={`pk grow ${i === values.length - 1 ? 'now' : ''}`}
                style={{ '--i': i }}
                points={`${x + 4},${h - 18} ${x + bw / 2},${h - 18 - ph} ${x + bw - 4},${h - 18}`}
                onPointerEnter={() => setReadout(read(i, v))}
              />
              {values.length <= 12 && (
                <text className="axis" x={x + bw / 2} y={h - 3} textAnchor="middle">
                  {axis}
                  {i + 1}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <p className="readout">{readout ?? empty}</p>
    </>
  )
}

export const chevron = (
  <svg viewBox="0 0 16 16">
    <path d="M5 2 L11 8 L5 14" />
  </svg>
)
