import { Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Stat from '../components/Stat.jsx'
import { dimensions } from '../data.js'
import { useFlow } from '../flow.jsx'

function formatDelta(delta) {
  return delta > 0 ? `+${delta}` : String(delta)
}

function average(key) {
  return dimensions.reduce((sum, d) => sum + d[key], 0) / dimensions.length
}

function ScoreBar({ label, score, className, from }) {
  return (
    <>
      <span className="comparison-label">{label}</span>
      <span className="track" aria-hidden="true">
        <span className={`fill ${className}`} style={{ '--score': score, '--from': from }} />
      </span>
      <span className="comparison-value">{score.toFixed(1)} / 5</span>
    </>
  )
}

export default function Progress() {
  const navigate = useNavigate()
  const { startNewPosition } = useFlow()
  const dialogRef = useRef(null)
  const [saveFailed, setSaveFailed] = useState(false)

  function openConfirm() {
    setSaveFailed(false)
    dialogRef.current.showModal()
  }

  function confirmNewPosition() {
    const saved = startNewPosition({ session1: average('session1'), session2: average('session2'), dimensions })
    if (!saved) {
      setSaveFailed(true)
      return
    }
    dialogRef.current.close()
    navigate('/')
  }

  return (
    <div className="page progress">
      <h1>Progress: session 1 vs session 2</h1>
      <p className="lede">See how your second interview improved after targeted practice.</p>
      <div className="stats">
        <Stat label="Session 1" value="2.5" />
        <Stat label="Session 2" value="3.5" />
        <Stat label="Change" value="+1.0" tone="good" />
      </div>
      <section className="card compare" aria-labelledby="compare-title">
        <div className="compare-header">
          <h2 id="compare-title">Scores by dimension</h2>
          <ul className="legend">
            <li>
              <span className="swatch before" aria-hidden="true" />
              Interview 1 (session 1)
            </li>
            <li>
              <span className="swatch after" aria-hidden="true" />
              Interview 2 (session 2)
            </li>
          </ul>
        </div>
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Dimension</th>
              <th scope="col" className="comparison-heading">
                Comparison (score out of 5)
              </th>
              <th scope="col" className="improvement-heading">
                Improvement
              </th>
            </tr>
          </thead>
          <tbody>
            {dimensions.map((d) => {
              const delta = d.session2 - d.session1
              return (
                <tr key={d.name}>
                  <th scope="row">{d.name}</th>
                  <td>
                    <div className="comparison">
                      <ScoreBar label="Interview 1" score={d.session1} className="before" />
                      <ScoreBar label="Interview 2" score={d.session2} className="after" from={d.session1 / d.session2} />
                    </div>
                  </td>
                  <td className="improvement">
                    <span className={delta === 0 ? 'delta flat' : 'delta'}>{formatDelta(delta)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      <div className="actions">
        <Link className="btn btn-primary" to="/interview">
          Start next interview
        </Link>
        <button className="btn" type="button">
          Download report
        </button>
        <button className="btn btn-text" type="button" onClick={openConfirm}>
          <Plus size={18} strokeWidth={2.25} aria-hidden="true" />
          New position
        </button>
      </div>
      <dialog className="confirm-dialog" ref={dialogRef} aria-labelledby="new-position-title" aria-describedby="new-position-text">
        <h2 id="new-position-title">Start a new position?</h2>
        <p id="new-position-text">Your current results are saved.</p>
        {saveFailed && (
          <p className="confirm-error" role="alert">
            Your results couldn't be saved, so nothing changed. Please try again.
          </p>
        )}
        <div className="confirm-actions">
          <button className="btn" type="button" onClick={() => dialogRef.current.close()}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={confirmNewPosition}>
            Start new position
          </button>
        </div>
      </dialog>
    </div>
  )
}
