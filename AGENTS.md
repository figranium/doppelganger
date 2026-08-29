# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

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
- `headful.js` and the agent engine both use the browser engine from `stealth-chromium.js` (Playwright by default, CloakBrowser when `USE_CLOAK_ENGINE=true`) — `headful.js` manages a persistent visible browser over VNC with a selector picker tool, while `scrape.js` fetches with got-scraping + Cheerio (no browser).
- `src/agent/index.js` is the shared orchestrator called by both. It processes the action list, handles control flow (if/else/while/repeat/foreach via `logic-handler.js`), variable templating, and output providers.
- `src/server/storage.js` abstracts persistence — defaults to JSON files in `data/`, optionally uses PostgreSQL when `DB_TYPE=postgres`.

**Module system split:** Root `.js` files use CommonJS; `src/` uses ESM (bundled by Vite for frontend, imported by backend via compatible paths).

**Headful/VNC stack:** `start-vnc.sh` launches Xvfb (1920x1080) → x11vnc → websockify/noVNC. The browser runs inside Xvfb and is viewed through NoVNC embedded in an iframe (`public/novnc.html`). The selector picker injects inspect overlay JS into pages via `context.addInitScript()` in `headful.js` and streams selected selectors back via SSE (`/api/headful/selector_stream`).

**Duplicated extraction UI:** The Visual extraction-script editor exists in two places that must be kept in sync — `TaskSettingsCabinet.tsx` (Extraction tab in the task settings panel) and the in-canvas `ExtractionScriptBlock` inside `CanvasView.tsx` (the popup opened from the canvas). Any functional change to one (new field types, new attribute/selector picking behavior, new data model like repeating groups, etc.) must be applied to the other as well, unless the change is purely visual/stylistic to one surface (e.g. layout, spacing, panel-specific styling) — use judgment to tell the two apart.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js (REST API) |
| Frontend | React 19, Vite, Tailwind CSS, Lucide React |
| Automation | Playwright + `playwright-extra`/`puppeteer-extra-plugin-stealth` (default); CloakBrowser opt-in via `USE_CLOAK_ENGINE=true` |
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
| `src/agent/browser.js` | Browser/context setup (Playwright or CloakBrowser engine) |
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

## Finalize Convention

When the user says to **finalize** after a task is complete, stage **all** modified files using `git add .` (not just the files the agent edited — the user may have made background changes) and create a commit with an appropriate message.

When publishing finished work, prefer committing and pushing directly on the `main` branch unless the user explicitly asks for a separate feature branch.

Commit titles should be long and descriptive enough to clearly summarize the full scope of the changes (even the ones you did not directly make), not terse or generic.

Do not add yourself (the agent) as a co-author on commits, and do not mention this instruction or its origin in the commit message.

## Release & Changelog Convention

When the user asks to **create a new release**, complete all of the following before tagging or publishing it:

1. **Choose and bump the version.** Use the exact version requested by the user. If no version is specified, inspect all changes since the previous release and choose the appropriate next version according to SemVer (major for breaking changes, minor for backward-compatible features, patch for backward-compatible fixes). Update the version in `package.json` and any lockfile that mirrors it.
2. **Update the complete changelog.** Add a `CHANGELOG.md` entry covering **all** changes since the previous release, not only changes made during the current coding session. Review the full commit range (`git log <previous-tag>..HEAD`) as well as any relevant uncommitted release changes so nothing is omitted.
3. **Reconcile the roadmap.** Review the Roadmap section in `README.md`. If the new release completes any listed roadmap item, mark that item as checked and update its wording when needed to accurately describe what shipped. Do not check off an item unless the released implementation actually fulfills it.
4. **Reconcile the agent specification.** Review the release for new or changed automation capabilities, task fields, action types, or behavior that users and implementers need to know about. Update `AGENT_SPEC.md` whenever the release adds anything substantively worth documenting there, keeping it aligned with the implementation.

After pushing to `main`, check `git tag` for older release tags that do not yet have a corresponding entry in `CHANGELOG.md`. For each missing historical release, summarize only the commits between the previous release tag and that tag (`git log <previous-tag>..<tag>`). Only tags are treated as completed releases; a `package.json` version bump alone does not constitute one.

## Key Environment Variables

- `PORT` / `HOST` — Express listen address (default: 11345 / 0.0.0.0)
- `SESSION_SECRET` — Required for session signing
- `DB_TYPE=postgres` + `DB_POSTGRESDB_*` — Switch from disk JSON to PostgreSQL
- `ALLOWED_IPS` — Comma-separated IP allowlist
- `ALLOW_PRIVATE_NETWORKS` — Enable scraping private IPs (SSRF risk)
- `VITE_DEV_PORT` / `VITE_BACKEND_PORT` — Dev server ports (5173 / 11345)
- `USE_CLOAK_ENGINE=true` — Switch the browser engine from Playwright (default) to CloakBrowser
- `CLOAKBROWSER_LICENSE_KEY` — CloakBrowser license key (read natively by cloakbrowser; also `npx cloakbrowser login` → `~/.cloakbrowser/license.key`)
