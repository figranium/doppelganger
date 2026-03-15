## 2025-05-15 - [Timing-Safe Login Check]
**Vulnerability:** User enumeration via timing attacks in the login process.
**Learning:** The previous implementation only called `bcrypt.compare` when a user was found. Since `bcrypt.compare` is computationally expensive, attackers could distinguish between valid and invalid emails by measuring server response times.
**Prevention:** Always perform a password comparison. If the user does not exist, compare against a dummy bcrypt hash to ensure consistent latency regardless of whether the account exists.
