## 2026-03-04 - [Security: Unsafe execSync for Session Secret]
**Vulnerability:** Use of `execSync` to shell out to `openssl` for session secret generation.
**Learning:** Shelling out to external binaries for cryptographic operations is unnecessary when Node.js has a built-in `crypto` module. It introduces risks of command injection (though not directly exploitable here as the command was static) and unnecessary overhead/dependencies.
**Prevention:** Use `crypto.randomBytes()` for all cryptographic random generation needs within the Node.js environment.

## 2026-03-05 - [Security: Authentication Bypass for Settings in Development]
**Vulnerability:** The `requireAuthForSettings` middleware was bypassing authentication checks if `NODE_ENV` was not set to `'production'`.
**Learning:** Hardcoding security bypasses based on environment variables can lead to unintended exposure if the environment is misconfigured or if development builds are accessible over a network.
**Prevention:** Avoid environment-based security bypasses for sensitive operations. If local development requires ease of access, use dedicated development mocks or local-only listeners rather than bypassing auth in shared middleware.

## 2026-03-06 - [Security: Path Traversal in runId for Captures]
**Vulnerability:** User-provided `runId` was used directly in screenshot and recording filenames, allowing attackers to write files outside the `public/captures` directory using `../` sequences.
**Learning:** Any user input that influences file system paths MUST be strictly sanitized or validated against a whitelist of allowed characters. Even if the base directory is hardcoded, relative path components in the input can escape it.
**Prevention:** Centralize sanitization for identifiers that map to file paths. Use a restrictive whitelist (e.g., `/[^a-zA-Z0-9_-]/g`) to strip potentially dangerous characters like dots and slashes.

## 2026-03-07 - [Security: Synchronous Sandbox Denial of Service]
**Vulnerability:** Use of `vm.runInContext` without a timeout allowed infinite loops in user-provided scripts to block the Node.js event loop.
**Learning:** The `vm` module in Node.js is synchronous. If a script executed via `vm.runInContext` enters an infinite loop, it will hang the entire process.
**Prevention:** Always provide a `timeout` option to `vm` methods (`runInContext`, `runInNewContext`, `runInThisContext`) when executing untrusted or user-provided code.
