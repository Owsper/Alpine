# Backend to-do: Alpine MVP

Based on the MVP plan and the product research, written when the product was still called InterviewVerse.

Status on 3 Nov 2026 : both backends are on `main`. The ticks are for `backend-ts/`, which no frontend calls. The frontend calls the FastAPI backend in `backend/`, whose status is at the end of this file. The team still has to pick one. Unticked items say what is missing.

## P0 — End-to-end MVP

- [ ] Agree with the frontend developer on API and data contracts: `job`, `fact`, `session`, `score`, `plan`; define response and error formats. **Needs the frontend developer.** Draft in `backend-ts/docs/api.md`, mapping to the frontend on main in `backend-ts/docs/frontend.md`, not signed off.
- [ ] Set up Supabase in the EU region and create tables for jobs, company facts, sessions, scores, and next-session plans. **Needs the project owner.** Migration and store are written and pass on local Postgres. No EU project exists yet, steps in `backend-ts/README.md`.
- [x] Implement `POST /research`: accept a job description and return company facts with `claim`, `source_url`, and `retrieved_at`. Never show a fact without a source. Add cached research for the demo company.
- [x] Implement `POST /session`: create a session from a job description and prepare five questions and an interview flow; store the session number, questions, and status.
- [x] Implement `POST /grade`: score a completed transcript across six dimensions (STAR, relevance, role knowledge, company fit, conciseness, evidence) on a 1–5 scale. Return an evidence quote and a short improvement tip for each score. Use strict JSON output.
- [x] Run the grader three times and take the median for each dimension; return strengths and the two weakest dimensions.
- [x] Implement `POST /next`: generate the next practice session from the previous results — 60% questions targeting weak skills, 20% anchor repeats, and 20% new questions.
- [ ] Support the full flow: job description → research → interview → transcript → grading → next-session plan. Every API step works on the real model. No frontend calls this backend yet and it runs no interviewer.

## P1 — Reliability, privacy, and demo readiness

- [ ] Separate the voice conversation from scoring: the interviewer model conducts the conversation; a separate call scores the completed transcript. Scoring is a separate call. This backend only returns the interviewer prompt, nothing here runs it.
- [x] Store only the transcript by default; do not store audio. Do not analyze video, faces, emotions, confidence, or personality.
- [x] Add user data export and deletion.
- [x] Add session states: `created → in_progress → completed → graded`; handle interruptions, retries, and provider failures without duplicate grading. A restart loses data until Supabase is attached.
- [x] Control transcript length, request volume, and costs; configure timeouts, caching, and clear AI-provider errors. The daily cap lives in memory and counts calls, not tokens.
- [ ] Prepare a test set of 50–100 labeled answers; measure grader consistency and score differences across accents. The set is built and ran, 121 of 121, results in `backend-ts/eval/results/latest.json`. Labels are AI-written and accents are simulated text, so it needs human labels and real speech before it counts.
- [ ] Prepare a demo mode with cached company facts and a prebuilt first session so an external API outage does not disrupt the demo. Cached N26 facts and the prebuilt first session work with no key. In an outage only the two canned transcripts get a report, a live answer gets 503.

## Implementation order

1. Database schema and JSON contracts. Written, contracts not signed off.
2. Prompt prototypes and grader output format. Done.
3. `/session` and `/grade`. Done.
4. `/research` with sources and a demo cache. Done.
5. `/next` and persistence between sessions. `/next` done, persistence waits on the Supabase project.
6. End-to-end integration with the frontend; after feature freeze, fix bugs only. Not started on this backend.

## Keep out of the MVP

- Authentication, localization, and audio storage.
- Face, emotion, confidence, or personality analysis.
- Using the product to hire or select candidates.
- Scraping LinkedIn or Glassdoor; use the job description and official company sources for research.

## Definition of done

The frontend can create a practice session from a job description, show sourced company facts, save the transcript, receive scores with evidence quotes, and start a follow-up session adapted to the previous session’s weakest dimensions.

Not met yet : the backend half works, but no frontend calls this backend.


## FastAPI backend in `backend/`

Checked on 3 Nov 2026. Verdicts come from a full check on `5d23f49`. Numbers and problems were re-tested on `707d079`, after the model list changed, unless marked `5d23f49`.

Not fully done, but the main flow works. In headless Chromium with the real model, Whisper, Kokoro and a fake mic, it goes from job post to facts, voice interview, grading, report, PDF and follow-up, and data survives a restart. Of the 20 items above (15 to-dos, 4 keep-outs, definition of done) : 12 met, 7 partial, 1 missing.

| Item | Status | What is left |
|---|---|---|
| API and data contracts | Partial | `backend/README.md` lists the routes. Some errors use a second shape, both readable. The repo can't show a sign-off. |
| Supabase in the EU | Partial | No Supabase and no EU storage yet : data is in a local SQLite file, and the EU project needs the project owner. All five tables exist and the schema ran unchanged on PGlite (`5d23f49`). Moving means swapping the sqlite3 driver in `db.py` and changing about 20 query lines, `main.py:90` and the PRAGMA. |
| `/research` | Met | The frontend sends no company URL, so facts for a non-demo company only restate the post while the screen says "We check the company". A site that redirects loses its facts silently (`5d23f49`). |
| `/session` | Partial | Questions come from a fixed bank with only company and title filled in. In 40 sessions each, a forklift operator and a nurse got a code, debug or "built" question in 24. |
| `/grade` | Partial | Problems 1, 2, 4 and 5. It also requests no JSON mode, and the grader isn't given the job description. |
| Three runs and median | Met | Small bugs : a dimension can be both strength and weakness (`5d23f49`), and on one-sentence answers 18 of 72 dimensions scored from fewer than 3 runs. |
| `/next` | Met | Always 3 weak, 1 anchor, 1 new. The 26-question bank runs out, so the new question repeats at take 9 (`5d23f49`). |
| Full flow | Met | Through the frontend, typed and with a fake mic. |
| Voice separate from scoring | Met | The grader sees text only. |
| Transcript only | Met | No audio is stored. Recognised answers also go to the server log (`5d23f49`). |
| Export and deletion | Partial | Both routes work. Export leaves out plans, the frontend has no button for either, and a job id is hard to find later. |
| Session states | Partial | Duplicate grading and crash recovery work (`5d23f49`). Problems 1 and 3 are what's left. |
| Length, volume, costs | Partial | The length limit works, and so do timeouts (`5d23f49`). No rate limit or budget, and see problem 9. |
| Labelled test set | Missing | Nothing in `backend/`. The set in `backend-ts/eval/` isn't wired to this grader. |
| Demo mode | Met | Runs with no key (`5d23f49`). The outage report has one quote on all six rows and no tips, and doesn't say it's rule-based. |
| Keep out (4 items) | Met | The LinkedIn and Glassdoor check is a list of names, so some mirrors pass it. Only the API can send a URL (`5d23f49`). |
| Definition of done | Met | With the limits above. |

