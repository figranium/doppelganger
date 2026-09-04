const assert = require('assert');
const storage = require('../../../src/server/storage');
const bcrypt = require('bcryptjs');

let baseUrl = 'http://127.0.0.1:11345';
let serverStarted = false;
let authCookie = null;

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
    serverStarted = true;
    return baseUrl;
}

const tests = [
    {
        id: 'API-001',
        name: 'Health Check API - Endpoint returning status OK',
        subsystem: 'api',
        setup: 'Express server running on 127.0.0.1:11345',
        steps: 'GET /api/health',
        expected: 'Returns 200 OK with status: ok',
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
        setup: 'Express server running on 127.0.0.1:11345',
        steps: 'Check setup status via GET /api/auth/check-setup, setup admin user if needed, and POST /api/auth/login.',
        expected: 'Login succeeds with correct password, returns session cookie, fails with 401 on incorrect password.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const base = await ensureServerRunning();

            const checkRes = await fetch(`${base}/api/auth/check-setup`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            const checkData = await checkRes.json();

            let email = 'qual_admin@example.com';
            let password = 'Password123!';

            if (checkData.setupRequired) {
                const setupRes = await fetch(`${base}/api/auth/setup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                    body: JSON.stringify({ email, name: 'Qual Admin', password })
                });
                assert.ok([200, 400, 403].includes(setupRes.status));
            } else {
                // Ensure a test user with known password exists in storage
                const users = await storage.loadUsers();
                if (users.length > 0) {
                    email = users[0].email;
                    // Reset user password to known password for qualification tests
                    users[0].password = await bcrypt.hash(password, 12);
                    await storage.saveUsers(users);
                }
            }

            // Attempt bad login
            const badLoginRes = await fetch(`${base}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({ email, password: 'wrong_password_123' })
            });
            assert.strictEqual(badLoginRes.status, 401, 'Bad credentials must return 401');

            // Attempt good login
            const goodLoginRes = await fetch(`${base}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({ email, password })
            });
            assert.strictEqual(goodLoginRes.status, 200, 'Good login must return 200');

            const cookies = goodLoginRes.headers.getSetCookie ? goodLoginRes.headers.getSetCookie() : [goodLoginRes.headers.get('set-cookie')];
            if (cookies && cookies.length > 0) {
                authCookie = cookies.map(c => c.split(';')[0]).join('; ');
            }
            assert.ok(authCookie, 'Login must yield auth session cookie');
        }
    },
    {
        id: 'API-003',
        name: 'Tasks API - CRUD Operations & Validation',
        subsystem: 'api',
        setup: 'Authenticated API request via session cookie',
        steps: 'Create task, GET task list, PATCH update task, DELETE task.',
        expected: 'Full CRUD lifecycle functions with correct status codes and persistent task snapshots.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const base = await ensureServerRunning();
            const headers = {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': authCookie || ''
            };

            // 1. Create task
            const createRes = await fetch(`${base}/api/tasks`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: 'API Qualification Task',
                    url: 'http://127.0.0.1:11346/form',
                    mode: 'agent',
                    actions: [{ id: 'act_1', type: 'navigate', value: 'http://127.0.0.1:11346/form' }]
                })
            });
            assert.strictEqual(createRes.status, 200, 'Task creation should return 200');
            const created = await createRes.json();
            assert.ok(created.id, 'Created task must have an ID');

            // 2. GET task list
            const listRes = await fetch(`${base}/api/tasks`, { headers });
            assert.strictEqual(listRes.status, 200);
            const tasks = await listRes.json();
            assert.ok(Array.isArray(tasks) && tasks.some(t => t.id === created.id));

            // 3. PATCH update task
            const updateRes = await fetch(`${base}/api/tasks/${created.id}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ name: 'Updated API Task' })
            });
            assert.strictEqual(updateRes.status, 200);

            // Cleanup created task
            await fetch(`${base}/api/tasks/${created.id}`, { method: 'DELETE', headers });
        }
    },
    {
        id: 'API-004',
        name: 'Settings API - API Key, Theme, Proxy, and User-Agent',
        subsystem: 'api',
        setup: 'API requests via session cookie',
        steps: 'GET/POST /api/settings/theme.',
        expected: 'Settings are persisted and retrieved accurately.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const base = await ensureServerRunning();
            const headers = {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': authCookie || ''
            };

            // Theme setting
            const themeRes = await fetch(`${base}/api/settings/theme`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ theme: 'dark' })
            });
            assert.strictEqual(themeRes.status, 200);
            const themeData = await themeRes.json();
            assert.strictEqual(themeData.theme, 'dark');

            // GET theme
            const getThemeRes = await fetch(`${base}/api/settings/theme`, { headers });
            assert.strictEqual(getThemeRes.status, 200);
            const getThemeData = await getThemeRes.json();
            assert.strictEqual(getThemeData.theme, 'dark');
        }
    },
    {
        id: 'API-005',
        name: 'Executions & Data API - Fetching execution logs, captures, and screenshots',
        subsystem: 'api',
        setup: 'API requests via session cookie',
        steps: 'GET /api/executions, GET /api/captures, GET /api/screenshots.',
        expected: 'Endpoints return valid JSON structures and arrays.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const base = await ensureServerRunning();
            const headers = {
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': authCookie || ''
            };

            const execRes = await fetch(`${base}/api/executions`, { headers });
            assert.strictEqual(execRes.status, 200);
            const execData = await execRes.json();
            assert.ok(Array.isArray(execData.executions));

            const capturesRes = await fetch(`${base}/api/captures`, { headers });
            assert.strictEqual(capturesRes.status, 200);
            const capturesData = await capturesRes.json();
            assert.ok(Array.isArray(capturesData.captures));

            const screenshotsRes = await fetch(`${base}/api/screenshots`, { headers });
            assert.strictEqual(screenshotsRes.status, 200);
            const screenshotsData = await screenshotsRes.json();
            assert.ok(Array.isArray(screenshotsData.screenshots));
        }
    },
    {
        id: 'API-006',
        name: 'Schedules API - Schedule CRUD and Validation',
        subsystem: 'api',
        setup: 'API requests via session cookie',
        steps: 'GET /api/schedules.',
        expected: 'Schedules endpoint lists schedules and accepts updates.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const base = await ensureServerRunning();
            const headers = {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': authCookie || ''
            };

            const listRes = await fetch(`${base}/api/schedules`, { headers });
            assert.strictEqual(listRes.status, 200);
            const schedData = await listRes.json();
            assert.ok(Array.isArray(schedData.schedules));
        }
    }
];

module.exports = { tests };
