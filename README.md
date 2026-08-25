<div align="center">
  <img src="https://raw.githubusercontent.com/figranium/figranium/main/banner.png" alt="Figranium Banner">
</div>

# Figranium — Deterministic Control for an Agentic World

Figranium is an open-source, self-hosted alternative to Apify and SaaS cloud scrapers, built to turn browser workflows into instant API endpoints for developers, API pipelines, and low-code tools like n8n and Activepieces. Powered by a React/Vite control plane and an Express/Playwright runtime, it lets you visually build stealth browser tasks, pass dynamic variables during runtime, handle automatic proxy rotation, and stream structured results or CSV exports on your own infrastructure—delivering the instant API convenience of cloud actors without usage credits, rate caps, or third-party data hosting.

<div align="center">
  <img src="demo.gif" alt="Figranium Demo" width="100%">
  <p align="center">
    <i>Watch a video walkthrough of Figranium usage: <b><a href="demo.webm">demo.webm</a></b> or <b><a href="demo.mp4">demo.mp4</a></b></i>
  </p>
</div>

# What You Get

- **Block‑based automation** — build flows with actions like click, type, wait, hover, and execute JavaScript against modern pages.
- **Task API + CLI** — trigger saved tasks via HTTP (`/tasks/:id/api`) or `npx figranium` while passing variables and securing runs with the API key you control.
- **Captures & storage** — automatically store screenshots/recordings and cookies; view them in the captures tab, reset storage, or download built assets.
- **Proxy management** — host, rotate, or import HTTP/SOCKS proxies, flag a default, and toggle rotation per task.
- **Task Scheduling** — run workflows automatically using visual interval/daily/weekly/monthly settings or advanced cron expressions.
- **Security-first** — session authentication, IP allowlists, secret management, and audit trails live entirely inside your environment.

# Official Partners

Figranium is proudly supported by:

## Featured Partner

<div align="center">
  <a href="https://swiftproxy.net/?ref=figranium" target="_blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="partner-assets/swiftproxy_white.png">
      <source media="(prefers-color-scheme: light)" srcset="partner-assets/swiftproxy.png">
      <img src="partner-assets/swiftproxy.png" width="220" alt="Swiftproxy">
    </picture>
  </a>
</div>

## Integration Partner

<div align="center">
  <a href="https://simplynode.io/?utm_source=figranium" target="_blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="partner-assets/simplynode_white.png">
      <source media="(prefers-color-scheme: light)" srcset="partner-assets/simplynode.png">
      <img src="partner-assets/simplynode.png" width="220" alt="SimplyNode">
    </picture>
  </a>
</div>

## Infrastructure Backers

<div align="center">
  <a href="https://www.digitalocean.com/?utm_medium=opensource&utm_source=Figranium">
    <img src="https://opensource.nyc3.cdn.digitaloceanspaces.com/attribution/assets/SVG/DO_Logo_horizontal_blue.svg" width="201" alt="DigitalOcean">
  </a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.mintlify.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="partner-assets/mintlify_white.svg">
      <source media="(prefers-color-scheme: light)" srcset="partner-assets/mintlify.svg">
      <img src="partner-assets/mintlify.svg" width="165" alt="Mintlify">
    </picture>
  </a>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.algolia.com">
    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Algolia_logo_full_blue.svg/1920px-Algolia_logo_full_blue.svg.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=thumbnail&_=20221025105233" width="165" alt="Algolia">
  </a>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://neon.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="partner-assets/neon_white.png">
      <source media="(prefers-color-scheme: light)" srcset="partner-assets/neon.png">
      <img src="partner-assets/neon.png" width="165" alt="Mintlify">
    </picture>
  </a>
</div>

# Getting Started

This starts the app on `http://localhost:11345` and the VNC viewer on `http://localhost:54311`.


## Docker Compose (Standard)

### 1. Create a Project Directory

Create a directory for your Figranium installation and navigate into it:
```bash
mkdir figranium-server
cd figranium-server
```
### 2. Create docker-compose.yml

