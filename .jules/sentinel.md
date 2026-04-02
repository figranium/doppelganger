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

## 2025-06-15 - [Loose Auth Input Validation]
**Vulnerability:** Authentication endpoints (/setup and /login) accepted non-string inputs and excessively long strings, potentially leading to DoS or unexpected behavior in hashing functions.
**Learning:** While the login process had timing-safe password checks, it lacked strict type and length validation for inputs. Attackers could send objects or extremely large payloads that might bypass certain checks or exhaust resources. Additionally, failure to maintain timing safety for requests rejected during initial validation could still leak account existence.
**Prevention:** Implement strict type checks (typeof === 'string') and length limits (e.g., 100-256 characters) for all authentication inputs. When rejecting inputs for validation failures in the login path, perform a dummy hashing operation to maintain a consistent timing profile.

## 2025-06-20 - [Sandbox Escape via "this" Context]
**Vulnerability:** Sandbox escape in extraction scripts via unproxied `this` in callback wrappers.
**Learning:** The `createSafeProxy` implementation wrapped arguments and return values but failed to wrap the `this` context when a host function invoked a sandboxed callback. This allowed the sandbox to access the raw host object and its `constructor`, eventually reaching the host's global scope (e.g., `this.constructor.constructor('return process')()`).
**Prevention:** Always wrap the `this` context with the security proxy before applying callbacks passed from a sandbox to host functions. Consistently applying this pattern across `get`, `apply`, and `construct` traps ensures a robust security boundary.

## 2025-06-25 - [Insecure Default for Private Network Access]
**Vulnerability:** Server-Side Request Forgery (SSRF) risk due to insecure default configuration.
**Learning:** The `ALLOW_PRIVATE_NETWORKS` flag defaulted to `true` because its logic (`!['0', 'false', 'no'].includes(...)`) treated an unset environment variable as an opt-in. This bypassed SSRF protections for internal IP ranges (localhost, 10.0.0.0/8, etc.) out of the box.
**Prevention:** Always use an explicit whitelist (e.g., `['1', 'true', 'yes'].includes(...)`) for security-sensitive feature flags to ensure a "secure by default" posture.
