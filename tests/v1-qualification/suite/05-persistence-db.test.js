const assert = require('assert');
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
            const originalTasks = await storage.loadTasks();
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
        name: 'PostgreSQL Restart/Migration Qualification',
        subsystem: 'persistence',
        setup: 'Requires an isolated PostgreSQL service and a known previous schema snapshot',
        steps: 'Upgrade a previous schema, restart the database/service, then verify all v1-critical records and migrations.',
        expected: 'Migration and restart persistence are proven against an isolated real PostgreSQL instance.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => ({ status: 'NOT_TESTED', reason: 'No isolated previous-schema PostgreSQL restart fixture is wired into this suite yet.' })
    }
];

module.exports = { tests };
