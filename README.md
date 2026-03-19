<div align="center">
  <img src="https://raw.githubusercontent.com/figranium/figranium/main/figranium_banner.png" alt="Figranium Banner">
</div>

# Figranium — Deterministic Control for an Agentic World

Figranium (formerly Doppelganger) is a self‑hosted, block-first automation control plane built for teams that want predictable, auditable browser workflows without pushing sensitive data to third‑party SaaS. It bundles a React/Vite frontend, an Express/Playwright backend, helper scripts, and optional CLI tooling so you can sketch blocks, inject JavaScript, rotate proxies, and run everything locally.

<img src="https://raw.githubusercontent.com/figranium/figranium/main/figranium_screenshot.png" alt="Figranium Demo" width="100%">

# What You Get

- **Block‑based automation** — build flows with actions like click, type, wait, hover, and execute JavaScript against modern pages.
- **Task API + CLI** — trigger saved tasks via HTTP (`/tasks/:id/api`) or `npx figranium` while passing variables and securing runs with the API key you control.
- **Captures & storage** — automatically store screenshots/recordings and cookies; view them in the captures tab, reset storage, or download built assets.
- **Proxy management** — host, rotate, or import HTTP/SOCKS proxies, flag a default, and toggle rotation per task.
- **Task Scheduling** — run workflows automatically using visual interval/daily/weekly/monthly settings or advanced cron expressions.
- **Security-first** — session authentication, IP allowlists, secret management, and audit trails live entirely inside your environment.

# Architecture Snapshot

1. **Frontend**  
   - Vite with React (TypeScript) drives `/dashboard`, `/tasks`, `/settings`, `/executions`, and `/captures`.
   - The Settings screen is tabbed (`System`, `Data`, `Proxies`) and houses panels for API keys, user agents, layout, storage, and version info.
   - Components call `/api/*` endpoints through the Vite dev proxy (see `vite.config.mts`), sharing `APP_VERSION` via `src/utils/appInfo.ts`.

2. **Backend**  
   - `server.js` (Express) handles auth (`/api/auth`), task metadata, hooks into Playwright, and exposes `/api/settings/*` for runtime configuration.
   - Requirements: Node 18+ (LTS), Playwright bundled via `npm install`.
   - Storage is plain‑file: `data/` for proxies and allowlists, `public/captures` for visuals, and browser session cookies stored internally.

3. **Scripts & automation**  
   - `scripts/postinstall.js` runs when dependencies install (keep an eye if you customize).
   - `agent.js`, `headful.js`, `scrape.js` expose specialized runners; the CLI binary `bin/cli.js` wires them for `npx figranium`.

4. **Code layout highlights**
   - `src/App.tsx` glues together routing, alerts, and the sidebar that links dashboards, tasks, and settings.
   - `src/components` houses reusable panels (API keys, storage, captures, proxies) that map directly to backend endpoints.
   - `server.js` embeds all HTTP handlers in one file; use the `data/` helpers for proxies, API keys, and user agent preferences if you customize behavior.

# Getting Started

## Docker (Recommended)

### Docker Compose (Multi-arch / ARM / Apple Silicon)

The easiest way to run Figranium on any architecture (including M1/M2/M3 Macs) is via Docker Compose.

1. Clone the repository:

```bash
git clone https://github.com/figranium/figranium.git
cd figranium
```

2. Start the services:

```bash
docker compose up --build -d
```

This starts the app on `http://localhost:11345` and the VNC viewer on `http://localhost:54311`.

### Docker Run (Standard)

```bash
docker pull ghcr.io/figranium/figranium
docker run -d \
  --name figranium \
  -p 11345:11345 \
  -p 54311:54311 \
  -e SESSION_SECRET=replace_with_long_random_value \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/public:/app/public \
  figranium/figranium
```

Visit `http://localhost:11345`. Stop/start with `docker stop/start figranium`.

> The first visit loads the login/setup screen. After you create the admin account and sign in, the dashboard replaces the login view and stays visible for as long as the session remains valid; returning users are redirected straight to the dashboard until they explicitly log out or the session expires.

