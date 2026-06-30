const fs = require('fs');
const path = require('path');
const {
    USERS_FILE,
    TASKS_FILE,
    EXECUTIONS_FILE,
    CREDENTIALS_FILE,
    API_KEY_FILE,
    GEMINI_API_KEY_FILE,
    OPENAI_API_KEY_FILE,
    CLAUDE_API_KEY_FILE,
    OLLAMA_API_KEY_FILE,
    AI_MODELS_FILE,
    DEFAULT_AI_MODELS,
    ALLOWED_IPS_FILE,
    STORAGE_STATE_PATH,
    MAX_EXECUTIONS,
    ALLOWED_IPS_TTL_MS
} = require('./constants');

const STORAGE_CACHE_TTL = 5000; // 5 seconds
const { parseIpList, normalizeIp } = require('./utils');
const { initDB, getPool } = require('./db');

let dbInitPromise = null;
let usingDisk = true;

// User Storage
let usersCache = null;
let usersMtime = 0;
let usersLoadPromise = null;
let usersLastCheck = 0;

async function ensureDB() {
    if (dbInitPromise) return dbInitPromise;
    dbInitPromise = (async () => {
        try {
            const pool = await initDB();
            if (pool) usingDisk = false;
        } catch (err) {
            console.error('[STORAGE] Database initialization failed:', err.message);
            console.error('[STORAGE] Falling back to disk storage.');
            usingDisk = true;
        }
        return !usingDisk;
    })();
    return dbInitPromise;
}

