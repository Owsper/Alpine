import { memo } from 'react'

/**
 * A dot-matrix spectrogram: every dot is its own CSS animation, timed by its distance from the centre,
 * so a sound wave keeps travelling outwards across the field. Decorative; screen readers skip it.
 */
function VoiceField({ rows, cols, className = '' }) {
  const centerRow = (rows - 1) / 2
  const centerCol = (cols - 1) / 2
  const dots = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fromCenter = Math.abs(c - centerCol) / centerCol
      const fromMiddle = Math.abs(r - centerRow) / centerRow
      dots.push(
        <i
          key={`${r}-${c}`}
          style={{
            '--d': `${Math.round(fromCenter * 1400 + fromMiddle * 420)}ms`,
            '--h': (1 - fromMiddle * 0.85).toFixed(2),
          }}
        />,
      )
    }
  }

  return (
    <div className={`voice-field ${className}`} style={{ '--cols': cols }} aria-hidden="true">
      {dots}
    </div>
  )
}

export default memo(VoiceField)