## Local Development (npm)

1. Install dependencies:

```bash
npm install
```

2. Launch backend + frontend:

```bash
npm run server
npm run dev
```

Frontend calls `/api` via the Vite proxy defined in `vite.config.mts`; the backend listens on `process.env.VITE_BACKEND_PORT` (default `11345`).

## Install Release via npm

If you just want to run the packaged release (no source checkout), install the published npm package and run `figranium` directly.

```bash
npm install -g figranium
figranium
```

Or use `npx`:

```bash
npx figranium
```

If you prefer not to install globally, clone the repo, run `npm install` to pull dependencies, and then run `npx figranium` inside that folder. This ensures `npx` can resolve the package from the local registry/cache while still shipping the same dashboard experience.

Set `SESSION_SECRET` and optionally mount `data/` and `public/` (match the Docker volume layout). The CLI spins up the same Express/Playwright stack and opens the browser-based dashboard at `http://localhost:11345` unless you override `PORT`.

## Session Secret

Set `SESSION_SECRET` before any run. A quick generator:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

# Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `SESSION_SECRET` | Signs session cookies. Required. | — |
| `ALLOWED_IPS` | Comma list for basic IP allowlisting. | none (open) |
| `TRUST_PROXY` | Honor `X-Forwarded-*` when behind a reverse proxy. | `0` |
| `ALLOW_PRIVATE_NETWORKS` | Allow scraping local/private IPs (SSRF risk). | `true` |
| `VITE_DEV_PORT` | Port for front-end dev server. | `5173` |
| `VITE_BACKEND_PORT` | Backend port for proxying + scripts. | `11345` |
| `DB_TYPE` | Optional database type overriding disk storage. Set to `postgres` to use PostgreSQL. | — |
| `DB_POSTGRESDB_HOST` | Hostname for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `DB_POSTGRESDB_PORT` | Port for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `DB_POSTGRESDB_USER` | Username for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `DB_POSTGRESDB_PASSWORD` | Password for the PostgreSQL database (required if DB_TYPE is postgres). | — |

Proxy rotation also respects `data/proxies.json` (see below), and `data/allowed_ips.json` works as an alternate allowlist format.

## Advanced Configuration

