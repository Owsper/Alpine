// Alpine promo: problem → product → how it works → the live interview → the report → progress → call to action.
// Same visual system as the app: deep spruce + glacier with one alpenglow spark, Big Shoulders + Schibsted Grotesk.

import { Audio } from '@remotion/media'
import { loadFont as loadDisplay } from '@remotion/google-fonts/BigShoulders'
import { loadFont as loadBody } from '@remotion/google-fonts/SchibstedGrotesk'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { AbsoluteFill, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

const { fontFamily: DISPLAY } = loadDisplay('normal', { subsets: ['latin'] })
const { fontFamily: BODY } = loadBody('normal', { weights: ['400', '600', '700'], subsets: ['latin'] })

const C = {
  ink: '#050e0a',
  spruce: '#0b2219',
  pine: '#14382a',
  moss: '#2f6b4f',
  lichen: '#7fb99a',
  glacier: '#b9f0dc',
  snow: '#eef7f2',
  glow: '#ff8a6b',
  dim: 'rgba(238,247,242,0.62)',
  line: 'rgba(238,247,242,0.14)',
}
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const out = Easing.bezier(0.16, 1, 0.3, 1)
const chamfer = (n) => `polygon(0 0,calc(100% - ${n}px) 0,100% ${n}px,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`

// Scene lengths in frames at 30 fps; transitions overlap neighbouring scenes.
export const SCENES = [150, 175, 150, 165, 210, 205, 155, 140]
export const TRANSITION = 15
export const DURATION = SCENES.reduce((a, b) => a + b, 0) - TRANSITION * (SCENES.length - 1)
// Global frame where each scene starts.
const STARTS = SCENES.map((_, i) => SCENES.slice(0, i).reduce((a, b) => a + b - TRANSITION, 0))

/* ---------------- shared pieces ---------------- */

const ease = (frame, from, to, start, length, easing = out) => interpolate(frame, [start, start + length], [from, to], { ...clamp, easing })

/** Words rise out of a mask one after another. */
function Rise({ text, start = 0, step = 3, style, wordStyle }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <span style={style}>
      {text.split(' ').map((word, i) => {
        const p = spring({ frame: frame - start - i * step, fps, config: { damping: 200 } })
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.04em 0.02em 0.1em', margin: '-0.04em -0.02em -0.1em' }}>
            <span style={{ display: 'inline-block', transform: `translateY(${(1 - p) * 112}%) rotate(${(1 - p) * 7}deg)`, transformOrigin: '0 100%', ...wordStyle }}>
              {word}
              {' '}
            </span>
          </span>
        )
      })}
    </span>
  )
}

