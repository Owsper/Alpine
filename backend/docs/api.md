# InterviewVerse API

> **DRAFT.** Pending sign-off by the frontend developer. Nothing here is frozen until then. See [Open points](#open-points-for-sign-off).

Backend for a job interview practice tool. It takes a job description, finds sourced company facts, prepares an interview, stores the text transcript, grades it and plans the next session.

Practice only, never for hiring or selection. Text of the answers only : no audio, video, face, emotion, confidence or personality analysis.

## The flow

```
POST /research                        job description -> job + sourced facts
POST /session                         job -> 5 questions, flow, interviewer_instructions
POST /session/:id/start               candidate starts
  voice interview, run by the frontend
POST /session/:id/transcript          save partial transcripts, then final:true
POST /grade                           6 scores with evidence quotes and tips
POST /next                            plan + the next session, already created
  repeat from start with the new session, /grade now also returns progress
```

## Conventions

- **Base URL** : `http://localhost:8787` in development.
- **Format** : JSON in and out. Every POST with a body must send `content-type: application/json`, else `unsupported_media_type`.
- **Success** : status 200 and the plain resource, with no wrapper.
- **Failure** : the error envelope, see [Errors](#errors).
- **Ids** : all ids are uuids. Anything else gets `bad_request`.
- **Times** : ISO 8601 UTC, like `2026-11-02T14:27:06.627Z`.
- **CORS** : exactly one allowed origin, the `CORS_ORIGIN` setting (default `http://localhost:5173`, the Vite dev server). `Retry-After` is exposed to the browser.
- **Body size** : 256 KB per request, else `payload_too_large`. The server may close the connection after this error, and a body far over the limit can surface in the browser as a `TypeError` instead of `payload_too_large` (Chrome : 1 MB and up always, 700 to 800 KB sometimes). The client must check the size before sending : `new Blob([json]).size`.
- **Rate limits** : per client per minute : `/research` 10, `/session` 20, `/grade` 10, `/next` 10. Over the limit gets `rate_limited` with a `Retry-After` header in seconds. Other routes are not limited.

### Timing

`/research`, `/session`, `/grade` and `/next` call an LLM and take seconds. Show progress and set a client timeout of at least 3 minutes on them.

Measured on 2026-11-02 against the real relay on the memory store. These are two runs, not a benchmark. All other routes answered in under 20 ms, Supabase will add network time to every route and that has not been measured.

| Call | Time |
| --- | --- |
| `POST /research`, first time for a company | 4 to 23 s over 15 job descriptions. Each site that gives no facts adds an LLM call, at most 4 sites are tried |
| `POST /research`, facts cached | 13.0 s (the company name is still extracted by the LLM) |
| `POST /session` | 13.0 s, 23.0 s and 13.1 s |
| `POST /grade` | 16.6 s, 29.3 s and 36.9 s. Later that day 22 to 67 s over 8 rounds of the grader alone, and 68.8 s through the route |
| `POST /grade`, already graded | 2 ms |
| `POST /next` | 19.3 s and 39.6 s |
| `POST /next`, plan already exists | 2 ms |

If the client gives up on `/grade`, for example after a reload, the server keeps grading. To wait for it poll `GET /session/:id` every few seconds until `status` is `graded`, it has no rate limit and it returns the score. While polling, `status` `completed` with `grading_started_at` null means no grade is running any more, because it failed : stop polling and call `POST /grade` again or show the error. Do not poll `POST /grade` : it counts against the limit of 10 per minute, so a poll every 3 s gets `rate_limited` at about 30 s, right when a slow grade finishes.

## Anonymous user_id

There are no accounts in the MVP. The frontend creates the user id once and sends it from then on :

```js
const id = localStorage.getItem('user_id') ?? crypto.randomUUID()
localStorage.setItem('user_id',id)
```

**The limit : this is not authentication.** A uuid is hard to guess, but it is the only thing protecting the data.

- Anyone who has a `user_id` can export and delete all of that user's data.
- Anyone who has a session id can read that session, its score, its job and its facts, write its transcript and trigger its grading. Session routes do not check the owner. Only `POST /session` with a `job_id` checks that the job belongs to `user_id`.
- A session id does not lead to the user : session responses leave out `user_id`, only the export has it.
- Clearing browser storage or changing device means a new identity. The old data can't be reached from the app any more and there is no recovery.

So keep user and session ids out of shareable links, analytics and logs. Real authentication is needed before any public launch.

## What the frontend owns

The backend never touches audio and has no text interviewer. It also does not mint voice tokens.

| The frontend does | Details |
| --- | --- |
| Voice connection | Connect to the voice model (OpenAI Realtime is the plan) and use `session.interviewer_instructions` as its system prompt, unchanged. It already holds the intro, questions, facts, outro and rules. |
| AI badge | Show a visible "AI interviewer" badge for the whole interview (EU AI Act Art. 50). The instructions also make the model say so first. |
| Posting the transcript | Turn the speech to text and post it, see [the transcript route](#post-sessionidtranscript). Do not clean the text up. The grader is told not to penalize transcription errors, grammar or accent. |
| Sourced facts | Show each fact with a link to `source_url` and its `retrieved_at`. Never show a fact without its source. If `facts` is empty, show the warning, do not fill the gap. |
| Disclaimer | Show `disclaimer` from `/research` or `GET /session/:id`. |
| Score view | Show the six dimensions with quote and tip. Do not add them up : there is deliberately no overall score, and the UI must not compute one. |
| Progress view | Claim a change only when `significant` is true. Otherwise it is within grader noise. |
| Retries | Follow `retryable` on errors, see [Errors](#errors). |
| Data rights | Offer export and delete, using the [user routes](#get-useridexport). |
| No sensitive capture | Send no audio, video or analysis of either. The transcript schema rejects unknown fields. |

## State machine

```
           start               transcript final:true             grade
created ----------> in_progress ---------------------> completed -------> graded
   |                                                       ^                 |
   |                  transcript final:true                |                 | next
   +-------------------------------------------------------+                 v
                                                                     new session (created)

created -- transcript final:false --> in_progress
```

What each call does per status :

| Call | created | in_progress | completed | graded |
| --- | --- | --- | --- | --- |
| `start` | moves to in_progress | 200, no change | `invalid_state` | `invalid_state` |
| `transcript`, `final:false` | saves, moves to in_progress | saves, `invalid_state` if it has fewer turns than stored or changes a stored answer | 200 if turns are identical, else `invalid_state` | same as completed |
| `transcript`, `final:true` | saves, moves to completed, `no_candidate_answers` if it has no candidate text | saves, moves to completed, `invalid_state` if it has fewer turns than stored or changes a stored answer, `no_candidate_answers` if it has no candidate text | 200 if turns are identical, else `invalid_state` | same as completed |
| `grade` | `invalid_state` | `invalid_state` | grades, moves to graded | returns the stored score |
| `next` | `invalid_state` | `invalid_state` | `invalid_state`, unless a score is stored : then it moves to graded and continues | creates the plan, or returns the stored one |

Notes :

- `start` is optional, a transcript can be saved straight from `created`.
- The transcript is frozen once it is final. A `final:true` with no candidate text gets `no_candidate_answers` and changes nothing, so the session stays open and the interview can go on.
- `/grade` and `/next` are safe to retry : they never grade twice or plan twice. If grading fails, the session stays `completed` so a retry works. A grade run stops by itself after 4.5 minutes. One that dies without finishing (a server crash for example) blocks retries with `grading_in_progress` for up to 5 minutes.
- `/research` and `/session` are **not** idempotent. Each successful call makes a new job or session, so retry them only after an error.

## Resources

```ts
type Dim = 'star'|'relevance'|'role_knowledge'|'company_fit'|'conciseness'|'evidence'
type Status = 'created'|'in_progress'|'completed'|'graded'

type Job = {id,user_id,description,company_name:string|null,company_url:string|null,company_key:string|null,role_title:string|null,demo:boolean,created_at}
type Fact = {claim,source_url,retrieved_at}
type Question = {id,text,kind:'base'|'weak'|'anchor'|'new',dimension:Dim|null}
type FlowStep = {type:'intro'|'question'|'outro',text,question_id:string|null}
type Turn = {role:'interviewer'|'candidate',text,question_id?:string|null}
type Session = {id,job_id,number:number,status:Status,questions:Question[],flow:FlowStep[],interviewer_instructions,transcript:Turn[]|null,grading_started_at:string|null,source_session_id:string|null,created_at,updated_at}
type DimScore = {dimension:Dim,score:1|2|3|4|5,evidence_quote,tip,noise:number}
type Progress = {dimension:Dim,prev:number,cur:number,delta:number,noise:number,significant:boolean}
type Score = {session_id,scores:DimScore[],strengths:Dim[],weakest:[Dim,Dim],progress:Progress[]|null,fallback:boolean,graded_at}
type Plan = {id,session_id,next_session_id,weakest:[Dim,Dim],composition:{weak:3,anchor:1,new:1},created_at}
```

Untyped fields are strings. `grading_started_at` is set while a grade runs and null otherwise, a poller uses it to see that a grade has stopped, see [Timing](#timing). Sessions in the export also carry `user_id`.

The six dimensions, from the grader's rubric :

| Dimension | What it measures |
| --- | --- |
| `star` | Situation, task, the candidate's own actions, a concrete result |
| `relevance` | Answers what was asked and connects it to the role |
| `role_knowledge` | Correct use of the methods and tools the role needs, how and why |
| `company_fit` | Ties the candidate's experience to company facts or job needs |
| `conciseness` | Answer length, repetition and filler words only |
| `evidence` | Specific examples, numbers, measurable results |

How the score fields are made :

- `score` : median of 3 independent grader runs.
- `noise` : population standard deviation of those 3 runs. Higher means the runs disagreed.
- `evidence_quote` : the candidate's own words, checked in code against the candidate turns. At least two words, or the whole turn when the candidate said one word.
- `weakest` : the two lowest scores. Ties go by the order of the table above.
- `strengths` : dimensions outside `weakest` that scored 4 or more, else the single highest one outside `weakest`.
- `progress` : null on a first session. On a follow-up, `noise` is the larger noise of the two sessions and `significant` is `abs(delta) > noise`.
- `fallback` : true only for the canned demo score, see [Demo mode](#demo-mode). Label it as sample feedback.

## Endpoints

### POST /research

Finds the company and its sourced facts, and creates the job.

| Field | Type | Notes |
| --- | --- | --- |
| `user_id` | uuid | required |
| `job_description` | string | required, 1 to 20000 chars |
| `company_url` | http(s) url | optional, wins over any url found in the description and is taken as given. Omit it when the field is blank and add `https://` when the user typed no scheme : `''` and `acme.test` get `bad_request`, not `source_not_allowed` |
| `demo` | boolean | optional, only has an effect when the server runs in demo mode |

Request :

```json
{
	"user_id":"3f2b8c1e-6a4d-4e7b-9c21-0d5f7a8b9c10",
	"job_description":"Backend Engineer at Acme Robotics in Graz. Read about us on https://acme.test/about.",
	"company_url":"https://acme.test/"
}
```

Response :

```json
{
	"job":{
		"id":"a1b2c3d4-0001-4a00-8a00-000000000001",
		"user_id":"3f2b8c1e-6a4d-4e7b-9c21-0d5f7a8b9c10",
		"description":"Backend Engineer at Acme Robotics in Graz. Read about us on https://acme.test/about.",
		"company_name":"Acme Robotics",
		"company_url":"https://acme.test/",
		"company_key":"acme.test",
		"role_title":"Backend Engineer",
		"demo":false,
		"created_at":"2026-11-02T14:27:10.000Z"
	},
	"company":{"name":"Acme Robotics","url":"https://acme.test/"},
	"facts":[
		{"claim":"Acme builds warehouse robots for mid-sized retailers across Europe.","source_url":"https://acme.test/","retrieved_at":"2026-11-02T14:27:06.627Z"},
		{"claim":"We were founded in Graz in 2011 and now employ 340 people.","source_url":"https://acme.test/about","retrieved_at":"2026-11-02T14:27:07.281Z"}
	],
	"cached":false,
	"warnings":[],
	"disclaimer":"Practice tool. Not affiliated with any company mentioned. No guarantee of job offers."
}
```

- `facts` has at most 8 items, and every one comes from a fetched page of the company.
- `claim` is **a sentence copied from that page**, not a summary, so it can say "we". Only whitespace is changed. Code checks it against the page text ignoring case and quote style, so those can differ from the page. A sentence that is not on the page, has under 4 words or is over 300 chars is dropped, and so is one that opens with a word that needs the sentence before it : So, And, But, Or, Then, Turns out, This, That, These, Those, It, They and similar, in any case. We and Our stay, and so does IT in capitals, which is the trade and not the pronoun. So there can be fewer than 8. Text the reader can't see never counts : `script`, `style`, `noscript`, `template`, `svg`, `nav`, `footer` and elements with the `hidden` attribute, `aria-hidden="true"` or an inline `display:none` or `visibility:hidden`. Content that React streaming moves into place from a `hidden` segment is visible, so it counts. CSS classes are not read.
- **Language** : pages are asked for with `Accept-Language: en`. Localization is out of the MVP and claims stay verbatim, they are never translated, so a site that ignores the header gives claims in its own language. Measured on 2026-11-03 from a German address : `stripe.com` and `zalando.de` answer in English, `bolt.eu`, `microsoft.com` and `nike.com` redirect by address whatever the header says and stay German. `en.acme.com` counts as the same site as `acme.com`, the way `www.acme.com` does, because that is where some sites send an English reader.
- Only the first 3 MB of a page are read.
- Without `company_url` the server tries up to 4 sites from the links in the description (3 hosts at most) and the sites the model suggests, and the description has to name a company. A host that matches the company name comes first, like `bosch.com` for Robert Bosch GmbH or `corporate.zalando.com` for Zalando SE, and it only needs a readable home page. Any other host needs the company's name on its home page, and is only used when no matching host could be read : a tool or partner the description links to can name the company too. When a site gives no facts the next one is tried, and the first that could be read is what `company.url` shows if none has facts. ATS and job board hosts such as Greenhouse, Lever, Workable or StepStone never count, unless that is the company hiring and its name is on the home page. To be sure of the right site, send `company_url`.
- A page that redirects away from the path that was asked for is dropped, like `/about` landing on `/efood`, because it can be about a brand or a subsidiary. Staying on that word is fine, like `/about` landing on `/en-eu/about`.
- `company.name` and `company.url` can be null.
- `cached` is true when the facts came from the 7 day cache of that company on that host (or the demo data). `retrieved_at` then keeps the original fetch time.
- `warnings` can hold `no_official_source` (no usable company url) and `no_sourced_facts` (no page could be fetched, or no fact could be verified). In both cases `facts` is empty and the call still returns 200, the job is usable.
- `source_refused` comes on top of one of those two, never alone, when the company's site said no and nothing of it was read : its robots.txt disallows us or answers 403 or 429, a page answers 403 or 429, or a page opts out of AI use (see below). Check for it first, it tells the user why there are no facts. `company.url` stays null next to `no_official_source` because nothing was read, and stays the `company_url` you sent next to `no_sourced_facts`. Without `company_url` only a host that matches the company name counts, another host may not be the company's. A site that is down, times out, or answers 404 or 5xx did not refuse, and one refusing page on a site that could be read does not count either.
- LinkedIn, Glassdoor, Indeed, Kununu and Xing are never fetched. The server also respects robots.txt and these AI opt-out signals : the `tdm-reservation` header or meta tag, `noai` or `notdm` in `X-Robots-Tag` or in a `robots` or `InterviewVerseBot` meta tag. A page that opts out this way gives no facts. `/.well-known/tdmrep.json` is not read.

Errors : `bad_request`, `source_not_allowed` (`company_url` is blocklisted, private or on a non default port), `not_found` (the user was deleted during the call), `rate_limited`, `budget_exceeded`, `llm_*`.

### POST /session

Creates a session with exactly 5 questions : 4 `base` and 1 `anchor`. The anchor can be at any position, so follow `flow` for the order. It comes back word for word in every later session of the job so progress can be compared, and the other questions of a later session are new.

Generated questions follow the language of the job description and never speak as the company : output with we, us or our, or the German or French for those, counts as invalid. The same goes for `/next`. `US` in capitals is fine.

`progress` only appears on sessions made by `/next`. A session made here on an existing job starts a fresh comparison.

Two request forms. Prefer the first, the second has no company facts because it skips research.

```json
{"user_id":"3f2b8c1e-6a4d-4e7b-9c21-0d5f7a8b9c10","job_id":"a1b2c3d4-0001-4a00-8a00-000000000001"}
```

```json
{"user_id":"3f2b8c1e-6a4d-4e7b-9c21-0d5f7a8b9c10","job_description":"Backend Engineer, no company named","demo":false}
```

Response, a Session. `interviewer_instructions` is shortened here :

```json
{
	"id":"a1b2c3d4-0002-4a00-8a00-000000000001",
	"job_id":"a1b2c3d4-0001-4a00-8a00-000000000001",
	"number":1,
	"status":"created",
	"questions":[
		{"id":"a1b2c3d4-0003-4a00-8a00-000000000001","text":"How do you approach API design so it stays dependable for everyone who consumes it?","kind":"base","dimension":null},
		{"id":"a1b2c3d4-0003-4a00-8a00-000000000002","text":"How do you keep a backend service reliable once it is running in production?","kind":"base","dimension":null},
		{"id":"a1b2c3d4-0003-4a00-8a00-000000000003","text":"Can you describe a backend service you built and how you made sure it was well tested?","kind":"base","dimension":null},
		{"id":"a1b2c3d4-0003-4a00-8a00-000000000004","text":"Tell me about a time something went wrong in a production system you were responsible for.","kind":"anchor","dimension":null},
		{"id":"a1b2c3d4-0003-4a00-8a00-000000000005","text":"What draws you to this role at Acme Robotics?","kind":"base","dimension":null}
	],
	"flow":[
		{"type":"intro","text":"I am an AI interviewer, not a human. This is practice only, it is not part of any hiring or selection process, and I am not affiliated with any company mentioned. The text transcript of this session is saved with its questions, scores and the job description, no audio is stored.","question_id":null},
		{"type":"question","text":"How do you approach API design so it stays dependable for everyone who consumes it?","question_id":"a1b2c3d4-0003-4a00-8a00-000000000001"},
		{"type":"question","text":"How do you keep a backend service reliable once it is running in production?","question_id":"a1b2c3d4-0003-4a00-8a00-000000000002"},
		{"type":"question","text":"Can you describe a backend service you built and how you made sure it was well tested?","question_id":"a1b2c3d4-0003-4a00-8a00-000000000003"},
		{"type":"question","text":"Tell me about a time something went wrong in a production system you were responsible for.","question_id":"a1b2c3d4-0003-4a00-8a00-000000000004"},
		{"type":"question","text":"What draws you to this role at Acme Robotics?","question_id":"a1b2c3d4-0003-4a00-8a00-000000000005"},
		{"type":"outro","text":"That was the last question, thanks for practicing. Your feedback will be based only on the text of your answers.","question_id":null}
	],
	"interviewer_instructions":"You are an AI voice interviewer in a job interview practice tool.\n\nRules :\n- Start by saying the intro below, so the candidate knows they are talking to an AI...",
	"transcript":null,
	"grading_started_at":null,
	"source_session_id":null,
	"created_at":"2026-11-02T14:27:40.000Z",
	"updated_at":"2026-11-02T14:27:40.000Z"
}
```

`number` counts up per job. A failed call with `job_description` leaves no job behind.

Errors : `bad_request`, `not_found` (no such job, it belongs to another `user_id`, or the user was deleted during the call), `session_conflict` (too many sessions created at once on this job, retry), `rate_limited`, `budget_exceeded`, `llm_*`.

### GET /session/:id

Returns the session, its score (null until graded), its job, the job's facts and the disclaimer. Use this to restore a page after a reload, or to wait for a running grade.

```jsonc
{
	"session":{"id":"a1b2c3d4-0002-4a00-8a00-000000000001","status":"graded" /* ...the full Session */},
	"score":{"session_id":"a1b2c3d4-0002-4a00-8a00-000000000001" /* ...the full Score, or null */},
	"job":{"id":"a1b2c3d4-0001-4a00-8a00-000000000001" /* ...the Job without user_id */},
	"facts":[/* Fact */],
	"disclaimer":"Practice tool. Not affiliated with any company mentioned. No guarantee of job offers."
}
```

Errors : `bad_request`, `not_found`.

### POST /session/:id/start

No body needed. Moves `created` to `in_progress`. Returns the Session, and is safe to repeat while `in_progress`.

```jsonc
{"id":"a1b2c3d4-0002-4a00-8a00-000000000001","status":"in_progress" /* ...the full Session */}
```

Errors : `bad_request`, `not_found`, `invalid_state`.

### POST /session/:id/transcript

Saves the transcript. Every accepted call **replaces** the stored one, so always send all the turns so far. Save partial transcripts during the interview so a dropped connection loses little, then send the full one with `final:true`.

- **Fewer turns than stored** : a partial or final save with fewer turns than are stored gets `invalid_state` with `details.stored_turns`, and nothing is stored. It is a late or stale save : resend the full transcript. A turn can't be removed, not even with `replace:true`.
- **A changed answer** : a save that changes a stored candidate turn gets `invalid_state` with `details.stored_turns` and `details.changed_turn`, the index of the first such turn, and nothing is stored. Send `replace:true` only when the change is a real correction. An answer that only grows (the new text starts with the stored text) needs no flag, and neither does an interviewer turn, a `question_id` or a candidate turn with no letter or digit in it. Turns are compared by position, so a turn inserted before a stored answer counts as changing it.
- **Saves that overlap** : they can't shrink the transcript. A write only lands if the session has not changed since it was read, and a save that lost the race reads and checks again, so a late shorter save gets the same `invalid_state`. Waiting for each save to answer is still simpler, because a late save with the same number of turns does replace as long as it changes no stored answer. A save that keeps losing gets `session_conflict`, send the same turns again.
- **After a reload** : take the turns from `session.transcript` (null means none) in `GET /session/:id` and add to those, before any save. A list that restarted from empty gets `invalid_state` while it is shorter, and also once it reaches the stored length, because its answers differ. Do not answer that with `replace:true`, reload instead.
- **No candidate text** : `final:true` with no letter or digit in any candidate turn gets `no_candidate_answers`. The status and the stored transcript stay as they were. `/grade` uses the same check.
- `turns` : array of Turn, in order. A Turn accepts only `role`, `text` and `question_id`. Anything else is `bad_request`.
- `question_id` : the id from the `flow` step being asked or answered, when known. Optional.
- `replace` : optional boolean, `true` says this save is meant to change stored answers. It can't remove turns or change a frozen transcript.
- Limits : 300 turns and 60000 chars of text in total, else `transcript_too_long`. Nothing is ever truncated silently.

Request :

```json
{
	"turns":[
		{"role":"interviewer","text":"I am an AI interviewer, not a human.","question_id":null},
		{"role":"interviewer","text":"How do you keep a backend service reliable once it is running in production?","question_id":"a1b2c3d4-0003-4a00-8a00-000000000002"},
		{"role":"candidate","text":"um so we had monitoring and some alerts, and I was part of the on-call.","question_id":"a1b2c3d4-0003-4a00-8a00-000000000002"}
	],
	"final":true
}
```

Response, the Session :

```jsonc
{
	"id":"a1b2c3d4-0002-4a00-8a00-000000000001",
	"status":"completed",
	"transcript":[/* ...the turns as sent */]
	/* ...the full Session */
}
```

Errors : `bad_request` (`details` names a turn with characters that can't be stored : a NUL or half an emoji), `not_found`, `invalid_state`, `session_conflict` (too many saves at once, retry), `no_candidate_answers`, `transcript_too_long`, `payload_too_large`.

### POST /grade

Scores a `completed` session. Returns the stored score if it was already graded, with no new LLM calls.

```json
{"session_id":"a1b2c3d4-0002-4a00-8a00-000000000001"}
```

Response, a Score. This one is a first session, so `progress` is null :

```json
{
	"session_id":"a1b2c3d4-0002-4a00-8a00-000000000001",
	"scores":[
		{"dimension":"star","score":2,"evidence_quote":"We looked at it as a team and then it got fixed after some days","tip":"Structure each answer as situation, your own specific actions, and a concrete result.","noise":0},
		{"dimension":"relevance","score":2,"evidence_quote":"To keep it reliable we had monitoring, we had some alerts","tip":"Answer the exact question asked before moving to related topics.","noise":0},
		{"dimension":"role_knowledge","score":3,"evidence_quote":"um so for an API I would, like, make it REST","tip":"Explain how and why you use each practice, such as versioning or contract testing.","noise":0},
		{"dimension":"company_fit","score":2,"evidence_quote":"I want to work in your company because it is a big bank","tip":"Tie a specific company fact or job requirement to one concrete thing you have built.","noise":0},
		{"dimension":"conciseness","score":2,"evidence_quote":"I like tests because they help, they really help, tests are good to have.","tip":"Give each question a fuller answer and cut repeated statements.","noise":0.4714045207910317},
		{"dimension":"evidence","score":2,"evidence_quote":"One time there was a bug in production with payments","tip":"Add measurable details to your examples, such as response times or how long the fix took.","noise":0.4714045207910317}
	],
	"strengths":["role_knowledge"],
	"weakest":["star","relevance"],
	"progress":null,
	"fallback":false,
	"graded_at":"2026-11-02T14:28:20.000Z"
}
```

On a follow-up session, `progress` has one row per dimension :

```json
[
	{"dimension":"star","prev":2,"cur":4,"delta":2,"noise":0.4714045207910317,"significant":true},
	{"dimension":"relevance","prev":2,"cur":2,"delta":0,"noise":0,"significant":false},
	{"dimension":"role_knowledge","prev":3,"cur":4,"delta":1,"noise":0.816496580927726,"significant":true},
	{"dimension":"company_fit","prev":2,"cur":2,"delta":0,"noise":0.4714045207910317,"significant":false},
	{"dimension":"conciseness","prev":2,"cur":5,"delta":3,"noise":0.4714045207910317,"significant":true},
	{"dimension":"evidence","prev":2,"cur":5,"delta":3,"noise":0.4714045207910317,"significant":true}
]
```

Errors : `bad_request`, `not_found` (no such session, or the user was deleted during the call), `invalid_state` (not completed yet), `no_candidate_answers`, `grading_in_progress` (poll `GET /session/:id`), `rate_limited`, `budget_exceeded`, `llm_*`.

### POST /next

Plans the follow-up to a `graded` session and creates that session. Returns the same plan and session on repeat calls.

```json
{"session_id":"a1b2c3d4-0002-4a00-8a00-000000000001"}
```

The new session always has 5 questions in this order :

| Position | `kind` | `dimension` | Text |
| --- | --- | --- | --- |
| 1, 2 | `weak` | `weakest[0]` | new, trains that skill |
| 3 | `weak` | `weakest[1]` | new, trains that skill |
| 4 | `anchor` | null | word for word the anchor of the session it follows |
| 5 | `new` | null | new topic for the role |

Response. `session` is shortened here, it is a full Session in `created` status, ready for `start` :

```jsonc
{
	"plan":{
		"id":"a1b2c3d4-0004-4a00-8a00-000000000001",
		"session_id":"a1b2c3d4-0002-4a00-8a00-000000000001",
		"next_session_id":"a1b2c3d4-0002-4a00-8a00-000000000002",
		"weakest":["star","relevance"],
		"composition":{"weak":3,"anchor":1,"new":1},
		"created_at":"2026-11-02T14:28:40.000Z"
	},
	"session":{
		"id":"a1b2c3d4-0002-4a00-8a00-000000000002",
		"number":2,
		"status":"created",
		"source_session_id":"a1b2c3d4-0002-4a00-8a00-000000000001",
		"questions":[
			{"id":"a1b2c3d4-0003-4a00-8a00-000000000006","text":"Tell me about a feature you delivered with product colleagues. Finish with the concrete result.","kind":"weak","dimension":"star"},
			{"id":"a1b2c3d4-0003-4a00-8a00-000000000007","text":"Tell me about a time you disagreed over a technical decision and what you did.","kind":"weak","dimension":"star"},
			{"id":"a1b2c3d4-0003-4a00-8a00-000000000008","text":"What concrete security measures do you apply when building an API?","kind":"weak","dimension":"relevance"},
			{"id":"a1b2c3d4-0003-4a00-8a00-000000000009","text":"Tell me about a time something went wrong in a production system you were responsible for.","kind":"anchor","dimension":null},
			{"id":"a1b2c3d4-0003-4a00-8a00-00000000000a","text":"How do you decide which data belongs in a SQL database and which events belong in a queue?","kind":"new","dimension":null}
		]
		/* ...flow, interviewer_instructions and the rest of the Session */
	}
}
```

Errors : `bad_request`, `not_found`, `invalid_state` (not graded yet), `session_conflict` (retry), `rate_limited`, `budget_exceeded`, `llm_*`.

### GET /user/:id/export

Returns everything stored for the user. Each fact also carries its `job_id`. An unknown id returns empty lists.

```jsonc
{
	"jobs":[/* Job */],
	"facts":[{"claim":"Acme builds warehouse robots for mid-sized retailers across Europe.","source_url":"https://acme.test/","retrieved_at":"2026-11-02T14:27:06.627Z","job_id":"a1b2c3d4-0001-4a00-8a00-000000000001"}],
	"sessions":[/* Session, with transcript */],
	"scores":[/* Score */],
	"plans":[/* Plan */]
}
```

Errors : `bad_request`.

### DELETE /user/:id

Permanently deletes the user's jobs, facts, sessions, transcripts, scores and plans. There is no undo. An unknown id returns zeros. A `/research`, `/session`, `/grade` or `/next` still running for that user writes nothing and gets `not_found`. This holds per server process.

```json
{"deleted":{"jobs":1,"sessions":2}}
```

Errors : `bad_request`.

### GET /health

No secrets. `store` is `memory` (nothing persisted) or `supabase`. It reads the store, so if the database can't be used the answer is the error envelope with `store_unavailable` or `internal`.

```json
{"ok":true,"store":"memory","model":"zai-org/GLM-5.3-Flash","demo":false}
```

### GET /demo

Only when the server runs with `DEMO_MODE=1`, otherwise `not_found`. Returns the seed data for a demo run. Shortened here :

```jsonc
{
	"company_name":"N26",
	"role_title":"Backend Engineer",
	"job_description":"SAMPLE job description written for a practice demo...",
	"company_url":"https://n26.com/",
	"transcript":[/* Turn, for the first session */],
	"followup_transcript":[/* Turn, for the session from /next, with visibly better answers */]
}
```

## Errors

Every failure has this shape. `details` is optional. Show `message` to developers rather than users.

These `details` fields are part of the contract : `stored_turns` on `invalid_state` (only for a save with fewer turns or a changed answer), `changed_turn` on `invalid_state` (only for a changed answer), `reason` on `source_not_allowed` (`bad_url`, `bad_port`, `credentials`, `blocklisted` or `private`), `turns` and `chars` on `transcript_too_long`, and `retry_after` on `rate_limited`, the same seconds as the header. Only the issue list on `bad_request` is for debugging, its shape can change. `llm_*` errors can also carry the provider's `status`.

```json
{"error":{"code":"transcript_too_long","message":"max 300 turns and 60000 chars","retryable":false,"details":{"turns":301,"chars":301}}}
```

```json
{"error":{"code":"bad_request","message":"invalid request","retryable":false,"details":[{"code":"unrecognized_keys","keys":["audio_url"],"path":["turns",0],"message":"Unrecognized key: \"audio_url\""}]}}
```

| Code | Status | `retryable` | Meaning | What the frontend does |
| --- | --- | --- | --- | --- |
| `bad_request` | 400 | no | Invalid body, id or JSON. `details` lists the problems | Fix the request |
| `not_found` | 404 | no | No such route, session or job. A restart of a server on the memory store causes this, it loses every id | For a stored session or job id : clear `job_id` and `session_id` from the flow state, keep `user_id` and go back to `/start`. Otherwise stop |
| `invalid_state` | 409 | no | Not allowed in this session status, or a transcript with fewer turns than stored or a changed answer. `details.stored_turns` has the count then, and `details.changed_turn` the index of the changed answer | Reload with `GET /session/:id`. For fewer turns or a changed answer, take the full list from `session.transcript`, add the new turns and resend |
| `session_conflict` | 409 | yes | Too many sessions created at once on this job, or too many saves of one transcript at once | Retry with backoff |
| `grading_in_progress` | 409 | yes | Another `/grade` is running for this session | Poll `GET /session/:id` until `graded`, or until `grading_started_at` is null while still `completed`, then call `/grade` again |
| `payload_too_large` | 413 | no | Body over 256 KB. Far over the limit the browser can show a `TypeError` instead, see [Conventions](#conventions) | Check the size before sending. Do not retry as is |
| `transcript_too_long` | 413 | no | Over 300 turns or 60000 chars. `details` has the counts | Do not retry as is |
| `unsupported_media_type` | 415 | no | POST body without `content-type: application/json` | Fix the request |
| `no_candidate_answers` | 422 | no | Final transcript has no candidate text. Nothing was saved | Keep interviewing, send `final:true` after an answer |
| `source_not_allowed` | 422 | no | `company_url` can't be used. `details.reason` says why | Ask for another url, or send none |
| `rate_limited` | 429 | yes | Too many requests | Wait for `Retry-After` |
| `budget_exceeded` | 429 | no | Daily LLM call cap or this client's share of it (a fifth) reached, resets at 00:00 UTC. Calls the provider did not answer do not count against the share, so retrying through an outage does not use it up | Ask to come back later |
| `llm_rate_limited` | 429 | yes | The LLM provider is rate limiting | Retry with backoff |
| `internal` | 500 | no | Unexpected server error, the message is generic | Show a generic error |
| `llm_bad_output` | 502 | yes | The LLM kept returning invalid output | Retry with backoff |
| `llm_unavailable` | 503 | yes | The LLM provider is down | Retry with backoff |
| `llm_config` | 503 | no | The LLM provider refuses the request or the key, this needs a fix on the server | Show a generic error |
| `store_unavailable` | 503 | yes | The database is down or did not answer in 10 s. Any route that reads or writes can return this, and nothing was lost if you retry | Retry with backoff, keep the transcript |
| `llm_timeout` | 504 | yes | The LLM provider timed out | Retry with backoff |

`llm_*` above means `llm_rate_limited`, `llm_bad_output`, `llm_unavailable`, `llm_config` and `llm_timeout`. The server already tries a fallback model before returning most of these, so a short backoff of a few seconds is enough, with a limit of about 3 tries.

## Demo mode

For a reliable demo when the server runs with `DEMO_MODE=1`, which needs no relay key. Send `demo:true` to `/research`, or to `/session` with a `job_description`, and use the `job_description` and transcripts from `GET /demo`. With a `job_id` the flag is accepted and ignored, the job already knows. The server uses the memory store in this mode, so no step needs a database or the network.

| Step | In demo mode |
| --- | --- |
| `/research` with `demo:true` | Stored facts, no network and no LLM. `job.demo` is true, `cached` is true. These 8 claims are short rewrites compared by hand with the live pages, not verbatim sentences like a normal `/research` |
| First `/session` of a demo job | Prebuilt questions, no LLM |
| Later `/session` of a demo job | Tries the LLM for up to 30 s, then the prebuilt questions again |
| `/grade` | With exactly `transcript` or `followup_transcript` : returns that transcript's canned score straight away with `fallback:true`, no LLM call, even when the LLM works. `followup_transcript` on the session from `/next` shows real progress rows. Any other transcript is always graded live and gets the normal error if that fails, demo quotes are never shown for it |
| `/next` | When the session it follows holds exactly `transcript` or `followup_transcript` : the canned question bank straight away, no LLM call. After any other transcript : tries the LLM for up to 30 s, then the bank for the same weak dimensions. The anchor stays the job's own. The bank is small, so a third session can repeat questions of the second |

So `transcript`, then `/next`, then `followup_transcript` always line up word for word, whatever the LLM does. Why the canned transcripts skip the grader : `followup_transcript` answers the bank questions for the weakest pair `star`, `evidence`, in that order. 8 live rounds on `transcript` on 2026-11-02 gave that pair 6 times, `evidence`, `star` once and `star`, `role_knowledge` once, and either of those two asks different questions.

Without `DEMO_MODE=1` the `demo` flag has no effect, the request runs as a normal one.

## Open points for sign-off

1. **Voice token.** The backend does not mint voice tokens, and a provider key can't ship in the browser. Where do the short-lived tokens for the voice connection come from?
2. **Transcript format.** Is one Turn per spoken utterance what the voice SDK gives you, and can you fill in `question_id`? It is optional, but it is the only link between an answer and its question.
3. **Saving partial transcripts.** How often will you save? Each save sends the whole transcript.
4. **CORS.** Only one origin is allowed. Preview deployments on other domains need a change here.
5. **Identity.** Is `localStorage` acceptable for the MVP, given the limits [described above](#anonymous-user_id)?
6. **Retention.** Data stays until the user deletes it, nothing expires. This needs a product decision before launch.
