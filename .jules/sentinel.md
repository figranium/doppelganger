## 2025-05-15 - [Timing-Safe Login Check]
**Vulnerability:** User enumeration via timing attacks in the login process.
**Learning:** The previous implementation only called `bcrypt.compare` when a user was found. Since `bcrypt.compare` is computationally expensive, attackers could distinguish between valid and invalid emails by measuring server response times.
**Prevention:** Always perform a password comparison. If the user does not exist, compare against a dummy bcrypt hash to ensure consistent latency regardless of whether the account exists.

## 2025-05-22 - [TaskId Path Traversal in Agent]
**Vulnerability:** Path traversal in agent `start` action allowing auth bypass of internal endpoints.
**Learning:** The agent's `start` action used user-provided task IDs to construct internal API URLs. Since internal requests from loopback can bypass authentication via `x-internal-run: 1`, an attacker could use path traversal (e.g., `../../api/clear-cookies?`) to trigger administrative actions.
**Prevention:** Always sanitize IDs and slugs used in URL construction, especially for internal or administrative API calls. Reusing existing sanitization utilities (like `sanitizeRunId`) ensures consistency across the codebase.

## 2025-05-23 - [Incomplete Protocol Validation Bypass]
**Vulnerability:** URL protocol validation bypass when `ALLOW_PRIVATE_NETWORKS` is enabled.
**Learning:** The `validateUrl` utility implemented an early return for the `ALLOW_PRIVATE_NETWORKS` flag, which bypassed all subsequent checks including the protocol whitelist (only allowing `http:` and `https:`). This enabled attackers to use dangerous protocols like `file://` or `javascript:` even when the intention was only to allow private IP ranges.
**Prevention:** Whitelist-based security checks (like protocol validation) should always be performed before any conditional bypasses to ensure a secure-by-default posture.

## 2025-05-24 - [Loopback Bypass via Header Spoofing]
**Vulnerability:** Authentication bypass for internal endpoints using spoofed `X-Forwarded-For` headers.
**Learning:** The `isLoopback` check in `requireApiKey` relied on `req.ip`. When `TRUST_PROXY` is enabled, `req.ip` is derived from headers like `X-Forwarded-For`, which can be spoofed by external clients to bypass the API key requirement intended for local agents.
**Prevention:** Use `req.socket.remoteAddress` instead of `req.ip` for security-sensitive loopback checks, as it represents the actual TCP connection source and is not influenced by proxy headers.

## 2025-06-05 - [Cross-Site WebSocket Hijacking (CSWSH)]
**Vulnerability:** Authenticated WebSocket connections were susceptible to hijacking via malicious cross-site requests.
**Learning:** WebSocket upgrades (the HTTP `upgrade` event) do not automatically enforce the Same-Origin Policy (SOP). While browsers include the `Origin` header, the server must explicitly validate it against the expected `Host` to prevent cross-site hijacking of authenticated sockets.
**Prevention:** Always implement an explicit `Origin` vs `Host` check in the `upgrade` handler for browser-accessible WebSocket endpoints. Refactoring this check into a shared utility like `isValidWebSocketOrigin` promotes consistent security across multiple upgrade paths (e.g., standard API and NoVNC/websockify).