Create a docker-compose.yml file in your project directory:
```bash
services:
  figranium:
    image: ghcr.io/figranium/figranium:latest
    container_name: figranium
    ports:
      - "11345:11345"
      - "54311:54311"
    volumes:
      - ./data:/app/data
      - ./captures:/app/public/captures
    environment:
      - PORT=11345
      - SESSION_SECRET=your_secure_random_string
    restart: unless-stopped
```
### 3. Start with Docker Compose

Run the following command to start the application in detached mode:
```bash
docker compose up -d
```


## Git Clone (Multi-arch / ARM / Apple Silicon)

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

Visit `http://localhost:11345`.

> The first visit loads the login/setup screen. After you create the admin account and sign in, the dashboard replaces the login view and stays visible for as long as the session remains valid; returning users are redirected straight to the dashboard until they explicitly log out or the session expires.

## Session Secret

Set `SESSION_SECRET` before any run. A quick generator:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

# Architecture Snapshot

## Figranite
At the core of Figranium lies **Figranite**, a high-performance, deterministic workflow interpreter designed for stateful browser automation. It is the project's primary execution kernel, responsible for transforming abstract block definitions into sentient-like browser behavior.

Key capabilities of **Figranite** include:
- **Stateful Execution:** Manages complex variables and loop contexts across blocks.
- **Human Physics Simulation:** Implements Bezier-curve cursor movements, randomized jitter, and fatigue-aware typing.
- **Stealth Integration:** Works in tandem with the Stealth Browser engine to bypass modern bot detection.
- **Recursive Logic:** Handles nested if/else, while, and foreach blocks with custom jump-map optimization.
- **Security-First:** Executes within a protected context with built-in SSRF and private network protection.


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
   - `agent.js` (powered by the **Figranite Engine**), `headful.js`, and `scrape.js` expose specialized runners; the CLI binary `bin/cli.js` wires them for `npx figranium`.

4. **Code layout highlights**
   - `src/App.tsx` glues together routing, alerts, and the sidebar that links dashboards, tasks, and settings.
   - `src/components` houses reusable panels (API keys, storage, captures, proxies) that map directly to backend endpoints.
   - `server.js` embeds all HTTP handlers in one file; use the `data/` helpers for proxies, API keys, and user agent preferences if you customize behavior.

# Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `SESSION_SECRET` | Signs session cookies. Required. | — |
| `ALLOWED_IPS` | Comma list for basic IP allowlisting. | none (open) |
| `TRUST_PROXY` | Honor `X-Forwarded-*` when behind a reverse proxy. | `0` |
| `ALLOW_PRIVATE_NETWORKS` | Allow scraping local/private IPs (SSRF risk). | `false` |
| `VITE_DEV_PORT` | Port for front-end dev server. | `5173` |
| `VITE_BACKEND_PORT` | Backend port for proxying + scripts. | `11345` |
| `DB_TYPE` | Optional database type overriding disk storage. Set to `postgres` to use PostgreSQL. | — |
| `DB_POSTGRESDB_HOST` | Hostname for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `DB_POSTGRESDB_PORT` | Port for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `DB_POSTGRESDB_USER` | Username for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `DB_POSTGRESDB_PASSWORD` | Password for the PostgreSQL database (required if DB_TYPE is postgres). | — |
| `USE_CLOAK_ENGINE` | Set to `true` to run the browser engine on CloakBrowser (stealth-patched Chromium) instead of the default Playwright stealth stack. | `false` |
| `CLOAKBROWSER_LICENSE_KEY` | CloakBrowser license key for the latest binary (read natively by cloakbrowser; `npx cloakbrowser login` writes `~/.cloakbrowser/license.key`). Without a key the free legacy binary is used. | — |
| `CAPTCHA_SOLVER_URL` | Optional YesCaptcha/AntiCaptcha-compatible endpoint. Remote solving is attempted first. | — |
| `CAPTCHA_SOLVER_KEY` | Client key for `CAPTCHA_SOLVER_URL`. | — |
| `CAPTCHA_MODEL_TIER` | Local model selection: `auto`, `owlvit`, or `florence2`. Auto selects OWL-ViT for 2–7.99 GiB and Florence-2 at 8 GiB+. | `auto` |
| `CAPTCHA_MODEL_DEVICE` | Local inference device policy: `auto` or `cpu`. | `auto` |
| `SKIP_LOCAL_CAPTCHA_MODEL` | Unconditionally disable local model detection, download, startup, reconciliation, and fallback. Cached weights are retained. | `false` |
| `CAPTCHA_REMOTE_FORWARD_PROXY` | Opt in to sending the active browser proxy and user agent to compatible proxy-backed remote tasks. Unsupported provider/task combinations fail over locally without changing IP. | `false` |
| `CAPTCHA_REMOTE_FORWARD_CONTEXT` | Opt in to sending origin-scoped cookies, locale, timezone, viewport, and user agent to a custom endpoint advertising `browserContext` version 1. | `false` |
| `CAPTCHA_REMOTE_TIMEOUT_MS` | Maximum time allocated to the remote route before local fallback. | action deadline minus local reserve |
| `CAPTCHA_LOCAL_FALLBACK_MIN_MS` | Portion of the action deadline reserved for the active-browser local route. | `15000` |
| `CAPTCHA_AUTO_DETECT_TIMEOUT_MS` | Maximum readiness-detection wait after each auto-solve trigger when no CAPTCHA is present. | `5000` |
| `CAPTCHA_COMPANION_URL` | Optional Apple companion URL. Docker Desktop discovers `http://host.docker.internal:11438`; native macOS uses loopback. | auto-detected |
| `CAPTCHA_COMPANION_TOKEN` | Bearer token for the Apple companion. If omitted, `data/captcha-companion-token` is used. | generated file |
| `CAPTCHA_OWLVIT_THRESHOLD` / `CAPTCHA_FLORENCE2_THRESHOLD` | Optional tier-specific confidence overrides in the range 0–1. | calibrated `0.12` / `0.18` |
| `RUN_CAPTCHA_LIVE_TESTS` | Set to `1` to enable network/model/browser acceptance tests. Ordinary tests never download weights. | disabled |
| `OHMYCAPTCHA_URL` / `OHMYCAPTCHA_CLIENT_KEY` | Deprecated aliases for the new remote endpoint variables. | — |

Local weights are fetched on first use/startup into persistent `data/captcha-model/`; no model weights or secondary browser are included in the Docker image. Every fetched file is pinned to an exact upstream commit, size, and SHA-256 digest, and inference loads with remote access disabled. OWL-ViT uses about 159 MB of artifacts on 2–7.99 GiB hosts; Florence-2 uses about 361 MB at 8 GiB+. Hosts below 2 GiB can still use a configured remote endpoint. At steady state only the active tier is retained.

Proxy and browser-context forwarding are disabled by default because they disclose sensitive connection and session information to the administrator-configured solver endpoint. Standard AntiCaptcha/YesCaptcha payloads never receive cookies. Context is sent only after the custom endpoint advertises `browserContext` version 1, and cookies are filtered to the active page origin.

### Optional Apple Silicon CAPTCHA companion

The native companion lets a Docker Desktop container use Apple unified memory and acceleration without putting model weights into the image:

```bash
npm run captcha:companion:install       # pinned Python 3.10+ venv + generated token
npm run captcha:companion:start         # native Figranium, loopback only
npm run captcha:companion:start:docker  # Docker Desktop, authenticated external bind
```

OWL-ViT uses ONNX Runtime's CoreML execution provider. Florence-2 first stages and probes the pinned 4-bit MLX format; if MLX is unavailable or its real inference probe fails, the failed MLX data is removed and the verified native ONNX format is activated. The companion exposes only authenticated `GET /v1/health` and `POST /v1/detect`, caps request/image sizes, serializes inference, and applies inference timeouts. The token file is already shared with the container through the persistent `data/` mount; use `CAPTCHA_COMPANION_TOKEN` when the companion and container do not share that directory.

