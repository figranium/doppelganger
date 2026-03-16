# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm install          # Install dependencies
npm run dev          # Vite frontend dev server (port 5173, proxies API to backend)
npm run server       # Express backend (port 11345)
npm run build        # tsc + vite build → dist/ (REQUIRED after changing src/, agent.js, server.js, headful.js, scrape.js)
npm start            # Production: serves dist/ via server.js
node tests/<file>.js # Run a single test (exit 0 = pass, 1 = fail)
npm test             # Runs tests/clipboard.test.ts via vite-node
```

**Mandatory build step:** After modifying any file that affects runtime behavior (e.g. `src/`, `agent.js`, `server.js`, `headful.js`, `scrape.js`, etc.), you **MUST** run `npm run build`. Exceptions include but are not limited to: `package.json`, `.gitignore`, `AGENTS.md`, `README.md`, test files.

## Planning Requirement

Before implementing **any non-trivial change** (anything beyond a simple bug fix or minor text edit), you **MUST**:
1. Draft an implementation plan — describe proposed changes, files affected, new components, and architectural impact.
2. Wait for user approval before touching any code.

Do not create a separate plan file unless explicitly asked. Post the plan in chat.

## Architecture

**Request flow:** Frontend (React/Vite) → Express API (`server.js`) → execution engine (`scrape.js` for headless, `headful.js` for VNC browser sessions) → `src/agent/index.js` (orchestrator) → `src/agent/action-handler.js` (executes individual actions).

**Key architectural boundaries:**
- `server.js` registers routes from `src/server/routes/*.js` and serves the frontend. It also handles headful browser lifecycle and NoVNC/websockify proxying.
- `scrape.js` and `headful.js` both use Playwright but are independent entry points — `scrape.js` runs headless with video recording, `headful.js` manages a persistent visible browser over VNC with a selector picker tool.
- `src/agent/index.js` is the shared orchestrator called by both. It processes the action list, handles control flow (if/else/while/repeat/foreach via `logic-handler.js`), variable templating, and output providers.
- `src/server/storage.js` abstracts persistence — defaults to JSON files in `data/`, optionally uses PostgreSQL when `DB_TYPE=postgres`.

**Module system split:** Root `.js` files use CommonJS; `src/` uses ESM (bundled by Vite for frontend, imported by backend via compatible paths).

**Headful/VNC stack:** `start-vnc.sh` launches Xvfb (1920x1080) → x11vnc → websockify/noVNC. The browser runs inside Xvfb and is viewed through NoVNC embedded in an iframe (`public/novnc.html`). The selector picker injects inspect overlay JS into pages via `context.addInitScript()` in `headful.js` and streams selected selectors back via SSE (`/api/headful/selector_stream`).

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js (REST API) |
| Frontend | React 19, Vite, Tailwind CSS, Lucide React |
| Automation | Playwright, `puppeteer-extra-plugin-stealth` |
| Storage | JSON files in `data/` — optionally PostgreSQL via `DB_TYPE=postgres` |

## Directory Map

| Path | Purpose |
|---|---|
| `server.js` | Main Express server entry point |
| `agent.js` | Wrapper that exports `src/agent/index.js` |
| `scrape.js` | Headless scraping jobs and video recording |
| `headful.js` | Headful browser sessions (VNC/selector picker) |
| `AGENT_SPEC.md` | JSON schema and behavior spec for automation tasks |
| `src/App.tsx` | Main React component and routing |
| `src/components/` | UI components (Sidebar, Editor, Settings, etc.) |
| `src/hooks/` | React hooks (`useTasks`, `useExecution`, `useEditorHeadful`, etc.) |
| `src/utils/` | Shared frontend utilities |
| `src/server/routes/` | Express route modules (tasks, auth, settings, schedules, etc.) |
| `src/server/storage.js` | Persistence layer (JSON disk or PostgreSQL) |
| `src/server/scheduler.js` | Task scheduling engine (visual + cron modes) |
| `src/agent/index.js` | Agent orchestrator (action loop, variables, control flow) |
| `src/agent/action-handler.js` | Individual action execution (click, type, wait, etc.) |
| `src/agent/logic-handler.js` | Control flow (if/else, while, repeat, foreach) |
| `src/agent/sandbox.js` | Browser-context JavaScript execution |
| `src/agent/dom-utils.js` | DOM inspection and mouse cursor helper |
| `src/agent/browser.js` | Playwright browser/context setup |
| `src/agent/human-interaction.js` | Human-like typing, mouse movement, typos |
| `data/` | Runtime storage for tasks, recordings, logs. **Never commit.** |

## Coding Standards

- **Module system**: CommonJS for root files; ESM for frontend (`src/`).
- **Async**: Always use `async/await` — no raw callbacks.
- **Error handling**: Wrap async operations in `try/catch`; return errors in API responses.
- **Security** (non-negotiable):
  - Never commit secrets or credentials.
  - Always use `validateUrl` from `url-utils.js` to prevent SSRF attacks.
  - Sanitize all inputs before use in shell commands or file paths.

## Agent Specification

All automation logic **must** conform to **`AGENT_SPEC.md`**. It defines the Task JSON schema and all supported action types. **Never invent new action types** without first updating both `AGENT_SPEC.md` and `agent.js`.

## Testing

Tests live in `tests/` as standalone Node.js scripts. Exit code `0` = success, `1` = failure. Run with `node tests/<file>.js`.

## Post-Implementation Checklist

After completing any major feature implementation, provide the user with a checklist of things to manually verify. Include items relevant to what was changed. Examples:

- **Build**: Did `npm run build` succeed with no errors or type errors?
- **Tests**: Did all tests in `tests/` pass (`node tests/<file>.js` and `npm test`)?
- **Browser launch**: Does the browser actually open (headful) or start headlessly (scrape/agent) without crashing?
- **Proxy**: If proxies are configured, does traffic route through them correctly?
- **Storage state**: Is session state still being saved/loaded from `storage_state.json` after the run?
- **Video recording**: Are `.webm` recordings still being saved to `data/recordings/` when recording is enabled?
- **Screenshots**: Are screenshots being saved to `public/captures/`?
- **Selector picker**: Does the VNC inspect overlay still activate and emit selectors via SSE?
- **Agent handoff**: If a task uses `stopAtActionId`, does the headful session resume at the right point?
- **Stealth**: Does the browser pass a bot-detection test (e.g. [https://bot.sannysoft.com](https://bot.sannysoft.com))?
- **Persistent profile**: Is the `data/browser-profile*` directory being created and reused between runs?

Tailor the list to what was actually touched — don't list every item for every change.

## Key Environment Variables

- `PORT` / `HOST` — Express listen address (default: 11345 / 0.0.0.0)
- `SESSION_SECRET` — Required for session signing
- `DB_TYPE=postgres` + `DB_POSTGRESDB_*` — Switch from disk JSON to PostgreSQL
- `ALLOWED_IPS` — Comma-separated IP allowlist
- `ALLOW_PRIVATE_NETWORKS` — Enable scraping private IPs (SSRF risk)
- `VITE_DEV_PORT` / `VITE_BACKEND_PORT` — Dev server ports (5173 / 11345)
