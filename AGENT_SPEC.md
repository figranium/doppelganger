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
  "autoSolveCaptcha": false,
  "actions": [],
  "variables": {},
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
screenshot, if, else, end, while, repeat, foreach, stop, set, on_error, start, http_request, get_content,
solve_captcha
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

`selector` ops:
- `exists`, `not_exists` — checks `action.selector` against the page's DOM (`document.querySelector`), not `conditionVar`/`conditionValue`.

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

## 16) Solve CAPTCHA
Detect and solve a CAPTCHA challenge on the current page using the bundled captcha-solving service (`ohmycaptcha`), then inject the solution back into the page.
```json
{
  "id": "act_captcha",
  "type": "solve_captcha",
  "captchaType": "recaptcha_v2",
  "selector": "#recaptcha-container",
  "varName": "captchaResult",
  "timeout": 120000
}
```
- `captchaType`: Optional — one of `recaptcha_v2`, `recaptcha_v3`, `hcaptcha`, `turnstile`. If omitted, the challenge type is auto-detected from the page.
- `selector`: Optional CSS selector scoping the search to a specific container (e.g. the widget's iframe wrapper). If omitted, the whole page is scanned.
- `varName`: Optional variable name to store solve metadata (`{ success, challenge, duration }`).
- `timeout`: Max time (ms) to wait for a solution (default: 120000). Real captcha solving (the service runs its own headless browser to work through the challenge) commonly takes over a minute, especially reCAPTCHA v2's image-challenge fallback.
- Requires at least 2 GB of available memory — throws if the host doesn't have it (the solver runs its own headless browser).
- reCAPTCHA v2's audio-challenge fallback (used whenever a click-only solve isn't enough) requires `CLOUD_API_KEY`/`CLOUD_BASE_URL`/`CLOUD_MODEL` to be configured (an OpenAI-compatible endpoint) — without it, those specific challenges fail with `ERROR_CAPTCHA_UNSOLVABLE`. hCaptcha, Turnstile, and reCAPTCHA v3 don't need this.
- Top-level task field `autoSolveCaptcha` (default `false`): when `true`, the agent automatically runs detection and solves a captcha after every `navigate`, `click`, or `type` action, without needing an explicit `solve_captcha` block. Off by default so tasks that don't need it pay no extra latency; the explicit block above still works either way.

## 17) Notes for AI agents
- `javascript` actions are page-context only (no `page` object).
- Prefer structured conditions for selectors (`exists` with selector).
- Keep waits short; use 1-2s unless the target site is slow.
- Always close block structures with `end`.