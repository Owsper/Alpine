# Alpine backend (TypeScript)

Interview practice API : job description, sourced company facts, session, transcript, grading, next session.
Practice tool only. Not for hiring or selection. Text of the answers only, no audio.

`main` also has a FastAPI backend in `backend/`, with its frontend wired to it. This is a separate backend, kept in `backend-ts/` so the two do not collide. The team still has to pick one.

Frontend contract (draft) : [docs/api.md](docs/api.md). Screen by screen wiring, field map and the decisions the frontend team has to make : [docs/frontend.md](docs/frontend.md).

## Setup

Needs Node 22.12 or newer (22, 24 or 26 and up, the test tools do not support 23 or 25), tested on 24.

```
cd backend-ts
npm install
cp .env.example .env
```

Set `LLM_BASE_URL` and `LLM_API_KEY` in `.env`, then :

```
npm run dev
curl http://localhost:8787/health
```

Without `SUPABASE_URL` it uses a memory store and nothing is persisted. `.env` is gitignored, keep it that way.

Fetched pages are parsed in up to 4 child processes, started on first use and kept for reuse. Each took about 75 to 120 MB on Windows, with at most 256 MB of heap. They get no env vars and exit with the server.

## Env vars

| Var | Default | |
| --- | --- | --- |
| `LLM_BASE_URL` | required, except with `DEMO_MODE=1` | OpenAI compatible relay, without `/v1` |
| `LLM_API_KEY` | required, except with `DEMO_MODE=1` | relay key |
| `LLM_MODEL` | `zai-org/GLM-5.3-Flash` | |
| `LLM_FALLBACK_MODEL` | `deepseek-ai/DeepSeek-V4.1-Flash` | used when the main model fails, except on 401, 402 or 403 and on output that fails validation |
| `LLM_TIMEOUT_MS` | `60000` | per call |
| `LLM_DAILY_CALL_CAP` | `2000` | in memory, per process, resets at 00:00 UTC. One client can use a fifth of it and at least 3 calls. Calls the provider did not answer count against the cap, not against that share |
| `SUPABASE_URL` | none | set it to use Supabase instead of the memory store |
| `SUPABASE_SERVICE_ROLE_KEY` | none | required with `SUPABASE_URL`, server side only |
| `CORS_ORIGIN` | `http://localhost:5173` | one origin, the Vite dev server by default |
| `DEMO_MODE` | `0` | `1` turns on demo mode, which always uses the memory store |
| `PORT` | `8787` | |
| `HOST` | `127.0.0.1` | set `0.0.0.0` to listen on the network, there is no authentication so only do that behind a proxy or firewall |
| `TRUST_PROXY` | `0` | number of proxies you control in front of the server. The client is read from `x-forwarded-for`, that many entries from the end |

## Scripts

| Script | |
| --- | --- |
| `npm run dev` | server with reload |
| `npm start` | server |
| `npm test` | unit and e2e tests, no network and no real LLM |
| `npm run typecheck` | |
| `npm run eval` | grader eval, calls the real LLM |

`npm test` skips the live Postgres checks in `test/store.test.ts`. To run them set `TEST_SUPABASE_URL` and `TEST_SUPABASE_KEY` to a throwaway project with the migration applied.

## Eval

```
npm run eval
npm run eval -- --limit 10 --concurrency 4 --out eval/results/latest.json
```

Grades `eval/gold.jsonl` (76 labeled answers) and `eval/accents.jsonl` (45 variants) with the real grader, 3 runs each, and prints agreement (kappa), mean error, noise and score differences per simulated accent. Results go to `--out`. Grades are cached in `eval/.cache` per model and `src/grade.ts` content, so a rerun only pays for what changed. It exits with 1 if an item failed.

`eval/results/latest.json` holds the full run : 121 of 121 graded on GLM-5.3-Flash, kappa 0.92 (0.88 to 0.94 per dimension), mean error 0.32, noise 0.14. The largest difference on a simulated accent is 0.20, evidence on German English and company fit on Indian English. All are inside the targets (kappa at least 0.6, noise under 0.5, difference under 0.5).

The labels are AI-written, the accents are simulated text and each item is one question and answer with no facts. Treat the numbers as a smoke test, not as fairness validation.

## Supabase

