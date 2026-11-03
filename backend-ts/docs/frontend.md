# Frontend integration

> **DRAFT for sign-off. Nothing here is wired.** The frontend on `main` (`frontend/`, commit `c96c683`) calls the FastAPI backend in `backend/`, not this one. This doc is the map for pointing it at backend-ts if the team picks backend-ts. It does not pick a backend, and where a recommendation depends on which one wins, it says so.

Paths like `screens/Report.jsx:52` are relative to `frontend/src/`. All frontend and `backend/` line numbers are from `c96c683` and will drift.

> **This map is out of date.** `main` moved to `fbc6227` on 2026-11-03 : the product is now called Alpine, `screens/*`, `flow.jsx` and `data.js` are gone, and the UI is `views/Practice.jsx`, `views/Overview.jsx` and `views/Sessions.jsx`. Rewrite the per-screen parts below before following them. What pointing the new frontend at backend-ts needs, read from the code and not run :
>
> - **Dashboard** : `dashboard.js:60` reads `GET /api/sessions`, a list of all sessions with no user. backend-ts has no such route. An adapter can build it from `GET /user/:id/export`, per user.
> - **Timings** : the dashboard reads `startedAt`, `endedAt` and `durationSec` on the transcript. backend-ts rejects these fields, and without them the dashboard shows NaN. Keep them in the browser, or add optional fields to `Turn`.
> - **Requests** : `/research` sends `{company,role,description}` and `/session` sends `{job_id}`, both get `bad_request` until they carry `user_id` and the fields in [api.md](api.md). The transcript also needs mapping to `{turns:[{role,text,question_id}],final}`.
> - **Planned session** : `Practice.jsx:59-63` expects `/session` to hand back the session `/next` planned. Here it makes a new one, so load the plan with `GET /session/:id`.
> - **Waits** : `Sessions.jsx:314` says grading takes a few seconds, the median here is 34 s, and a second `/grade` during a round gets 409 `grading_in_progress`.
> - **Voice** : `/api/voice/*` stays on FastAPI, so two servers run.
>
> About 200 to 300 lines and 6 to 9 hours for a scripted N26 demo. That is an estimate, nothing was prototyped on the new frontend.

