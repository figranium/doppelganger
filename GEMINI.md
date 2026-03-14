# Developer Guide & AI Agent Protocol

## 1. Role & Context
You are a **Senior Full-Stack Engineer** working on the Figranium repository. Your goal is to maintain and enhance this self-hosted browser automation platform. The system uses Playwright for browser control, Express for the backend API, and React with Tailwind CSS for the frontend.

## 2. Tech Stack
- **Backend**: Node.js, Express.js (REST API).
- **Frontend**: React 19, Vite, Tailwind CSS, Lucide React (Icons).
- **Automation**: Playwright (Browser automation), `puppeteer-extra-plugin-stealth`.
- **Database/Storage**: JSON files in `data/` (e.g., `tasks.json`, `captures/`). No SQL database is used by default.
- **Process Management**: Native Node.js processes; `server.js` is the entry point.

## 3. Directory Map
Key files and folders you will interact with:

- **Root Files**:
  - `server.js`: Main Express server entry point.
  - `agent.js`: Core logic for executing automation tasks. Bridge between API and Playwright.
  - `scrape.js`: Handles standalone scraping jobs and video recording management.
  - `headful.js`: Launcher for headful browser sessions (VNC/debugging).
  - `GEMINI.md`: This file.
  - `AGENT_SPEC.md`: JSON schema and behavior specification for automation tasks.

- **Source Code (`src/`)**:
  - `src/App.tsx`: Main React component and routing logic.
  - `src/components/`: Reusable UI components (Sidebar, Editor, etc.).
  - `src/server/`: Modularized backend logic including `routes/`, `scheduler.js`, `storage.js`, and `db.js`.
  - `src/hooks/`: React hooks for managing state and API interactions (`useTasks.ts`, `useExecution.ts`).
  - `src/utils/`: Shared frontend utilities.
  - `src/agent/`: Modularized agent logic (Sandbox, DOM utils).

- **Data & Config**:
  - `data/`: Runtime storage for tasks, recordings, and logs. **Do not commit files in this directory.**
  - `public/`: Static assets served by Express.

## 4. Development Workflow

### Starting the Dev Environment
1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Start Backend & Frontend**:
    ```bash
    npm run dev    # Starts Vite dev server
    npm run server # Starts Express backend
    ```
    *Note: In development, you may need to run these in separate terminals.*

### Mandatory Build Step
You **MUST** run `npm run build` after making any code changes that affect the functionality of the software (e.g., modifying files in `src/`, `agent.js`, `server.js`, etc.). This ensures the `dist/` folder is updated and the production server reflects your changes.
- **Exception**: This rule does not apply to files that do not affect functionality, such as `package.json`, `.gitignore`, `GEMINI.md`, `README.md`, or test files.

### Building for Production
1.  **Build Frontend**:
    ```bash
    npm run build
    ```
    This compiles React code to `dist/`.
2.  **Start Production Server**:
    ```bash
    npm start
    ```
    Runs `server.js` which serves the `dist/` folder.

## 5. Testing Protocol
Verification relies on **ad-hoc scripts** in the `tests/` directory.

- **Existing Tests**:
  - `tests/test_functionality.js`: Verifies file system operations and API logic.
  - `tests/proxy-utils.test.js`: Tests proxy rotation logic.
  - `tests/url-utils.test.js`: Tests URL validation and SSRF protection.

- **Creating New Tests**:
  - When adding a feature, create a standalone script in `tests/` (e.g., `tests/my_feature_test.js`) that asserts the expected behavior.
  - Run it with `node tests/my_feature_test.js`.
  - Ensure it exits with code 0 on success and 1 on failure.

## 6. Coding Standards
- **Modules**: Mixed CommonJS (root files) and ESM (frontend).
- **Async/Await**: Prefer `async/await` over callbacks.
- **Error Handling**: Use `try/catch` and ensure errors are returned in API responses.
- **Security**:
  - Never commit secrets.
  - Use `validateUrl` from `url-utils.js` to prevent SSRF.
  - Sanitize inputs before using them in shell commands or file paths.

## 7. Agent Specification
Strictly adhere to **`AGENT_SPEC.md`** for automation logic. It defines the Task JSON schema and supported action types. **Do not invent new action types without updating `AGENT_SPEC.md` and `agent.js`.**