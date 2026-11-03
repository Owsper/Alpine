// Records a real walkthrough of the Alpine app for the demo video.
// Needs the app running against a throwaway database, next to (not instead of) your own:
//   backend:  cd backend && DATABASE_PATH=demo.db VOICE_ENABLED=false .venv/Scripts/python -m uvicorn app.main:app --port 8101
//   frontend: cd frontend && API_PORT=8101 npx vite --port 5175
// Writes demo/out/walkthrough.webm and demo/out/markers.json (seconds since the recording started).

import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = fileURLToPath(new URL('.', import.meta.url))
const API = 'http://127.0.0.1:8101/api'
const APP = 'http://localhost:5175'
const outDir = `${here}out`
mkdirSync(outDir, { recursive: true })

async function api(path, body) {
  const response = await fetch(`${API}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
  return response.json()
}

/** One earlier, weaker take on another job, so the dashboard has history to show. */
async function seed() {
  const { sessions } = await api('/sessions')
  if (sessions.length) return
  const { job } = await api('/research', { company: 'Nimbus Logistics', role: 'Backend engineer', description: 'Build and run the shipment tracking APIs in Python and Postgres. On-call rotation, code reviews, mentoring interns.' })
  const session = await api('/session', { job_id: job.id })
  await api(`/session/${session.sessionId}/start`, {})
  let t = Date.now() - 6 * 60_000
  const turns = []
  const answers = [
    'Um, I like backend stuff and, uh, I think logistics is interesting, so yeah.',
    'We had a bug once and I, um, fixed it. It was in the API I think.',
    'I would look at the logs and, uh, ask someone on the team.',
  ]
  session.questions.slice(0, 3).forEach((q, i) => {
    turns.push({ questionId: q.id, role: 'interviewer', text: q.text, startedAt: t, endedAt: (t += 4000) })
    turns.push({ questionId: q.id, role: 'candidate', text: answers[i], startedAt: (t += 800), endedAt: (t += 9000) })
  })
  await api(`/session/${session.sessionId}/transcript`, { turns, durationSec: 150 })
  await api('/grade', { session_id: session.sessionId })
}

await seed()

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${here}silence.wav`, '--autoplay-policy=no-user-gesture-required'],
})
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: outDir, size: { width: 1920, height: 1080 } } })
await context.grantPermissions(['microphone'], { origin: APP })
const page = await context.newPage()
const t0 = Date.now()
const markers = {}
const mark = (name) => {
  markers[name] = (Date.now() - t0) / 1000
  console.log(name.padEnd(16), markers[name].toFixed(1))
}
const pause = (ms) => page.waitForTimeout(ms)

async function glide(locator) {
  const box = await locator.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 })
}
async function press(locator) {
  await glide(locator)
  await pause(250)
  await locator.click()
}
async function typeInto(locator, text, delay = 28) {
  await press(locator)
  await locator.pressSequentially(text, { delay })
}

// 1. Landing
await page.goto(APP)
mark('landing')
await pause(5200)
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, 260)
  await pause(260)
}
await pause(1200)
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
await pause(1500)
mark('landing-cta')
await press(page.getByRole('link', { name: 'Start a mock interview' }).first())

// 2. Practice: the job
await page.waitForURL(/app\.html/)
await page.getByRole('heading', { name: 'Practice' }).waitFor()
await pause(1800)
mark('job')
await press(page.getByRole('button', { name: 'Software engineer', exact: true }))
await page.getByPlaceholder('Software engineer, working student').fill('')
await typeInto(page.getByPlaceholder('Software engineer, working student'), 'Software engineer, working student')
await typeInto(page.getByPlaceholder('Acme Robotics'), 'Acme Robotics')
await press(page.getByPlaceholder('Paste the job description here.'))
await page.getByPlaceholder('Paste the job description here.').fill(
  'Working student, software engineering (20 h/week).\nYou will build fleet-control services in Go and TypeScript, write tests, and ship small features end to end with the robotics team.\nYou bring: a CS degree in progress, one real project you can talk about, curiosity about robots.',
)
await pause(900)
mark('research')
await press(page.getByRole('button', { name: 'Research the company' }))

// 3. Facts
await page.getByRole('heading', { name: /What we found about/ }).waitFor({ timeout: 60_000 })
mark('facts')
await pause(2500)
const facts = page.locator('.fact input')
if ((await facts.count()) > 2) {
  await press(facts.nth(2))
  await pause(1200)
}
mark('ask')
await press(page.getByRole('button', { name: 'Ask me a question' }))

// 4. The interview, answered by typing
const field = page.getByPlaceholder('Prefer typing? Write your answer here')
await field.waitFor({ timeout: 30_000 })
mark('live')
const caption = page.locator('.lq')
async function answer(text, label) {
  const before = await caption.textContent()
  await pause(1600)
  mark(label)
  await typeInto(field, text, 22)
  await pause(400)
  await field.press('Enter')
  // Wait for the interviewer's next line: a follow-up or the next question.
  await page.waitForFunction((prev) => {
    const now = document.querySelector('.lq')?.textContent ?? ''
    return now && now !== prev
  }, before, { timeout: 30_000 })
  await pause(2400)
}
await pause(2500)
await answer('Honestly it was a project I did, and it went fine.', 'answer-vague')
mark('followup')
await answer(
  'Last spring I built a route planner for our campus delivery robot in Go. Paths kept colliding at one junction, so I added a reservation table. Collisions dropped to zero over two weeks of testing.',
  'answer-concrete',
)
await answer(
  'At my student job I owned the shipping API. A deploy broke label printing, I rolled it back in five minutes, then added a contract test so it cannot ship broken again.',
  'answer-3',
)
mark('end')
await press(page.getByRole('button', { name: 'End session' }))

// 5. Done → report
await page.getByRole('heading', { name: 'Take finished' }).waitFor({ timeout: 60_000 })
mark('done')
await pause(3000)
await press(page.getByRole('button', { name: 'See the report' }))
await page.locator('.dims').waitFor({ timeout: 90_000 })
mark('report')
await pause(1500)
await press(page.getByRole('button', { name: 'Play' }))
await pause(5000)
await page.mouse.wheel(0, 500)
await pause(2500)
await page.mouse.wheel(0, 600)
await pause(2500)
await glide(page.getByRole('button', { name: 'Download report (PDF)' }))
mark('download')
await pause(2500)

// 6. Overview
await page.mouse.wheel(0, -3000)
await pause(800)
mark('overview')
await press(page.getByRole('link', { name: 'Overview' }))
await pause(4500)
for (let i = 0; i < 5; i++) {
  await page.mouse.wheel(0, 300)
  await pause(450)
}
await glide(page.locator('#chart'))
await pause(2500)
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel(0, 350)
  await pause(450)
}
await pause(2000)
mark('end-of-recording')

await context.close()
await browser.close()
const video = readdirSync(outDir).find((f) => f.endsWith('.webm') && f !== 'walkthrough.webm')
renameSync(`${outDir}/${video}`, `${outDir}/walkthrough.webm`)
writeFileSync(`${outDir}/markers.json`, JSON.stringify(markers, null, 2))
console.log('saved demo/out/walkthrough.webm')
