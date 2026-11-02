import { Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Stat from '../components/Stat.jsx'
import { averageScore, dimensions, sessionResults } from '../data.js'
import { useFlow } from '../flow.jsx'
import { buildReportPdf, downloadPdf } from '../reportPdf.js'

function formatDelta(delta) {
  return delta > 0 ? `+${delta}` : String(delta)
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
  const { job, startNewPosition, resetInterview, interviewsCompleted } = useFlow()
  // A comparison needs two finished interviews. Until then only the first one is shown.
  const latest = Math.max(1, interviewsCompleted)
  const comparing = latest > 1
  const previous = comparing ? latest - 1 : 1
  const firstAverage = averageScore('session1')
  const secondAverage = averageScore('session2')
  const dialogRef = useRef(null)
  const [saveFailed, setSaveFailed] = useState(false)

  function downloadReport() {
    const result = sessionResults[Math.min(latest, sessionResults.length) - 1]
    const pdf = buildReportPdf({
      job,
      date: new Date().toLocaleDateString('en-US', { dateStyle: 'long' }),
      title: comparing ? `Progress: session ${previous} vs session ${latest}` : 'Progress: session 1',
      stats: comparing
        ? [
            { label: `Session ${previous}`, value: firstAverage.toFixed(1) },
            { label: `Session ${latest}`, value: secondAverage.toFixed(1) },
            { label: 'Change', value: `+${(secondAverage - firstAverage).toFixed(1)}`, good: true },
          ]
        : [{ label: 'Session 1', value: firstAverage.toFixed(1) }],
      rows: dimensions.map((d) => ({ name: d.name, before: d.session1, after: comparing ? d.session2 : undefined })),
      previous,
      latest,
      strongest: result.strongest,
      focus: result.focus,
    })
    downloadPdf(pdf, job.company)
  }

  function openConfirm() {
    setSaveFailed(false)
    dialogRef.current.showModal()
  }

  function confirmNewPosition() {
    const saved = startNewPosition(
      comparing
        ? { interviewsCompleted: latest, session1: firstAverage, session2: secondAverage, dimensions }
        : { interviewsCompleted: latest, session1: firstAverage, dimensions: dimensions.map(({ name, session1 }) => ({ name, session1 })) },
    )
    if (!saved) {
      setSaveFailed(true)
      return
    }
    dialogRef.current.close()
    navigate('/')
  }

  return (
    <div className="page progress">
      <h1>{comparing ? `Progress: session ${previous} vs session ${latest}` : 'Progress: session 1'}</h1>
      <p className="lede">
        {comparing
          ? `See how your ${latest === 2 ? 'second' : 'latest'} interview improved after targeted practice.`
          : 'Finish your next interview to see how your scores change.'}
      </p>
      <div className="stats">
        <Stat label={`Session ${previous}`} value={firstAverage.toFixed(1)} />
        {comparing && (
          <>
            <Stat label={`Session ${latest}`} value={secondAverage.toFixed(1)} />
            <Stat label="Change" value={`+${(secondAverage - firstAverage).toFixed(1)}`} tone="good" />
          </>
        )}
      </div>
      <section className="card compare" aria-labelledby="compare-title">
        <div className="compare-header">
          <h2 id="compare-title">Scores by dimension</h2>
          <ul className="legend">
            <li>
              <span className="swatch before" aria-hidden="true" />
              Interview {previous} (session {previous})
            </li>
            {comparing && (
              <li>
                <span className="swatch after" aria-hidden="true" />
                Interview {latest} (session {latest})
              </li>
            )}
          </ul>
        </div>
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Dimension</th>
              <th scope="col" className="comparison-heading">
                {comparing ? 'Comparison (score out of 5)' : 'Score out of 5'}
              </th>
              {comparing && (
                <th scope="col" className="improvement-heading">
                  Improvement
                </th>
              )}
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
                      <ScoreBar label={`Interview ${previous}`} score={d.session1} className="before" />
                      {comparing && (
                        <ScoreBar label={`Interview ${latest}`} score={d.session2} className="after" from={d.session1 / d.session2} />
                      )}
                    </div>
                  </td>
                  {comparing && (
                    <td className="improvement">
                      <span className={delta === 0 ? 'delta flat' : 'delta'}>{formatDelta(delta)}</span>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      <div className="actions">
        <Link className="btn btn-primary" to="/interview" onClick={resetInterview}>
          Start next interview
        </Link>
        <button className="btn" type="button" onClick={downloadReport}>
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