async function bulkInsert(client, table, columns, rows) {
    if (!rows || rows.length === 0) return;
    const valuePlaceholders = [];
    const flatValues = [];
    let placeholderIndex = 1;

    for (const row of rows) {
        const placeholders = [];
        for (const col of columns) {
            placeholders.push(`$${placeholderIndex++}`);
            flatValues.push(row[col]);
        }
        valuePlaceholders.push(`(${placeholders.join(', ')})`);
    }

    const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valuePlaceholders.join(', ')}`;
    await client.query(query, flatValues);
}

// User Storage
// Load users is now asynchronous since DB query is async
async function loadUsers() {
    const useDB = await ensureDB();
    const now = Date.now();
    if (useDB) {
        if (usersCache && (now - usersLastCheck < STORAGE_CACHE_TTL)) {
            return usersCache;
        }
        if (usersLoadPromise) {
            return await usersLoadPromise;
        }
        usersLoadPromise = (async () => {
            try {
                const pool = getPool();
                if (!pool) throw new Error('Database pool not available');
                const res = await pool.query('SELECT data FROM users ORDER BY id ASC');
                usersCache = res.rows.map(r => r.data);
                usersLastCheck = Date.now();
            } catch (e) {
                console.error('[STORAGE] loadUsers DB error:', e.message);
                usersCache = usersCache || [];
            }
            usersLoadPromise = null;
            return usersCache;
        })();
        return await usersLoadPromise;
    }

    if (usersCache && (now - usersLastCheck < STORAGE_CACHE_TTL)) {
        return usersCache;
    }

    let stat;
    try {
        stat = await fs.promises.stat(USERS_FILE);
    } catch {
        usersCache = [];
        usersMtime = 0;
        return [];
    }

    if (usersCache && usersMtime === stat.mtimeMs) {
        usersLastCheck = now;
        return usersCache;
    }

    if (usersLoadPromise) {
        return await usersLoadPromise;
    }

    usersLoadPromise = (async () => {
        try {
            const data = await fs.promises.readFile(USERS_FILE, 'utf8');
            usersCache = JSON.parse(data);
            usersMtime = stat.mtimeMs;
            usersLastCheck = Date.now();
        } catch (e) {
            usersCache = usersCache || [];
            usersMtime = 0;
        }
        usersLoadPromise = null;
        return usersCache;
    })();

    return await usersLoadPromise;
}

async function saveUsers(users) {
    usersCache = users;
    usersLastCheck = Date.now();
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE users');
            const rows = users.map((data, i) => ({ id: i + 1, data }));
            await bulkInsert(client, 'users', ['id', 'data'], rows);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
        return;
    }

    await fs.promises.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    try {
        const stat = await fs.promises.stat(USERS_FILE);
        usersMtime = stat.mtimeMs;
    } catch {
        // ignore
    }
}

// Task Storage
let tasksCache = null;
let tasksMap = new Map(); // stores { task, index }
let tasksLoadPromise = null;
let tasksMtime = 0;
let tasksLastCheck = 0;

function syncTasksMap() {
    if (!tasksCache) {
        tasksMap.clear();
        return;
    }
    tasksMap = new Map(tasksCache.map((task, index) => [task.id, { task, index }]));
}

function getTaskById(id) {
    if (!tasksCache) return null;
    const entry = tasksMap.get(id);
    return entry ? entry.task : null;
}

function getTaskIndexById(id) {
    if (!tasksCache) return -1;
    const entry = tasksMap.get(id);
    return entry !== undefined ? entry.index : -1;
}

function migrateExtractionScript(script) {
    if (!script || typeof script !== 'string' || !script.includes('$$data')) return script;
    // Replace $$data.html / $$data.url accessed without parens → data.html() / data.url()
    let s = script.replace(/\$\$data\.html(?!\s*\()/g, 'data.html()');
    s = s.replace(/\$\$data\.url(?!\s*\()/g, 'data.url()');
    // Replace any remaining $$data → data
    return s.replace(/\$\$data/g, 'data');
}

function migrateTaskScripts(tasks) {
    let changed = false;
    const migrated = tasks.map(task => {
        const newScript = migrateExtractionScript(task.extractionScript);
        if (newScript !== task.extractionScript) {
            changed = true;
            return { ...task, extractionScript: newScript };
        }
        return task;
    });
    return { tasks: migrated, changed };
}

async function loadTasks() {
    const useDB = await ensureDB();
    const now = Date.now();
    if (useDB) {
        // Simple cache without mtime check if we rely on in-memory operations to mutate it
        if (tasksCache && (now - tasksLastCheck < STORAGE_CACHE_TTL)) return tasksCache;

        if (tasksLoadPromise) {
            return await tasksLoadPromise;
        }

        tasksLoadPromise = (async () => {
            try {
                const pool = getPool();
                if (!pool) throw new Error('Database pool not available');
                const res = await pool.query('SELECT data FROM tasks');
                const raw = res.rows.map(r => r.data);
                const { tasks: migrated, changed } = migrateTaskScripts(raw);
                tasksCache = migrated;
                tasksLastCheck = Date.now();
                syncTasksMap();
                if (changed) saveTasks(migrated).catch(e => console.error('[MIGRATE] Failed to save migrated tasks:', e));
            } catch (e) {
                console.error('[STORAGE] loadTasks DB error:', e.message);
                tasksCache = tasksCache || [];
                syncTasksMap();
            }
            tasksLoadPromise = null;
            return tasksCache;
        })();

        return await tasksLoadPromise;
    }

    if (tasksCache && (now - tasksLastCheck < STORAGE_CACHE_TTL)) {
        return tasksCache;
    }

    let stat;
    try {
        stat = await fs.promises.stat(TASKS_FILE);
    } catch {
        tasksCache = [];
        tasksMtime = 0;
        return [];
    }

    if (tasksCache && tasksMtime === stat.mtimeMs) {
        tasksLastCheck = now;
        return tasksCache;
    }

    if (tasksLoadPromise) {
        return await tasksLoadPromise;
    }

    tasksLoadPromise = (async () => {
        try {
            const data = await fs.promises.readFile(TASKS_FILE, 'utf8');
            const raw = JSON.parse(data);
            const { tasks: migrated, changed } = migrateTaskScripts(raw);
            tasksCache = migrated;
            tasksMtime = stat.mtimeMs;
            tasksLastCheck = Date.now();
            syncTasksMap();
            if (changed) saveTasks(migrated).catch(e => console.error('[MIGRATE] Failed to save migrated tasks:', e));
        } catch (e) {
            tasksCache = tasksCache || [];
            tasksMtime = 0;
            syncTasksMap();
        }
        tasksLoadPromise = null;
        return tasksCache;
    })();

    return await tasksLoadPromise;
}

async function saveTasks(tasks) {
    tasksCache = tasks;
    tasksLastCheck = Date.now();
    syncTasksMap();
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE tasks');
            const rows = tasks.map(task => ({ id: task.id, data: task }));
            await bulkInsert(client, 'tasks', ['id', 'data'], rows);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
        return;
    }

    await fs.promises.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
    try {
        const stat = await fs.promises.stat(TASKS_FILE);
        tasksMtime = stat.mtimeMs;
    } catch {
        // ignore
    }
}

// Execution Storage
let executionsCache = null;
let executionsMap = new Map();
let executionsLoadPromise = null;
let executionsSaveTimer = null;
let executionsWritePromise = Promise.resolve();
let dbExecutionsCount = null;

function syncExecutionsMap() {
    if (!executionsCache) {
        executionsMap.clear();
        return;
    }
    executionsMap = new Map(executionsCache.map(exec => [exec.id, exec]));
}

function getExecutionById(id) {
    if (!executionsCache) return null;
    return executionsMap.get(id) || null;
}

async function performExecutionsWrite(data) {
    const nextWrite = executionsWritePromise.then(() => fs.promises.writeFile(EXECUTIONS_FILE, data));
    executionsWritePromise = nextWrite.catch(() => { });
    return nextWrite;
}

async function loadExecutions() {
    if (executionsCache) return executionsCache;

    if (executionsLoadPromise) {
        return await executionsLoadPromise;
    }

    executionsLoadPromise = (async () => {
        const useDB = await ensureDB();
        if (useDB) {
            try {
                const pool = getPool();
                if (!pool) throw new Error('Database pool not available');
                // order by timestamp descending in postgres JSONB field
                const res = await pool.query("SELECT data FROM executions ORDER BY CAST(data->>'timestamp' AS BIGINT) DESC LIMIT $1", [MAX_EXECUTIONS]);
                executionsCache = res.rows.map(r => r.data);
                // ⚡ Bolt: Initialize dbExecutionsCount if we retrieved the full set
                if (executionsCache.length < MAX_EXECUTIONS) {
                    dbExecutionsCount = executionsCache.length;
                }
            } catch (e) {
                console.error('[STORAGE] loadExecutions DB error:', e.message);
                executionsCache = [];
            }
        } else {
            try {
                const data = await fs.promises.readFile(EXECUTIONS_FILE, 'utf8');
                executionsCache = JSON.parse(data);
            } catch (e) {
                executionsCache = [];
            }
        }
        syncExecutionsMap();
        executionsLoadPromise = null;
        return executionsCache;
    })();

    return await executionsLoadPromise;
}

async function saveExecutions(executions) {
    if (executionsSaveTimer) {
        clearTimeout(executionsSaveTimer);
        executionsSaveTimer = null;
    }
    executionsCache = executions;
    syncExecutionsMap();

    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE executions');
            const rows = executions.map(exec => ({ id: exec.id, data: exec }));
            await bulkInsert(client, 'executions', ['id', 'data'], rows);
            await client.query('COMMIT');
            // ⚡ Bolt: Keep count in sync after bulk save
            dbExecutionsCount = executions.length;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
        return;
    }

    const data = JSON.stringify(executions, null, 2);
    await performExecutionsWrite(data);
}

async function appendExecution(entry) {
    if (!executionsCache) await loadExecutions();

    executionsCache.unshift(entry);
    // ⚡ Bolt: Incremental Map update instead of rebuilding the entire map (O(1) vs O(N))
    executionsMap.set(entry.id, entry);

    if (executionsCache.length > MAX_EXECUTIONS) {
        const removed = executionsCache.pop();
        if (removed) executionsMap.delete(removed.id);
    }

    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        try {
            await pool.query('INSERT INTO executions (id, data) VALUES ($1, $2)', [entry.id, entry]);

            // ⚡ Bolt: Cold start for executions count tracking
            if (dbExecutionsCount === null) {
                const countRes = await pool.query('SELECT COUNT(*) FROM executions');
                dbExecutionsCount = parseInt(countRes.rows[0].count);
            } else {
                dbExecutionsCount++;
            }

            // Delete oldest if we exceed limit
            if (dbExecutionsCount > MAX_EXECUTIONS) {
                // Find oldest id to delete using timestamp from JSONB
                await pool.query(`
                    DELETE FROM executions 
                    WHERE id IN (
                        SELECT id FROM executions
                        ORDER BY CAST(data->>'timestamp' AS BIGINT) ASC
                        LIMIT 1
                    )
                `);
                dbExecutionsCount--;
            }
        } catch (e) {
            console.error('[STORAGE] Failed to append execution to DB:', e);
        }
        return;
    }

    if (executionsSaveTimer) clearTimeout(executionsSaveTimer);

    executionsSaveTimer = setTimeout(async () => {
        executionsSaveTimer = null;
        try {
            const data = JSON.stringify(executionsCache, null, 2);
            await performExecutionsWrite(data);
        } catch (err) {
            console.error('[STORAGE] Failed to save executions (debounced):', err);
        }
    }, 1000);
}

// API Key Storage
let apiKeyCache = undefined;
let apiKeyLoadPromise = null;

async function loadApiKey() {
    if (apiKeyCache !== undefined) return apiKeyCache;
    if (apiKeyLoadPromise) return apiKeyLoadPromise;

    apiKeyLoadPromise = (async () => {
        let apiKey = null;

        const useDB = await ensureDB();
        if (useDB) {
            try {
                const pool = getPool();
                if (!pool) throw new Error('Database pool not available');
                const res = await pool.query('SELECT key FROM api_key WHERE id = 1');
                if (res.rows.length > 0) apiKey = res.rows[0].key;
            } catch (e) {
                console.error('[STORAGE] loadApiKey DB error:', e.message);
            }
        } else {
            try {
                const raw = await fs.promises.readFile(API_KEY_FILE, 'utf8');
                const data = JSON.parse(raw);
                apiKey = data && data.apiKey ? data.apiKey : null;
            } catch (e) {
                apiKey = null;
            }
        }

        if (apiKeyCache !== undefined) {
            apiKeyLoadPromise = null;
            return apiKeyCache;
        }

        if (!apiKey) {
            try {
                // Now loadUsers is async
                const users = await loadUsers();
                if (Array.isArray(users) && users.length > 0 && users[0].apiKey) {
                    apiKey = users[0].apiKey;
                    await saveApiKey(apiKey);
                }
            } catch (e) {
                // ignore
            }
        }

        if (apiKeyCache !== undefined) {
            apiKeyLoadPromise = null;
            return apiKeyCache;
        }

        apiKeyCache = apiKey;
        apiKeyLoadPromise = null;
        return apiKey;
    })();

    return apiKeyLoadPromise;
}

async function saveApiKey(apiKeyArg) {
    const apiKey = typeof apiKeyArg === 'string' ? apiKeyArg.trim() : apiKeyArg;
    apiKeyCache = apiKey;
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        try {
            await pool.query('INSERT INTO api_key (id, key) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET key = EXCLUDED.key', [apiKey]);
        } catch (e) {
            console.error('[STORAGE] Failed to save API key to DB:', e.message);
        }
    } else {
        try {
            fs.writeFileSync(API_KEY_FILE, JSON.stringify({ apiKey }, null, 2));
        } catch (e) {
            console.error('[STORAGE] Failed to save API key to file:', e.message);
        }
    }

    // Try to update user with the new API key too
    try {
        const users = await loadUsers();
        if (Array.isArray(users) && users.length > 0) {
            users[0].apiKey = apiKey;
            await saveUsers(users);
        }
    } catch (e) { }
}

// Gemini API Key Storage
let geminiKeysCache = null;
let geminiKeysMtime = 0;
let geminiKeysLastCheck = 0;
let geminiKeysLoadPromise = null;

async function loadGeminiApiKey() {
    const useDB = await ensureDB();
    const now = Date.now();

    if (useDB) {
        if (geminiKeysCache && (now - geminiKeysLastCheck < STORAGE_CACHE_TTL)) return geminiKeysCache;
        if (geminiKeysLoadPromise) {
            return await geminiKeysLoadPromise;
        }

        geminiKeysLoadPromise = (async () => {
            try {
                const pool = getPool();
                if (!pool) throw new Error('Database pool not available');
                const res = await pool.query('SELECT key FROM gemini_api_key ORDER BY id ASC');
                geminiKeysCache = res.rows.map(row => row.key ? row.key.trim() : '').filter(k => k);
                geminiKeysLastCheck = Date.now();
            } catch (e) {
                console.error('[STORAGE] Failed to load Gemini keys from DB:', e.message);
                geminiKeysCache = geminiKeysCache || [];
            }
            geminiKeysLoadPromise = null;
            return geminiKeysCache;
        })();

        return await geminiKeysLoadPromise;
    }

    if (geminiKeysCache && (now - geminiKeysLastCheck < STORAGE_CACHE_TTL)) return geminiKeysCache;

    let stat;
    try {
        stat = await fs.promises.stat(GEMINI_API_KEY_FILE);
    } catch {
        geminiKeysCache = [];
        geminiKeysMtime = 0;
        return [];
    }

    if (geminiKeysCache && geminiKeysMtime === stat.mtimeMs) {
        geminiKeysLastCheck = now;
        return geminiKeysCache;
    }

    if (geminiKeysLoadPromise) {
        return await geminiKeysLoadPromise;
    }

    geminiKeysLoadPromise = (async () => {
        try {
            const raw = await fs.promises.readFile(GEMINI_API_KEY_FILE, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.geminiApiKeys)) {
                geminiKeysCache = data.geminiApiKeys.map(k => typeof k === 'string' ? k.trim() : '').filter(k => k);
            } else if (data.geminiApiKey) {
                geminiKeysCache = [data.geminiApiKey.trim()]; // backward compatibility
            }
            geminiKeysMtime = stat.mtimeMs;
            geminiKeysLastCheck = Date.now();
        } catch (e) {
            console.error('[STORAGE] Failed to load Gemini keys from file:', e.message);
            geminiKeysCache = geminiKeysCache || [];
            geminiKeysMtime = 0;
        }
        geminiKeysLoadPromise = null;
        return geminiKeysCache;
    })();

    return await geminiKeysLoadPromise;
}

async function saveGeminiApiKey(keysArg) {
    const keys = (Array.isArray(keysArg) ? keysArg : (keysArg ? [keysArg] : []))
        .map(k => typeof k === 'string' ? k.trim() : '')
        .filter(k => k);

    geminiKeysCache = keys;
    geminiKeysLastCheck = Date.now();

    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE gemini_api_key');
            const rows = keys.map((key, i) => ({ id: i + 1, key }));
            await bulkInsert(client, 'gemini_api_key', ['id', 'key'], rows);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('[STORAGE] Failed to save Gemini keys to DB:', e.message);
        } finally {
            client.release();
        }
        return;
    }

    try {
        await fs.promises.writeFile(GEMINI_API_KEY_FILE, JSON.stringify({ geminiApiKeys: keys }, null, 2));
        const stat = await fs.promises.stat(GEMINI_API_KEY_FILE);
        geminiKeysMtime = stat.mtimeMs;
    } catch (e) {
        console.error('[STORAGE] Failed to save Gemini keys to file:', e.message);
    }
}

// OpenAI API Key Storage
let openAiKeysCache = null;
let openAiKeysMtime = 0;
let openAiKeysLastCheck = 0;
let openAiKeysLoadPromise = null;

async function loadOpenAiApiKey() {
    const useDB = await ensureDB();
    const now = Date.now();

    if (useDB) {
        if (openAiKeysCache && (now - openAiKeysLastCheck < STORAGE_CACHE_TTL)) return openAiKeysCache;
        if (openAiKeysLoadPromise) {
            return await openAiKeysLoadPromise;
        }

        openAiKeysLoadPromise = (async () => {
            try {
                const pool = getPool();
                if (!pool) throw new Error('Database pool not available');
                const res = await pool.query('SELECT key FROM openai_api_key ORDER BY id ASC');
                openAiKeysCache = res.rows.map(row => row.key ? row.key.trim() : '').filter(k => k);
                openAiKeysLastCheck = Date.now();
            } catch (e) {
                console.error('[STORAGE] Failed to load OpenAI keys from DB:', e.message);
                openAiKeysCache = openAiKeysCache || [];
            }
            openAiKeysLoadPromise = null;
            return openAiKeysCache;
        })();

        return await openAiKeysLoadPromise;
    }

    if (openAiKeysCache && (now - openAiKeysLastCheck < STORAGE_CACHE_TTL)) return openAiKeysCache;

    let stat;
    try {
        stat = await fs.promises.stat(OPENAI_API_KEY_FILE);
    } catch {
        openAiKeysCache = [];
        openAiKeysMtime = 0;
        return [];
    }

    if (openAiKeysCache && openAiKeysMtime === stat.mtimeMs) {
        openAiKeysLastCheck = now;
        return openAiKeysCache;
    }

    if (openAiKeysLoadPromise) {
        return await openAiKeysLoadPromise;
    }

    openAiKeysLoadPromise = (async () => {
        try {
            const raw = await fs.promises.readFile(OPENAI_API_KEY_FILE, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.openAiApiKeys)) {
                openAiKeysCache = data.openAiApiKeys.map(k => typeof k === 'string' ? k.trim() : '').filter(k => k);
            } else if (data.openAiApiKey) {
                openAiKeysCache = [data.openAiApiKey.trim()];
            }
            openAiKeysMtime = stat.mtimeMs;
            openAiKeysLastCheck = Date.now();
        } catch (e) {
            console.error('[STORAGE] Failed to load OpenAI keys from file:', e.message);
            openAiKeysCache = openAiKeysCache || [];
            openAiKeysMtime = 0;
        }
        openAiKeysLoadPromise = null;
        return openAiKeysCache;
    })();

    return await openAiKeysLoadPromise;
}

async function saveOpenAiApiKey(keysArg) {
    const keys = (Array.isArray(keysArg) ? keysArg : (keysArg ? [keysArg] : []))
        .map(k => typeof k === 'string' ? k.trim() : '')
        .filter(k => k);

    openAiKeysCache = keys;
    openAiKeysLastCheck = Date.now();

    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE openai_api_key');
            const rows = keys.map((key, i) => ({ id: i + 1, key }));
            await bulkInsert(client, 'openai_api_key', ['id', 'key'], rows);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('[STORAGE] Failed to save OpenAI keys to DB:', e.message);
        } finally {
            client.release();
        }
        return;
    }

    try {
        await fs.promises.writeFile(OPENAI_API_KEY_FILE, JSON.stringify({ openAiApiKeys: keys }, null, 2));
        const stat = await fs.promises.stat(OPENAI_API_KEY_FILE);
        openAiKeysMtime = stat.mtimeMs;
    } catch (e) {
        console.error('[STORAGE] Failed to save OpenAI keys to file:', e.message);
    }
}

// Claude API Key Storage
let claudeKeysCache = null;
let claudeKeysMtime = 0;
let claudeKeysLastCheck = 0;
let claudeKeysLoadPromise = null;

async function loadClaudeApiKey() {
    const useDB = await ensureDB();
    const now = Date.now();

    if (useDB) {
        if (claudeKeysCache && (now - claudeKeysLastCheck < STORAGE_CACHE_TTL)) return claudeKeysCache;
        if (claudeKeysLoadPromise) {
            return await claudeKeysLoadPromise;
        }

        claudeKeysLoadPromise = (async () => {
            try {
                const pool = getPool();
                if (!pool) throw new Error('Database pool not available');
                const res = await pool.query('SELECT key FROM claude_api_key ORDER BY id ASC');
                claudeKeysCache = res.rows.map(row => row.key ? row.key.trim() : '').filter(k => k);
                claudeKeysLastCheck = Date.now();
            } catch (e) {
                console.error('[STORAGE] Failed to load Claude keys from DB:', e.message);
                claudeKeysCache = claudeKeysCache || [];
            }
            claudeKeysLoadPromise = null;
            return claudeKeysCache;
        })();

        return await claudeKeysLoadPromise;
    }

    if (claudeKeysCache && (now - claudeKeysLastCheck < STORAGE_CACHE_TTL)) return claudeKeysCache;

    let stat;
    try {
        stat = await fs.promises.stat(CLAUDE_API_KEY_FILE);
    } catch {
        claudeKeysCache = [];
        claudeKeysMtime = 0;
        return [];
    }

    if (claudeKeysCache && claudeKeysMtime === stat.mtimeMs) {
        claudeKeysLastCheck = now;
        return claudeKeysCache;
    }

    if (claudeKeysLoadPromise) {
        return await claudeKeysLoadPromise;
    }

    claudeKeysLoadPromise = (async () => {
        try {
            const raw = await fs.promises.readFile(CLAUDE_API_KEY_FILE, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.claudeApiKeys)) {
                claudeKeysCache = data.claudeApiKeys.map(k => typeof k === 'string' ? k.trim() : '').filter(k => k);
            } else if (data.claudeApiKey) {
                claudeKeysCache = [data.claudeApiKey.trim()];
            }
            claudeKeysMtime = stat.mtimeMs;
            claudeKeysLastCheck = Date.now();
        } catch (e) {
            console.error('[STORAGE] Failed to load Claude keys from file:', e.message);
            claudeKeysCache = claudeKeysCache || [];
            claudeKeysMtime = 0;
        }
        claudeKeysLoadPromise = null;
        return claudeKeysCache;
    })();

    return await claudeKeysLoadPromise;
}

async function saveClaudeApiKey(keysArg) {
    const keys = (Array.isArray(keysArg) ? keysArg : (keysArg ? [keysArg] : []))
        .map(k => typeof k === 'string' ? k.trim() : '')
        .filter(k => k);

    claudeKeysCache = keys;
    claudeKeysLastCheck = Date.now();

    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE claude_api_key');
            const rows = keys.map((key, i) => ({ id: i + 1, key }));
            await bulkInsert(client, 'claude_api_key', ['id', 'key'], rows);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('[STORAGE] Failed to save Claude keys to DB:', e.message);
        } finally {
            client.release();
        }
        return;
    }

    try {
        await fs.promises.writeFile(CLAUDE_API_KEY_FILE, JSON.stringify({ claudeApiKeys: keys }, null, 2));
        const stat = await fs.promises.stat(CLAUDE_API_KEY_FILE);
        claudeKeysMtime = stat.mtimeMs;
    } catch (e) {
        console.error('[STORAGE] Failed to save Claude keys to file:', e.message);
    }
}

// Ollama API Key Storage (stores base URLs, e.g. http://localhost:11434)
let ollamaKeysCache = null;
let ollamaKeysMtime = 0;
let ollamaKeysLastCheck = 0;
let ollamaKeysLoadPromise = null;

async function loadOllamaApiKey() {
    const useDB = await ensureDB();
    const now = Date.now();

    if (useDB) {
        if (ollamaKeysCache && (now - ollamaKeysLastCheck < STORAGE_CACHE_TTL)) return ollamaKeysCache;
        if (ollamaKeysLoadPromise) return await ollamaKeysLoadPromise;

        ollamaKeysLoadPromise = (async () => {
            try {
                const pool = getPool();
                if (!pool) throw new Error('Database pool not available');
                const res = await pool.query('SELECT key FROM ollama_api_key ORDER BY id ASC');
                ollamaKeysCache = res.rows.map(row => row.key ? row.key.trim() : '').filter(k => k);
                ollamaKeysLastCheck = Date.now();
            } catch (e) {
                console.error('[STORAGE] Failed to load Ollama keys from DB:', e.message);
                ollamaKeysCache = ollamaKeysCache || [];
            }
            ollamaKeysLoadPromise = null;
            return ollamaKeysCache;
        })();

        return await ollamaKeysLoadPromise;
    }

    if (ollamaKeysCache && (now - ollamaKeysLastCheck < STORAGE_CACHE_TTL)) return ollamaKeysCache;
    if (ollamaKeysLoadPromise) return await ollamaKeysLoadPromise;

    let stat;
    try {
        stat = await fs.promises.stat(OLLAMA_API_KEY_FILE);
    } catch {
        ollamaKeysCache = [];
        ollamaKeysMtime = 0;
        return [];
    }

    if (ollamaKeysCache && ollamaKeysMtime === stat.mtimeMs) {
        ollamaKeysLastCheck = now;
        return ollamaKeysCache;
    }

    ollamaKeysLoadPromise = (async () => {
        try {
            const raw = await fs.promises.readFile(OLLAMA_API_KEY_FILE, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.ollamaApiKeys)) {
                ollamaKeysCache = data.ollamaApiKeys.map(k => typeof k === 'string' ? k.trim() : '').filter(k => k);
            } else {
                ollamaKeysCache = [];
            }
            ollamaKeysMtime = stat.mtimeMs;
            ollamaKeysLastCheck = Date.now();
        } catch (e) {
            console.error('[STORAGE] Failed to load Ollama keys from file:', e.message);
            ollamaKeysCache = ollamaKeysCache || [];
            ollamaKeysMtime = 0;
        }
        ollamaKeysLoadPromise = null;
        return ollamaKeysCache;
    })();

    return await ollamaKeysLoadPromise;
}

async function saveOllamaApiKey(keysArg) {
    const keys = (Array.isArray(keysArg) ? keysArg : (keysArg ? [keysArg] : []))
        .map(k => typeof k === 'string' ? k.trim() : '')
        .filter(k => k);

    ollamaKeysCache = keys;
    ollamaKeysLastCheck = Date.now();

    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE ollama_api_key');
            const rows = keys.map((key, i) => ({ id: i + 1, key }));
            await bulkInsert(client, 'ollama_api_key', ['id', 'key'], rows);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('[STORAGE] Failed to save Ollama keys to DB:', e.message);
        } finally {
            client.release();
        }
        return;
    }

    try {
        await fs.promises.writeFile(OLLAMA_API_KEY_FILE, JSON.stringify({ ollamaApiKeys: keys }, null, 2));
        const stat = await fs.promises.stat(OLLAMA_API_KEY_FILE);
        ollamaKeysMtime = stat.mtimeMs;
    } catch (e) {
        console.error('[STORAGE] Failed to save Ollama keys to file:', e.message);
    }
}

// Credentials Storage
let credentialsCache = null;

async function loadCredentials() {
    if (credentialsCache) return credentialsCache;
    const useDB = await ensureDB();
    if (useDB) {
        try {
            const pool = getPool();
            if (!pool) throw new Error('Database pool not available');
            const res = await pool.query('SELECT data FROM credentials ORDER BY id ASC');
            credentialsCache = res.rows.map(r => r.data);
        } catch (e) {
            console.error('[STORAGE] Failed to load credentials from DB:', e.message);
            credentialsCache = [];
        }
        return credentialsCache;
    }
    try {
        const raw = await fs.promises.readFile(CREDENTIALS_FILE, 'utf8');
        credentialsCache = JSON.parse(raw);
    } catch {
        credentialsCache = [];
    }
    return credentialsCache;
}

async function saveCredentials(credentials) {
    credentialsCache = credentials;
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE credentials');
            const rows = credentials.map((data, i) => ({ id: i + 1, data }));
            await bulkInsert(client, 'credentials', ['id', 'data'], rows);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('[STORAGE] Failed to save credentials to DB:', e.message);
        } finally {
            client.release();
        }
        return;
    }
    await fs.promises.writeFile(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
}

// Session Helper
const saveSession = (req) => new Promise((resolve, reject) => {
    if (!req.session) {
        return resolve();
    }
    req.session.save((err) => err ? reject(err) : resolve());
});

// Allowed IPs Storage
let allowedIpsCache = { env: null, file: null, mtimeMs: 0, set: null, lastCheck: 0 };

const loadAllowedIps = async () => {
    const envRaw = String(process.env.ALLOWED_IPS || '').trim();
    const now = Date.now();

    if (allowedIpsCache.set && (now - allowedIpsCache.lastCheck < ALLOWED_IPS_TTL_MS)) {
        return allowedIpsCache.set;
    }

    let filePath = null;
    let fileMtime = 0;
    let fileEntries = [];

    try {
        const stat = await fs.promises.stat(ALLOWED_IPS_FILE);
        filePath = ALLOWED_IPS_FILE;
        fileMtime = stat.mtimeMs || 0;
    } catch {
        filePath = null;
    }

    if (
        allowedIpsCache.set &&
        allowedIpsCache.env === envRaw &&
        allowedIpsCache.file === filePath &&
        allowedIpsCache.mtimeMs === fileMtime
    ) {
        allowedIpsCache.lastCheck = now;
        return allowedIpsCache.set;
    }

    if (filePath) {
        try {
            const raw = await fs.promises.readFile(filePath, 'utf8');
            const parsed = JSON.parse(raw);
            fileEntries = Array.isArray(parsed)
                ? parsed
                : Array.isArray(parsed.allowedIps)
                    ? parsed.allowedIps
                    : [];
        } catch {
            fileEntries = [];
        }
    }

    const combined = [
        ...parseIpList(envRaw),
        ...parseIpList(fileEntries)
    ]
        .map(normalizeIp)
        .filter(Boolean);

    const set = new Set(combined);
    allowedIpsCache = { env: envRaw, file: filePath, mtimeMs: fileMtime, set, lastCheck: now };
    return set;
};

// Storage State
const getStorageStateFile = () => {
    try {
        if (fs.existsSync(STORAGE_STATE_PATH)) {
            const stat = fs.statSync(STORAGE_STATE_PATH);
            if (stat.isDirectory()) {
                return path.join(STORAGE_STATE_PATH, 'storage_state.json');
            }
        }
    } catch { }
    return STORAGE_STATE_PATH;
};

/**
 * Flush any pending debounced execution writes to disk immediately.
 * Called during graceful shutdown to prevent data loss.
 */
async function flushExecutions() {
    if (executionsSaveTimer) {
        clearTimeout(executionsSaveTimer);
        executionsSaveTimer = null;
    }
    if (!executionsCache) return;

    const useDB = await ensureDB();
    if (useDB) return; // DB writes are immediate, nothing to flush

    try {
        const data = JSON.stringify(executionsCache, null, 2);
        await performExecutionsWrite(data);
    } catch (err) {
        console.error('[STORAGE] Failed to flush executions on shutdown:', err);
    }
}

// AI Models Storage
let aiModelsCache = null;

async function loadAiModels() {
    if (aiModelsCache) return aiModelsCache;
    const useDB = await ensureDB();
    if (useDB) {
        try {
            const pool = getPool();
            if (!pool) throw new Error('Database pool not available');
            const res = await pool.query('SELECT data FROM ai_models WHERE id = 1');
            if (res.rows.length > 0) {
                aiModelsCache = { ...DEFAULT_AI_MODELS, ...res.rows[0].data };
            } else {
                aiModelsCache = { ...DEFAULT_AI_MODELS };
            }
        } catch (e) {
            console.error('[STORAGE] Failed to load AI models from DB:', e.message);
            aiModelsCache = { ...DEFAULT_AI_MODELS };
        }
        return aiModelsCache;
    }
    try {
        const raw = await fs.promises.readFile(AI_MODELS_FILE, 'utf8');
        aiModelsCache = { ...DEFAULT_AI_MODELS, ...JSON.parse(raw) };
    } catch {
        aiModelsCache = { ...DEFAULT_AI_MODELS };
    }
    return aiModelsCache;
}

async function saveAiModels(models) {
    aiModelsCache = { ...DEFAULT_AI_MODELS, ...models };
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        try {
            await pool.query('INSERT INTO ai_models (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [aiModelsCache]);
        } catch (e) {
            console.error('[STORAGE] Failed to save AI models to DB:', e.message);
        }
        return;
    }
    await fs.promises.writeFile(AI_MODELS_FILE, JSON.stringify(aiModelsCache, null, 2));
}

module.exports = {
    loadUsers,
    saveUsers,
    loadTasks,
    saveTasks,
    getTaskById,
    getTaskIndexById,
    loadExecutions,
    saveExecutions,
    getExecutionById,
    appendExecution,
    flushExecutions,
    loadApiKey,
    saveApiKey,
    loadGeminiApiKey,
    saveGeminiApiKey,
    loadOpenAiApiKey,
    saveOpenAiApiKey,
    loadClaudeApiKey,
    saveClaudeApiKey,
    loadOllamaApiKey,
    saveOllamaApiKey,
    loadCredentials,
    saveCredentials,
    saveSession,
    loadAllowedIps,
    getStorageStateFile,
    loadAiModels,
    saveAiModels
};
