import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { label } from '../api.js'
import { CountUp, LineChart, Peaks, Profile, Rings, Streak, chevron } from '../components/alpine.jsx'
import { METRES_PER_MINUTE, SUMMIT, fmtTime, summarise } from '../dashboard.js'

const COLOURS = ['var(--glacier)', 'var(--lichen)', 'var(--alpenglow)']

export default function Overview({ data }) {
  const navigate = useNavigate()
  const { sessions, upcoming, dimensions, loading, error } = data
  const stats = summarise(sessions, dimensions)
  const [metric, setMetric] = useState(0)
  const first = sessions.length === 0
  const nextQuestion = upcoming?.questions?.[0]?.text
  const toGo = SUMMIT - stats.metres
  const focus = stats.latest?.weakest

  return (
    <>
      <header className="top rise" style={{ '--d': 0 }}>
        <div>
          <h1>{first ? 'Basecamp.' : 'Welcome back.'}</h1>
          <p>{loading ? 'Loading your sessions…' : error ? error : first ? 'Your numbers land here once you run a session.' : `${sessions.length} session${sessions.length === 1 ? '' : 's'} so far.`}</p>
        </div>
      </header>
      <div className="grid">
        <article className="card hero c12 rise" style={{ '--d': 1 }} data-anchor data-ax=".82" data-ay=".5" data-ar=".62" data-orb='{"amp":0.09,"m":0,"alpha":1,"warm":0.3,"tilt":0.35}'>
          <div>
            <h2>{upcoming ? `Ready for take ${upcoming.number}?` : first ? 'Ready for your first take?' : 'Ready for another take?'}</h2>
            <p className="q">
              {upcoming && nextQuestion ? (
                <>
                  Next question in your {upcoming.role} set at {upcoming.company}: <b>“{nextQuestion}”</b>
                </>
              ) : (
                'Paste a job post, check what we found about the company, then answer out loud.'
              )}
            </p>
          </div>
          <div className="hero-act">
            <Link className="btn solid" to="/practice" data-burst>
              <span>Start a session</span>
            </Link>
            {sessions[0] && (
              <Link className="btn ghost" to={`/sessions/${sessions[0].sessionId}`}>
                Replay last take
              </Link>
            )}
            <Streak week={stats.week} streak={stats.streak} />
          </div>
        </article>

        <article className="card c7 rise" style={{ '--d': 2 }}>
          <div className="hd">
            <div>
              <h2>Altitude</h2>
              <p className="sub">Every minute you speak adds {METRES_PER_MINUTE} metres. The summit is {SUMMIT.toLocaleString('en-US')}.</p>
            </div>
          </div>
          <div className="big">
            <CountUp to={stats.metres} ms={1500} />
            <small>m</small>
          </div>
          <Profile metres={stats.metres} />
          <p className="togo">
            {toGo > 0
              ? `${toGo.toLocaleString('en-US')} m to the summit, about ${fmtTime((toGo / METRES_PER_MINUTE) * 60)} more speaking.`
              : 'Summit reached. Keep the habit going.'}
          </p>
        </article>

        <article className="card alt2 c5 rise" style={{ '--d': 3 }}>
          <div className="hd">
            <div>
              <h2>Last take</h2>
              <p className="sub">{stats.latest ? `Scores out of 5, ${stats.latest.day.toLowerCase()}` : 'Scores appear after your first graded session'}</p>
            </div>
          </div>
          {stats.rings.length ? <Rings items={stats.rings.map((r) => ({ ...r, label: label(r.label) }))} /> : <p className="empty">Nothing graded yet.</p>}
        </article>

        <article className="card c8 rise" style={{ '--d': 4 }}>
          <div className="hd">
            <div>
              <h2>Your takes, in order</h2>
              <p className="sub">Hover the line to read any take</p>
            </div>
            <div className="chips">
              {dimensions.map((dim, i) => (
                <button key={dim} type="button" className={`chip ${metric === i ? 'on' : ''}`} onClick={() => setMetric(i)}>
                  {label(dim)}
                </button>
              ))}
            </div>
          </div>
          {stats.graded.length ? (
            <LineChart data={stats.series[dimensions[metric]]} name={label(dimensions[metric])} colour={COLOURS[metric % 3]} />
          ) : (
            <p className="empty">The line starts with your first graded take.</p>
          )}
        </article>

        <article className="card alt2 focus c4 rise" style={{ '--d': 5 }}>
          <span className="tag">Work on this</span>
          {focus ? (
            <>
              <h3>{label(focus.dimension)}.</h3>
              <p>{focus.fix ?? `This was your lowest score last time (${focus.value} of 5).`}</p>
              {focus.evidence_quote && (
                <p>
                  You said: <q>{focus.evidence_quote}</q>
                </p>
              )}
            </>
          ) : (
            <>
              <h3>Say it out loud.</h3>
              <p>After your first session this card names the one thing to fix next, quoting your own words.</p>
            </>
          )}
          <Link className="btn ghost sm" style={{ marginTop: 18 }} to="/practice">
            Drill it
          </Link>
        </article>

        <article className="card c7 rise" style={{ '--d': 6 }}>
          <div className="hd">
            <div>
              <h2>Twelve weeks</h2>
              <p className="sub">Sessions per week</p>
            </div>
          </div>
          <Peaks values={stats.weeks} max={Math.max(4, ...stats.weeks)} axis="W" read={(i, v) => <><b>{v}</b> session{v === 1 ? '' : 's'} in week {i + 1}</>} empty="Hover a peak." />
        </article>

        <article className="card alt2 c5 rise" style={{ '--d': 7 }}>
          <div className="hd">
            <div>
              <h2>Filler words</h2>
              <p className="sub">Per take, oldest to newest</p>
            </div>
          </div>
          {stats.fillers.length ? (
            <Peaks
              values={stats.fillers.slice(-12)}
              max={Math.max(5, ...stats.fillers)}
              axis="T"
              read={(i, v) => <><b>{v}</b> filler word{v === 1 ? '' : 's'} in take {i + 1}</>}
              empty={stats.fillers.length > 1 ? `From ${stats.fillers[0]} to ${stats.fillers.at(-1)}.` : `${stats.fillers[0]} in your first take.`}
            />
          ) : (
            <p className="empty">Counted from your transcript: um, uh, erm.</p>
          )}
        </article>

        <article className="card c12 rise" style={{ '--d': 8 }}>
          <div className="hd">
            <div>
              <h2>Recent sessions</h2>
              <p className="sub">Open one to replay it with the transcript</p>
            </div>
            <Link className="btn ghost sm" to="/sessions">
              All sessions
            </Link>
          </div>
          <div className="rows">
            {sessions.slice(0, 5).map((s) => (
              <button className="row" type="button" key={s.sessionId} onClick={() => navigate(`/sessions/${s.sessionId}`)}>
                <span>
                  <b>{s.title}</b>
                  <small>
                    {s.role} at {s.company} · {s.day} · {fmtTime(s.durationSec)}
                  </small>
                </span>
                <span className="sc">{s.overall == null ? '–' : s.overall.toFixed(1)}</span>
                <span className="go">{chevron}</span>
              </button>
            ))}
            {!sessions.length && <p className="empty">No sessions yet.</p>}
          </div>
        </article>
      </div>
    </>
  )
}
