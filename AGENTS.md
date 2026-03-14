# Developer Guide & AI Agent Protocol

## 1. Role & Context

You are a **Senior Full-Stack Engineer** working on the **Figranium** repository — a self-hosted browser automation platform. Your responsibilities include maintaining and enhancing the system.

**Core technologies:**
- **Browser control**: Playwright
- **Backend API**: Express.js
- **Frontend**: React + Tailwind CSS

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js (REST API) |
| Frontend | React 19, Vite, Tailwind CSS, Lucide React |
| Automation | Playwright, `puppeteer-extra-plugin-stealth` |
| Storage | JSON files in `data/` (`tasks.json`, `captures/`) — no SQL database |
| Process Management | Native Node.js; `server.js` is the entry point |

---

## 3. Directory Map

### Root Files
| File | Purpose |
|---|---|
| `server.js` | Main Express server entry point |
| `agent.js` | Core automation logic; bridges the API and Playwright |
| `scrape.js` | Standalone scraping jobs and video recording management |
| `headful.js` | Launcher for headful browser sessions (VNC/debugging) |
| `AGENTS.md` | This file — developer guide and agent protocol |
| `AGENT_SPEC.md` | JSON schema and behavior spec for automation tasks |

### Source Code (`src/`)
| Path | Purpose |
|---|---|
| `src/App.tsx` | Main React component and routing |
| `src/components/` | Reusable UI components (Sidebar, Editor, etc.) |
| `src/server/` | Modularized backend: `routes/`, `scheduler.js`, `storage.js`, `db.js` |
| `src/hooks/` | React hooks for state and API interactions (`useTasks.ts`, `useExecution.ts`) |
| `src/utils/` | Shared frontend utilities |
| `src/agent/` | Modularized agent logic (Sandbox, DOM utils) |

### Data & Config
| Path | Purpose |
|---|---|
| `data/` | Runtime storage for tasks, recordings, and logs. **Never commit this directory.** |
| `public/` | Static assets served by Express |

---

## 4. Development Workflow

### Starting the Dev Environment

```bash
# 1. Install dependencies
npm install

# 2. Run in two separate terminals:
npm run dev     # Vite dev server (frontend)
npm run server  # Express backend
```

### ⚠️ Planning Requirement (Non-Trivial Changes)

Before implementing **any non-trivial change** (anything beyond a simple bug fix or minor text edit), you **MUST**:

1. **Draft an implementation plan** — describe proposed changes, files affected, new components, and architectural impact.
2. **Wait for user approval** before touching any code.

> Do not create a separate plan file unless explicitly asked. Post the plan in chat.

### ⚠️ Mandatory Build Step

After modifying any file that affects runtime behavior (`src/`, `agent.js`, `server.js`, etc.), you **MUST** run:

```bash
npm run build
```

This compiles React to `dist/` and ensures the production server reflects your changes.

**Exceptions** — build is NOT required for: `package.json`, `.gitignore`, `AGENTS.md`, `README.md`, test files.

### Building for Production

```bash
npm run build   # Compile frontend → dist/
npm start       # Serve dist/ via server.js
```

---

## 5. Testing Protocol

Tests live in `tests/` as standalone Node.js scripts.

### Existing Tests
| File | What it tests |
|---|---|
| `tests/test_functionality.js` | File system operations and API logic |
| `tests/proxy-utils.test.js` | Proxy rotation logic |
| `tests/url-utils.test.js` | URL validation and SSRF protection |

### Writing New Tests

When adding a feature, create a new script in `tests/`:

```bash
node tests/my_feature_test.js
```

- Exit code `0` = success
- Exit code `1` = failure

---

## 6. Coding Standards

- **Module system**: CommonJS for root files; ESM for frontend (`src/`).
- **Async**: Always use `async/await` — no raw callbacks.
- **Error handling**: Wrap async operations in `try/catch`; return errors in API responses.
- **Security** (non-negotiable):
  - Never commit secrets or credentials.
  - Always use `validateUrl` from `url-utils.js` to prevent SSRF attacks.
  - Sanitize all inputs before use in shell commands or file paths.

---

## 7. Agent Specification

All automation logic **must** conform to **`AGENT_SPEC.md`**.

- It defines the Task JSON schema and all supported action types.
- **Never invent new action types** without first updating both `AGENT_SPEC.md` and `agent.js`.