# Security policy

## Reporting a vulnerability

Please do not open a public issue. Report it privately through [GitHub security advisories](https://github.com/Owsper/Alpine/security/advisories/new) and include:

- what the problem is and which part of the repository it affects
- steps to reproduce it
- the impact you expect

Leave real API keys and candidate transcripts out of your report.

## Supported versions

Alpine is an MVP with no releases yet. Only the `main` branch gets security fixes.

## Running Alpine safely

- There is no authentication, so run it on your own machine or behind a proxy or firewall you control.
- Keep keys in `.env` files, which git ignores. The `SUPABASE_SERVICE_ROLE_KEY` used by `backend-ts/` belongs on the server only.
- Job posts and transcripts are sent to whichever LLM provider you configure, so check its data terms before using real data.
