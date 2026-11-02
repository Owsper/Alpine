# InterviewVerse backend

Interview practice API : job description, sourced company facts, session, transcript, grading, next session.
Practice tool only. Not for hiring or selection. Text of the answers only, no audio.

Frontend contract (draft) : [docs/api.md](docs/api.md).

## Setup

Needs Node 22.12 or newer (22, 24 or 26 and up, the test tools do not support 23 or 25), tested on 24.

```
cd backend
npm install
cp .env.example .env
```

Set `LLM_BASE_URL` and `LLM_API_KEY` in `.env`, then :

```
npm run dev
curl http://localhost:8787/health
```

Without `SUPABASE_URL` it uses a memory store and nothing is persisted. `.env` is gitignored, keep it that way.

## Env vars

| Var | Default | |
| --- | --- | --- |
| `LLM_BASE_URL` | required | OpenAI compatible relay, without `/v1` |
| `LLM_API_KEY` | required | relay key |
| `LLM_MODEL` | `zai-org/GLM-5.3-Flash` | |
| `LLM_FALLBACK_MODEL` | `deepseek-ai/DeepSeek-V4.1-Flash` | used when the main model fails, except on 401, 402 or 403 and on output that fails validation |
| `LLM_TIMEOUT_MS` | `60000` | per call |
| `LLM_DAILY_CALL_CAP` | `2000` | in memory, per process, resets at 00:00 UTC. One client can use a fifth of it |
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

The labels are AI-written and the accents are simulated. Treat the numbers as a smoke test, not as fairness validation. The checked in `eval/results/latest.json` covers 2 items only, the full set has not been run.

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

```
# Git Bash
DEMO_MODE=1 npm start

# PowerShell
$env:DEMO_MODE='1'; npm start
```

Or set `DEMO_MODE=1` in `.env`.

Get the job description and the two transcripts from `GET /demo`, then run the normal flow with `demo:true` on `/research` or on `/session` with a job description. Research and the first session use stored data with no LLM call. `/grade` and `/next` try the LLM first and fall back to canned results, after 45 s and 30 s at most if it hangs. The canned scores are only ever used for the exact demo transcripts. Details in [docs/api.md](docs/api.md#demo-mode).

The stored data is in `src/demo/`. The job description is a marked sample. The company facts are captured from the real site and go out of date, so refresh them before a demo :

```
npx tsx --env-file=.env scripts/capture-demo.ts
```

It only captures N26, because the job, questions and transcripts are written for N26. It exits with 1 and saves nothing if the run lacks a fact the question bank quotes, and the model does not pick the same facts every time, so run it again in that case.
