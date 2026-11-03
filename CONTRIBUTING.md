# Contributing to Alpine

Thanks for helping out. This page covers how to get a change merged.

## Set up

Follow the [quick start](README.md#quick-start). The no-GPU path is enough for most frontend and API work.

## Make a change

1. Branch from `main`.
2. Keep each pull request to one change, and match the style of the file you are editing.
3. Run the checks for the parts you touched.
4. Open a pull request and fill in the template. Add a screenshot for UI changes.

| Part | Check | Run from |
| --- | --- | --- |
| `backend/` | `npm test` | repository root |
| `frontend/` | `npm run build` | repository root |
| `backend-ts/` | `npm test` and `npm run typecheck` | `backend-ts/` |

## Commit messages

Use `type(scope): summary`, with the scope optional:

```text
feat(sessions): download the report as a PDF
fix(interview): keep the transcript when the mic drops
chore: rename the product
```

## Product rules

Alpine is a practice tool. Changes must keep these rules:

- Store text transcripts only, never audio.
- No face, emotion, confidence or personality analysis.
- Scores are practice guidance. Do not build features for hiring or selecting candidates.
- Every company fact needs a source, and the interviewer says it is an AI.
- Research uses the job post and official company sources. No scraping LinkedIn or Glassdoor.

## Secrets

Never commit `.env` files, API keys or real candidate transcripts. Use the `.env.example` files to document new settings.

To report a vulnerability, see [SECURITY.md](SECURITY.md).
