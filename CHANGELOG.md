# Changelog

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