- `PLAYWRIGHT_BROWSERS_PATH` (or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`) when using a shared Playwright installation.
- `NODE_ENV=production` enables the bundled `dist/` client and reduces console verbosity.
- `HOST=0.0.0.0` allows binding beyond localhost inside Docker containers, while `PORT` overrides the Express listen port (defaults to `11345`).
- Set `LOG_LEVEL` to `debug` if you need more Playwright or proxy diagnostics; this can also be a custom wrapper when running `node server.js`.
- **Headful mode:** the headful/visible browser binds to `54311`, so open that port alongside `11345` when running `headful.js` or other headful flows.

# UI Walkthrough

- **Dashboard** — quick stats, recent runs, and a “New Task” entry point (block or agent).
 - **Task Editor** — drag blocks (click, type, wait, scroll, press, JavaScript); toggle “Rotate Proxies”; schedule runs via the **Schedule** tab; run/stop tasks; inspect results with pins & logs.
 - **Captures** — review screenshots/recordings stored under `public/captures`; delete individually or refresh.
 - **Executions** — historical runs with detail drill-down and the ability to re-run or download results.
 - **Settings**
  - **System tab**: regenerate or copy API key, select user agent, adjust layout ratio, view/copy version (`VersionPanel`), and clear storage.
  - **Data tab**: manage captures and cookies.
  - **Proxies tab**: add/import proxies, set defaults, toggle rotation, and inspect host vs saved entries.

# CLI & Agent Mode

- Use `npx figranium` (or `npm run cli`) to launch the interactive CLI that shows tasks, status, and logs.
- Behind the scenes, `bin/cli.js` can invoke `agent.js`, `headful.js`, or `scrape.js` depending on the runtime mode (`--agent`, `--headful`, `--scrape`).
- Run `node agent.js --help` to see flags like `--task`, `--browser`, or `--version`. These runners share the same settings (API key, proxies, storage) as the web UI.
- When connecting via the API key, prefer `Authorization: Bearer <key>` so reverse proxies can normalize headers; the CLI also accepts a `--api-key` flag for scripted runs.

### Agent capabilities

- Tasks use the JSON schema outlined in `AGENT_SPEC.md`, including mode/modes (`agent`/`block`), wait times, selectors, and stealth flags.
- Support for all action types in the spec (`click`, `type`, `wait`, `press`, `scroll`, `javascript`, `csv`, `hover`, `merge`, `screenshot`, `if/else/end`, loops, `foreach`, `stop`, `set`, `on_error`, `start`), so you can encode complex flows.
- Variable templating ( `{$var}` ), structured conditions, and helper functions such as `exists()`, `text()`, and `block` output ensure reusable, data-driven tasks.
- Extraction scripts run in the browser context after the page renders; you can return JSON/CSV by reading DOM nodes directly as documented in `AGENT_SPEC.md`.

# Proxies

Proxies can be defined via the UI or `data/proxies.json`:

```json
[
  "http://user:pass@proxy1.example.com:8000",
  { "server": "socks5://proxy2.example.com:1080", "label": "data center" }
]
```

- `host` is always available and represents your machine’s default IP.
- Rotation settings (`round-robin` or `random`) live in the Settings screen and persist through the backend endpoints.
- Import/export operations live behind `/api/settings/proxies/import`.

# API Surface

Figranium exposes a comprehensive REST API for integration with agents (like OpenClaw) or custom automation scripts. All endpoints are hosted locally, typically on port `11345`.

**Authentication:** 
If enabled, provide the `x-api-key` header or `Authorization: Bearer <key>`. For internal network use, this may be optional depending on your settings.


### Task Management API
*   **`GET /api/tasks`**: List all saved automation profiles.
*   **`POST /api/tasks`**: Create a new task profile.
*   **`PUT /api/tasks/:id`**: Update an existing task profile.
*   **`POST /api/tasks/:id/api`**: Execute a predefined task. Pass `{"variables": {}}` in the body to override execution variables dynamically.

### Scheduling API
*   **`GET /api/schedules`**: List all scheduled tasks and their status.
*   **`POST /api/schedules/:taskId`**: Create or update a schedule (supports visual config or raw cron).
*   **`DELETE /api/schedules/:taskId`**: Disable/remove a schedule.
*   **`GET /api/schedules/status/all`**: Get an overview of all active scheduled jobs.

### Execution & Logging API
*   **`GET /api/executions`**: Retrieve paginated logs of all past runs.
*   **`GET /api/executions/:id`**: View the exact steps, result JSON, and configuration state of a specific run.

### Data Management API
*   **`GET /api/data/captures`**: List generated screenshots, videos, and downloads.
*   **`DELETE /api/data/captures/:name`**: Delete a specific capture.
*   **`POST /api/clear-screenshots`**: Removes all files in `public/captures`.
*   **`POST /api/clear-cookies`**: Clears stored browser session cookies.

# Task Scripting Tips

- Use JavaScript blocks to scrape structured data:
  ```js
  return document.querySelectorAll('article').length;
  ```
- Keep CSS selectors narrow; the block-based editor surfaces `#`, `.`, and attribute hints.
- When running headlessly, toggle `headful.js` or `agent.js` depending on whether you need a visible browser for debugging.
- Set `task.variables` via the API to re-use generic workflows across multiple domains.

## Workflow Recipe

1. Design a task in the editor starting with a `goto` block and a `wait` block to give pages time to render.
2. Add conditional `javascript` blocks to test for specific DOM elements; use the retry/timer controls per block.
3. Attach `extract` (JSON output) or `screenshot` actions before submitting so you can inspect results in the Captures tab.
4. Toggle “Rotate Proxies” if you need egress diversity and pick a default proxy on Settings → Proxies.
5. Use the **Schedule** tab to set up automated runs (e.g., every day at 9 AM or every 15 minutes).
6. Save the task, pin results you care about, and use the `POST /tasks/:id/api` endpoint with variables like `{"variables":{"query":"books"}}` to run it from automation tools.

# Task Scheduling

Figranium includes a built-in scheduler that handles automated task execution without requiring external cron jobs or triggers.

- **Visual Mode**: Easily configure periodic runs (every X minutes), hourly, daily, weekly (select specific days), or monthly runs.
- **Advanced Mode**: Use standard 5-field cron expressions (`* * * * *`) for complex schedules.
- **Persistence**: Schedules are stored within the task metadata and persist across server restarts.
- **Monitoring**: The "Next Run" and "Last Run" status (including duration) are visible directly in the Task Editor's Schedule tab.

# Testing & Validation

- Run `npm run build` before packaging for production; the `dist/` folder contains the compiled assets.
- Backend logging writes to the console; capture output from `server.js` for debugging proxies, authentication, or Playwright failures.
- Playwright logs are visible in the running Node process and under `node_modules/.cache` when using the CLI.

# Troubleshooting

- **“Session expired”** in the UI: confirm `SESSION_SECRET` is consistent and cookies aren’t blocked by your browser.
- **Proxy import fails**: inspect `data/proxies.json` for valid URLs; the backend validates `server` as a string.
- **API key lost**: copy from Settings → System tab.

# Data Lifecycle

- Captures land in `public/captures`; regular cleanups can be scripted via `POST /api/clear-screenshots`.
- Cookies are stored internally; clear them via the UI or `/api/clear-cookies`.
- Proxy lists, user-agent preferences, and settings persist under `data/` (look for `proxies.json`, `allowed_ips.json`, etc.) — treat this directory as your config source control.
- Use `Storage` controls in Settings to clear data after experimentation cycles, and keep `layouts` or `version` info tracked via `localStorage` as shown in `src/components/SettingsScreen.tsx`.

# Maintenance

- The project is governed by the **[GNU General Public License v3.0](https://github.com/figranium/figranium/blob/main/LICENSE)**, which grants rights for distribution and modification as per the GPLv3 terms.
- Keep `data/` backed up if you rely on historical proxies and settings.
- Release updates by pulling `figranium/figranium` (Docker) or `npm i figranium` (npm). The Settings view always displays the current package version.
- Contributions: follow `.github/` templates, respect `CONTRIBUTING.md`, and run available lint/test scripts if you touch critical areas.

# Roadmap

- [x] **Settings shortcuts** — the System tab already exposes API key regeneration, user agent selection, and layout preferences so operators can tune them without leaving the UI.
- [x] **Storage cleanup** — the Settings data tab lets you clear captures and cookies, and the backend exposes `/api/clear-screenshots` and `/api/clear-cookies`.
- [x] **IP rotation tooling** — build a settings workflow for importing proxies and automatically rotating them.
- [x] **API key workflow** — the API key panel already supports regenerating and copying keys via `/api/settings/api-key`, so secure API access is ready without extra setup.
- [x] **Task proxy rotation toggle** — the “Rotate Proxies” option in each task ties into the Settings rotation controls, enabling rotation per execution.
- [x] **Spatial editor transition** — transition to a spatial editor like that of activepieces (top priority).
- [ ] **Action key combos** — add modifier shortcuts (e.g., Ctrl+Click, Shift+Scroll) so tasks can more closely mirror real user interactions.
- [ ] **Click-and-drag block** — add an action that does drag gestures (selecting text, moving items) so tasks can simulate click-and-drag flows.
- [x] **Recording controls** — Task editor now exposes a “Disable automated recording” switch in the general settings panel so workflows can skip video capture on a per-task basis.
- [x] **File downloads** — add explicit support for agent tasks to download files (PDFs, CSVs, etc.) directly from target pages, then surface those downloads in the UI so users can preview or export them without sifting through captures.
- [x] **Stateless mode** — Tasks now have a “Stateless execution” toggle alongside the recording controls so each run starts with no cookies or local storage, ensuring nothing persists between executions for that workflow.
- [ ] **Adblocking filters** — add controls so execution contexts can enable built-in ad/malware filtering (e.g., via hosts file overrides or request blocking) to reduce noise on sensitive sites.
- [ ] **Extraction response mode** — add a Settings switch so users can choose whether the API returns HTML+data (for debugging) or data-only payloads when extraction scripts run.
- [ ] **Folder organization** — group tasks, assets, and captures into named folders so operators can browse, filter, and download collections per workflow.
- [ ] **Stable capture retention** — add filtering, pinning, and archiving in captures tab so teams can keep compliance records.
- [ ] **Workspace templates** — allow saving and sharing workspace presets (layout + default proxies/agents) so new team members can onboard with pre-configured setups.
- [ ] **Geo-targeted exits** — allow choosing proxy regions for tasks so you can pin the apparent location before running a job.
- [x] **Complete anti-detection coverage** — follow browserscan.net's anti-detection checklist (fingerprints, headers, fonts, WebRTC, etc.) so automated runs mimic real browsers across task executions.
- [ ] **Session recording redaction** — add toggles to redact sensitive fields (passwords, credit cards) from recordings/logs before storing them.
- [ ] **Two-factor authentication** — add optional TOTP/second-factor support to Settings/Auth so operators can lock down the UI with 2FA.
- [ ] **AI-assisted fixing** — add an “AI auto-fix” helper that suggests layout, selector, and proxy tweaks after failed runs, letting teams approve or discard the proposed changes without switching contexts.
- [ ] **Companion app** — build a lightweight companion app that mirrors critical dashboard notifications (failures, capture completions, proxy issues) so operators can stay informed without opening the full UI.
- [x] **Community presets hub** — build a marketplace where users can publish task/workspace presets, browse and download others’ submissions, and choose to offer each preset either for free or as a paid template so creators can monetize standalone workflows while keeping the free option available.
- [ ] **Database Tab / Local CRM** — add a built-in spreadsheet-like interface for viewing and managing extracted data (CRM-style) entirely within the app, without requiring external tools.
- [ ] **iframe interaction support** — add the ability to target and interact with elements inside iframes in the task editor.
- [x] **Autosave** — automatically persist task changes and editor state at regular intervals so operators don't lose work on long-running or complex workflow designs.
- [x] **Highlight tool** — add a feature to highlight elements on the page (similar to a browser's inspect tool) to easily pick selectors and build workflows.
- [x] **Cron triggers** — add support for scheduling tasks with cron expressions so workflows can run automatically on defined intervals.
- [ ] **Canvas notes** — add sticky-note-style annotations to the block canvas so operators can leave freeform comments and context alongside their workflows without affecting execution.

# Security Considerations

- Never commit your `SESSION_SECRET` or API keys into shared repositories.
- Use `ALLOWED_IPS`/`data/allowed_ips.json` to gate the UI when deploying to a network-exposed host.
- Rotate API keys periodically via Settings, and log all automation runs through the Executions tab for audit purposes.
- Playwright runs inside the same Node process; keep dependencies up to date and rebuild `node_modules` after significant OS patches.

# Community

- Report issues or request features via the GitHub repo issue tracker.
- Follow the authors on `https://github.com/figranium` for releases.
- Share automation recipes with other self-hosted users in your org, but respect the license for sharing infrastructure.
- Join the community on [Discord](https://discord.gg/kPmfbgu9Xn).

# Support the Project

If you find this project helpful, please consider supporting its development. Your contributions help keep the project maintained and the lights on!

<div align="center">
  <a href="https://ko-fi.com/figranium" target="_blank">
    <img src="https://img.shields.io/badge/Support%20on-Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Support on Ko-fi" />
  </a>
</div>

---
**Other ways to help:**
*   **Star** the repository to help others find it.
*   **Share** the project with your network.
*   **Contribute** to the code or documentation.
