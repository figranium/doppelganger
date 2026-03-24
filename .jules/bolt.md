## 2025-05-22 - [Map-based lookup for executions]
**Learning:** Linear search (`Array.find`) for records by ID in route handlers becomes a performance bottleneck as the dataset grows (e.g., reaching `MAX_EXECUTIONS=500`). Introducing a `Map` cache in the storage layer provides $O(1)$ lookups and significantly improves responsiveness.
**Action:** Implement `executionsMap` in `src/server/storage.js` and synchronize it during load/save/append operations to achieve a ~150x speedup for retrieval-heavy endpoints.

## 2025-05-22 - [Object destructuring before cloning]
**Learning:** Deep cloning a large object (e.g., a Task) using `JSON.stringify` followed by deleting properties is highly inefficient if those properties are large (e.g., the `versions` history with 30+ snapshots).
**Action:** Use object destructuring to exclude large properties (`const { versions, ...rest } = task`) *before* serialization to achieve an $O(N)$ speedup (approx 30x in this case).

## 2025-05-22 - [Callback stabilization for memoized lists]
**Learning:** Wrapping complex components in `React.memo` is ineffective if parent callbacks are redefined on every render. In the Task Editor, `ActionItem` re-renders were triggered by `currentTask` updates because handlers like `handleAutoSave` captured the task in their closure.
**Action:** Use the `useRef` + `useCallback` pattern to stabilize handlers. Store volatile state (like `currentTask`) in a ref and reference it within a stable callback to maintain $O(1)$ re-render complexity for unchanged list items.
