const fs = require('fs');
const path = require('path');
const {
    USERS_FILE,
    TASKS_FILE,
    EXECUTIONS_FILE,
    API_KEY_FILE,
    GEMINI_API_KEY_FILE,
    OPENAI_API_KEY_FILE,
    CLAUDE_API_KEY_FILE,
    ALLOWED_IPS_FILE,
    STORAGE_STATE_PATH,
    MAX_EXECUTIONS,
    ALLOWED_IPS_TTL_MS
} = require('./constants');
const { parseIpList, normalizeIp } = require('./utils');
const { initDB, getPool } = require('./db');

let dbInitPromise = null;
let usingDisk = true;

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

// User Storage
// Load users is now asynchronous since DB query is async
async function loadUsers() {
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const res = await pool.query('SELECT data FROM users ORDER BY id ASC');
        return res.rows.map(r => r.data);
    }

    if (!fs.existsSync(USERS_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

async function saveUsers(users) {
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE users');
            for (let i = 0; i < users.length; i++) {
                await client.query('INSERT INTO users (id, data) VALUES ($1, $2)', [i + 1, users[i]]);
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
        return;
    }

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Task Storage
let tasksCache = null;
let tasksMap = new Map(); // stores { task, index }
let tasksLoadPromise = null;
let tasksMtime = 0;

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

async function loadTasks() {
    const useDB = await ensureDB();
    if (useDB) {
        // Simple cache without mtime check if we rely on in-memory operations to mutate it
        if (tasksCache) return [...tasksCache];

        if (tasksLoadPromise) {
            const result = await tasksLoadPromise;
            return [...result];
        }

        tasksLoadPromise = (async () => {
            try {
                const pool = getPool();
                const res = await pool.query('SELECT data FROM tasks');
                tasksCache = res.rows.map(r => r.data);
                syncTasksMap();
            } catch (e) {
                tasksCache = [];
                syncTasksMap();
            }
            tasksLoadPromise = null;
            return tasksCache;
        })();

        const result = await tasksLoadPromise;
        return [...result];
    }

    let stat;
    try {
        stat = await fs.promises.stat(TASKS_FILE);
    } catch {
        tasksCache = [];
        return [];
    }

    if (tasksCache && tasksMtime === stat.mtimeMs) {
        return [...tasksCache];
    }

    if (tasksLoadPromise) {
        const result = await tasksLoadPromise;
        return [...result];
    }

    tasksLoadPromise = (async () => {
        try {
            const data = await fs.promises.readFile(TASKS_FILE, 'utf8');
            tasksCache = JSON.parse(data);
            tasksMtime = stat.mtimeMs;
            syncTasksMap();
        } catch (e) {
            tasksCache = [];
            tasksMtime = 0;
            syncTasksMap();
        }
        tasksLoadPromise = null;
        return tasksCache;
    })();

    const result = await tasksLoadPromise;
    return [...result];
}

async function saveTasks(tasks) {
    tasksCache = tasks;
    syncTasksMap();
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE tasks');
            for (const task of tasks) {
                await client.query('INSERT INTO tasks (id, data) VALUES ($1, $2)', [task.id, task]);
            }
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
let executionsLoadPromise = null;
let executionsSaveTimer = null;
let executionsWritePromise = Promise.resolve();

async function performExecutionsWrite(data) {
    const nextWrite = executionsWritePromise.then(() => fs.promises.writeFile(EXECUTIONS_FILE, data));
    executionsWritePromise = nextWrite.catch(() => { });
    return nextWrite;
}

async function loadExecutions() {
    if (executionsCache) return [...executionsCache];

    if (executionsLoadPromise) {
        const result = await executionsLoadPromise;
        return [...result];
    }

    executionsLoadPromise = (async () => {
        const useDB = await ensureDB();
        if (useDB) {
            try {
                const pool = getPool();
                // order by timestamp descending in postgres JSONB field
                const res = await pool.query("SELECT data FROM executions ORDER BY CAST(data->>'timestamp' AS BIGINT) DESC LIMIT $1", [MAX_EXECUTIONS]);
                executionsCache = res.rows.map(r => r.data);
            } catch (e) {
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
        executionsLoadPromise = null;
        return executionsCache;
    })();

    const result = await executionsLoadPromise;
    return [...result];
}

async function saveExecutions(executions) {
    if (executionsSaveTimer) {
        clearTimeout(executionsSaveTimer);
        executionsSaveTimer = null;
    }
    executionsCache = executions;

    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE executions');
            for (const exec of executions) {
                await client.query('INSERT INTO executions (id, data) VALUES ($1, $2)', [exec.id, exec]);
            }
            await client.query('COMMIT');
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
    if (executionsCache.length > MAX_EXECUTIONS) {
        executionsCache.length = MAX_EXECUTIONS;
    }

    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        try {
            await pool.query('INSERT INTO executions (id, data) VALUES ($1, $2)', [entry.id, entry]);

            // Delete oldest if we exceed limit
            const countRes = await pool.query('SELECT COUNT(*) FROM executions');
            if (parseInt(countRes.rows[0].count) > MAX_EXECUTIONS) {
                // Find oldest id to delete using timestamp from JSONB
                await pool.query(`
                    DELETE FROM executions 
                    WHERE id IN (
                        SELECT id FROM executions
                        ORDER BY CAST(data->>'timestamp' AS BIGINT) ASC
                        LIMIT 1
                    )
                `);
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
                const res = await pool.query('SELECT key FROM api_key WHERE id = 1');
                if (res.rows.length > 0) apiKey = res.rows[0].key;
            } catch (e) { }
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

async function saveApiKey(apiKey) {
    apiKeyCache = apiKey;
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        try {
            await pool.query('INSERT INTO api_key (id, key) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET key = EXCLUDED.key', [apiKey]);
        } catch (e) { }
    } else {
        fs.writeFileSync(API_KEY_FILE, JSON.stringify({ apiKey }, null, 2));
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
async function loadGeminiApiKey() {
    let keys = [];
    const useDB = await ensureDB();
    if (useDB) {
        try {
            const pool = getPool();
            const res = await pool.query('SELECT key FROM gemini_api_key ORDER BY id ASC');
            keys = res.rows.map(row => row.key).filter(k => k);
        } catch (e) { }
    } else {
        try {
            const raw = await fs.promises.readFile(GEMINI_API_KEY_FILE, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.geminiApiKeys)) {
                keys = data.geminiApiKeys;
            } else if (data.geminiApiKey) {
                keys = [data.geminiApiKey]; // backward compatibility
            }
        } catch (e) { }
    }
    return keys;
}

async function saveGeminiApiKey(keysArg) {
    const keys = Array.isArray(keysArg) ? keysArg : (keysArg ? [keysArg] : []);
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE gemini_api_key');
            let id = 1;
            for (let i = 0; i < keys.length; i++) {
                if (keys[i] && keys[i].trim()) {
                    await client.query('INSERT INTO gemini_api_key (id, key) VALUES ($1, $2)', [id++, keys[i].trim()]);
                }
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
        } finally {
            client.release();
        }
    } else {
        fs.writeFileSync(GEMINI_API_KEY_FILE, JSON.stringify({ geminiApiKeys: keys.filter(k => k && k.trim()) }, null, 2));
    }
}

// OpenAI API Key Storage
async function loadOpenAiApiKey() {
    let keys = [];
    const useDB = await ensureDB();
    if (useDB) {
        try {
            const pool = getPool();
            const res = await pool.query('SELECT key FROM openai_api_key ORDER BY id ASC');
            keys = res.rows.map(row => row.key).filter(k => k);
        } catch (e) { }
    } else {
        try {
            const raw = await fs.promises.readFile(OPENAI_API_KEY_FILE, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.openAiApiKeys)) {
                keys = data.openAiApiKeys;
            } else if (data.openAiApiKey) {
                keys = [data.openAiApiKey];
            }
        } catch (e) { }
    }
    return keys;
}

async function saveOpenAiApiKey(keysArg) {
    const keys = Array.isArray(keysArg) ? keysArg : (keysArg ? [keysArg] : []);
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE openai_api_key');
            let id = 1;
            for (let i = 0; i < keys.length; i++) {
                if (keys[i] && keys[i].trim()) {
                    await client.query('INSERT INTO openai_api_key (id, key) VALUES ($1, $2)', [id++, keys[i].trim()]);
                }
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
        } finally {
            client.release();
        }
    } else {
        fs.writeFileSync(OPENAI_API_KEY_FILE, JSON.stringify({ openAiApiKeys: keys.filter(k => k && k.trim()) }, null, 2));
    }
}

// Claude API Key Storage
async function loadClaudeApiKey() {
    let keys = [];
    const useDB = await ensureDB();
    if (useDB) {
        try {
            const pool = getPool();
            const res = await pool.query('SELECT key FROM claude_api_key ORDER BY id ASC');
            keys = res.rows.map(row => row.key).filter(k => k);
        } catch (e) { }
    } else {
        try {
            const raw = await fs.promises.readFile(CLAUDE_API_KEY_FILE, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.claudeApiKeys)) {
                keys = data.claudeApiKeys;
            } else if (data.claudeApiKey) {
                keys = [data.claudeApiKey];
            }
        } catch (e) { }
    }
    return keys;
}

async function saveClaudeApiKey(keysArg) {
    const keys = Array.isArray(keysArg) ? keysArg : (keysArg ? [keysArg] : []);
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE claude_api_key');
            let id = 1;
            for (let i = 0; i < keys.length; i++) {
                if (keys[i] && keys[i].trim()) {
                    await client.query('INSERT INTO claude_api_key (id, key) VALUES ($1, $2)', [id++, keys[i].trim()]);
                }
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
        } finally {
            client.release();
        }
    } else {
        fs.writeFileSync(CLAUDE_API_KEY_FILE, JSON.stringify({ claudeApiKeys: keys.filter(k => k && k.trim()) }, null, 2));
    }
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

module.exports = {
    loadUsers,
    saveUsers,
    loadTasks,
    saveTasks,
    getTaskById,
    getTaskIndexById,
    loadExecutions,
    saveExecutions,
    appendExecution,
    loadApiKey,
    saveApiKey,
    loadGeminiApiKey,
    saveGeminiApiKey,
    loadOpenAiApiKey,
    saveOpenAiApiKey,
    loadClaudeApiKey,
    saveClaudeApiKey,
    saveSession,
    loadAllowedIps,
    getStorageStateFile
};
