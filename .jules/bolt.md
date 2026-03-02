## 2025-02-28 - [Frontend Performance: CookiePanel Optimization]
**Learning:** `CookiesPanel.tsx` previously re-rendered all cookies and executed expensive decoding logic (`decodeURIComponent`, `atob`, regex checks) on every re-render (e.g. expanding/collapsing a row), because this computation was tightly coupled with the loop inside the component render body.
**Action:** Use `useMemo` to precalculate derived data structure for collections before the render `map` loop, particularly when components have internal state triggers that cause frequent re-renders.

## 2025-02-28 - [Frontend Performance: ResultsPane Memoization]
**Learning:** Using `Date.now()` unmemoized inside a React component's render body (e.g., for image cache busting) forces constant re-renders and image re-fetching whenever the parent component updates (like during drag-and-drop). Additionally, expensive data parsing functions like `getTableData` and `getResultsPreview` were unmemoized.
**Action:** Wrap expensive derived state and volatile cache-busters (like `Date.now()`) in `useMemo` with appropriate dependency arrays. Ensure heavy sub-components are exported with `React.memo()`.

## 2024-05-24 - React-Window Item Memoization
**Learning:** `react-window` supplies `itemData` to its item renderers. If the inner component (like `CaptureCard`) is not wrapped in `React.memo`, it will re-render even if its specific slice of `itemData` (e.g. `capture` and `onDelete`) hasn't changed, purely because the parent list re-rendered.
**Action:** Always wrap components rendered inside `react-window` lists (e.g., `CaptureCard` inside `CapturesScreen` or `CapturesPanel`) with `React.memo()` to fully benefit from the stabilized `itemData` provided to the list.
