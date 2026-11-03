// Alpine product demo: the real app, recorded by demo/record.mjs, cut and narrated by demo/build.py.

import { Audio, Video } from '@remotion/media'
import { loadFont as loadDisplay } from '@remotion/google-fonts/BigShoulders'
import { loadFont as loadBody } from '@remotion/google-fonts/SchibstedGrotesk'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { AbsoluteFill, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import timeline from './demo-timeline.json'

const { fontFamily: DISPLAY } = loadDisplay('normal', { subsets: ['latin'] })
const { fontFamily: BODY } = loadBody('normal', { weights: ['400', '600', '700'], subsets: ['latin'] })

const C = { ink: '#050e0a', spruce: '#0b2219', pine: '#14382a', moss: '#2f6b4f', lichen: '#7fb99a', glacier: '#b9f0dc', snow: '#eef7f2', glow: '#ff8a6b', dim: 'rgba(238,247,242,0.62)', line: 'rgba(238,247,242,0.14)' }
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const chamfer = (n) => `polygon(0 0,calc(100% - ${n}px) 0,100% ${n}px,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`

export const DEMO_FRAMES = timeline.frames

// The recording sits in a window, scaled so there is room for the step label above and captions below.
const SCALE = 0.84
const WIN = { w: 1920 * SCALE, h: 1080 * SCALE }
const WIN_TOP = 70

function Backdrop() {
  const frame = useCurrentFrame()
  const t = frame / 30
  return (
    <AbsoluteFill style={{ background: C.ink, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', width: 1150, height: 800, left: -260 + Math.sin(t * 0.2) * 120, bottom: -240 + Math.cos(t * 0.17) * 60, borderRadius: '50%', background: C.pine, filter: 'blur(110px)', opacity: 0.6 }} />
      <div style={{ position: 'absolute', width: 850, height: 850, right: -200 + Math.cos(t * 0.15) * 110, top: -270 + Math.sin(t * 0.21) * 90, borderRadius: '50%', background: C.moss, filter: 'blur(120px)', opacity: 0.4 }} />
    </AbsoluteFill>
  )
}

function Logo({ size, draw = 1 }) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 26 22" style={{ overflow: 'visible' }}>
      <path d="M1 21 L9 6 L14 14 L18 8 L25 21 Z" fill="none" stroke={C.glacier} strokeWidth="2" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - draw} />
    </svg>
  )
}

/** Narration as a subtitle, revealed word by word at roughly the speaking pace. */
function Caption({ text, frames }) {
  const frame = useCurrentFrame()
  const words = text.split(' ')
  const speakFrames = Math.max(1, frames - 30)
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: WIN_TOP + WIN.h + 18, textAlign: 'center', fontFamily: BODY, fontSize: 26, lineHeight: 1.3, padding: '0 160px', color: C.snow }}>
      {words.map((w, i) => {
        const on = interpolate(frame, [10 + (i / words.length) * speakFrames, 16 + (i / words.length) * speakFrames], [0.25, 1], clamp)
        return (
          <span key={i} style={{ opacity: on }}>
            {w}{' '}
          </span>
        )
      })}
    </div>
  )
}

function Step({ label }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = spring({ frame: frame - 4, fps, config: { damping: 200 } })
  return (
    <div style={{ position: 'absolute', left: (1920 - WIN.w) / 2, top: 18, display: 'flex', alignItems: 'center', gap: 14, opacity: p, transform: `translateX(${(1 - p) * -20}px)`, fontFamily: BODY, fontWeight: 700, fontSize: 26, color: C.snow }}>
      <span style={{ width: 12, height: 12, background: C.glow, transform: 'rotate(45deg)' }} />
      {label}
    </div>
  )
}

function Clip({ seg }) {
  const frame = useCurrentFrame()
  // A slow push-in keeps long stretches of UI alive without hiding anything.
  const zoom = interpolate(frame, [0, seg.frames], [1, 1.035], { ...clamp, easing: Easing.inOut(Easing.sin) })
  return (
    <AbsoluteFill>
      <Step label={seg.label} />
      <div style={{ position: 'absolute', left: (1920 - WIN.w) / 2, top: WIN_TOP, width: WIN.w, height: WIN.h, overflow: 'hidden', clipPath: chamfer(22), boxShadow: `0 0 0 1px ${C.line}`, background: C.ink }}>
        <div style={{ width: 1920, height: 1080, transform: `scale(${SCALE * zoom})`, transformOrigin: '0 0' }}>
          <Video src={staticFile('walkthrough.mp4')} trimBefore={Math.round(seg.from * 30)} trimAfter={Math.round(seg.to * 30)} playbackRate={seg.rate} muted />
        </div>
      </div>
      <Caption text={seg.caption} frames={seg.frames} />
    </AbsoluteFill>
  )
}

function Card({ last }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const draw = interpolate(frame, [0, 35], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) })
  const p = spring({ frame: frame - 12, fps, config: { damping: 200 } })
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', color: C.snow, textAlign: 'center' }}>
      <Logo size={120} draw={draw} />
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 200, lineHeight: 0.9, marginTop: 20, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>Alpine</div>
      <div style={{ fontFamily: BODY, fontSize: 38, color: C.dim, marginTop: 24, opacity: p }}>{last ? 'Rehearse the interview. Then just show up.' : 'Product demo'}</div>
      {last && (
        <div style={{ marginTop: 44, opacity: interpolate(frame, [30, 50], [0, 1], clamp), background: C.glacier, color: C.ink, fontFamily: BODY, fontWeight: 700, fontSize: 30, padding: '20px 40px', clipPath: chamfer(14) }}>Start a mock interview</div>
      )}
    </AbsoluteFill>
  )
}

export function Demo() {
  const timing = linearTiming({ durationInFrames: timeline.fade })
  const segs = timeline.segments
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      {/* Ambient pad, soft swells and Kokoro narration, mixed by demo/build.py */}
      <Audio src={staticFile('demo-mix.wav')} />
      <Backdrop />
      <TransitionSeries>
        {segs.flatMap((seg, i) => {
          const items = [
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={seg.frames}>
              {seg.kind === 'card' ? <Card last={i === segs.length - 1} /> : <Clip seg={seg} />}
            </TransitionSeries.Sequence>,
          ]
          if (i < segs.length - 1) items.push(<TransitionSeries.Transition key={`t${i}`} presentation={fade()} timing={timing} />)
          return items
        })}
      </TransitionSeries>
    </AbsoluteFill>
  )
}
