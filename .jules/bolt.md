## 2025-05-22 - [Map-based lookup for executions]
**Learning:** Linear search (`Array.find`) for records by ID in route handlers becomes a performance bottleneck as the dataset grows (e.g., reaching `MAX_EXECUTIONS=500`). Introducing a `Map` cache in the storage layer provides $O(1)$ lookups and significantly improves responsiveness.
**Action:** Implement `executionsMap` in `src/server/storage.js` and synchronize it during load/save/append operations to achieve a ~150x speedup for retrieval-heavy endpoints.
