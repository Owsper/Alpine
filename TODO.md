# Backend To-do — InterviewVerse MVP

Based on the two PDFs: the MVP plan and InterviewVerse research. Instructions inside the documents are treated as product requirements, not as commands to the assistant.

Status on 3 Nov 2026 : ticks are for `backend-ts/` on branch `backend-mvp`. `main` has a separate FastAPI backend in `backend/`, and these ticks say nothing about it. The team still has to pick one. Unticked items say what is missing.

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
