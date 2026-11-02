# Frontend integration

> **DRAFT for sign-off.** Calls and fields are the real ones from [api.md](api.md). Recommendations are proposals, the frontend team decides. Frontend line numbers are from commit `b2ddd74` and will drift.

The frontend is fully mocked today : `src/data.js` says so on line 1, and `src/` has no `fetch`, `WebSocket` or `RTCPeerConnection`. So nothing below is wired yet.

Sign-off means three things : answer the [decisions](#decisions-needed) by number, pick a [voice option](#the-biggest-gap--voice-and-transcripts), and close the [open points in api.md](api.md#open-points-for-sign-off).

## One full loop

| # | Screen | When | Call | Keep |
| --- | --- | --- | --- | --- |
| 1 | `/start` JobPosting | "Prepare interview" | `POST /research` `{user_id,job_description,company_url?}` | `job.id`, `company`, `facts`, `warnings`, `disclaimer` |
| 2 | `/research` Research | "Start interview" | `POST /session` `{user_id,job_id}` | the Session : `id`, `number`, `flow` |
| 3 | `/interview` Interview | lobby "Start interview" | `POST /session/:id/start`, no body | |
| 4 | | after each answer | `POST /session/:id/transcript` `{turns,final:false}` | all turns so far, one save at a time |
| 5 | | "End session" | `POST /session/:id/transcript` `{turns,final:true}` | `transcript`, for "View transcript" |
| 6 | `/report` Report | on arrival | `POST /grade` `{session_id}` | the Score |
| 7 | | "Generate my next interview" | `POST /next` `{session_id}` | `session`, now the current one |
| 8 | `/progress` Progress | on arrival | none, uses the Score from 6 | |
| 9 | | "Start next interview" | none, back to 3 with the session from 7 | |

The landing page calls nothing. On the second pass the Score from step 6 has `progress` filled, on the first pass it is null, which matches the `comparing` branch in `Progress.jsx`. Drive that branch from `score.progress !== null`, see the [field map](#field-map).

- **Click handlers, not effects.** `main.jsx:17` uses `StrictMode`, which runs effects twice in dev. `/research` and `/session` are not idempotent, so an effect makes two jobs and pays the LLM twice. Step 6 has to run on arrival, so guard it with a ref : a second `/grade` at the same time gets `grading_in_progress`.
- **Going back.** `/start` stays reachable. Call `/research` again only if the text changed, every call makes a new job.
- **Reload.** `session_id` is enough, `GET /session/:id` returns the session, score, job, facts and disclaimer. `created` or `in_progress` means Interview, `completed` means Report and run step 6, `graded` means Report with the returned `score`. After step 7 the graded session is `session.source_session_id`.
- **Reload during an interview.** The turns are in memory, so they are gone after a refresh and `flow.jsx` keeps the interview going. Before any save, seed the turns from `session.transcript` (null means `[]`) and resume at the first `flow` step of type `question` whose `question_id` has no candidate turn. Never start from an empty list : a shorter save and End session both get `invalid_state` with `details.stored_turns`, and once the new list reaches the stored length it **silently replaces the earlier answers**.
- **Waits**, from a few runs : `/research` 4 to 23 s, `/session` 13 to 23 s, `/grade` 17 to 37 s, `/next` 19 to 40 s. Details in [api.md](api.md#timing).

## Field map

Job form :

| Frontend | API |
| --- | --- |
| `job.posting` | `job_description`, 1 to 20000 chars |
| `job.company`, `job.role` | no request field, unknown fields are dropped silently, see [D8](#d8-company-role-and-a-url-as-the-posting) |
| nothing | `company_url`, optional |
| shown back | `job.company_name`, `job.role_title`, `company.name`, all nullable |

Facts :

| Frontend | API |
| --- | --- |
| `fact.text` | `claim`, a sentence copied from the page, so it can say "we" |
| `fact.source` | `source_url`, a full url, so drop the `https://` prefix in `Research.jsx:155` |
| `fact.retrieved` | `retrieved_at`, ISO. `new Date(x).toLocaleDateString('en-GB',{dateStyle:'medium'})` gives `2 Nov 2026` |
| `fact.id` | none, use the array index |
| `fact.tag` | none, the backend does not categorize. Drop it, or show the source host there |
| `fact.added`, `isEdited` | none, see [D1](#d1-editable-facts) |
| `company` constant | `company.name`, can be null |

Interview :

| Frontend | API |
| --- | --- |
| `generateQuestions(facts)` | `session.flow`, steps with `type` `question`. Use `flow`, not `questions`, for the order |
| `question` as React key | `question_id` |
| `currentQuestion.index` | none, client state moved by whatever runs the voice |
| `interviewStartedAt`, `interviewer` | none, client only |

Dimensions, same order as `score.scores` :

| Frontend name | Id |
| --- | --- |
| STAR structure | `star` |
| Relevance | `relevance` |
| Role knowledge | `role_knowledge` |
| Company fit | `company_fit` |
| Conciseness | `conciseness` |
| Evidence | `evidence` |

Results :

| Frontend | API |
| --- | --- |
| `Math.max(1,interviewsCompleted)` | the graded session's `number`, counts per job. Keep it from before step 7 or read it with `GET /session/:source_session_id`. On `/progress` the current session is already the new one, so `session.number` is one too high |
| `comparing`, `latest > 1` on Progress | `score.progress !== null`, never `session.number`. On the first pass `session.number` is 2 while `progress` is null, so `score.progress[i]` would throw |
| `dimensions[i].sessionN` on Report | `score.scores[i].score` |
| `sessionResults[i].strongest`, one string | `score.strengths`, one or more, not sorted by score |
| `sessionResults[i].focus`, `'STAR, Evidence'` | `score.weakest`, exactly two, lowest first |
| hard-coded quote and tip, `Report.jsx:59-73` | `score.scores[i].evidence_quote`, `.tip`, one per dimension |
| `d.session1`, `d.session2` on Progress | when comparing `score.progress[i].prev`, `.cur`. On the first pass `d.session1` is `score.scores[i].score` and there is no `d.session2` |
| `delta` | `score.progress[i].delta`, only when `.significant` is true |
| `averageScore()` | none on purpose, see [D3](#d3-overall-score) |
| hard-coded "Demo data", `Research.jsx:120`, `reportPdf.js:100` | `job.demo`, `score.fallback` |

## Decisions needed

### D1. Editable facts

Research lets the user edit, remove and add facts (`Research.jsx:69-85`), and added ones have no source. The backend has no route that changes facts and a Fact must have `source_url` and `retrieved_at`. `/session` builds `interviewer_instructions` from the stored facts and `/grade` and `/next` read them too, so edits would reach none of them. "The interviewer only uses what is listed here" (`Research.jsx:91`) would be false, and added facts break "Every fact links to its source" on the same line and "Never show a fact without a source" in the requirements.

**Recommend** : read-only facts for the MVP, remove the edit UI. If removing a fact matters later it needs a new backend route, none exists. Text the user types should never be shown as a fact.

### D2. generateQuestions versus server questions

`generateQuestions(facts)` returns short labels and a changing count (`data.js:61`). The server returns exactly 5 full questions, up to two sentences each, so the list needs room for longer text. The Blueprint panel also invents 5 questions from a skills regex under the heading "Your interview" (`Blueprint.jsx:19-25`), and the real ones will differ.

**Recommend** : delete `generateQuestions`, render `session.flow`. Keep the Blueprint skills, drop its question list or label it as an example.

### D3. Overall score

Report shows "Overall score x.x / 5" (`Report.jsx:37-40`). Progress shows averages and a "Change" (`Progress.jsx:36-37,90-99`), and so do the PDF and the saved positions (`Progress.jsx:48-49,65-71`). The research, section 9 Ethics, says : "Psychological safety: the pattern "1 strength → 2 improvements → 1 exercise"; no overall score after the first session." That wording can mean none from session 2 on, or none once session 1 ends. The backend has no such field, and [api.md](api.md#what-the-frontend-owns) says the UI must not compute one.

**Recommend** : no overall score on any session, which holds under both readings. Delete `averageScore`. The research demo script is per dimension too : "radar: Structure 2 → 4".

### D4. Progress claims

The research, section 7 : "Progress = Δ on repeated dimensions, shown only if Δ > grader noise". Today every delta is shown (`Progress.jsx:148`), the lede says "improved" (`:86`), confetti always plays when comparing (`:97`), and "Change" always gets a `+` (`:96`), so a drop would read `+-0.5`.

**Recommend** : show `delta` only when `significant`, otherwise "within noise". Confetti only when a row has `significant` and `delta > 0`. Neutral lede. Render real drops. `progress` compares a session with the one before it only, so a longer history needs stored session ids or `GET /user/:id/export`, there is no list route.

### D5. Where the ids live

Flow state is in `sessionStorage`, one per tab (`flow.jsx:33,44`). Finished positions are in `localStorage` and nothing reads them yet (`flow.jsx:13,23`).

**Recommend** :

- `user_id` in `localStorage`, created once. In `sessionStorage` every tab would be a new user with unreachable data.
- Current `job_id` and `session_id` in the flow state, so a refresh restores through `GET /session/:id`.
- `interviewverse-positions` keeps `job_id` and session ids, not copies of the job, facts and results.
- Never in a url, analytics or logs. Routes have no ids today, so keep it that way, because anyone holding an id can read or change that data, see [api.md](api.md#anonymous-user_id).
- `DELETE /user/:id` only clears the server. The frontend must also clear `user_id`, `interviewverse-flow`, `interviewverse-positions` and `interviewverse-positions-backup-*`, which hold the pasted job posting.

### D6. Opened from disk, origin null

`npm run build:file` makes `dist/standalone.html`, opened from disk with `HashRouter` (`main.jsx:14`). Its requests carry `Origin: null`. The server allows exactly one origin, `http://localhost:5173` by default, so the browser blocks them and `fetch` throws with no error envelope. `vite preview` (port 4173 by default) and `http://127.0.0.1:5173` are refused the same way.

**Recommend** : use the Vite dev server or `npm run preview -- --port 5173` for anything that talks to the API, and keep the standalone file as a mock demo only, labeled as such. `CORS_ORIGIN=null` does make the server accept it, but then the Vite origin is refused, and any local file or sandboxed iframe in that browser can call the server and spend LLM calls. Use it only for a one machine demo, if at all. If you add a Vite proxy, give it a prefix like `/api`, because `/research` is both a page and an API route.

### D7. Camera

The preview is local today : `getUserMedia({video:true,audio:false})` goes only to the `<video>` element and the tracks stop on toggle or leave (`Interview.jsx:68-94`). It has to stay that way. With any voice option, request audio separately and send only that, never add the camera stream to a network connection or draw frames from it. No API field can carry it, the Turn schema rejects unknown fields.

The research, section 7, says "the camera is not used", while the landing page calls it "an optional mirror" (`Landing.jsx:193`), and the lobby says "Check your camera and mic" (`Interview.jsx:175`).

**Recommend** : keep it off by default as it is now, say "stays on this device" next to the button, and reword the lobby so it does not read as required. Someone should confirm that the mirror is acceptable against the research line.

### D8. Company, role and a url as the posting

The form requires company and role (`JobPosting.jsx:9-13`), but `/research` only takes `job_description` and drops unknown fields without an error. The LLM reads the company and role out of the text, and the demo posting names neither. The form also offers "the posting text or a URL" (`JobPosting.jsx:12,147`), but the backend never reads a posting from a url : a url in the text only counts as a candidate for the company site, and job board hosts never do.

**Recommend** : send `` `${role} at ${company}\n\n${posting}` `` as `job_description`, change the copy to text only, add an optional company website field for `company_url`, since that is the only sure way to get the right site, and cap the textarea so the whole text stays under 20000 chars. Omit `company_url` when the field is blank and add `https://` when no scheme was typed : `''`, `acme.test` and `www.acme.test` get a plain `bad_request`, so the "ask for another url" handling of `source_not_allowed` never runs for them.

### D9. No facts found

The UI refuses to start without a fact and asks the user to write one (`Research.jsx:176-198`, `flow.jsx:66`). `/research` can return 200 with `facts:[]` and a warning, `no_official_source` or `no_sourced_facts`, and the job is usable. [api.md](api.md#what-the-frontend-owns) says to show the warning and not fill the gap.

**Recommend** : allow the start with no facts and show the warning. `INITIAL.facts` starts empty, not from the mock (`flow.jsx:6`).

### D10. AI badge disappears

The pill says "AI interviewer" only while the interviewer is the main tile. After a swap it says "You" and the small tile says "Interviewer" (`Interview.jsx:149,184-195`). [api.md](api.md#what-the-frontend-owns) asks for a visible badge for the whole interview, for EU AI Act Art. 50.

**Recommend** : one fixed badge in both layouts.

### D11. Report content

The feedback panel is one hard-coded Evidence card (`Report.jsx:52-75`), and the API returns a quote and tip for all six. "Strongest area" expects one value, while `strengths` can hold several and is not sorted by score, so `strengths[0]` is not always the strongest.

**Recommend** : follow the research pattern, strengths first, then the two `weakest` with quote and tip, with all six reachable. Relabel to "Strengths". When `fallback` is true, label it as sample feedback. If `company_name` is passed to the PDF, handle null, `company.normalize` throws on it (`reportPdf.js:151`).

### D12. Missing from the UI

No screen has the `disclaimer`, the `warnings`, or export and delete. The research asks for "One-click data deletion; report export for a coach".

**Recommend** : show `disclaimer` on Research and Report, and add a "Your data" entry using `GET /user/:id/export` and `DELETE /user/:id`, with the local cleanup from [D5](#d5-where-the-ids-live). "View transcript" has no handler yet (`Report.jsx:81-84`), it can read `session.transcript`.

### D13. Demo data

"Fill demo" types Acme Robotics (`JobPosting.jsx:15-20`). `GET /demo`, on a server with `DEMO_MODE=1`, holds an N26 job text and two transcripts, and `demo:true` returns the stored N26 name and facts whatever text was sent. Acme plus `demo:true` shows the wrong company. Canned scores only ever apply to those two exact transcripts.

**Recommend** : when `GET /health` says `demo:true`, fill the form from `GET /demo`, send its `job_description` unchanged, and post `transcript` and then `followup_transcript`.

### D14. Actions that have to wait

- **Research scan** : 4 fake steps of 480 ms and a Skip button (`Research.jsx:10-11,109`). The API sends no progress and takes about 12 s. Use an indeterminate state and remove Skip. "Writing your question plan" is really the wait in step 2.
- **End session** is a `Link` that leaves at once and counts the interview (`Interview.jsx:227-237`). Make it a button that waits for step 5. `no_candidate_answers` means the session is still open, so stay on the screen. On `store_unavailable`, keep the turns and retry.
- **Generate my next interview** is a `Link` too (`Report.jsx:77`). It has to wait for `/next`, which is safe to repeat.

## The biggest gap : voice and transcripts

**Neither side captures voice or writes a transcript yet.** Without a transcript there is nothing to grade, so the loop can't run on a real answer whatever else gets wired.

- **Frontend** : the mic button only flips a state (`Interview.jsx:218`), "Speaking…" is a label (`:144`), `getUserMedia` asks for video only (`:75`), and nothing moves to the next question (`data.js:72`).
- **Backend** : it never touches audio, has no text interviewer and does not mint Realtime tokens, because the relay has no Realtime endpoint. On 2026-11-02 `/v1/realtime/sessions`, `/v1/realtime/client_secrets`, `/v1/realtime/calls` and a WebSocket upgrade on `/v1/realtime` all gave 404, even though its model list names `stepaudio-2.5-realtime`. `/v1/audio/transcriptions` and `/v1/audio/speech` gave 503 `all_credentials_exhausted`, so those can't be used either right now.

Every option gives the backend the same thing, so the API does not change :

```js
{role:'interviewer',text:step.text,question_id:step.question_id}
{role:'candidate',text:answer,question_id:step.question_id}
```

The options. This is not decided, the research plans A for the hackathon and B for the product (section 7).

| | A. OpenAI Realtime (WebRTC) | B. Cascade : STT, LLM, TTS | C. Web Speech API | D. Typed only |
| --- | --- | --- | --- | --- |
| Provider token | yes, from a real OpenAI key, not the relay | yes, Deepgram and ElevenLabs in the research | no | no |
| New backend work | a token route, not built | proxy routes and a live interviewer, neither built | none | none |
| Real conversation | yes, with `interviewer_instructions` as the prompt | yes, same prompt | no, reads `flow` in order, no follow-ups or interruptions | no |
| Who receives the voice | OpenAI | Deepgram, and ElevenLabs gets the text | Chrome : Google. See below | nobody |
| Listed as a processor in the research | yes | yes | no, Google is not listed | no voice processor |
| Cost of a 15 min session, research section 6 | $0.9 to 2.5, mini $0.32 to 1.0 | $0.30 to 0.60 | no voice cost | no voice cost |
| Fits "answer by voice" (`Landing.jsx:127`) | yes | yes | yes, as a scripted interview | no |

**How C works** : `speechSynthesis` reads `session.flow` in order, intro first because it is the AI disclosure. `SpeechRecognition` (`window.SpeechRecognition || window.webkitSpeechRecognition`) takes each answer, a "Done" button ends the turn, and only final results go into `turns`. A typed fallback is required, because MDN marks `SpeechRecognition` as limited availability, not Baseline. The research asks for a text mode anyway (section 8, Fairness). `interviewer_instructions` goes unused.

**The privacy catch in C** : Chrome sends the recognition audio to Google. MDN : "On some browsers, like Chrome, using Speech Recognition on a web page involves a server-based recognition engine. Your audio is sent to a web service for recognition processing". Chromium's engine points at `https://www.google.com/speech-api/full-duplex/v1`. So these lines would need rewording, because we would not keep the audio but it would still leave the device, to a party the research does not list as a processor (it asks for Art. 28 DPAs with the ones it lists) :

- "The audio itself is never kept." (`Landing.jsx:145`)
- "Audio is turned into text and dropped." (`Landing.jsx:196`)
- the spoken intro, "no audio is stored", stays true of our storage but says nothing about Google

MDN also documents `recognition.processLocally = true` for on-device recognition, after a language pack download. It fails with `language-not-supported` if the pack is missing. Which browsers support it has not been checked.

**For any voice option** : the research requires consent and a DPIA for voice, and says to label the voice as synthetic. The accent checks in the eval use simulated text, so none of these speech engines has been tested for accent differences.

## Fetch helper

```js
const API = 'http://localhost:8787'

export async function api(path,{body,method = body ? 'POST' : 'GET',tries = 3} = {}) {
	for (let i = 1;;i++) {
		const res = await fetch(API + path,{method,headers:body ? {'content-type':'application/json'} : {},body:body && JSON.stringify(body),signal:AbortSignal.timeout(180000)})
		const data = await res.json()
		if (res.ok) return data
		const {code,message,retryable} = data.error
		if (!retryable || code === 'grading_in_progress' || i >= tries) throw Object.assign(new Error(message),{code,retryable,status:res.status})
		await new Promise((r) => setTimeout(r,(Number(res.headers.get('retry-after')) || 2 ** i) * 1000))
	}
}
```

```js
await api('/research',{body:{user_id,job_description}})
await api(`/session/${id}/start`,{method:'POST'})
await api(`/session/${id}`)
```

- **`grading_in_progress`** is retryable but must not be repeated : poll `GET /session/:id` every few seconds until `status` is `graded`. While polling, `completed` with `grading_started_at` null means the grade failed and none is running, so call `POST /grade` again or show the error, do not keep waiting. Give up after 5 minutes, the length of the grading lease, and offer a retry. A reload or a second tab that lost the `POST` response polls the same way.
- **A thrown `TypeError` or `TimeoutError`** means no answer : network down, CORS refused or too slow. It is deliberately not retried. `/research` and `/session` may still be running on the server, and a repeat would create a second job or session.
- **`message` is for developers.** Show your own text per `code`, the table is in [api.md](api.md#errors).

## Not checked

- Nothing here was run in a browser. The CORS results come from the server's response headers, the opened-from-disk case included. The helper was run against the real routes in demo mode, with a fake LLM that always fails.
- The Web Speech facts come from MDN and the Chromium source, not from a test.
- The relay check covered routes only, on one day, with no audio sent. Its audio routes may work once its credentials recover, but the [README](../README.md#before-real-users) already says to replace the relay before real users.
- The research PDF is not in the repo, so its lines are quoted by section.
