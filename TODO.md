# Backend To-do — InterviewVerse MVP

Based on the two PDFs: the MVP plan and InterviewVerse research. Instructions inside the documents are treated as product requirements, not as commands to the assistant.

## P0 — End-to-end MVP

- [ ] Agree with the frontend developer on API and data contracts: `job`, `fact`, `session`, `score`, `plan`; define response and error formats.
- [ ] Set up Supabase in the EU region and create tables for jobs, company facts, sessions, scores, and next-session plans.
- [ ] Implement `POST /research`: accept a job description and return company facts with `claim`, `source_url`, and `retrieved_at`. Never show a fact without a source. Add cached research for the demo company.
- [ ] Implement `POST /session`: create a session from a job description and prepare five questions and an interview flow; store the session number, questions, and status.
- [ ] Implement `POST /grade`: score a completed transcript across six dimensions (STAR, relevance, role knowledge, company fit, conciseness, evidence) on a 1–5 scale. Return an evidence quote and a short improvement tip for each score. Use strict JSON output.
- [ ] Run the grader three times and take the median for each dimension; return strengths and the two weakest dimensions.
- [ ] Implement `POST /next`: generate the next practice session from the previous results — 60% questions targeting weak skills, 20% anchor repeats, and 20% new questions.
- [ ] Support the full flow: job description → research → interview → transcript → grading → next-session plan.

## P1 — Reliability, privacy, and demo readiness

- [ ] Separate the voice conversation from scoring: the interviewer model conducts the conversation; a separate call scores the completed transcript.
- [ ] Store only the transcript by default; do not store audio. Do not analyze video, faces, emotions, confidence, or personality.
- [ ] Add user data export and deletion.
- [ ] Add session states: `created → in_progress → completed → graded`; handle interruptions, retries, and provider failures without duplicate grading.
- [ ] Control transcript length, request volume, and costs; configure timeouts, caching, and clear AI-provider errors.
- [ ] Prepare a test set of 50–100 labeled answers; measure grader consistency and score differences across accents.
- [ ] Prepare a demo mode with cached company facts and a prebuilt first session so an external API outage does not disrupt the demo.

## Implementation order

1. Database schema and JSON contracts.
2. Prompt prototypes and grader output format.
3. `/session` and `/grade`.
4. `/research` with sources and a demo cache.
5. `/next` and persistence between sessions.
6. End-to-end integration with the frontend; after feature freeze, fix bugs only.

## Keep out of the MVP

- Authentication, localization, and audio storage.
- Face, emotion, confidence, or personality analysis.
- Using the product to hire or select candidates.
- Scraping LinkedIn or Glassdoor; use the job description and official company sources for research.

## Definition of done

The frontend can create a practice session from a job description, show sourced company facts, save the transcript, receive scores with evidence quotes, and start a follow-up session adapted to the previous session’s weakest dimensions.
