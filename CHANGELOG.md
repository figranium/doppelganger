# Changelog

## [0.14.2] - 2026-08-15

### Bug Fixes
- **Restore backdrop blur on modals and overlay panels in Dark and Solarized Dark themes** - A theme CSS override was force-replacing translucent `bg-black/NN` backgrounds with a fully opaque solid color regardless of whether the element also had a `backdrop-blur-*` class, defeating the blur on the Task Settings panel, the confirm modal, and several other modals/overlays. Removed the incorrect dark-theme override (light theme was already correct) and restored a translucent, theme-aware background on the confirm modal, which had separately been hardcoded to a fully opaque color.
- **Fix headful VNC session stuck in a "Reconnecting..." loop** - `start-vnc.sh` was embedding literal double-quote characters into the `x11vnc` `-passwd` argument due to unquoted shell word-splitting of an escaped-quote string, so x11vnc's actual password never matched the password handed to the noVNC client, causing every connection attempt to fail authentication and immediately disconnect. Switched to a bash array for the x11vnc arguments so the password is passed as a single unmodified argument; verified with a real RFB authentication handshake against the running container.
- **Fix proxy credentials embedded in a pasted URL not being split out** - Proxies added by pasting a full `http://user:pass@host:port` URL into the Server field stored the entire URL (credentials included) as the `server` value instead of splitting out `username`/`password`, causing the Settings > Proxies list to display the same URL twice and causing those proxies to fail upstream authentication when used in a rotation pool. `normalizeProxy` now parses embedded credentials out of `server` on both the add and bulk-import paths; existing broken entries self-heal automatically since proxy config is already re-normalized on every read.

## [0.14.1] - 2026-08-12

