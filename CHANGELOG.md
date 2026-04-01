# Changelog

## [0.11.4] - 2026-04-01

### Security
- **[HIGH] Fix SSRF via webhook redirects** (#237) — Playwright navigation and redirect handling in `scrape.js`, `headful.js`, `server.js`, and `src/agent/browser.js` now validates destination URLs through `validateUrl` before following redirects, closing a vector where a crafted page could redirect the browser to an internal network address. `url-utils.js` gained comprehensive redirect-chain validation with a new test suite (`tests/sentinel_ssrf_verification.js`).
- **[HIGH] Harden session security and protect status endpoints** (#241) — Session cookies are now issued with `httpOnly: true` to mitigate XSS-based session theft. `GET /api/headful/status` now requires authentication (previously unauthenticated). `Strict-Transport-Security` (HSTS) headers are set automatically when secure cookies are enabled.
- **Fix SSRF in Baserow output provider and credentials route** (#244) — `src/server/outputProviders/baserow.js` and `src/server/routes/credentials.js` now route all outbound requests through `validateUrl`, preventing a workflow author from pointing the Baserow provider at an internal host. Extended SSRF test coverage added to `tests/sentinel_ssrf_verification.js`; added `tests/repro_baserow_ssrf.js` as a standalone regression test.
- **[HIGH] Fix sandbox escape via getPrototypeOf** (#248) — `src/agent/sandbox.js` now installs a `getPrototypeOf` trap on the security proxy, blocking the `Object.getPrototypeOf(proxy).constructor` escape path that could have allowed extraction scripts to reach the host Node.js environment. Regression test added in `tests/sandbox_escape_v3.test.js`.

### Features
- **Dashboard task search** (#250) — A search bar (shortcut `/`) appears in the Dashboard header. Tasks are filtered live by name or URL using a case-insensitive `useMemo` match. Includes a "Clear" button and a "No matching tasks" empty state. Fully keyboard-accessible with `aria-label` and focus management.
- **Activity Log copy button** (#243) — A one-click Copy button appears in the ResultsPane Activity Log tab, making it easy to capture the full execution log for debugging or sharing.
- **Dashboard quick-copy URL** (#247) — A copy-URL button appears on hover/focus on each task card in the Dashboard, allowing the task's target URL to be copied without opening the editor. Missing `aria-label`/`title` attributes added to Export, Import, and New Task buttons.

### Performance
- **Task list API payload** (#235) — `GET /api/tasks/list` no longer serializes the full version history of each task. Version data is already fetched on demand inside the editor, so stripping it from the list response significantly reduces payload size and server/client memory pressure on large task libraries.
- **Editor history serialization** (#238) — `useEditorHistory` now uses a more efficient diffing strategy, measurably reducing serialization overhead for tasks with large action lists.
- **Agent execution loop** (#239) — `actionContext` construction is fully hoisted outside the inner execution loop in `src/agent/index.js`, eliminating repeated allocations on every action step.
- **Syntax highlighting** (#242) — `src/utils/syntaxHighlight.ts` rewritten to avoid redundant regex passes; produces the same output with less CPU time on large token streams.
- **ResultsPane large string handling** (#245) — Long result strings are now truncated before being passed into the renderer, preventing the UI thread from blocking on huge payloads.
- **ResultsPane large data preview** (#249) — Object/array previews in ResultsPane are capped before JSON serialization, keeping the panel responsive even when results contain thousands of records.
- **Table data detection and header discovery** (#252) — `getTableData` now samples the first 200 items (matching the preview limit) for type detection instead of scanning the full array, and uses a `Set` for header tracking. Benchmarks show ~70× speedup for detection on 100 000-item arrays (3.24 ms → 0.04 ms); header discovery is now O(K) instead of O(K·H).

### Bug Fixes
- **Sticky notes: multi-move, color fix, plain-text display** — Rubber-band-selecting multiple sticky notes and dragging now moves all selected notes together. Color-swatch clicks no longer dismiss edit mode (mousedown `preventDefault`). Note body renders as plain monospace text rather than Markdown (markdown display caused confusing interactions with the editor's own markdown fields).

### Improvements
- **Action Palette UX and accessibility** (#236) — `aria-label` added to the search input; `title`/`aria-label` added to the Close and Clear buttons; auto-focus behaviour corrected to avoid interfering with screen readers; `Escape` key now dismisses the palette cleanly; focus rings made consistent with the rest of the editor.
- **StickyNote accessibility and micro-UX** (#240) — Keyboard focus and ARIA roles added to sticky note interactive elements; color picker interaction polished.
- **RichInput accessibility** (#243) — ARIA attributes added to the custom `RichInput` component; focus-visible rings added to all interactive sub-elements.
- **Canvas background contrast** — Canvas grid dots lowered in contrast for a less visually noisy editing surface.

## [0.11.3] - 2026-03-25

### Features
- **Task Descriptions** — Tasks now support an optional `description` field. Edit it in the Task Settings panel (always visible above the tab bar). The description renders on the canvas inside the trigger card and is included in the `GET /api/tasks/list` response so AI agents and operators have context without fetching the full task.

## [0.11.2] - 2026-03-24

### Features
- **Sticky Notes on Canvas** — Right-click the canvas background to add sticky notes. Notes support full Markdown rendering (headings, bold, italic, code, lists, tables, etc.), are draggable and resizable, and sit on the layer below blocks. Available in five colors: default, yellow, pink, green, and purple. Positions and sizes are stored as integers in canvas world coordinates. Sticky notes participate in the rubber-band selection tool and support Ctrl+C / Ctrl+V copy-paste alongside blocks.

### Improvements
- **Editor Performance** — Excluded `versions` from task snapshot stringification for a ~23× speedup in change detection. Wrapped `ActionItem` in `React.memo` and stabilized callbacks in `EditorScreen`/`CanvasView` to eliminate unnecessary re-renders.
- **Agent Execution Loop** — Hoisted static `actionOptions` and `actionContext` construction outside the main execution loop, reducing per-step overhead by ~32% and lowering GC pressure on long-running tasks.
- **Trigger Header Accessibility** — Converted the "On Execution" trigger header from a `div` to a semantic `<button>` with `aria-expanded`, `aria-label`, `title`, and keyboard focus ring support.
- **Password Input Accessibility** — Added a visibility toggle to password fields.

### Security
- **[CRITICAL] Fix Sandbox Escape in Extraction Scripts** — Fixed a proxy bypass in `src/agent/sandbox.js` that allowed extraction scripts to escape the sandbox via unproxied `this` in callbacks.
- **API Key Endpoint Hardening** — Fixed a missing `await` on `saveApiKey`, added 512-character input length validation, and applied CSRF protection and rate limiting middleware to all state-changing settings endpoints.

## [0.11.1] - 2026-03-22

### Security
- **[HIGH] Fix Cross-Site WebSocket Hijacking (CSWSH)** — WebSocket upgrade handler now validates the `Origin` header against the server's host. Added `isValidWebSocketOrigin` utility to `url-utils.js` and a dedicated test suite to verify the protection.
- **[MEDIUM] Harden internal auth bypass against IP spoofing** — `requireApiKey` now reads `req.socket.remoteAddress` for loopback verification instead of `X-Forwarded-For`, preventing external attackers from bypassing the local-agent whitelist when `TRUST_PROXY` is enabled.
- **Remove vulnerable `openssl` npm package** — dependency removed; it was unused in application code and had a known CVE (GHSA-75w2-qv55-x7fv).

### Features
- **FigClaw integration layer** — foundational backend infrastructure for FigClaw to use Figranium as a programmatic execution backend:
  - `GET /api/health` endpoint with DB connectivity check.
  - Graceful SIGTERM/SIGINT shutdown (flushes in-flight executions, stops scheduler, closes DB).
  - Execution concurrency limiter (`MAX_CONCURRENT_EXECUTIONS` env var; unlimited by default).
  - Completion webhook: optional `webhookUrl` on `POST /tasks/:id/api` (SSRF-validated).
  - Task CRUD endpoints now accept API key auth alongside session auth.
  - `flushExecutions()` added to the storage layer for safe shutdown of debounced writes.
- **Proxies Panel UX enhancement** — loading state and input validation on "Add Proxy", focus-visible rings on all interactive buttons, descriptive ARIA labels and tooltips on icon-only actions.
- **Cookies Panel accessibility improvements** — standardized focus-visible rings, `aria-label`/`title` attributes on all action buttons, integrated `CopyButton` per cookie row, cookie value toggle converted to a semantic `<button>` with `aria-expanded`.
- **Updated page title** — title changed to "Figranium | Build complex browser workflows visually" to better reflect product positioning.

### Improvements
- **Optimize task serialization for change detection** — replaced `JSON.parse(JSON.stringify())` in `serializeTaskSnapshot` with object destructuring, yielding ~5× faster change detection with no allocation overhead.

## [0.11.0] - 2026-03-19

### Security
- **[HIGH] Fix protocol validation bypass in `validateUrl`** — protocols were not being checked strictly, allowing potential SSRF via alternative schemes.
- **Harden SSRF protection** — additional edge-case coverage for IPv6 and private-network ranges in `isPrivateIP` / `validateUrl`.
- **Login timing-safety** — timing-safe comparison now used across all login checks to prevent user-enumeration via response-time differences.
- **Standardize accessibility and focus states for global overlays** — keyboard focus is no longer lost or trapped unexpectedly in modal overlays.

### Features
- **Switch primary font to Questrial** — replaced Geologica with Questrial site-wide for a cleaner, more legible aesthetic.
- **Disable font synthesis** — prevent browsers from artificially bolding/italicising Questrial, preserving its intended rendering.
- **Auto-enable inspect mode** — opening a headful session for selector finding now automatically activates inspect mode, removing a manual step.
- **Optimize task cloning for versioning** — task clone operations are now significantly faster and produce leaner copies.
- **Larger page headings** — Dashboard, Run History, Settings, and Captures screen headings increased from `text-base` to `text-2xl`.

### Bug Fixes
- **Fix headful session and agent handoff** — a null browser reference caused headful sessions to fail silently; reference is now guarded correctly.
- **Fix inspect-mode click interception** — clicks in headful mode were being swallowed by the inspect overlay when it should not have been active.
- **Fix URL variable interpolation in headful mode** — variables resolving to objects were being coerced to `[object Object]` instead of their string value.
- **Fix headful modal sizing, context menu dismissal, and selector finder heuristics** — several UX regressions in the headful UI corrected in one pass.

### Improvements
- **Restyle screen headings** — page-level titles moved to minimal all-caps uppercase labels for a more refined look, now also larger.
- **Standardize accessibility roles** — `role`, `aria-*`, and focus-visible styles audited and normalised across ActionItem, tabs, and editor CTAs.
- **Remove unused `memo` import in ActionItem** — dead import and its wrapper removed; no behavioural change.