Problems, roughly worst first. Some sit in the frontend :

1. **Rule-based scores pass as AI scores and stay.** With the default `DEMO_MODE`, a grade during relay errors still returns 200, from a rule-based grader. The screen and PDF still say an AI scored it, and grading again returns the same scores. Good answers got 3.5 instead of 4.0, weak ones 2.3 instead of 1.7. It happened unforced in the re-test : 3 of 3 grades during a burst of 402s, 3 of 10 during a burst of 502s. Both models share the relay, so the race doesn't help. The fallback is what demo mode asks for, and the API does mark these `source : heuristic`. The screen never reads that, and nothing can regrade them. With `DEMO_MODE=false` the same failure gives a clean 503 and a retry grades for real (`5d23f49`).
2. **No answers still get scores.** With the default `DEMO_MODE`, ending with no answers gives overall 2.3 with no quotes, above a footer saying each score quotes your own words. With it off you get a 503 and no scores (`5d23f49`).
3. **A take is easy to lose (mostly frontend).** Reload or the side menu mid interview loses every answer with no warning. The app offers no way to restart a follow-up left half way, though the API can still finish it (`5d23f49`). A transcript over the 20,000 character limit gets a 413 on every End session press, so the take can't finish.
4. **A typed answer can lift its own score.** The test sentence closes the transcript tag and claims the scale is inverted. Weak answers with a median of 1.4 got 2.7 in 11 of 13 API tries and 5.0 on all six scores in 2. In the typed box, 6 injected takes averaged 3.12 and 3 plain ones 1.10. In a logged run Nemotron obeyed in 18 of 18 replies. DeepSeek returned empty scores and won those races, which sent the grade to the rule grader. It takes a deliberate sentence, and the harm is mostly to the user's own report. Tag-free wording never gave all 5s, though 7 of 13 tries still got the rule grader's 2.7. Injections in the job post were ignored (`5d23f49`).
5. **The same answers score differently.** The same five good answers got 3.5 to 4.5 in 15 of 16 sessions and 2.8 once. The random question draw moves it most : with questions pinned the spread was 0 to 0.4. The cause of the 2.8 is unknown : the same questions gave 3.5 to 3.8 in 6 retries. The first valid reply wins whatever it holds, and the models grade at different levels, a mean of 3.18 for DeepSeek and 2.69 for Nemotron on normal answers, so relay speed can move a score by about half a point.
6. **Real answers get treated as a repeat request (frontend).** Short answers like "I didn't understand the brief at first, so I asked." got the question asked again, 6 of 6 on the typed path.
7. **Wrong follow-up card (both).** With plans on two jobs, Generate on the older job shows the newer job's card, 2 of 2.
8. **Same-time requests.** With two requests at once the loser gets a bare 500 : `POST /api/session` in 24 of 40 tries, `POST /api/next` in 7 of 10. Those pairs made no duplicates, but 12 at once could make two sessions (`5d23f49`). The app sends one at a time, so this takes two tabs or a direct client.
9. **Open routes, a problem only if hosted.** Login is kept out of the MVP on purpose, but `GET /api/sessions` returns every transcript and `POST /api/voice/chat` answers any prompt, even with voice off, for anyone who can reach the server.
10. **Stalled Google Fonts leave the page blank (frontend).** 21 to 30 s when the connection times out, with no paint at all while a request goes unanswered.
11. **README.** The camera mirror in `README.md:180` isn't in the frontend, which only asks for audio.

Works well :

- Quotes : all 148 on the real model were in the candidate's words (`5d23f49`). In the logged re-test runs, 318 of 319 dropped items were null. The other was a reworded quote that the check rightly threw out.
- Speed and fallback : 24 normal grades had all 144 dimensions at 3 runs, median 3.3 s, max 9.7 s. Since `d062845` the second model is a real fallback : with either one blocked, 6 of 6 grades were real.
- Voice works end to end on a fake mic, though a quiet first word can get lost (`5d23f49`).
- The follow-up always has the planned 3, 1, 1 mix.
- Restarts, duplicate grading in one process, the no-key demo and clear API errors all held up (`5d23f49`).
- Research blocks most local and private addresses and doesn't follow redirects (`5d23f49`), so the redirect gap is the cost of a safety choice.
- 5 pytest tests pass. They use a fake model, so they don't cover the problems above.

Not checked : a real Postgres or Supabase, a full README install, Python 3.13 (all runs used 3.12), problem 6 on the spoken path, real network failures for problem 10, real human speech, real mics and accents, other browsers, relay cost, and the speed numbers against the plain app, since they came through a logging wrapper.