### Features
- **Polite value-driven GitHub Star conversion loop and social proof headers** (#342) - Added a non-intrusive `GithubStarPrompt` component that tracks starred/dismissed/opened state via `localStorage` and delays its appearance until after a successful run; clicking "I've starred it!" redirects to the GitHub repo with guidance text. Embedded inside the editor `ResultsPane` at the high-delight moment right after execution succeeds, alongside new social proof headers.

### Security
- **Cryptographically secure randomness for proxy selection and viewport sizing** - Replaced `Math.random()` with `crypto.randomInt()` in `proxy-rotation.js`'s `getNextProxy`, and in randomized viewport dimension generation in `scrape.js` and `src/agent/browser.js`, closing a CodeQL "insecure randomness" finding.
- **Harden proxy credential normalization** - `normalizeProxy` in `proxy-utils.js` now maps null/empty/undefined username and password fields to `undefined` so they're excluded from saved configs; `headful.js`, `scrape.js`, and `src/agent/browser.js` sanitize proxy option objects passed to Playwright to only include truthy credentials, preventing a null-property crash in rotating proxy pools (#341).

### Bug Fixes
- **Fix Task Settings Panel unreadable on Light and Solarized Light themes** (#340) - Made the panel theme-aware instead of using hardcoded colors.
- **Fix Docker arm64 builds and headful VNC access on Apple Silicon** (#337, #338) - Removed the redundant `npx playwright install` step since the `mcr.microsoft.com/playwright` base image already ships native per-architecture browser binaries (~1GB smaller images per platform); bound noVNC/websockify to `0.0.0.0:54311` so Docker Desktop on Apple Silicon hosts can reach the VNC port, while connecting to the VNC backend via explicit loopback IPv4 `127.0.0.1:5900` to avoid IPv4/IPv6 address-family mismatches.

### Improvements
- Added theme-aware light/dark logo variants for the Swiftproxy, SimplyNode, and Mintlify partner badges in the README; reorganized the README's Official Partners/Infrastructure Backers sections and heading hierarchy.

### Tests
- Added unit test cases to `tests/proxy-utils.test.js` covering normalization of rotating pools with falsy, null, or empty credentials.

## [0.14.0] - 2026-08-10

### Features
- **Programmatic browser & inspector API** (#334) - New authenticated endpoints expose core headful workflows for external orchestration: `POST /api/browser/open` launches or reattaches a managed headful session and returns a `sessionId`/`wsEndpoint`; `POST /api/inspector/highlight` activates the inspect overlay and returns candidate CSS/XPath selectors with confidence scores; `PATCH /api/tasks/:id` performs partial task updates with version snapshots; `DELETE /api/tasks/:id` now cleans up in-process schedules on delete. All routes support both session and API key auth (#334) and are covered by `tests/api_endpoints.test.js` (26 tests).
- **Multi-theme support** - Added Dark, Light, Solarized Light, and Solarized Dark themes (`theme.ts`, `useTheme` hook, `ThemePanel`, `ThemeIntroModal`), applied via CSS custom properties.
- **CAPTCHA/form detection engine (foundational)** - Added `src/agent/figranite/captcha/`: a DOM/shadow-DOM/iframe observer that classifies interactive elements (slider, audio, grid, rotational, distorted-text, widget-frame, form) and emits structured detection events with coordinates, a 2GB memory guardrail (`os.totalmem()` + cgroup v1/v2 limits), and typed human-handoff hooks (`onCaptchaDetected`, `pauseForHuman`, `submitSolution`) that pipe externally supplied solution coordinates into the existing mouse trajectory generator. Detection and handoff only — no automated solving logic.

### Security
- **Fix unauthenticated VNC/websockify access** - `server.js`, `start-vnc.sh`, and `public/novnc.html` updated so the noVNC/websockify proxy path requires authentication.
- **Bind websockify to IPv4 loopback explicitly** (#335) - Avoids IPv6/IPv4 loopback mismatches inside Docker on Mac that could cause the VNC stream to bind unexpectedly.
- **Path traversal sanitization for sessionId** - Added strict validation for `sessionId` and `taskId` before use in file lookups.
- **Enforce strict raw-cron range and ordering validation** (#324) - Closes an edge case where malformed cron ranges could pass validation.
- Fixed CodeQL alerts surfaced across the browser/session and cron-validation code paths (#325, #322).

### Bug Fixes
- **Fix local loopback WebSocket disconnects on Mac/Docker** (#331, #333) - Resolved dropped WebSocket connections and a loading-state flash in `HeadfulModal` affecting Mac/Docker hosts.
- **Resolve path mismatch for generated captures** (#336) - Captures generated during a run were not reliably surfacing in the frontend; capture lookup now matches the actual write path.
- **Fix captures not surfacing in Docker** - `server.js` and `src/server/routes/data.js` now serve/read captures from both `public/captures` locations.
- **Persist captures to a host volume** - Captures survive container restarts; runtime capture artifacts were untracked from git.
- **Fix theme-switching contrast regressions** - Corrected an invisible canvas dot-grid on light themes, buttons rendering white-on-white text under theme-accent backgrounds, and unreadable hardcoded blue accent text; retuned syntax/code colors across all four themes for WCAG AA contrast.
- Resolved an illegal `return` statement bug in custom JS actions and corrected outdated test imports.

### Improvements
- **Persistent browser session storage** - Session IDs now persist across reconnects instead of being regenerated per session.
- **Demo assets** (#328, #329) - Recorded and embedded an updated demo GIF/video of typical Figranium usage; automated future walkthrough generation.
- **Exported task filename** (#330) - Task export filename pattern changed from `doppelganger-tasks` to `figranium-tasks`.
- Replaced JetBrains Mono with Space Mono across CSS/Tailwind config; added Algolia logo to README; synchronized `package-lock.json` with `package.json` to fix `npm ci` failures (#326).

### Tests
- Added a comprehensive end-to-end user journey test with Playwright (#327).
- Added `tests/api_endpoints.test.js` (26 tests) covering the new programmatic browser/inspector/task API surface.
- Added unit tests for the new CAPTCHA memory guard and DOM detection/routing observer.

## [0.13.2] - 2026-08-05

### Features
- **Programmatic API endpoints (initial cut)** - Introduced the browser launcher, highlight inspector, task update, and task deletion endpoints later hardened with auth in 0.14.0.

### Improvements
- **Demo walkthrough automation** (#328, #329) - Recorded and embedded high-quality demo video/GIF walkthroughs.
- **Exported task filename** (#330) - Changed exported task filename prefix from `doppelganger-tasks` to `figranium-tasks`.
- Replaced JetBrains Mono with Space Mono from Google Fonts across CSS and Tailwind configuration.

### Tests
- Added a comprehensive E2E user journey test with Playwright (#327).

## [0.13.1] - 2026-07-30

### Security
- **Fix unauthenticated VNC and websockify access** - Closed a path where the noVNC/websockify proxy could be reached without authentication.
- **CodeQL alert remediation** (#325, #322) - Addressed static-analysis findings across session and browser handling code.
- **Path traversal sanitization** - Added sanitization for `sessionId` and strict validation for `taskId` before use in fetches.
- **Enforce strict raw-cron range and ordering validation** (#324) - Prevents malformed cron field ranges/ordering from being accepted.

### Bug Fixes
- **Persistent session ID storage** - Browser session IDs are now persisted rather than regenerated each session.
- Fixed outdated test imports and an illegal `return` statement bug in custom JS actions.
- Fixed search bar overlapping import/export buttons on tablet viewports.

### Improvements
- Improved Dashboard header responsiveness for iPad (#320).
- Synchronized `package-lock.json` with `package.json` direct dependencies to fix `npm ci` failures (#326).
- README cleanup: added sponsors/backers section, updated logo, removed unused `public/logo.png`/`public/icon.png`.

## [0.13.0] - 2026-06-29

### Critical Architectural Pivot
* **Retired NPM Distribution:** The figranium NPM package is officially retired. Local Node.js and Playwright binary management are no longer supported.
* **Strict Containerization:** Figranium has migrated entirely to an isolated Docker-first architecture. The full Express backend, Vite/React UI, and execution layers are now deployed together via uniform container sandboxes to guarantee 100% execution determinism across all environments.

### Core Backend & Engine Fixes
* **Restored AI Selector Generation:** Fixed a silent backend orchestration failure that caused the legacy AI selector tool to stall. The engine now reliably analyzes DOM structural fragments and returns clean, human-readable selector strings.
* **Added Selector Mode Toggle:** Introduced a configuration switch directly inside the action block panel. Users can now seamlessly toggle between AI Selector Generation Mode for rapid prototyping and the Native Browser Selection Tool for exact viewport inspection.
* **Codebase Optimization:** Executed a massive code refactor to strip out dead utility paths, unused backend modules, and legacy NPM setup configurations.

### UI & Layout Ergonomics
* **Tablet Layout Responsiveness:** Resolved an interface bug on tablet and iPad viewports where the dashboard header container compressed elements. The task filter search bar and export action buttons now utilize responsive breakpoints to prevent layout overlaps.

### Database Infrastructure Enhancements
* **Schema Robustness:** Updated API key columns in src/server/db.js from VARCHAR(255) to TEXT, including automated migration logic to update existing installations seamlessly.
* **Feature Parity:** Implemented missing table definitions and storage logic for Ollama API keys, Credentials, AI Models, and Proxy configurations to ensure full parity with disk-based storage.
* **Cloud SSL Support:** Integrated PostgreSQL SSL support toggled via the DB_POSTGRESDB_SSL environment variable, enabling secure connections to managed cloud database providers like Aiven.
* **Architectural Integration:** Refactored proxy-rotation.js to natively support database storage and integrated the routine directly into the main application initialization flow within server.js.
* **Integration Testing:** Added tests/db-integration.test.js using a mocked PostgreSQL pool to thoroughly verify database interactions across all storage modules.

## [0.12.2] - 2026-04-11

### Security
- **Ollama SSRF hardening** (#284) - Settings and task routes now validate Ollama configuration and API targets more strictly, preventing unsafe outbound requests to internal hosts.

### Performance
- **Cron next-run calculation** (#285) - `src/server/cron-parser.js` now calculates the next execution time more efficiently, with a dedicated regression/perf test added in `tests/cron-perf.test.js`.
- **Sandbox proxy optimization** (#282) - Browser sandbox proxy handling was streamlined for better identity handling and lower overhead in extraction flows.

### Improvements
- **Block editing interactions** - Blocks now open their settings on double-click, while the block type label uses a short click delay so a second click can switch from the action palette to block settings. The tweaked interaction keeps single-click type changes responsive without stealing the double-click path.
- **Shortcut discoverability and task card actions** (#283) - Task card and sidebar keyboard cues were polished to make action discovery more obvious from the dashboard.
- **TypeScript config cleanup** - `tsconfig.json` was adjusted to resolve a lint/type-check issue uncovered during the release cycle.

### Tests
- Added `tests/cron-perf.test.js` to guard the cron scheduler optimization.

## [0.12.1] - 2026-04-08

### Security
- **Block `host.docker.internal` in SSRF protection** (#275) - `url-utils.js` updated to explicitly reject this host even when `ALLOW_PRIVATE_NETWORKS` is enabled, preventing potential internal network probes via Docker bridges.
- **Stricter network defaults** - `ALLOW_PRIVATE_NETWORKS` is now disabled by default.

### Features
- **Global AI model settings** - Added support for configuring default AI providers (OpenAI, Anthropic, Gemini, etc.) site-wide in system settings.
- **`get_content` action** - New built-in action to extract full page content (HTML, text, or markdown) directly without custom extraction scripts.
- **Extractor worker migration** - Extraction scripts now run in a dedicated worker for better isolation and performance.

### Performance
- **Vite Upgrade** - Upgraded to Vite 7.3.2 for improved build performance and security.

### Improvements
- **Capture cleanup** (#276) - Recordings are now automatically deleted when clearing captures in system settings.
- **Code health** (#272) - Reduced scheduler log noise by removing unnecessary startup/shutdown logs.
- **Environment consistency** - Renamed internal environment variables for Playwright installation for improved clarity.

### Tests
- Added comprehensive test suite for the **Execution Queue Limiter** (#271).

## [0.12.0] - 2026-04-07

### Performance
- **PostgreSQL Optimization** (#264) - Implemented in-memory counters for execution logging to significantly reduce DB pressure during high-concurrency workloads.
- **Finalization Optimization** (#262) - Streamlined agent execution finalization process to reduce overhead and latency.
- **Dashboard Rendering** (#259) - Extracted and memoized `TaskCard` components to improve Dashboard responsiveness with large task libraries.

### Improvements
- **Shortcuts & Navigation** (#257, #260) - Added `Ctrl+Enter` shortcut to run tasks directly from the editor or action palette.
- **UI Consistency** (#255) - Implemented standardized `Escape` key dismissal for all major editor overlays (Settings, Palette, Context Menus, etc.).
- **Capture Management** (#253) - Enhanced the captures UI with icon-only action bars, visual type indicators (photo/video), and background loading states.

## [0.11.4] - 2026-04-01

### Security
- **[HIGH] Fix SSRF via webhook redirects** (#237) - Playwright navigation and redirect handling in `scrape.js`, `headful.js`, `server.js`, and `src/agent/browser.js` now validates destination URLs through `validateUrl` before following redirects, closing a vector where a crafted page could redirect the browser to an internal network address. `url-utils.js` gained comprehensive redirect-chain validation with a new test suite (`tests/sentinel_ssrf_verification.js`).
- **[HIGH] Harden session security and protect status endpoints** (#241) - Session cookies are now issued with `httpOnly: true` to mitigate XSS-based session theft. `GET /api/headful/status` now requires authentication (previously unauthenticated). `Strict-Transport-Security` (HSTS) headers are set automatically when secure cookies are enabled.
- **Fix SSRF in Baserow output provider and credentials route** (#244) - `src/server/outputProviders/baserow.js` and `src/server/routes/credentials.js` now route all outbound requests through `validateUrl`, preventing a workflow author from pointing the Baserow provider at an internal host. Extended SSRF test coverage added to `tests/sentinel_ssrf_verification.js`; added `tests/repro_baserow_ssrf.js` as a standalone regression test.
- **[HIGH] Fix sandbox escape via getPrototypeOf** (#248) - `src/agent/sandbox.js` now installs a `getPrototypeOf` trap on the security proxy, blocking the `Object.getPrototypeOf(proxy).constructor` escape path that could have allowed extraction scripts to reach the host Node.js environment. Regression test added in `tests/sandbox_escape_v3.test.js`.

### Features
- **Dashboard task search** (#250) - A search bar (shortcut `/`) appears in the Dashboard header. Tasks are filtered live by name or URL using a case-insensitive `useMemo` match. Includes a "Clear" button and a "No matching tasks" empty state. Fully keyboard-accessible with `aria-label` and focus management.
- **Activity Log copy button** (#243) - A one-click Copy button appears in the ResultsPane Activity Log tab, making it easy to capture the full execution log for debugging or sharing.
- **Dashboard quick-copy URL** (#247) - A copy-URL button appears on hover/focus on each task card in the Dashboard, allowing the task's target URL to be copied without opening the editor. Missing `aria-label`/`title` attributes added to Export, Import, and New Task buttons.

### Performance
- **Task list API payload** (#235) - `GET /api/tasks/list` no longer serializes the full version history of each task. Version data is already fetched on demand inside the editor, so stripping it from the list response significantly reduces payload size and server/client memory pressure on large task libraries.
- **Editor history serialization** (#238) - `useEditorHistory` now uses a more efficient diffing strategy, measurably reducing serialization overhead for tasks with large action lists.
- **Agent execution loop** (#239) - `actionContext` construction is fully hoisted outside the inner execution loop in `src/agent/index.js`, eliminating repeated allocations on every action step.
- **Syntax highlighting** (#242) - `src/utils/syntaxHighlight.ts` rewritten to avoid redundant regex passes; produces the same output with less CPU time on large token streams.
- **ResultsPane large string handling** (#245) - Long result strings are now truncated before being passed into the renderer, preventing the UI thread from blocking on huge payloads.
- **ResultsPane large data preview** (#249) - Object/array previews in ResultsPane are capped before JSON serialization, keeping the panel responsive even when results contain thousands of records.
- **Table data detection and header discovery** (#252) - `getTableData` now samples the first 200 items (matching the preview limit) for type detection instead of scanning the full array, and uses a `Set` for header tracking. Benchmarks show ~70x speedup for detection on 100 000-item arrays (3.24 ms to 0.04 ms); header discovery is now O(K) instead of O(K*H).

### Bug Fixes
- **Sticky notes: multi-move, color fix, plain-text display** - Rubber-band-selecting multiple sticky notes and dragging now moves all selected notes together. Color-swatch clicks no longer dismiss edit mode (mousedown `preventDefault`). Note body renders as plain monospace text rather than Markdown (markdown display caused confusing interactions with the editor's own markdown fields).

### Improvements
- **Action Palette UX and accessibility** (#236) - `aria-label` added to the search input; `title`/`aria-label` added to the Close and Clear buttons; auto-focus behaviour corrected to avoid interfering with screen readers; `Escape` key now dismisses the palette cleanly; focus rings made consistent with the rest of the editor.
- **StickyNote accessibility and micro-UX** (#240) - Keyboard focus and ARIA roles added to sticky note interactive elements; color picker interaction polished.
- **RichInput accessibility** (#243) - ARIA attributes added to the custom `RichInput` component; focus-visible rings added to all interactive sub-elements.
- **Canvas background contrast** - Canvas grid dots lowered in contrast for a less visually noisy editing surface.

## [0.11.3] - 2026-03-25

### Features
- **Task Descriptions** - Tasks now support an optional `description` field. Edit it in the Task Settings panel (always visible above the tab bar). The description renders on the canvas inside the trigger card and is included in the `GET /api/tasks/list` response so AI agents and operators have context without fetching the full task.

## [0.11.2] - 2026-03-24

### Features
- **Sticky Notes on Canvas** - Right-click the canvas background to add sticky notes. Notes support full Markdown rendering (headings, bold, italic, code, lists, tables, etc.), are draggable and resizable, and sit on the layer below blocks. Available in five colors: default, yellow, pink, green, and purple. Positions and sizes are stored as integers in canvas world coordinates. Sticky notes participate in the rubber-band selection tool and support Ctrl+C / Ctrl+V copy-paste alongside blocks.

### Improvements
- **Editor Performance** - Excluded `versions` from task snapshot stringification for a ~23x speedup in change detection. Wrapped `ActionItem` in `React.memo` and stabilized callbacks in `EditorScreen`/`CanvasView` to eliminate unnecessary re-renders.
- **Agent Execution Loop** - Hoisted static `actionOptions` and `actionContext` construction outside the main execution loop, reducing per-step overhead by ~32% and lowering GC pressure on long-running tasks.
- **Trigger Header Accessibility** - Converted the "On Execution" trigger header from a `div` to a semantic `<button>` with `aria-expanded`, `aria-label`, `title`, and keyboard focus ring support.
- **Password Input Accessibility** - Added a visibility toggle to password fields.

### Security
- **[CRITICAL] Fix Sandbox Escape in Extraction Scripts** - Fixed a proxy bypass in `src/agent/sandbox.js` that allowed extraction scripts to escape the sandbox via unproxied `this` in callbacks.
- **API Key Endpoint Hardening** - Fixed a missing `await` on `saveApiKey`, added 512-character input length validation, and applied CSRF protection and rate limiting middleware to all state-changing settings endpoints.

## [0.11.1] - 2026-03-22

### Security
- **[HIGH] Fix Cross-Site WebSocket Hijacking (CSWSH)** - WebSocket upgrade handler now validates the `Origin` header against the server's host. Added `isValidWebSocketOrigin` utility to `url-utils.js` and a dedicated test suite to verify the protection.
- **[MEDIUM] Harden internal auth bypass against IP spoofing** - `requireApiKey` now reads `req.socket.remoteAddress` for loopback verification instead of `X-Forwarded-For`, preventing external attackers from bypassing the local-agent whitelist when `TRUST_PROXY` is enabled.
- **Remove vulnerable `openssl` npm package** - dependency removed; it was unused in application code and had a known CVE (GHSA-75w2-qv55-x7fv).

### Features
- **FigClaw integration layer** - foundational backend infrastructure for FigClaw to use Figranium as a programmatic execution backend:
  - `GET /api/health` endpoint with DB connectivity check.
  - Graceful SIGTERM/SIGINT shutdown (flushes in-flight executions, stops scheduler, closes DB).
  - Execution concurrency limiter (`MAX_CONCURRENT_EXECUTIONS` env var; unlimited by default).
  - Completion webhook: optional `webhookUrl` on `POST /tasks/:id/api` (SSRF-validated).
  - Task CRUD endpoints now accept API key auth alongside session auth.
  - `flushExecutions()` added to the storage layer for safe shutdown of debounced writes.
- **Proxies Panel UX enhancement** - loading state and input validation on "Add Proxy", focus-visible rings on all interactive buttons, descriptive ARIA labels and tooltips on icon-only actions.
- **Cookies Panel accessibility improvements** - standardized focus-visible rings, `aria-label`/`title` attributes on all action buttons, integrated `CopyButton` per cookie row, cookie value toggle converted to a semantic `<button>` with `aria-expanded`.
- **Updated page title** - title changed to "Figranium | Build complex browser workflows visually" to better reflect product positioning.

### Improvements
- **Optimize task serialization for change detection** - replaced `JSON.parse(JSON.stringify())` in `serializeTaskSnapshot` with object destructuring, yielding ~5x faster change detection with no allocation overhead.

## [0.11.0] - 2026-03-19

### Security
- **[HIGH] Fix protocol validation bypass in `validateUrl`** - protocols were not being checked strictly, allowing potential SSRF via alternative schemes.
- **Harden SSRF protection** - additional edge-case coverage for IPv6 and private-network ranges in `isPrivateIP` / `validateUrl`.
- **Login timing-safety** - timing-safe comparison now used across all login checks to prevent user-enumeration via response-time differences.
- **Standardize accessibility and focus states for global overlays** - keyboard focus is no longer lost or trapped unexpectedly in modal overlays.

### Features
- **Switch primary font to Questrial** - replaced Geologica with Questrial site-wide for a cleaner, more legible aesthetic.
- **Disable font synthesis** - prevent browsers from artificially bolding/italicising Questrial, preserving its intended rendering.
- **Auto-enable inspect mode** - opening a headful session for selector finding now automatically activates inspect mode, removing a manual step.
- **Optimize task cloning for versioning** - task clone operations are now significantly faster and produce leaner copies.
- **Larger page headings** - Dashboard, Run History, Settings, and Captures screen headings increased from `text-base` to `text-2xl`.

### Bug Fixes
- **Fix headful session and agent handoff** - a null browser reference caused headful sessions to fail silently; reference is now guarded correctly.
- **Fix inspect-mode click interception** - clicks in headful mode were being swallowed by the inspect overlay when it should not have been active.
- **Fix URL variable interpolation in headful mode** - variables resolving to objects were being coerced to `[object Object]` instead of their string value.
- **Fix headful modal sizing, context menu dismissal, and selector finder heuristics** - several UX regressions in the headful UI corrected in one pass.

### Improvements
- **Restyle screen headings** - page-level titles moved to minimal all-caps uppercase labels for a more refined look, now also larger.
- **Standardize accessibility roles** - `role`, `aria-*`, and focus-visible styles audited and normalised across ActionItem, tabs, and editor CTAs.
- **Remove unused `memo` import in ActionItem** - dead import and its wrapper removed; no behavioural change.


