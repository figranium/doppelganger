# Security Policy

## Reporting a Vulnerability
If you discover a security issue, send an email to `admin@figranium.dev` with:
- the npm or container version and tag you were using
- a description of the issue and how to reproduce it
- any relevant logs or screenshots

We will acknowledge receipt within 24 hours, work with you privately, and post a public advisory only after a fix is ready.

## Supported Versions
We consider the `main` branch the supported release train. Please verify against that branch with your reproduction steps.

## Handling Sensitive Task Data
Task variables can be flagged **Secret** (Vars tab, or `"secret": true` in the task JSON). Secret values are redacted from logs, API responses, execution history, webhook payloads, output-provider pushes, and screen captures — see `AGENT_SPEC.md` §16 for the full list and its limits.

Redaction protects **output**, not storage. Secret values are written to `data/tasks.json` (or the `tasks` table under `DB_TYPE=postgres`) in plaintext, the same as Baserow credential tokens, because the automation has to replay them. Treat `data/` as a secret store: restrict filesystem permissions, keep it out of version control (it is already gitignored), and encrypt backups.

Task **export** files never contain secret values — the variable and its flag are exported with an empty value, so refill it after importing.

Two related notes:
- Values shorter than 4 characters are not redacted — the match would be too broad to be useful. Use longer values for anything that matters.
- A secret typed into a page can still be exposed by the target site itself (for example, if it echoes the value into a different part of the page after submission). Masking covers the field being typed into.

## Response Process
We strive to provide a fix or mitigation instructions within three business days. If a fix takes longer, we will keep you updated on progress and ETA.
