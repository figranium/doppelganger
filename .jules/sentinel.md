## 2026-03-04 - [Security: Unsafe execSync for Session Secret]
**Vulnerability:** Use of `execSync` to shell out to `openssl` for session secret generation.
**Learning:** Shelling out to external binaries for cryptographic operations is unnecessary when Node.js has a built-in `crypto` module. It introduces risks of command injection (though not directly exploitable here as the command was static) and unnecessary overhead/dependencies.
**Prevention:** Use `crypto.randomBytes()` for all cryptographic random generation needs within the Node.js environment.

## 2026-03-05 - [Security: Authentication Bypass for Settings in Development]
**Vulnerability:** The `requireAuthForSettings` middleware was bypassing authentication checks if `NODE_ENV` was not set to `'production'`.
**Learning:** Hardcoding security bypasses based on environment variables can lead to unintended exposure if the environment is misconfigured or if development builds are accessible over a network.
**Prevention:** Avoid environment-based security bypasses for sensitive operations. If local development requires ease of access, use dedicated development mocks or local-only listeners rather than bypassing auth in shared middleware.