/** Fades and lifts its children in. */
function Appear({ start = 0, children, style, y = 26 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = spring({ frame: frame - start, fps, config: { damping: 200 } })
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * y}px)`, ...style }}>{children}</div>
}

function Logo({ size = 34, draw = 1, stroke = C.glacier }) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 26 22" style={{ overflow: 'visible' }}>
      <path d="M1 21 L9 6 L14 14 L18 8 L25 21 Z" fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="miter" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - draw} />
    </svg>
  )
}

function Kicker({ children, start = 0 }) {
  return (
    <Appear start={start} y={12}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: BODY, fontWeight: 600, fontSize: 26, color: C.lichen, letterSpacing: '0.02em' }}>
        <span style={{ width: 12, height: 12, background: C.glow, transform: 'rotate(45deg)' }} />
        {children}
      </div>
    </Appear>
  )
}

/* ---------------- background: aurora, grain, contour sphere ---------------- */

function heightAt(x, y, z, t) {
  const a = Math.sin(x * 3.1 + t * 0.5) * Math.cos(y * 2.7 - t * 0.4) + Math.sin(z * 3.7 + x * 1.3 + t * 0.35) * 0.7
  const b = Math.sin(x * 7.3 - y * 5.1 + t * 0.8) * Math.cos(z * 6.7 + t * 0.6) * 0.35
  return (a + b) / 2.05
}

/** The app's contour sphere, computed per frame as SVG paths so every frame renders the same. */
function Sphere({ x, y, r, alpha, amp = 0.09, warm = 0, t }) {
  if (alpha < 0.01) return null
  const rotY = t * 0.22
  const rotX = 0.35
  const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX)
  const P = r * 4.2
  const front = []
  const back = []
  const bold = []
  const NL = 24
  const SEG = 90
  for (let i = 1; i <= NL; i++) {
    const phi = -Math.PI / 2 + (Math.PI * i) / (NL + 1)
    const cp = Math.cos(phi), sp = Math.sin(phi)
    const d = { f: '', b: '' }
    let last = null
    let prev = null
    for (let k = 0; k <= SEG; k++) {
      const th = (k / SEG) * Math.PI * 2
      const ux = cp * Math.cos(th), uy = sp, uz = cp * Math.sin(th)
      const rad = r * (1 + amp * heightAt(ux, uy, uz, t))
      const X = ux * rad, Y = uy * rad, Z = uz * rad
      const x1 = X * cy + Z * sy, z1 = -X * sy + Z * cy
      const y1 = Y * cx - z1 * sx, z2 = Y * sx + z1 * cx
      const s = P / (P - z2)
      const px = x + x1 * s, py = y + y1 * s
      if (prev) {
        const side = z2 + prev.z > 0 ? 'f' : 'b'
        if (side !== last) d[side] += `M${prev.x.toFixed(1)} ${prev.y.toFixed(1)}`
        d[side] += `L${px.toFixed(1)} ${py.toFixed(1)}`
        last = side
      }
      prev = { x: px, y: py, z: z2 }
    }
    ;(i % 5 === 0 ? bold : front).push(d.f)
    back.push(d.b)
  }
  return (
    <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, opacity: alpha }}>
      <defs>
        <radialGradient id="glow">
          <stop offset="0" stopColor={C.glacier} stopOpacity="0.14" />
          <stop offset="0.45" stopColor={C.moss} stopOpacity="0.1" />
          <stop offset="1" stopColor={C.moss} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="warm" cx="0.4" cy="0.7">
          <stop offset="0.5" stopColor={C.glow} stopOpacity="0" />
          <stop offset="0.78" stopColor={C.glow} stopOpacity={0.2 * warm} />
          <stop offset="1" stopColor={C.glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="shade">
          <stop offset="0" stopColor={C.ink} stopOpacity="0.5" />
          <stop offset="0.85" stopColor={C.ink} stopOpacity="0.38" />
          <stop offset="1" stopColor={C.ink} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={x} cy={y} r={r * 2} fill="url(#glow)" />
      {warm > 0.01 && <circle cx={x} cy={y} r={r * 1.4} fill="url(#warm)" />}
      <path d={back.join('')} fill="none" stroke={C.moss} strokeOpacity="0.55" strokeWidth="1.2" />
      <circle cx={x} cy={y} r={r * 1.08} fill="url(#shade)" />
      <path d={front.join('')} fill="none" stroke={C.lichen} strokeOpacity="0.7" strokeWidth="1.3" />
      <path d={bold.join('')} fill="none" stroke={C.glacier} strokeOpacity="0.95" strokeWidth="2.2" />
    </svg>
  )
}

/** Where the sphere sits in each scene (global frames); it glides between them. */
const ORB = [
  { at: STARTS[0], x: 1380, y: 520, r: 330, alpha: 0.9, warm: 0 },
  { at: STARTS[1], x: 1480, y: 560, r: 480, alpha: 0.25, warm: 0 },
  { at: STARTS[2], x: 1560, y: 230, r: 130, alpha: 0.9, warm: 0.4 },
  { at: STARTS[3], x: 1730, y: 150, r: 95, alpha: 0.7, warm: 0.1 },
  { at: STARTS[4], x: 1620, y: 880, r: 150, alpha: 0.7, warm: 0.5 },
  { at: STARTS[5], x: 230, y: 930, r: 130, alpha: 0.45, warm: 0.2 },
  { at: STARTS[6], x: 960, y: 1040, r: 260, alpha: 0.3, warm: 0.3 },
  { at: STARTS[7], x: 960, y: 540, r: 500, alpha: 0.32, warm: 1 },
]

function Backdrop() {
  const frame = useCurrentFrame()
  const t = frame / 30
  const keys = ORB.map((o) => o.at)
  const orb = Object.fromEntries(['x', 'y', 'r', 'alpha', 'warm'].map((k) => [k, interpolate(frame, keys, ORB.map((o) => o[k]), { ...clamp, easing: Easing.inOut(Easing.cubic) })]))
  const intro = ease(frame, 0, 1, 0, 45)
  return (
    <AbsoluteFill style={{ background: C.ink, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', width: 1150, height: 800, left: -260 + Math.sin(t * 0.2) * 120, bottom: -240 + Math.cos(t * 0.17) * 60, borderRadius: '50%', background: C.pine, filter: 'blur(110px)', opacity: 0.6 }} />
      <div style={{ position: 'absolute', width: 850, height: 850, right: -200 + Math.cos(t * 0.15) * 110, top: -270 + Math.sin(t * 0.21) * 90, borderRadius: '50%', background: C.moss, filter: 'blur(120px)', opacity: 0.4 }} />
      <div style={{ position: 'absolute', width: 480, height: 480, left: 760 + Math.sin(t * 0.13) * 260, top: 520 + Math.cos(t * 0.11) * 140, borderRadius: '50%', background: C.glow, filter: 'blur(120px)', opacity: 0.1 }} />
      <Sphere {...orb} r={orb.r * (0.3 + 0.7 * intro)} alpha={orb.alpha * intro} t={t} />
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, opacity: 0.07, mixBlendMode: 'overlay' }}>
        <filter id="n">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={Math.floor(frame / 2) % 12} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#n)" />
      </svg>
    </AbsoluteFill>
  )
}

/* ---------------- scenes ---------------- */

const page = { padding: '0 140px', justifyContent: 'center', color: C.snow, fontFamily: BODY }
const h1 = { fontFamily: DISPLAY, fontWeight: 800, lineHeight: 0.86, letterSpacing: '-0.01em' }

function Hook() {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={page}>
      <Kicker>Every interview has one</Kicker>
      <div style={{ ...h1, fontSize: 168, marginTop: 30, maxWidth: 1300 }}>
        <Rise text="The moment you" start={6} />
        <br />
        <Rise text="lose the room." start={14} wordStyle={{ color: C.glacier }} />
      </div>
      <Appear start={40}>
        <p style={{ marginTop: 40, fontSize: 34, color: C.dim, maxWidth: 900 }}>
          You knew the answer. It just came out as <span style={{ color: C.glow, textDecoration: 'underline', textUnderlineOffset: 8 }}>um</span>, a long pause and the point at the very end.
        </p>
      </Appear>
      <div style={{ position: 'absolute', left: 140, bottom: 90, width: ease(frame, 0, 520, 30, 60), height: 2, background: C.glacier }} />
    </AbsoluteFill>
  )
}

function Statement() {
  const frame = useCurrentFrame()
  const words = 'Knowing the answer and saying it well under pressure are two different skills.'.split(' ')
  return (
    <AbsoluteFill style={{ ...page, alignItems: 'flex-start' }}>
      <p style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 112, lineHeight: 1, maxWidth: 1500 }}>
        {words.map((w, i) => {
          const on = ease(frame, 0, 1, 8 + i * 5, 14)
          return (
            <span key={i} style={{ display: 'inline-block', marginRight: '0.24em', color: `rgba(238,247,242,${0.15 + 0.85 * on})`, transform: `translateY(${(1 - on) * 0.12}em)` }}>
              {w}
            </span>
          )
        })}
      </p>
      <Appear start={80}>
        <p style={{ marginTop: 44, fontSize: 36, color: C.lichen }}>Reading trains the first. Only saying it out loud trains the second.</p>
      </Appear>
    </AbsoluteFill>
  )
}

function Brand() {
  const frame = useCurrentFrame()
  const draw = ease(frame, 0, 1, 4, 40)
  const letters = 'Alpine'.split('')
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', color: C.snow }}>
      <Logo size={150} draw={draw} />
      <div style={{ display: 'flex', marginTop: 26, fontFamily: DISPLAY, fontSize: 250, lineHeight: 0.86 }}>
        {letters.map((l, i) => {
          const w = ease(frame, 200, 800, 20 + i * 4, 30)
          const o = ease(frame, 0, 1, 18 + i * 4, 14)
          return (
            <span key={i} style={{ fontWeight: Math.round(w), opacity: o }}>
              {l}
            </span>
          )
        })}
      </div>
      <Appear start={55}>
        <p style={{ marginTop: 28, fontFamily: BODY, fontSize: 40, color: C.dim }}>Rehearse the interview. Then just show up.</p>
      </Appear>
    </AbsoluteFill>
  )
}

function Steps() {
  const steps = [
    ['01', 'Paste the job', 'Role, company, the posting. The questions follow it.'],
    ['02', 'Check the facts', 'We research the company. The interviewer only uses facts you keep.'],
    ['03', 'Answer out loud', 'A voice interviewer asks, listens, and follows up when you stay vague.'],
  ]
  return (
    <AbsoluteFill style={page}>
      <Kicker>How it works</Kicker>
      <div style={{ ...h1, fontSize: 128, marginTop: 24 }}>
        <Rise text="Three steps to a real take." start={4} step={3} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28, marginTop: 70 }}>
        {steps.map(([n, title, body], i) => (
          <Appear key={n} start={30 + i * 14} y={50}>
            <div style={{ background: 'rgba(11,34,25,0.82)', boxShadow: `inset 0 0 0 1px ${C.line}`, padding: '40px 40px 46px', clipPath: chamfer(26), minHeight: 300 }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 40, color: i === 2 ? C.glow : C.glacier }}>{n}</div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 62, lineHeight: 1, marginTop: 18 }}>{title}</div>
              <p style={{ marginTop: 18, fontSize: 27, lineHeight: 1.45, color: C.dim }}>{body}</p>
            </div>
          </Appear>
        ))}
      </div>
    </AbsoluteFill>
  )
}

/** A spoken line, typed out like the app's caption. */
function Typed({ text, start, speed = 1.4, style }) {
  const frame = useCurrentFrame()
  const n = Math.max(0, Math.floor((frame - start) * speed))
  const blink = Math.floor(frame / 8) % 2 === 0
  return (
    <p style={style}>
      {text.slice(0, n)}
      {n > 0 && <span style={{ display: 'inline-block', width: '0.07em', height: '0.8em', marginLeft: '0.08em', background: C.glacier, verticalAlign: '-0.05em', opacity: blink ? 1 : 0 }} />}
    </p>
  )
}

function Bars({ level, colour }) {
  const frame = useCurrentFrame()
  const t = frame / 30
  const N = 64
  const bw = 1100 / N
  return (
    <svg width="1100" height="120" viewBox="0 0 1100 120">
      {Array.from({ length: N }, (_, i) => {
        const env = Math.sin(((i + 0.5) / N) * Math.PI)
        const n = ((Math.sin(t * 5 + i * 0.7) + Math.sin(t * 3.1 - i * 1.3) * 0.7) / 1.7) * 0.5 + 0.5
        const h = Math.max(3, (0.06 + level * 0.95) * 120 * (0.25 + 0.75 * n) * (0.3 + 0.7 * env))
        return <rect key={i} x={i * bw + bw * 0.2} y={60 - h / 2} width={bw * 0.6} height={h} fill={colour} opacity={0.4 + 0.6 * env} />
      })}
    </svg>
  )
}

function Live() {
  const frame = useCurrentFrame()
  // 0–60 the interviewer asks, 62–118 the candidate answers, then the follow-up.
  const answering = frame >= 62 && frame < 118
  const level = answering ? 0.35 + 0.35 * Math.abs(Math.sin(frame * 0.45) * Math.sin(frame * 0.13)) : frame < 60 || frame > 125 ? 0.18 : 0.03
  const status = frame < 60 ? 'Interviewer is asking' : frame < 118 ? 'Listening to you' : 'Follow-up'
  const followUp = frame >= 118
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: C.snow, fontFamily: BODY }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 28, color: C.dim }}>
        <span style={{ width: 12, height: 12, background: answering ? C.glow : C.glacier, transform: `rotate(45deg) scale(${0.6 + 0.4 * Math.abs(Math.sin(frame / 6))})` }} />
        {status}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} style={{ width: 13, height: 13, border: `2px solid ${C.lichen}`, transform: 'rotate(45deg)', background: i === 0 ? C.lichen : i === 1 ? C.glacier : 'transparent' }} />
        ))}
      </div>
      <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!followUp ? (
          <Typed text="Walk me through how you'd debug a problem you've never seen." start={4} style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 92, lineHeight: 0.98, maxWidth: 1400 }} />
        ) : (
          <Typed text="You mentioned asking a friend or AI. What did you do when neither had seen it?" start={122} speed={1.6} style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 84, lineHeight: 0.98, maxWidth: 1450, color: C.glacier }} />
        )}
      </div>
      <Bars level={level} colour={answering ? C.glow : C.glacier} />
      <div style={{ height: 70, marginTop: 24, fontSize: 30, color: C.dim, opacity: ease(frame, 0, 1, 70, 12) }}>
        You said: <span style={{ color: C.snow }}>“I'd ask a friend who knows it, or put it into AI…”</span>
      </div>
      <Appear start={150} y={14}>
        <div style={{ fontSize: 24, color: C.lichen }}>Vague answer → one follow-up, built from your own words.</div>
      </Appear>
    </AbsoluteFill>
  )
}

const RING = 2 * Math.PI * 34

function Report() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const dims = [
    ['STAR structure', 4],
    ['Relevance', 4],
    ['Role knowledge', 3],
    ['Company fit', 2],
    ['Conciseness', 3],
    ['Evidence', 2],
  ]
  return (
    <AbsoluteFill style={{ ...page, flexDirection: 'row', alignItems: 'center', gap: 90 }}>
      <div style={{ flex: '0 0 760px' }}>
        <Kicker>The report</Kicker>
        <div style={{ ...h1, fontSize: 118, marginTop: 24 }}>
          <Rise text="Scores that quote you." start={4} />
        </div>
        <Appear start={40}>
          <div style={{ marginTop: 50, background: C.glow, color: C.ink, display: 'inline-block', padding: '6px 14px', fontWeight: 700, fontSize: 22, clipPath: chamfer(8) }}>Work on this</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 70, marginTop: 18, lineHeight: 0.95 }}>Evidence.</div>
          <p style={{ marginTop: 18, fontSize: 30, color: C.dim, lineHeight: 1.45 }}>
            You said <span style={{ color: C.snow }}>“it went well”</span>. Say how you measured it: a number, a before and after.
          </p>
        </Appear>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '46px 56px', flex: 1 }}>
        {dims.map(([name, v], i) => {
          const p = spring({ frame: frame - 24 - i * 6, fps, config: { damping: 200 }, durationInFrames: 45 })
          const colour = [C.glacier, C.lichen, C.glow][i % 3]
          return (
            <div key={name} style={{ display: 'grid', justifyItems: 'center', gap: 10, opacity: Math.min(1, p * 2) }}>
              <svg width="170" height="170" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="40" cy="40" r="34" fill="none" stroke={C.line} strokeWidth="5" />
                <circle cx="40" cy="40" r="34" fill="none" stroke={colour} strokeWidth="5" strokeDasharray={RING} strokeDashoffset={RING * (1 - (v / 5) * p)} />
              </svg>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 60, lineHeight: 1, marginTop: -8 }}>{(v * p).toFixed(0)}</div>
              <div style={{ fontSize: 24, color: C.dim }}>{name}</div>
            </div>
          )
        })}
      </div>
      <div style={{ position: 'absolute', left: 140, bottom: 60, fontSize: 20, color: C.dim }}>Sample report. Scores are practice guidance from an AI, not a hiring decision.</div>
    </AbsoluteFill>
  )
}

const PROFILE = [[0, 140], [40, 118], [70, 126], [120, 86], [150, 100], [205, 52], [240, 70], [300, 34], [330, 50], [390, 24], [430, 44], [470, 66], [520, 40], [560, 18], [600, 8]]
const PROFILE_D = PROFILE.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ')
const SEGMENTS = PROFILE.slice(1).map((p, i) => Math.hypot(p[0] - PROFILE[i][0], p[1] - PROFILE[i][1]))
const PROFILE_LENGTH = SEGMENTS.reduce((a, b) => a + b, 0)

/** The point `share` of the way along the profile line. */
function along(share) {
  let left = share * PROFILE_LENGTH
  for (let i = 0; i < SEGMENTS.length; i++) {
    if (left <= SEGMENTS[i]) {
      const f = left / SEGMENTS[i]
      return [PROFILE[i][0] + (PROFILE[i + 1][0] - PROFILE[i][0]) * f, PROFILE[i][1] + (PROFILE[i + 1][1] - PROFILE[i][1]) * f]
    }
    left -= SEGMENTS[i]
  }
  return PROFILE.at(-1)
}

function Climb() {
  const frame = useCurrentFrame()
  const draw = ease(frame, 0, 0.82, 20, 80, Easing.inOut(Easing.cubic))
  // The line is drawn by path length; the climber follows it by the same share of the length.
  const me = along(draw)
  return (
    <AbsoluteFill style={page}>
      <Kicker>Go again</Kicker>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 20 }}>
        <div style={{ ...h1, fontSize: 118 }}>
          <Rise text="Every take climbs." start={4} />
        </div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 150, lineHeight: 0.85 }}>
          {Math.round(draw * 4478).toLocaleString('en-US')}
          <span style={{ fontSize: 56, fontWeight: 600, color: C.dim, marginLeft: 10 }}>m</span>
        </div>
      </div>
      <svg width="1640" height="400" viewBox="0 0 600 150" preserveAspectRatio="none" style={{ marginTop: 40, overflow: 'visible' }}>
        <path d={PROFILE_D + ' L600 150 L0 150 Z'} fill={C.glacier} opacity={0.08 * Math.min(1, draw * 3)} />
        <path d={PROFILE_D} fill="none" stroke={C.line} strokeWidth="1.6" />
        <path d={PROFILE_D} fill="none" stroke={C.glacier} strokeWidth="2.4" pathLength="1" strokeDasharray={`${draw} 2`} />
        <rect x={me[0] - 6} y={me[1] - 6} width="12" height="12" fill={C.glow} transform={`rotate(45 ${me[0]} ${me[1]})`} />
      </svg>
      <Appear start={60}>
        <p style={{ marginTop: 30, fontSize: 32, color: C.dim, maxWidth: 1300 }}>Your two weakest scores become the next interview. Every minute you speak adds altitude.</p>
      </Appear>
    </AbsoluteFill>
  )
}

function Cta() {
  const frame = useCurrentFrame()
  const btn = ease(frame, 0, 1, 50, 25)
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: C.snow, fontFamily: BODY }}>
      <div style={{ ...h1, fontSize: 210 }}>
        <Rise text="Run it once" start={4} />
        <br />
        <Rise text="here first." start={12} />
      </div>
      <Appear start={36}>
        <p style={{ marginTop: 36, fontSize: 38, color: C.dim }}>Your real interview should feel like the second time.</p>
      </Appear>
      <div style={{ marginTop: 50, opacity: btn, transform: `translateY(${(1 - btn) * 20}px)` }}>
        <div style={{ background: C.glacier, color: C.ink, fontWeight: 700, fontSize: 32, padding: '22px 44px', clipPath: chamfer(16) }}>Start a mock interview</div>
      </div>
      <div style={{ position: 'absolute', bottom: 70, display: 'flex', alignItems: 'center', gap: 16, fontFamily: DISPLAY, fontWeight: 700, fontSize: 52, opacity: ease(frame, 0, 1, 70, 20) }}>
        <Logo size={46} />
        Alpine
      </div>
    </AbsoluteFill>
  )
}

/* ---------------- the video ---------------- */

const SCENE_COMPONENTS = [Hook, Statement, Brand, Steps, Live, Report, Climb, Cta]

export function Promo() {
  const timing = linearTiming({ durationInFrames: TRANSITION })
  const presentations = [fade(), fade(), slide({ direction: 'from-bottom' }), fade(), slide({ direction: 'from-right' }), fade(), fade()]
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      {/* Synthesised score + Kokoro voice-over, mixed by scripts/make-sound.py and scripts/make-voice.py */}
      <Audio src={staticFile('alpine-mix.wav')} />
      <Backdrop />
      <TransitionSeries>
        {SCENE_COMPONENTS.flatMap((Scene, i) => {
          const items = [
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={SCENES[i]}>
              <Scene />
            </TransitionSeries.Sequence>,
          ]
          if (i < SCENE_COMPONENTS.length - 1) items.push(<TransitionSeries.Transition key={`t${i}`} presentation={presentations[i]} timing={timing} />)
          return items
        })}
      </TransitionSeries>
    </AbsoluteFill>
  )
}
