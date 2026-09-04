const assert = require('assert');
const { Pool } = require('pg');
const storage = require('../../../src/server/storage');
const db = require('../../../src/server/db');

const tests = [
    {
        id: 'PERSIST-001',
        name: 'Storage Parity - Task Save/Load Round Trip',
        subsystem: 'persistence',
        setup: 'Storage module initialized',
        steps: 'Append a temporary Task, save, reload and verify fields, then restore the original Task set.',
        expected: 'Task storage round-trips accurately without leaving test data behind.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const taskId = `test_task_${Date.now()}`;
            const originalTasks = JSON.parse(JSON.stringify(await storage.loadTasks()));
            const testTask = {
                id: taskId,
                name: 'Persistence Qualification Task',
                url: 'https://example.com',
                mode: 'agent',
                wait: 1000,
                actions: [{ id: 'a1', type: 'navigate', value: 'https://example.com' }],
                variables: { var1: { type: 'string', value: 'val1' } }
            };
            try {
                await storage.saveTasks([...originalTasks, testTask]);
                const found = (await storage.loadTasks()).find(t => t.id === taskId);
                assert.ok(found, 'Saved task must be retrievable');
                assert.strictEqual(found.name, testTask.name);
                assert.strictEqual(found.url, testTask.url);
                assert.deepStrictEqual(found.actions, testTask.actions);
                assert.deepStrictEqual(found.variables, testTask.variables);
            } finally {
                await storage.saveTasks(originalTasks);
            }
        }
    },
    {
        id: 'PERSIST-002',
        name: 'Storage Parity - API Key Save/Load Round Trip',
        subsystem: 'persistence',
        setup: 'Storage module initialized',
        steps: 'Save a temporary API key, reload and compare it, then restore the original key.',
        expected: 'API key persists accurately and the qualification run leaves the original setting intact.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const originalKey = await storage.loadApiKey();
            const testKey = `fig_qual_key_${Date.now()}`;
            try {
                await storage.saveApiKey(testKey);
                assert.strictEqual(await storage.loadApiKey(), testKey, 'API key must match saved key');
            } finally {
                await storage.saveApiKey(originalKey || '');
            }
        }
    },
    {
        id: 'PERSIST-003',
        name: 'Storage Parity - Theme Configuration Round Trip',
        subsystem: 'persistence',
        setup: 'Storage module initialized',
        steps: 'Save a temporary theme, reload it, then restore the original theme.',
        expected: 'Theme preference persists accurately without leaving changed state.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const originalTheme = await storage.loadThemeConfig();
            try {
                await storage.saveThemeConfig('solarized-dark');
                assert.strictEqual(await storage.loadThemeConfig(), 'solarized-dark');
            } finally {
                await storage.saveThemeConfig(originalTheme || 'dark');
            }
        }
    },
    {
        id: 'PERSIST-004',
        name: 'Database Initialization - Concurrent initDB Calls',
        subsystem: 'persistence',
        setup: 'Call initDB concurrently from multiple promises',
        steps: 'Trigger three concurrent initDB() calls and require all to resolve.',
        expected: 'Concurrent initialization does not throw or deadlock.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const results = await Promise.all([db.initDB(), db.initDB(), db.initDB()]);
            assert.strictEqual(results.length, 3);
        }
    },
    {
        id: 'PERSIST-005',
        name: 'PostgreSQL Backend - Real Round Trip, Independent Connection, and Schema Migration End-State',
        subsystem: 'persistence',
        setup: 'Requires DB_TYPE=postgres plus DB_POSTGRESDB_HOST/PORT/USER/PASSWORD and an isolated qualification database',
        steps: 'Initialize the real PostgreSQL backend, persist an API key through Figranium storage, verify it through a second independent PostgreSQL connection, and verify migrated API-key columns are TEXT.',
        expected: 'Figranium writes to PostgreSQL, data is visible from an independent connection, and key-column migration end-state is correct.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const required = ['DB_POSTGRESDB_HOST', 'DB_POSTGRESDB_PORT', 'DB_POSTGRESDB_USER', 'DB_POSTGRESDB_PASSWORD'];
            const missing = required.filter(name => !process.env[name]);
            if (missing.length) {
                return { status: 'BLOCKED', reason: `PostgreSQL qualification environment is missing: ${missing.join(', ')}` };
            }

            const primaryPool = await db.initDB();
            assert.ok(primaryPool, 'Configured PostgreSQL backend must return a pool');

            const independentPool = new Pool({
                host: process.env.DB_POSTGRESDB_HOST,
                port: Number(process.env.DB_POSTGRESDB_PORT),
                user: process.env.DB_POSTGRESDB_USER,
                password: process.env.DB_POSTGRESDB_PASSWORD,
                database: process.env.DB_POSTGRESDB_DATABASE || 'postgres',
                ssl: ['true', '1'].includes(String(process.env.DB_POSTGRESDB_SSL || '').toLowerCase()) ? { rejectUnauthorized: false } : false
            });

            const originalKey = await storage.loadApiKey();
            const testKey = `fig_pg_qual_${Date.now()}`;
            try {
                await storage.saveApiKey(testKey);
                const direct = await independentPool.query('SELECT key FROM api_key WHERE id = 1');
                assert.strictEqual(direct.rows[0]?.key, testKey, 'Independent PostgreSQL connection must see the storage write');

                const tables = await independentPool.query(`
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name IN ('users','tasks','executions','api_key','credentials','ai_models','proxies_config','captcha_settings')
                `);
                const tableNames = new Set(tables.rows.map(r => r.table_name));
                for (const table of ['users','tasks','executions','api_key','credentials','ai_models','proxies_config','captcha_settings']) {
                    assert.ok(tableNames.has(table), `Expected PostgreSQL table ${table}`);
                }

                const columns = await independentPool.query(`
                    SELECT table_name, data_type
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND column_name = 'key'
                      AND table_name IN ('api_key','gemini_api_key','openai_api_key','claude_api_key')
                `);
                const types = new Map(columns.rows.map(r => [r.table_name, r.data_type]));
                for (const table of ['api_key','gemini_api_key','openai_api_key','claude_api_key']) {
                    assert.strictEqual(types.get(table), 'text', `${table}.key must be migrated to TEXT`);
                }
            } finally {
                await storage.saveApiKey(originalKey || '');
                await independentPool.end();
            }
        }
    }
];

module.exports = { tests };
