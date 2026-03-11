## 2025-02-28 - [Frontend Performance: CookiePanel Optimization]
**Learning:** `CookiesPanel.tsx` previously re-rendered all cookies and executed expensive decoding logic (`decodeURIComponent`, `atob`, regex checks) on every re-render (e.g. expanding/collapsing a row), because this computation was tightly coupled with the loop inside the component render body.
**Action:** Use `useMemo` to precalculate derived data structure for collections before the render `map` loop, particularly when components have internal state triggers that cause frequent re-renders.

## 2025-02-28 - [Frontend Performance: ResultsPane Memoization]
**Learning:** Using `Date.now()` unmemoized inside a React component's render body (e.g., for image cache busting) forces constant re-renders and image re-fetching whenever the parent component updates (like during drag-and-drop). Additionally, expensive data parsing functions like `getTableData` and `getResultsPreview` were unmemoized.
**Action:** Wrap expensive derived state and volatile cache-busters (like `Date.now()`) in `useMemo` with appropriate dependency arrays. Ensure heavy sub-components are exported with `React.memo()`.

## 2025-03-05 - [Frontend Performance: Fine-grained Dependency Arrays]
**Learning:** Even when a cache-buster like `Date.now()` is correctly wrapped in `useMemo`, an overly broad dependency array (like the entire `activeResults` object instead of specifically `activeResults.screenshotUrl`) causes unnecessary recalculations when unrelated fields (like streaming `logs`) update. This leads to continuous image re-fetching and flickering DOM updates.
**Action:** Always scope `useMemo` dependencies as narrowly as possible, using scalar primitives or specific sub-properties rather than parent objects, especially when dealing with data streams or frequent sub-state updates.

## 2024-05-24 - React-Window Item Memoization
**Learning:** `react-window` supplies `itemData` to its item renderers. If the inner component (like `CaptureCard`) is not wrapped in `React.memo`, it will re-render even if its specific slice of `itemData` (e.g. `capture` and `onDelete`) hasn't changed, purely because the parent list re-rendered.
**Action:** Always wrap components rendered inside `react-window` lists (e.g., `CaptureCard` inside `CapturesScreen` or `CapturesPanel`) with `React.memo()` to fully benefit from the stabilized `itemData` provided to the list.

## 2026-03-04 - [Frontend Performance: EditorScreen Memoization]
**Learning:** Functions that derive state from large data structures (like `getBlockDepths` iterating over `currentTask.actions`) will be executed on every re-render if called directly in the component body. This causes O(N) recalculations even when the data structure hasn't changed (e.g., during drag-and-drop operations, variable edits, etc.). Also, do not use hooks inside `(() => {})()` statements!
**Action:** Always wrap derived array calculations inside `useMemo` hooks, with the parent array as the dependency, to avoid unnecessary loop executions during React render cycles. Ensure it is placed directly at the top level of the function block.

## 2025-03-24 - [Agent Performance: Template Resolution and Loop Optimization]
**Learning:**  was executing a regex replacement on every call even for static strings. Additionally, the agent loop was stringifying every action object on every iteration to check for `{$html}` markers, which is expensive for large tasks or long-running loops.
**Action:** Add a fast-path check (`!input.includes('{$')`) to template resolution functions and pre-calculate action properties (like HTML requirement) before entering the execution loop to avoid redundant O(N) operations inside the loop.

## 2025-03-24 - [Agent Performance: Template Resolution and Loop Optimization]
**Learning:** `resolveTemplate` was executing a regex replacement on every call even for static strings. Additionally, the agent loop was stringifying every action object on every iteration to check for `{$html}` markers, which is expensive for large tasks or long-running loops.
**Action:** Add a fast-path check (`!input.includes('{$')`) to template resolution functions and pre-calculate action properties (like HTML requirement) before entering the execution loop to avoid redundant O(N) operations inside the loop.