1. Create a project at [supabase.com](https://supabase.com) and pick an EU region, for example Central EU (Frankfurt). The region can't be changed later.
2. Apply the migration :

```
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
```

Or paste `supabase/migrations/0001_init.sql` into the SQL editor.

3. Add to `.env`, with the values from the project's API settings :

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

4. Restart. `/health` reads the database and should say `"store":"supabase"`. If it fails, the log line `store <status> <code>` says why, `42501` means the grants in the migration were not applied.

The migration turns on row level security with no policies and grants the tables to `service_role` only, so only the service role key can read data. Never send that key to the frontend.

## Demo mode

Lets a demo survive an LLM or network outage. It always uses the memory store, even with `SUPABASE_URL` set, so a restart loses the data.

**Frontend teammates start here.** It needs no relay key : `LLM_BASE_URL` and `LLM_API_KEY` can stay empty, the LLM steps fail at once and use the canned data. Copy the env file once, then start :

```
cd backend-ts
npm install
cp .env.example .env

# Git Bash
DEMO_MODE=1 npm start

# PowerShell
$env:DEMO_MODE='1'; npm start
```

Or set `DEMO_MODE=1` in `.env`. Only `demo:true` requests work without a key. A normal `/research` or a transcript other than the demo ones gets `llm_unavailable`.

Get the company, role, job description and the two transcripts from `GET /demo`, then run the normal flow with `demo:true` on `/research` or on `/session` with a job description. Research and the first session use stored data with no LLM call. So do `/grade` and `/next` on the two exact demo transcripts, even when the LLM works, because the live grader does not always pick the weakest pair the follow-up transcript was written for. Any other transcript is graded live, and `/next` after it tries the LLM for up to 30 s and then uses the canned questions. Details in [docs/api.md](docs/api.md#demo-mode).

The stored data is in `src/demo/`. The job description is a marked sample. The 8 company facts were compared by hand with the live pages on 2026-11-02. They are short rewrites from before claims became verbatim sentences, so they differ from what `/research` returns now. They go out of date, but **do not refresh them right before a demo**. Refreshing replaces them with whatever this run picks, so read the diff and run `npm test` afterwards :

```
npx tsx --env-file=.env scripts/capture-demo.ts
```

It only captures N26, because the job, questions and transcripts are written for N26. It exits with 1 and saves nothing if the run lacks a fact the question bank quotes. The model does not pick the same sentences every time (3 of 4 runs on 2026-11-02 had them all), so run it again in that case.

## Before real users

- **LLM provider** : the relay is an unnamed third party with no DPA or zero-retention evidence, while the research asks for an EU region, a DPA and zero retention. Transcripts and job descriptions go through it, so switch provider first.
- **Supabase** : the EU project still has to be created, nothing is persisted until then.
- **Retention** : nothing enforces the 12 month transcript retention, data stays until the user deletes it.
- **Relay key** : it was pasted in a chat, rotate it.
- **Relay host** : `main` still tracks it in `backend/.env.example` and as a default in `backend/app/config.py`, from commit 8a934c2. This branch has neither. Remove it from those two files. Rewriting history is the owner's call.

## Known limits

- **Grade after a crash** : on a durable store, a process killed mid-grade leaves that session answering 409 `grading_in_progress` for up to 5 minutes, then a retry works. Poll `GET /session/:id` while waiting, retrying `/grade` hits the limit of 10 a minute.
- **Call counts** : one `/grade` is 3 upstream calls when healthy, 9 on failed quotes and 18 on bad output. Those can double when the main model fails first and the fallback runs too, up to 36. The live maximum was 7 over 52 rounds. Output is about 7k to 19k tokens per grade on the main model and about 4k on the fallback.
- **Rejected output** : `/session` still fails sometimes where the model keeps reaching for a banned word the posting never used. A copywriter posting returned 200 on 14 of 16 tries, and on the main model the first answer on it is nearly always rejected, 11 of 12, so it costs two calls. `/grade` can still answer 502 if the model keeps misquoting, 0 of 76 rounds with the current retry and 1 of 344 without it, too rare to tell apart. Both can be retried.
- **Question filter** : a banned word the posting or its facts use is allowed in questions, by word and not by sense. `Build mood boards.` would allow `What is your mood today?`, the model did not write that in 255 accepted questions. On postings that ask for a trait, the anchor can be about the candidate's own composure and repeats in every later session : 23 of 111 anchors on soft and heavy postings said stay calm, 16 of 17 on a flight attendant posting, and one question coached how to sound on a posting that says sound confident on the phone. Checking the anchor with no exemption would stop it, the team has not decided.
- **Filter gaps** : the filter is English whole words, so German is barely filtered. `Wie selbstbewusst sind Sie?` passes, and 7 of 18 tips on a German posting came back in English. It also misses `How do you manage your feelings?`, `Speak more slowly`, `Where were you born?` and `Which religion do you follow?`. The prompts forbid most of these, the filter is only the backstop.
- **Tips** : when every run's tip for a dimension holds a banned word the fixed tip is shown, 46 of 1692 dimensions live on a set weighted to such postings, 45 of them on 5 postings that made up about half the rounds and 1 in the other 131 rounds. That lost useful tips where the company name or the main need holds such a word : company fit got the fixed tip in 43 of 151 rounds on those postings, for example 3 of 9 on a company called Mood Media. The fixed tip is in English and gives advice even at a 5. If no run at the median has a clean tip, the tip comes from a run with another score, so tip and quote can be about different things, 11 of 1692.
- **Score drift** : on postings full of banned words, final scores are about 0.1 lower than before the tip change, because a run whose tip held such a word used to be thrown away. Plausibly chance, the two control postings moved in one dimension too. Compare with care across that change.
- **Repeated calls** : each `POST /session` makes a new session and spends an LLM call, so a double click makes two. The frontend has to guard it.
- **Large bodies** : a body of 1 MB or more shows up as a network error in Chromium, not as 413, because the server closes the connection first. 300 KB gets the 413.
- **Company coverage** : of 12 real companies tried, 8 gave 4 to 8 facts and 4 gave 0 or 1, with a warning. Some sites refuse crawlers or render with scripts only.
- **Platform** : only run on Windows with Node 24.
