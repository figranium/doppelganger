const assert = require('assert');
const storage = require('../../../src/server/storage');
const bcrypt = require('bcryptjs');

let baseUrl = 'http://127.0.0.1:11345';
let serverStarted = false;
let authCookie = null;
let originalUsers = null;

async function ensureServerRunning() {
    if (serverStarted) return baseUrl;
    require('../../../server');
    for (let i = 0; i < 30; i++) {
        try {
            const ping = await fetch(`${baseUrl}/api/health`);
            if (ping.status === 200) {
                serverStarted = true;
                return baseUrl;
            }
        } catch {
            await new Promise(r => setTimeout(r, 200));
        }
    }
    throw new Error('Figranium API server did not become ready');
}

function headers(json = false) {
    return {
        ...(json ? { 'Content-Type': 'application/json' } : {}),
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': authCookie || ''
    };
}

async function cleanup() {
    if (originalUsers) {
        await storage.saveUsers(originalUsers);
        originalUsers = null;
    }
}

const tests = [
    {
        id: 'API-001',
        name: 'Health Check API - Endpoint returning status OK',
        subsystem: 'api',
        setup: 'Express server running on 127.0.0.1:11345',
        steps: 'GET /api/health and validate status code and response body.',
        expected: 'Returns 200 with status="ok".',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const base = await ensureServerRunning();
            const res = await fetch(`${base}/api/health`);
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.status, 'ok');
        }
    },
    {
        id: 'API-002',
        name: 'Auth Setup & Login Lifecycle',
        subsystem: 'api',
        setup: 'Express server running with isolated/restorable user storage',
        steps: 'Check setup status, ensure a known qualification account can authenticate, reject a wrong password, and preserve the resulting session cookie.',
        expected: 'Bad credentials return 401; good credentials return 200 with a session cookie; original user storage is restored after the suite.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const base = await ensureServerRunning();
            if (!originalUsers) originalUsers = JSON.parse(JSON.stringify(await storage.loadUsers()));

            const checkRes = await fetch(`${base}/api/auth/check-setup`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
            assert.strictEqual(checkRes.status, 200);
            const checkData = await checkRes.json();

            let email = 'qual_admin@example.com';
            const password = 'Password123!';

            if (checkData.setupRequired) {
                const setupRes = await fetch(`${base}/api/auth/setup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                    body: JSON.stringify({ email, name: 'Qualification Admin', password })
                });
                assert.strictEqual(setupRes.status, 200, 'Initial qualification user setup must succeed');
            } else {
                const users = await storage.loadUsers();
                assert.ok(users.length > 0, 'Configured instance must contain at least one user');
                email = users[0].email;
                users[0].password = await bcrypt.hash(password, 12);
                await storage.saveUsers(users);
            }

            const badLoginRes = await fetch(`${base}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({ email, password: 'wrong_password_123' })
            });
            assert.strictEqual(badLoginRes.status, 401, 'Bad credentials must return 401');

            const goodLoginRes = await fetch(`${base}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({ email, password })
            });
            assert.strictEqual(goodLoginRes.status, 200, 'Good login must return 200');

            const cookies = goodLoginRes.headers.getSetCookie ? goodLoginRes.headers.getSetCookie() : [goodLoginRes.headers.get('set-cookie')];
            authCookie = (cookies || []).filter(Boolean).map(c => c.split(';')[0]).join('; ');
            assert.ok(authCookie, 'Login must yield auth session cookie');
        }
    },
    {
        id: 'API-003',
        name: 'Tasks API - CRUD Operations & Persistence',
        subsystem: 'api',
        setup: 'Authenticated API request via session cookie',
        steps: 'Create a Task, list it, update it, verify the updated value, delete it, then verify it is absent.',
        expected: 'Full Task CRUD lifecycle succeeds and changes are reflected by subsequent reads.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const base = await ensureServerRunning();
            const h = headers(true);
            let createdId;
            try {
                const createRes = await fetch(`${base}/api/tasks`, {
                    method: 'POST', headers: h,
                    body: JSON.stringify({
                        name: 'API Qualification Task',
                        url: 'http://127.0.0.1:11346/form',
                        mode: 'agent',
                        actions: [{ id: 'act_1', type: 'navigate', value: 'http://127.0.0.1:11346/form' }]
                    })
                });
                assert.strictEqual(createRes.status, 200);
                const created = await createRes.json();
                createdId = created.id;
                assert.ok(createdId);

                const listRes = await fetch(`${base}/api/tasks`, { headers: h });
                assert.strictEqual(listRes.status, 200);
                const tasks = await listRes.json();
                assert.ok(tasks.some(t => t.id === createdId));

                const updateRes = await fetch(`${base}/api/tasks/${createdId}`, {
                    method: 'PATCH', headers: h, body: JSON.stringify({ name: 'Updated API Qualification Task' })
                });
                assert.strictEqual(updateRes.status, 200);

                const afterUpdate = await (await fetch(`${base}/api/tasks`, { headers: h })).json();
                assert.strictEqual(afterUpdate.find(t => t.id === createdId)?.name, 'Updated API Qualification Task');
            } finally {
                if (createdId) {
                    const del = await fetch(`${base}/api/tasks/${createdId}`, { method: 'DELETE', headers: h });
                    assert.ok([200, 204, 404].includes(del.status));
                }
            }
        }
    },
    {
        id: 'API-004',
        name: 'Settings API - Theme, API Key, Proxy, and User-Agent Reads',
        subsystem: 'api',
        setup: 'Authenticated API requests via session cookie',
        steps: 'Read theme, API key, proxy list, and user-agent configuration; write a temporary theme value and restore the original.',
        expected: 'All four settings endpoints return valid structures and theme persistence round-trips without leaving changed state.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const base = await ensureServerRunning();
            const h = headers(true);

            const themeGet = await fetch(`${base}/api/settings/theme`, { headers: h });
            assert.strictEqual(themeGet.status, 200);
            const originalTheme = (await themeGet.json()).theme;

            const keyRes = await fetch(`${base}/api/settings/api-key`, { headers: h });
            assert.strictEqual(keyRes.status, 200);
            const keyData = await keyRes.json();
            assert.ok(Object.prototype.hasOwnProperty.call(keyData, 'apiKey'));

            const proxyRes = await fetch(`${base}/api/settings/proxies`, { headers: h });
            assert.strictEqual(proxyRes.status, 200);
            assert.ok(Array.isArray(await proxyRes.json()));

            const uaRes = await fetch(`${base}/api/settings/user-agent`, { headers: h });
            assert.strictEqual(uaRes.status, 200);
            const uaData = await uaRes.json();
            assert.ok(uaData && typeof uaData === 'object');

            const temporaryTheme = originalTheme === 'dark' ? 'light' : 'dark';
            try {
                const setRes = await fetch(`${base}/api/settings/theme`, {
                    method: 'POST', headers: h, body: JSON.stringify({ theme: temporaryTheme })
                });
                assert.strictEqual(setRes.status, 200);
                const verifyRes = await fetch(`${base}/api/settings/theme`, { headers: h });
                assert.strictEqual((await verifyRes.json()).theme, temporaryTheme);
            } finally {
                await fetch(`${base}/api/settings/theme`, {
                    method: 'POST', headers: h, body: JSON.stringify({ theme: originalTheme || 'dark' })
                });
            }
        }
    },
    {
        id: 'API-005',
        name: 'Executions, Captures, and Screenshots API - Response Contracts',
        subsystem: 'api',
        setup: 'Authenticated API requests via session cookie',
        steps: 'GET /api/executions, /api/captures, and /api/screenshots and validate their collection response contracts.',
        expected: 'All endpoints return 200 and the documented arrays.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const base = await ensureServerRunning();
            const h = headers();

            const execRes = await fetch(`${base}/api/executions`, { headers: h });
            assert.strictEqual(execRes.status, 200);
            assert.ok(Array.isArray((await execRes.json()).executions));

            const capturesRes = await fetch(`${base}/api/captures`, { headers: h });
            assert.strictEqual(capturesRes.status, 200);
            assert.ok(Array.isArray((await capturesRes.json()).captures));

            const screenshotsRes = await fetch(`${base}/api/screenshots`, { headers: h });
            assert.strictEqual(screenshotsRes.status, 200);
            assert.ok(Array.isArray((await screenshotsRes.json()).screenshots));
        }
    },
    {
        id: 'API-006',
        name: 'Schedules API - Create, Read, Validate, Status, and Disable',
        subsystem: 'api',
        setup: 'Authenticated API request with a temporary Task',
        steps: 'Create a temporary Task, save a valid cron schedule, read list/status, reject invalid schedule input, disable the schedule, and delete the Task.',
        expected: 'Schedule CRUD/validation endpoints persist valid configuration, reject invalid cron, report status, and disable cleanly.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const base = await ensureServerRunning();
            const h = headers(true);
            let taskId;
            try {
                const create = await fetch(`${base}/api/tasks`, {
                    method: 'POST', headers: h,
                    body: JSON.stringify({ name: 'Schedule Qualification Task', url: 'http://127.0.0.1:11346/', mode: 'agent', actions: [] })
                });
                assert.strictEqual(create.status, 200);
                taskId = (await create.json()).id;
                assert.ok(taskId);

                const save = await fetch(`${base}/api/schedules/${taskId}`, {
                    method: 'POST', headers: h, body: JSON.stringify({ enabled: true, cron: '0 * * * *' })
                });
                assert.strictEqual(save.status, 200);
                const saved = await save.json();
                assert.strictEqual(saved.schedule.enabled, true);
                assert.strictEqual(saved.schedule.cron, '0 * * * *');
                assert.ok(Number.isFinite(saved.nextRun));

                const list = await fetch(`${base}/api/schedules`, { headers: h });
                assert.strictEqual(list.status, 200);
                assert.ok((await list.json()).schedules.some(s => s.taskId === taskId));

                const status = await fetch(`${base}/api/schedules/${taskId}/status`, { headers: h });
                assert.strictEqual(status.status, 200);
                const statusData = await status.json();
                assert.strictEqual(statusData.isValid, true);
                assert.strictEqual(statusData.cron, '0 * * * *');

                const invalid = await fetch(`${base}/api/schedules/${taskId}`, {
                    method: 'POST', headers: h, body: JSON.stringify({ enabled: true, cron: 'not-a-cron' })
                });
                assert.strictEqual(invalid.status, 400, 'Invalid cron must be rejected');

                const disable = await fetch(`${base}/api/schedules/${taskId}`, { method: 'DELETE', headers: h });
                assert.strictEqual(disable.status, 200);
                assert.strictEqual((await disable.json()).success, true);
            } finally {
                if (taskId) await fetch(`${base}/api/tasks/${taskId}`, { method: 'DELETE', headers: h });
            }
        }
    }
];

module.exports = { tests, cleanup };
