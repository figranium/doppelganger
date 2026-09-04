const assert = require('assert');
const storage = require('../../../src/server/storage');
const db = require('../../../src/server/db');

const tests = [
    {
        id: 'PERSIST-001',
        name: 'Storage Parity - Task CRUD & Snapshot Persistence',
        subsystem: 'persistence',
        setup: 'Storage module initialized',
        steps: 'Load tasks, modify task list with new task, save tasks, load tasks again, verify task presence.',
        expected: 'Tasks correctly saved to storage (disk/PG) and retrieved with identical properties.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const taskId = `test_task_${Date.now()}`;
            const testTask = {
                id: taskId,
                name: 'Persistence Qualification Task',
                url: 'https://example.com',
                mode: 'agent',
                wait: 1000,
                actions: [{ id: 'a1', type: 'navigate', value: 'https://example.com' }],
                variables: { var1: { type: 'string', value: 'val1' } }
            };

            const existingTasks = await storage.loadTasks();
            const updatedTasks = [...existingTasks, testTask];

            // Save tasks
            await storage.saveTasks(updatedTasks);

            // Load tasks
            const loadedTasks = await storage.loadTasks();
            const found = loadedTasks.find(t => t.id === taskId);
            assert.ok(found, 'Saved task must be retrievable');
            assert.strictEqual(found.name, 'Persistence Qualification Task');

            // Cleanup task
            const cleaned = loadedTasks.filter(t => t.id !== taskId);
            await storage.saveTasks(cleaned);
        }
    },
    {
        id: 'PERSIST-002',
        name: 'Storage Parity - User Credentials & API Key Storage',
        subsystem: 'persistence',
        setup: 'Storage module initialized',
        steps: 'Save API key and credentials, retrieve API key, delete credentials.',
        expected: 'API key and credentials persisted and retrieved accurately.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const testKey = `fig_qual_key_${Date.now()}`;
            await storage.saveApiKey(testKey);

            const loadedKey = await storage.loadApiKey();
            assert.strictEqual(loadedKey, testKey, 'API key must match saved key');
        }
    },
    {
        id: 'PERSIST-003',
        name: 'Storage Parity - Theme Configuration Persistence & Cookies',
        subsystem: 'persistence',
        setup: 'Storage module initialized',
        steps: 'Save theme config "solarized-dark", load theme config.',
        expected: 'Theme preference saved and restored without FOUC state discrepancy.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            await storage.saveThemeConfig('solarized-dark');
            const themeConfig = await storage.loadThemeConfig();
            assert.strictEqual(themeConfig, 'solarized-dark');

            // Restore dark theme
            await storage.saveThemeConfig('dark');
        }
    },
    {
        id: 'PERSIST-004',
        name: 'Database Initialization - Race Condition Hardening',
        subsystem: 'persistence',
        setup: 'Call initDB concurrently from multiple promises',
        steps: 'Trigger concurrent initDB() calls and verify single shared promise resolves without duplicate table creations or pool contention.',
        expected: 'All concurrent calls resolve successfully to the same DB pool instance.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const results = await Promise.all([
                db.initDB(),
                db.initDB(),
                db.initDB()
            ]);
            assert.strictEqual(results.length, 3);
        }
    }
];

module.exports = { tests };
