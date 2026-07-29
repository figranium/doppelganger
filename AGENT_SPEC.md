# Agent Spec (For AI Agents)

This document is a concise, implementation-focused reference for AI agents that generate tasks for Figranium. It covers the JSON schema, supported actions, variable templating, control flow, JavaScript execution context, and extraction scripts.




## 1) Task JSON schema (minimal)
```json
{
  "name": "My Task",
  "description": "Optional human-readable description of what this task does. Shown on the canvas and included in the /api/tasks/list response so AI agents and operators have context.",
  "url": "https://example.com",
  "mode": "agent",
  "wait": 2,
  "selector": "",
  "rotateUserAgents": false,
  "rotateProxies": false,
  "rotateViewport": false,
  "humanTyping": false,
  "stealth": {
    "allowTypos": false,
    "idleMovements": false,
    "overscroll": false,
    "deadClicks": false,
    "fatigue": false,
    "naturalTyping": false
  },
  "actions": [],
  "variables": {},
  "redactCaptures": true,
  "schedule": {
    "enabled": false,
    "frequency": "daily",
    "hour": 9,
    "minute": 0
  },
  "output": {
    "provider": "baserow",
    "credentialId": "<credential-id>",
    "tableId": "<baserow-table-id>",
    "onError": "ignore"
  }
}
```

## 2) Action types
Supported action `type` values:
```
navigate, click, type, wait, wait_selector, wait_downloads, press, scroll, javascript, csv, hover, merge,
screenshot, if, else, end, while, repeat, foreach, stop, set, on_error, start, http_request, get_content
```

Common fields:
- `selector` (string): CSS selector used by click/hover/scroll/foreach.
- `value` (string): payload for type/wait/scroll/javascript/start.
- `key` (string): key for `press` (e.g., `Enter`).
- `disabled` (boolean): skip action.
- `varName` (string): target variable for `set`, `merge`, `foreach`.
- `conditionVar`, `conditionVarType`, `conditionOp`, `conditionValue`: structured conditions for `if` and `while`.

## 3) Variable templating
Any string can include `{$varName}` tokens.
Example:
```
"value": "Hello {$user.name}"
```

Reserved:
- `{$now}` resolves to ISO timestamp
- `block.output` contains last block output
- `loop.index`, `loop.count`, `loop.item`, `loop.text`, `loop.html` during foreach

Variables holding passwords, tokens, or card numbers should be marked secret — see **§16 Sensitive variables**.

## 4) JavaScript action context
The `javascript` action runs **inside the page** (browser context), not Node.
- `document` and DOM APIs are available.
- `page` is **not** available.
- Return a value from the script to set `block.output`.

Example:
```js
const title = document.title;
return { title };
```

## 5) Extraction scripts (task-level)
You can set `extractionScript` and `extractionFormat` at the task level. The extraction script runs **after** the page is processed and uses the same page-context rules as `javascript` actions (no `page` object).

Minimal example:
```json
{
  "extractionFormat": "json",
  "extractionScript": "return Array.from(document.querySelectorAll('.card')).map(el => ({ title: el.textContent.trim() }));"
}
```

CSV example:
```json
{
  "extractionFormat": "csv",
  "extractionScript": "return Array.from(document.querySelectorAll('.row')).map(el => ({ name: el.querySelector('.name')?.textContent?.trim() || '' }));"
}
```

## 6) Output — push results to Baserow
Set the `output` field to automatically append `result.data` to a Baserow table after each run.

- `provider`: always `"baserow"` for now.
- `credentialId`: ID of a saved credential (manage via **Settings → Output** in the UI or `POST /api/credentials`).
- `tableId`: numeric Baserow table ID (visible in the table URL).
- `onError`: `"ignore"` (suppress errors) or `"fail"` (log errors prominently in the server console).

The extraction script's return value must be a **JSON object** (→ one row) or **JSON array of objects** (→ batch rows). Object keys must match Baserow field names exactly. `extractionFormat` must be `"json"` when using output (CSV is not supported for push).

Example:
```json
{
  "extractionScript": "return Array.from(document.querySelectorAll('.product')).map(el => ({ Name: el.querySelector('h2').textContent, Price: el.querySelector('.price').textContent }));",
  "extractionFormat": "json",
  "output": {
    "provider": "baserow",
    "credentialId": "cred_abc123",
    "tableId": "42",
    "onError": "fail"
  }
}
```

## 7) Control flow
### If / Else / End
Either use a **JS expression** in `value` or structured fields.

JS expression example:
```json
{ "id": "act_if", "type": "if", "value": "exists('.login')" }
```

Structured example:
```json
{
  "id": "act_if",
  "type": "if",
  "conditionVarType": "string",
  "conditionVar": ".login",
  "conditionOp": "exists",
  "conditionValue": ""
}
```

### While / End
Same condition format as `if`.

### Repeat / End
```json
{ "id": "act_repeat", "type": "repeat", "value": "5" }
```

### Foreach / End
Collect items from selector or variable and iterate.
```json
{ "id": "act_foreach", "type": "foreach", "selector": ".row" }
```

## 7) Condition operators
`string` ops:
- `equals`, `not_equals`, `contains`, `starts_with`, `ends_with`, `matches`

`number` ops:
- `equals`, `not_equals`, `gt`, `gte`, `lt`, `lte`

`boolean` ops:
- `is_true`, `is_false`

## 8) JS condition helpers (value expression)
If you use `value` as JS expression, these helpers exist:
- `exists(selector)`
- `text(selector)`
- `url()`
- `vars` (variables map)
- `block` (block.output)

Example:
```
exists('.load-more') && text('.count') !== ''
```