Run deterministic tests normally. The following commands are intentionally opt-in because they download weights or contact official test widgets:

```bash
RUN_CAPTCHA_LIVE_TESTS=1 npm run captcha:test:live
RUN_CAPTCHA_LIVE_TESTS=1 RUN_CAPTCHA_FLORENCE_TESTS=1 npm run captcha:test:live
RUN_CAPTCHA_LIVE_TESTS=1 npm run captcha:test:docker
```

The Docker acceptance command builds an image, verifies that it contains no weights, then exercises 1/2/4/8 GiB cgroup limits. A release must not claim full CAPTCHA acceptance until the real Florence probe has passed on an 8+ GiB runner. Apple acceptance additionally requires Apple Silicon and the installed companion.

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
*   **`POST /api/clear-screenshots`**: Removes all files in `public/captures` and `data/recordings`.
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
- [x] **Extraction response mode** — add a Settings switch so users can choose whether the API returns HTML+data (for debugging) or data-only payloads when extraction scripts run.
- [ ] **Folder organization** — group tasks, assets, and captures into named folders so operators can browse, filter, and download collections per workflow.
- [ ] **Stable capture retention** — add filtering, pinning, and archiving in captures tab so teams can keep compliance records.
- [ ] **Workspace templates** — allow saving and sharing workspace presets (layout + default proxies/agents) so new team members can onboard with pre-configured setups.
- [ ] **Geo-targeted exits** — allow choosing proxy regions for tasks so you can pin the apparent location before running a job.
- [x] **Complete anti-detection coverage** — follow browserscan.net's anti-detection checklist (fingerprints, headers, fonts, WebRTC, etc.) so automated runs mimic real browsers across task executions.
- [ ] **Session recording redaction** — add toggles to redact sensitive fields (passwords, credit cards) from recordings/logs before storing them.
- [ ] **Two-factor authentication** — add optional TOTP/second-factor support to Settings/Auth so operators can lock down the UI with 2FA.
- [ ] **Automatic self-healing selectors** — add selector fallback and recovery logic so tasks can repair broken locators after layout changes without manual intervention.
- [ ] **AI-assisted fixing** — add an “AI auto-fix” helper that suggests layout, selector, and proxy tweaks after failed runs, letting teams approve or discard the proposed changes without switching contexts.
- [ ] **Companion app** — build a lightweight companion app that mirrors critical dashboard notifications (failures, capture completions, proxy issues) so operators can stay informed without opening the full UI.
- [x] **Community presets hub** — build a marketplace where users can publish task/workspace presets, browse and download others’ submissions, and choose to offer each preset either for free or as a paid template so creators can monetize standalone workflows while keeping the free option available.
- [ ] **Database Tab / Local CRM** — add a built-in spreadsheet-like interface for viewing and managing extracted data (CRM-style) entirely within the app, without requiring external tools.
- [ ] **iframe interaction support** — add the ability to target and interact with elements inside iframes in the task editor.
- [x] **Autosave** — automatically persist task changes and editor state at regular intervals so operators don't lose work on long-running or complex workflow designs.
- [x] **Highlight tool** — add a feature to highlight elements on the page (similar to a browser's inspect tool) to easily pick selectors and build workflows.
- [x] **Cron triggers** — add support for scheduling tasks with cron expressions so workflows can run automatically on defined intervals.
- [x] **Canvas notes** — add sticky-note-style annotations to the block canvas so operators can leave freeform comments and context alongside their workflows without affecting execution.
- [ ] **Page triggers** - trigger a task automatically when a web page changes a certain way.

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


**Other ways to help:**
*   **Star** the repository to help others find it.
*   **Share** the project with your network.
*   **Contribute** to the code or documentation.