Sign-off means two things : answer the [decisions](#decisions-needed) by number, and close the [open points in api.md](api.md#open-points-for-sign-off). The voice on `main` answers points 1 to 3 there : no voice token, one Turn per utterance with its question id, one save at the end. Points 4 to 6 are still open.

## Before any screen works

**Path and port.** The frontend puts `/api` in front of everything (`api.js:7`, `voice/backendClient.ts:33,39`, `voice/config.ts:5-8`) and Vite sends it to port 8100 (`frontend/vite.config.js:8`). backend-ts has no prefix and listens on 8787. The proxy can bridge that with no backend change. The first key is only for [voice option A](#voice) and has to stay first :

```js
proxy:{
	'/api/voice':{target:'http://127.0.0.1:8100',changeOrigin:true},
	'/api':{target:'http://127.0.0.1:8787',changeOrigin:true,rewrite:(p) => p.replace(/^\/api/,'')},
},
```

Requests stay same origin, so `CORS_ORIGIN` plays no part under `vite` or `vite preview`. A deployed build has no Vite, so whatever serves it needs the same rewrite, plus `TRUST_PROXY` so rate limits see real clients.

**`user_id`.** Neither client sends one, and `/research` and `/session` require it. See [D5](#d5-where-the-ids-live).

## Every call

| Frontend call | Sends today | backend-ts | What differs, and what it reads |
| --- | --- | --- | --- |
| `api.research`, `api.js:33`, `screens/Research.jsx:46` | `POST /api/research` `{company,role,description}` | `POST /research` `{user_id,job_description,company_url?}` | As sent : `bad_request`. `description` is `job_description`, `user_id` is required, `company` and `role` have no field, see [D8](#d8-company-role-and-a-url-as-the-posting). Reads `job.id` and `facts`, same names, except `source_label` |
| `api.session`, `api.js:34`, `screens/Interview.jsx:125` | `POST /api/session` `{job_id}` | `POST /session` `{user_id,job_id}` | As sent : `bad_request`. Reads `sessionId`, which is `id`, and `company`, `role`, `facts`, which a Session does not have. Always makes a new session, see [round 2](#one-full-loop) |
| `api.start`, `api.js:35`, `screens/Interview.jsx:126` | `POST /api/session/{id}/start` | `POST /session/:id/start` | Same call, no body, response not read. Gets `invalid_state` on a completed or graded session, FastAPI answers 200 (`backend/app/main.py:173-175`) |
| `api.grade`, `api.js:23,36`, `screens/Report.jsx:52` | `POST /api/grade` `{session_id}` | `POST /grade` `{session_id}` | Same request, other response names, see [Score](#field-map). A second call while one runs gets `grading_in_progress`, FastAPI waits on a lock (`backend/app/main.py:195`) |
| `api.next`, `api.js:37`, `screens/Report.jsx:69` | `POST /api/next` `{session_id}` | `POST /next` `{session_id}` | Same request. Reads `session.sessionId`, which is `session.id`. `plan` has other names, nothing reads it |
| `api.progress`, `api.js:38`, `screens/Progress.jsx:38` | `GET /api/progress/{job}` | **No equivalent** | Gets `not_found`, and `screens/Progress.jsx:40` turns any failure into demo numbers with no error, so a backend problem reads as sample data. Use `GET /session/:gradedSessionId`, see [Progress](#field-map) |
| `api.voiceStatus`, `api.js:39` | `GET /api/voice/status` | **No equivalent** | Nothing calls it |
| `loadSession`, `voice/backendClient.ts:32` | `GET /api/session/{id}` | `GET /session/:id` | Nothing calls it. The response is `{session,score,job,facts,disclaimer}`, not a flat session |
| `sendTranscript`, `voice/backendClient.ts:38`, `voice/interviewFlow.ts:208` | `POST /api/session/{id}/transcript` `{turns:[{questionId,role,text,startedAt,endedAt}],durationSec}` | `POST /session/:id/transcript` `{turns:[{role,text,question_id}],final:true}` | As sent : `bad_request`, the schema is strict and `final` is required, see [Transcript](#field-map). Response not read |
| `transcribe`, `voice/localVoice.ts:15` | `POST /api/voice/asr`, WAV | **No equivalent** | See [Voice](#voice) |
| `streamChat`, `voice/localVoice.ts:24` | `POST /api/voice/chat`, reads SSE | **No equivalent** | See [Voice](#voice) |
| `synthesize`, `voice/localVoice.ts:51` | `POST /api/voice/tts`, reads WAV | **No equivalent** | See [Voice](#voice) |
| `config.api.health`, `voice/config.ts:8` | `GET /api/health` | `GET /health` | Nothing calls it. `{ok,store,model,demo}`, not `{ok,demo_mode,models,dimensions}` |

Ids : every backend-ts id is a uuid and anything else gets `bad_request`, so the default session id `practice` (`voice/config.ts:48`) can't be used. FastAPI's question ids are `q1` to `q5` (`backend/app/questions.py:63`). The client passes them through without reading them, so uuids work.

## One full loop

| # | Screen | When | backend-ts call | Keep in flow state |
| --- | --- | --- | --- | --- |
| 1 | `/start` | "Prepare interview", `screens/JobPosting.jsx:59-72` | none | `job` |
| 2 | `/research` | on arrival, in an effect, `screens/Research.jsx:42-57` | `POST /research` | `job.id` as `jobId`, `facts`, and `warnings`, which nothing reads yet |
| 3 | `/interview` | lobby "Start interview", `screens/Interview.jsx:117-130` | `POST /session`, or `GET /session/:id` on round 2, then `POST /session/:id/start` | `id` as `sessionId` |
| 4 | | while talking, `screens/Interview.jsx:160-187`, `voice/interviewFlow.ts:72,247` | none, see [Voice](#voice) | |
| 5 | | last answer or "End session", `screens/Interview.jsx:215-221`, `voice/interviewFlow.ts:200-214` | `POST /session/:id/transcript` with `final:true`, once | |
| 6 | `/report` | on arrival, in an effect, `screens/Report.jsx:45-59` | `POST /grade` | the Score, in the screen |
| 7 | | "Generate my next interview", `screens/Report.jsx:61-77` | `POST /next` | `session.id` as `sessionId`, the graded one as `gradedSessionId` |
| 8 | `/progress` | on arrival, in an effect, `screens/Progress.jsx:36-42` | `GET /session/:gradedSessionId` | |
| 9 | | "Start next interview", `screens/Progress.jsx:183` | none, back to 3 | |

The landing page calls nothing.

- **Round 2.** `screens/Interview.jsx:125` calls `api.session` on every start. FastAPI hands back the session `/next` planned (`backend/app/main.py:156`). backend-ts makes a new one : in a run it returned number 3 next to the planned number 2, with `source_session_id` null, so the planned questions are lost and `/grade` returns `progress:null`. So when `sessionId` is set, read it with `GET /session/:id` and reuse it while `status` is `created` or `in_progress`. Otherwise `POST /session`.
- **`/research` in an effect.** `main.jsx:17` uses `StrictMode`, which runs effects twice in dev, and `cancelled` (`screens/Research.jsx:44,48`) only ignores the answer. So in dev each research makes two jobs, on both backends. On backend-ts both spend LLM calls and count against the limit of 10 per minute. Share the call in flight, the way `api.js:22-30` does for grade.
- **Back on `/report` after step 7.** `sessionId` is already the new ungraded session, so `screens/Report.jsx:52` gets an error on both backends. `gradedSessionId` is set (`screens/Report.jsx:70`) and nothing reads it. Use it here and on Progress.
- **Reload.** Flow state survives in `sessionStorage`, and `/grade` returns the stored score. During an interview the turns are in memory only (`voice/transcript.ts:1`), so a reload goes back to the lobby and the answers are gone, on both backends. backend-ts takes `final:false` saves if the team wants more, see [the route](api.md#post-sessionidtranscript).
- **Stored id is gone, backend-ts only.** A restart on the memory store loses every id, and demo mode always uses that store. On `not_found` for a stored id, clear `jobId` and `sessionId`, keep `user_id`, and go back to `/start`.
- **Waits**, measured live : `/research` 4 to 30 s, `/session` median 13 s and up to 45 s, `/grade` median 34 s and up to 75 s, `/next` median 27 s and up to 64 s. Details in [api.md](api.md#timing). FastAPI picks session and next questions from a bank with no LLM, so "Preparing…" (`screens/Interview.jsx:297`) and "Planning…" (`screens/Report.jsx:163`) will show much longer.

## Field map

Facts, read in `api.js:47-55` :

| Frontend reads | backend-ts |
| --- | --- |
| `fact.claim` | same, a sentence copied from the page, so it can say "we" |
| `fact.source_url` | same, always a full http(s) url, so the "job posting you pasted" branch (`api.js:53`) never runs |
| `fact.retrieved_at` | same, ISO |
| `fact.source_label`, as `tag` | none, the backend does not categorize. `screens/Research.jsx:164` would show an empty tag. Drop it, or show the source host there |
| nothing | `company`, `warnings`, `cached`, `disclaimer`, see [D9](#d9-no-facts-found) and [D12](#d12-missing-from-the-ui) |

Session :

| Frontend reads | backend-ts |
| --- | --- |
| `sessionId`, `screens/Interview.jsx:126,130`, `screens/Report.jsx:70`, `voice/interviewFlow.ts:208` | `id` |
| `number`, `screens/Interview.jsx:368` | same |
| `questions[].id`, `.text`, `screens/Interview.jsx:57`, `voice/interviewFlow.ts:69,89,112` | same, in the same order as `flow`. `kind` can also be `base`, nothing reads it |
| `company`, `role`, `voice/interviewFlow.ts:63,228` | not on a Session. Use `job.company` and `job.role` from the form (`flow.jsx:53`), they are required there. `job.company_name` and `job.role_title` from the API can be null. Unmapped, the intro says "the undefined role at undefined" |
| `facts`, `voice/interviewFlow.ts:223` | not needed, `screens/Interview.jsx:128` fills it from the Research list |
| nothing | `flow`, `interviewer_instructions`, see [D15](#d15-what-the-interviewer-says-first) and [Voice](#voice) |

Transcript, built in `voice/interviewFlow.ts:97,141` :

| Frontend sends | backend-ts |
| --- | --- |
| `role`, `text` | same |
| `questionId` | `question_id`, a uuid or null. The intro is saved under the first question's id (`voice/interviewFlow.ts:89`), which is accepted |
| `startedAt`, `endedAt`, `durationSec` | no field, rejected |
| nothing | `final:true`, required |

```js
{turns:t.turns.map(({role,text,questionId}) => ({role,text,question_id:questionId})),final:true}
```

Dimensions, same order on both (`backend/app/config.py:36`, `src/contracts.ts`) :

| FastAPI name | Label, `api.js:43-44` | backend-ts id |
| --- | --- | --- |
| `STAR` | STAR structure | `star` |
| `Relevance` | Relevance | `relevance` |
| `Role knowledge` | Role knowledge | `role_knowledge` |
| `Company fit` | Company fit | `company_fit` |
| `Conciseness` | Conciseness | `conciseness` |
| `Evidence` | Evidence | `evidence` |

`label()` only knows `STAR`, so the ids print raw until `DIMENSION_LABELS` has all six.

Score, in `screens/Report.jsx` :

| Frontend reads | backend-ts |
| --- | --- |
| `s.value`, `:99-101,131,154` | `score`, 1 to 5, never null |
| `s.fix`, `:138,143` | `tip`, on all six |
| `s.evidence_quote`, `:133-135,156` | same, never null |
| `report.overall`, `:113` | none, so it prints `0.0 / 5`, see [D3](#d3-overall-score) |
| `report.top_strengths`, `:116` | `strengths`, one or more, not sorted by score. Unmapped, this line throws |
| `report.top_weaknesses`, `:117` | `weakest`, exactly two, lowest first |

Progress, in `screens/Progress.jsx`, from `GET /session/:gradedSessionId` :

| Frontend reads | backend-ts |
| --- | --- |
| `sessions.length > 1`, `:53` | `score.progress !== null` |
| `last.number`, `:54` | `session.number` |
| `before.number`, `:55` | `session.number` from `GET /session/:source_session_id` |
| `session1`, `session2`, `:51` | when comparing `score.progress[i].prev`, `.cur`. On the first pass only `score.scores[i].score` |
| `delta`, `:159,173` | `score.progress[i].delta`, see [D4](#d4-progress-claims) |

The screen only reads the last two sessions (`:46-47`), so `score.progress` covers it. For a longer history `GET /user/:id/export` works : filter `sessions` by `job_id` and `status`, join `scores` on `session_id`. It also carries every transcript, and there is no list route.

## Decisions needed

Numbers are kept from the earlier draft. D10 and D14 are gone because the frontend settled them : the "AI interviewer" pill stays in both layouts (`screens/Interview.jsx:307-311`), the scan holds until research answers (`screens/Research.jsx:26-39`), End session waits for the save (`screens/Interview.jsx:216,360`), and "Generate my next interview" waits for `/next` (`screens/Report.jsx:61-77`).

### D1. Editable facts

Research lets the user edit, remove and add facts (`screens/Research.jsx:84-110`), and added ones have no source (`:186`). `screens/Interview.jsx:127-128` passes that list to the flow, where only the follow-up prompt reads it (`voice/interviewFlow.ts:223,237`).

On backend-ts no route changes facts. `/session` writes the questions from the stored facts, and `/grade` and `/next` read them too, so a removed fact still shapes the interview and "The interviewer only uses what is listed here" (`screens/Research.jsx:116`) is false. On FastAPI that line holds, because its questions and grader do not read facts. Under both, added facts break "Every fact links to its source" on the same line and "Never show a fact without a source" in the requirements.

**Recommend** : under both, drop "Add fact", text the user types should never be shown as a fact. On backend-ts also make facts read-only for the MVP, or reword that line.

### D2. Placeholder questions

Until a session exists the list shows `generateQuestions(facts)` (`screens/Interview.jsx:57`, `data.js:61`). The Blueprint panel invents 5 questions from a skills regex under "Your interview" (`components/Blueprint.jsx:19-25,30`). The real ones differ on both backends.

**Recommend** : under both, no list before the session exists, and delete `generateQuestions`. Keep the Blueprint skills, drop its question list or label it as an example.

### D3. Overall score

Report shows "Overall score" (`screens/Report.jsx:110-115`). Progress shows averages and a "Change" (`screens/Progress.jsx:56-58,115-121`), and so do the PDF and the saved positions (`:67-71,89-95`). The research, section 9 Ethics, says : "Psychological safety: the pattern "1 strength → 2 improvements → 1 exercise"; no overall score after the first session." That wording can mean none from session 2 on, or none once session 1 ends. FastAPI returns `overall` (`backend/app/grader.py:112`). backend-ts has no such field, and [api.md](api.md#what-the-frontend-owns) says the UI must not compute one.

**Recommend** : no overall score on any session, which holds under both readings. On backend-ts this is required anyway. On FastAPI it means not showing a field it sends.

### D4. Progress claims

The research, section 7 : "Progress = Δ on repeated dimensions, shown only if Δ > grader noise". Today every delta is shown (`screens/Progress.jsx:173`), the lede says "improved" (`:111`), confetti always plays when comparing (`:122`), and "Change" always gets a `+` (`:93,121`), so a drop would read `+-0.5`.

**Recommend** : under both, confetti only on a real gain, a neutral lede, and real drops rendered. On backend-ts show `delta` only when `significant`, otherwise "within noise". FastAPI has no such flag : it returns `runs` per dimension (`backend/app/main.py:95`), and something would have to compute the rule from them.

### D5. Where the ids live

Settled : `jobId`, `sessionId` and `gradedSessionId` are in flow state (`flow.jsx:6,68-71`), in `sessionStorage`, one per tab (`flow.jsx:33,44`), and routes carry no ids (`App.jsx:58-62`). Keep them out of urls, analytics and logs, because anyone holding an id can read or change that data, see [api.md](api.md#anonymous-user_id).

**Recommend, backend-ts only**, FastAPI has no users :

- `user_id` in `localStorage`, created once. In flow state every tab would be a new user with unreachable data.
- `interviewverse-positions` (`flow.jsx:76`) keeps `job_id` and session ids, not copies of the job, facts and results. Nothing reads it yet (`flow.jsx:13,23`).
- `DELETE /user/:id` only clears the server. The frontend must also clear `user_id`, `interviewverse-flow`, `interviewverse-positions` and `interviewverse-positions-backup-*`, which hold the pasted job posting.

### D6. Opened from disk

`npm run build:file` (`frontend/package.json:9`) makes `dist/standalone.html`, opened from disk with `HashRouter` (`main.jsx:14`). `api.js:7` fetches a relative `/api`, and on `file:` there is no server behind that, so neither backend can be reached. Research shows an error next to the mock facts (`screens/Research.jsx:145-156`), and the lobby stops at "Research the job first" (`screens/Interview.jsx:118-120`).

**Recommend** : under both, remove that build or label it as a mock that stops at the lobby.

### D7. Camera

Settled : the preview is off by default and stays local (`screens/Interview.jsx:34,81-102`), and the microphone is its own stream (`voice/audio.ts:55-56`).

Still open : the research, section 7, says "the camera is not used", while the landing page calls it "an optional mirror" (`screens/Landing.jsx:193`).

**Recommend** : under both, say "stays on this device" next to the button. Someone should confirm that the mirror is acceptable against the research line.

### D8. Company, role and a url as the posting

**backend-ts only.** The form requires company and role (`screens/JobPosting.jsx:9-13`) and FastAPI takes them (`backend/app/models.py:8-9`), but `/research` only takes `job_description` and reads them out of the text with the LLM. The demo posting names neither. The form also offers "the posting text or a URL" (`screens/JobPosting.jsx:12,147`), but backend-ts never reads a posting from a url : a url in the text only counts as a candidate for the company site.

**Required** : cap the textarea so the whole text stays under 20000 chars, a longer text gets `bad_request`. FastAPI cuts at 12000 without saying so (`backend/app/main.py:137`).

**Recommend** : send `` `${role} at ${company}\n\n${posting}` `` as `job_description`, change the copy to text only, and add an optional company website field for `company_url`, since that is the only sure way to get the right site. Omit it when blank and add `https://` when no scheme was typed : `''` and `acme.test` get a plain `bad_request`.

### D9. No facts found

The UI refuses to start without a fact and asks the user to write one (`screens/Research.jsx:214-236`, `flow.jsx:66`), and the initial list is the mock (`flow.jsx:6`). Both backends can return `facts:[]`. backend-ts also sends a warning, `no_official_source` or `no_sourced_facts`, with `source_refused` on top when the company's site said no. The job is usable, and [api.md](api.md#what-the-frontend-owns) says to show the warning and not fill the gap.

**Recommend** : under both, allow the start with no facts and let `INITIAL.facts` start empty. On backend-ts show the warning, and check `source_refused` first, because "no official source" reads as if the company has no site.

### D11. Report content

The weakest dimension gets a quote and tip, the other five a quote only (`screens/Report.jsx:126-159`). "Strongest area" (`:116`) reads as one value. On backend-ts `tip` is on all six, and `strengths` can hold several and is not sorted by score, so `strengths[0]` is not always the strongest.

**Recommend** : under both, follow the research pattern, strengths first, then the two weakest with quote and tip, with all six reachable. Relabel to "Strengths". On backend-ts, when `fallback` is true, label it as sample feedback.

### D12. Missing from the UI

No screen has a disclaimer, warnings, or export and delete. The research asks for "One-click data deletion; report export for a coach".

**Recommend** : on backend-ts show `disclaimer` on Research and Report, and add a "Your data" entry using `GET /user/:id/export` and `DELETE /user/:id`, with the local cleanup from [D5](#d5-where-the-ids-live). On FastAPI those routes are per job (`backend/app/main.py:251,262`) and there is no disclaimer field, so the text would have to live in the frontend.

### D13. Demo data

**backend-ts only.** "Fill demo" types Acme Robotics (`screens/JobPosting.jsx:15-20`). `GET /demo`, on a server with `DEMO_MODE=1`, holds an N26 job and two transcripts, and `demo:true` returns the stored N26 name and facts whatever text was sent, so Acme plus `demo:true` shows the wrong company.

The canned score only comes for exactly `transcript` or `followup_transcript`. Answers from the mic or the typed box never match, so they are graded live. On a demo server with no relay key that gets `llm_unavailable`. See [api.md](api.md#demo-mode).

**Recommend** : when `GET /health` says `demo:true`, fill the form from `GET /demo`, send its `job_description` unchanged, without the line from [D8](#d8-company-role-and-a-url-as-the-posting), and add a path that posts the two transcripts instead of using the mic.

### D15. What the interviewer says first

The client scripts its own intro and wrap-up (`voice/interviewFlow.ts:62-65`, `voice/config.ts:34,44`). The intro says it is an AI, but not that this is practice only, not part of hiring, not affiliated with the company, or what gets saved. `flow[0].text` on backend-ts says all of that, and nothing reads it.

**Recommend** : under both, the spoken intro carries those points. On backend-ts speak `flow[0].text` and `flow.at(-1).text`. On FastAPI add the words to `voice/config.ts`.

## Voice

Settled on `main`, so the earlier options are gone. The client runs the interview (`voice/interviewFlow.ts`), and FastAPI hosts the models :

- **Listening** : its own mic stream (`voice/audio.ts:55-56`), each utterance goes as WAV to `/api/voice/asr`, Whisper on the GPU (`backend/app/speech.py:33-37`).
- **Speaking** : scripted lines go to `/api/voice/tts`, Kokoro on the CPU (`voice/interviewFlow.ts:68-77`, `backend/app/speech.py:54-56`).
- **Follow-ups** : the client writes the prompt and calls `/api/voice/chat`, at most one per question (`voice/interviewFlow.ts:170-179,221-257`).
- **Typed answers** : always offered (`screens/Interview.jsx:205-213,327-337`).

backend-ts has none of these routes and never touches audio. `flow` and `interviewer_instructions` were written for a voice model the client connects to, and nothing on `main` reads them.

If FastAPI wins, the table below does not apply. If backend-ts wins, this is not decided :

| | A. FastAPI voice routes next to backend-ts | B. Voice routes in backend-ts | C. Typed only |
| --- | --- | --- | --- |
| New work | the proxy above | not built : three routes and a speech service, the models are Python | the mapping only |
| Runs | both servers, and a GPU for Whisper | backend-ts, a speech service, and a GPU for Whisper | backend-ts only |
| Follow-up questions | yes, on FastAPI's own LLM settings, outside backend-ts's rate limits and daily cap | yes, once built | no |
| Fits "answer by voice" (`screens/Landing.jsx:127`) | yes | yes | no |

**How C behaves**, from reading the code : a failed clip is skipped (`voice/localVoice.ts:113-118`), follow-ups are skipped (`voice/interviewFlow.ts:251-253`), and failed recognition points to the typed box (`screens/Interview.jsx:181-184`). So questions show as captions with no sound (`screens/Interview.jsx:301-305`), and the loop still ends.

**For any voice path** :

- The research requires consent and a DPIA for voice, and says to label the voice as synthetic. The lobby has no consent step (`screens/Interview.jsx:294-298`).
- The accent checks in the eval use simulated text, so Whisper has not been tested for accent differences.
- "Audio is turned into text and dropped" (`screens/Landing.jsx:145,196`) matches `backend/app/voice.py:5`. The text is not kept to the transcript : `backend/app/voice.py:80` logs what was recognised and `voice/interviewFlow.ts:206` prints the transcript to the console. `DELETE /user/:id` reaches neither.

## Errors and retries

Both backends send `{error:{code,message}}`, so `api.js:16` keeps working. On backend-ts it is not enough :

- **`message` is for developers**, like `invalid request`. `api.js:16` keeps only that and the screens show it (`screens/Research.jsx:147`, `screens/Report.jsx:85,172`, `screens/Interview.jsx:201`). Keep `code`, `retryable` and the status on the thrown Error and show your own text per `code`, the table is in [api.md](api.md#errors). `voice/backendClient.ts:44` throws the status only, so the save needs the same.
- **End session before any answer** gets `no_candidate_answers`, FastAPI accepts it (`backend/app/main.py:178-190`). `voice/interviewFlow.ts:212` moves to `error`, where `:140` ignores new answers, and "Press End session to try again" (`screens/Interview.jsx:150`) gets the same refusal forever. The session stays open, so go back to the question.
- **A retried save** adds the wrap-up line again (`voice/interviewFlow.ts:203`). That is fine while the session is open, but if the first save landed and only its answer was lost, the retry gets `invalid_state`. Then read `GET /session/:id` and go on if `status` is `completed`.
- **`grading_in_progress`** takes a reload or a second tab, because `api.js:22-30` only covers one page. "Try again" (`screens/Report.jsx:86`) would get it again. Poll `GET /session/:id` every few seconds until `status` is `graded`. `completed` with `grading_started_at` null means the grade failed and none is running, so call `/grade` again or show the error. Give up after 5 minutes, the length of the grading lease.
- **No answer at all** (`api.js:12-13`) means network down, too slow, or a body far over the 256 KB limit. Do not repeat `/research` or `/session` on it, they may still be running and each call makes a new job or session.

## Before you sign

**Run** on 2026-11-03, against this branch's working tree : a `DEMO_MODE=1` server on the memory store with no relay key, behind Vite 8.3.5 (`vite` and `vite preview`) with the proxy above and a stub on the voice path. Every request body in [Every call](#every-call) as the frontend sends it, then the mapped loop through two rounds, a `POST /session` after `/next`, export, and the transcript snippet on a transcript shaped like the voice flow's.

**Not run** :

- **The frontend.** It was not started and no browser was involved. So what a screen does with an answer is read from the code, not seen : the empty tag, `undefined` in the intro, the throw at `screens/Report.jsx:116`, demo numbers on Progress, the End session loop, the StrictMode double research, typed-only voice and the standalone build.
- **FastAPI, Whisper and Kokoro.** Their behaviour is read from `backend/` at `c96c683`.
- **A real LLM.** Demo mode gives canned questions and scores. A live grade of a transcript shaped like the voice flow's, with one turn per utterance and the "Thank you." lines, has not been run, so its effect on the scores is unknown. The waits come from [api.md](api.md#timing).
- **CORS in a browser.** From the server's headers only : another origin gets 200 with no allow-origin header. Whether the 256 KB limit surfaces differently through the proxy was not tried, and the Chrome numbers in api.md are from an earlier review of direct calls.

Also : the research PDF is not in the repo, so its lines are quoted by section. [api.md](api.md#what-the-frontend-owns) still names OpenAI Realtime as the plan, which is out of date against `main`. It is not changed here.