## 9) Example: click "Load more" until it disappears
```json
{
  "name": "Load More Until Gone",
  "url": "https://example.com",
  "mode": "agent",
  "wait": 2,
  "selector": "",
  "rotateUserAgents": false,
  "rotateProxies": false,
  "rotateViewport": false,
  "humanTyping": false,
  "stealth": {
    "allowTypos": false,
    "idleMovements": false,
    "overscroll": false,
    "deadClicks": false,
    "fatigue": false,
    "naturalTyping": false
  },
  "actions": [
    {
      "id": "act_while_load_more",
      "type": "while",
      "conditionVarType": "string",
      "conditionVar": ".load-more",
      "conditionOp": "exists",
      "conditionValue": ""
    },
    {
      "id": "act_click_load_more",
      "type": "click",
      "selector": ".load-more"
    },
    {
      "id": "act_wait_after_click",
      "type": "wait",
      "value": "1.5"
    },
    { "id": "act_end_while", "type": "end" }
  ],
  "variables": {}
}
```

## 10) Example: set + merge variables
```json
{
  "id": "act_set",
  "type": "set",
  "varName": "user.name",
  "value": "Ada"
}
```

```json
{
  "id": "act_merge",
  "type": "merge",
  "varName": "payload",
  "value": "{$user}, {$extra}"
}
```

## 11) Example: JavaScript extraction
```json
{
  "id": "act_js",
  "type": "javascript",
  "value": "return Array.from(document.querySelectorAll('.item')).map(el => el.textContent.trim());"
}
```

## 12) Stop action
```json
{ "id": "act_stop", "type": "stop", "value": "success" }
```

## 13) Start another task
```json
{ "id": "act_start", "type": "start", "value": "task_id_here" }
```

## 14) HTTP Request
Make an arbitrary HTTP API call. The response is automatically parsed as JSON (falls back to text). Throws on non-2xx status.
```json
{
  "id": "act_http",
  "type": "http_request",
  "method": "POST",
  "value": "https://api.example.com/endpoint",
  "headers": "{\"Authorization\": \"Bearer {$token}\"}",
  "body": "{\"key\": \"{$value}\"}",
  "varName": "apiResponse"
}
```
- `method`: HTTP verb — `GET`, `POST`, `PUT`, `PATCH`, or `DELETE` (default: `GET`).
- `value`: The request URL. Supports variable templating. Validated against SSRF rules.
- `headers`: Optional JSON string of request headers. Supports variable templating.
- `body`: Optional request body (for POST/PUT/PATCH/DELETE). Supports variable templating.
- `varName`: Optional variable name to store the parsed response for use in later actions.

## 15) Get Content
Extract the visible text content (`innerText`) of a page or a specific element and optionally store it in a variable.
```json
{
  "id": "act_content",
  "type": "get_content",
  "selector": ".article-body",
  "varName": "pageContent"
}
```
- `selector`: Optional CSS selector. If omitted, returns the full page body text.
- `varName`: Optional variable name to store the result. Also available as `{$block.output}` in the next action.

## 16) Sensitive variables (secrets)
Mark a variable `secret: true` when it holds a password, token, API key, or card number.

```json
{
  "variables": {
    "username": { "type": "string", "value": "ada@example.com" },
    "password": { "type": "string", "value": "correct-horse", "secret": true }
  }
}
```

The value is used normally during execution — it is typed into forms, sent in headers, and templated with `{$password}` like any other variable. What changes is everything that leaves the run:

- **Logs** — every occurrence is replaced with `[REDACTED]`, including the `Typing into #pw: …` line.
- **API response** — the returned `logs`, `html`, `data`, and `final_url` are redacted, so a secret echoed back by the target page (`value` attributes survive DOM cleaning) does not reach the caller.
- **Execution history** — the stored `taskSnapshot.variables` keeps secret entries but replaces their values with `[REDACTED]`; the stored result is the already-redacted response.
- **Webhooks and output providers** — both receive the redacted result.
- **Screenshots and recordings** — the target field is visually masked *before* the value is typed, so plaintext never renders into a capture. Disable per task with `"redactCaptures": false`.
- **Child tasks** — the `start` action forwards the secret variable names, so the child run redacts the same values.
- **Task exports** — exported JSON keeps the variable and its `secret` flag but blanks the value.

Redaction is exact-value matching, which also covers derived values: copying a secret into another variable, or embedding it in a larger string, still matches.

**Limits worth knowing:**
- Values shorter than 4 characters are **not** redacted — a 1–2 character secret would match nearly every log line. Use a longer value or accept that it stays visible.
- Redaction applies to output, not to storage. Secret values are stored in `data/tasks.json` in plaintext, like Baserow credential tokens. Protect the `data/` directory accordingly.
- Masking a capture depends on the page: it covers the field being typed into, not a value the site later renders somewhere else on the page.

To flag a value captured at runtime — an OTP read off the page, a token from an API response — set `secret` on the `set` action:

```json
{ "id": "act_set_otp", "type": "set", "varName": "otp", "value": "{$block.output}", "secret": true }
```

When calling the API, pass secret variables in the request body like any other variable:

```json
{ "variables": { "password": "correct-horse" } }
```

## 17) Notes for AI agents
- `javascript` actions are page-context only (no `page` object).
- Prefer structured conditions for selectors (`exists` with selector).
- Keep waits short; use 1-2s unless the target site is slow.
- Always close block structures with `end`.
- Mark any password, token, or card-number variable `secret: true` (§16). Never inline such a value directly in an action — put it in a secret variable and reference it with `{$name}`, or it will not be redacted.