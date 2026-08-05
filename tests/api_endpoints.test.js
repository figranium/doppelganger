/**
 * Tests for the new programmatic API endpoints:
 *   - PATCH /api/tasks/:id (task update)
 *   - DELETE /api/tasks/:id (task deletion with schedule cleanup)
 *   - POST /api/browser/open (browser launcher - auth + validation only)
 *   - POST /api/inspector/highlight (selector inspector - auth + validation only)
 *
 * These tests start the server on a fixed port and make real HTTP requests
 * using Node's native http module. They focus on auth gating, validation
 * errors, and response shape correctness — not full browser launch (which
 * requires a display).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const TEST_API_KEY = 'test_api_key_for_endpoints_' + Date.now();
const TEST_PORT = 11399;
const DATA_DIR = path.join(__dirname, '..', 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const API_KEY_FILE = path.join(DATA_DIR, 'api_key.json');

let originalApiKey;
let originalTasks;

function httpRequest(method, urlPath, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const bodyStr = body ? JSON.stringify(body) : '';
        const options = {
            hostname: '127.0.0.1',
            port: TEST_PORT,
            path: urlPath,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr),
                'Host': `127.0.0.1:${TEST_PORT}`,
                ...headers
            }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (e) {}
                resolve({ status: res.statusCode, body: parsed, raw: data });
            });
        });
        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function waitForServer(maxWaitMs = 15000) {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
        const ok = await new Promise((resolve) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: TEST_PORT,
                path: '/api/health',
                method: 'GET',
                headers: { 'x-api-key': TEST_API_KEY }
            }, (res) => {
                res.resume();
                res.on('end', () => resolve(res.statusCode === 200));
            });
            req.on('error', () => resolve(false));
            req.end();
        });
        if (ok) return;
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('Server did not start within ' + maxWaitMs + 'ms');
}

async function setup() {
    // Ensure data dir exists
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    // Backup API key, write test API key
    if (fs.existsSync(API_KEY_FILE)) {
        originalApiKey = fs.readFileSync(API_KEY_FILE, 'utf8');
    }
    fs.writeFileSync(API_KEY_FILE, JSON.stringify({ apiKey: TEST_API_KEY }, null, 2));

    // Backup tasks
    if (fs.existsSync(TASKS_FILE)) {
        originalTasks = fs.readFileSync(TASKS_FILE, 'utf8');
    }
    fs.writeFileSync(TASKS_FILE, JSON.stringify([], null, 2));

    // Set env for server
    process.env.PORT = String(TEST_PORT);
    process.env.SESSION_SECRET = 'test-secret-for-api-endpoints';

    // Require server fresh (starts the express app)
    delete require.cache[require.resolve('../server.js')];
    require('../server.js');

    // Wait for server to be ready
    await waitForServer();
}

async function teardown() {
    if (originalApiKey) {
        fs.writeFileSync(API_KEY_FILE, originalApiKey);
    } else if (fs.existsSync(API_KEY_FILE)) {
        fs.unlinkSync(API_KEY_FILE);
    }
    if (originalTasks) {
        fs.writeFileSync(TASKS_FILE, originalTasks);
    } else if (fs.existsSync(TASKS_FILE)) {
        fs.unlinkSync(TASKS_FILE);
    }
}

async function runTests() {
    let passed = 0;
    let failed = 0;
    const assert = (cond, msg, extra = null) => {
        if (cond) { passed++; console.log('  ✓ ' + msg); }
        else { failed++; console.error('  ✗ ' + msg + (extra ? ' | ' + JSON.stringify(extra) : '')); }
    };

    console.log('\n=== API Endpoints Tests ===\n');

    // Test 1: PATCH /api/tasks/:id without auth → 401 or 403
    console.log('Test 1: PATCH /api/tasks/:id without auth');
    {
        const res = await httpRequest('PATCH', '/api/tasks/task_test1', { name: 'Updated' });
        assert(res.status === 401 || res.status === 403, 'should return 401 or 403 without API key', { status: res.status, body: res.body });
    }

    // Test 2: DELETE /api/tasks/:id without auth → 401 or 403
    console.log('Test 2: DELETE /api/tasks/:id without auth');
    {
        const res = await httpRequest('DELETE', '/api/tasks/task_test1', null);
        assert(res.status === 401 || res.status === 403, 'should return 401 or 403 without API key', { status: res.status, body: res.body });
    }

    // Test 3: POST /api/browser/open without auth → 401 or 403
    console.log('Test 3: POST /api/browser/open without auth');
    {
        const res = await httpRequest('POST', '/api/browser/open', { url: 'https://example.com' });
        assert(res.status === 401 || res.status === 403, 'should return 401 or 403 without API key', { status: res.status, body: res.body });
    }

    // Test 4: POST /api/inspector/highlight without auth → 401 or 403
    console.log('Test 4: POST /api/inspector/highlight without auth');
    {
        const res = await httpRequest('POST', '/api/inspector/highlight', { sessionId: 'sess_test' });
        assert(res.status === 401 || res.status === 403, 'should return 401 or 403 without API key', { status: res.status, body: res.body });
    }

    // Test 5: PATCH /api/tasks/:id with auth on non-existent task → 404
    console.log('Test 5: PATCH /api/tasks/:id with auth on non-existent task');
    {
        const res = await httpRequest('PATCH', '/api/tasks/nonexistent_task', { name: 'Updated' }, {
            'x-api-key': TEST_API_KEY
        });
        assert(res.status === 404, 'should return 404 for non-existent task', { status: res.status, body: res.body });
        assert(res.body && res.body.error === 'TASK_NOT_FOUND', 'should return TASK_NOT_FOUND error', { body: res.body });
    }

    // Test 6: DELETE /api/tasks/:id with auth on non-existent task → 404
    console.log('Test 6: DELETE /api/tasks/:id with auth on non-existent task');
    {
        const res = await httpRequest('DELETE', '/api/tasks/nonexistent_task', null, {
            'x-api-key': TEST_API_KEY
        });
        assert(res.status === 404, 'should return 404 for non-existent task', { status: res.status, body: res.body });
        assert(res.body && res.body.error === 'TASK_NOT_FOUND', 'should return TASK_NOT_FOUND error', { body: res.body });
    }

    // Test 7: Create a task, PATCH it, verify response shape
    console.log('Test 7: Create task, PATCH it, verify response');
    {
        const taskId = 'task_test_patch_' + Date.now();
        // Create task via POST
        const createRes = await httpRequest('POST', '/api/tasks', {
            id: taskId,
            name: 'Original Name',
            mode: 'agent',
            actions: [{ type: 'navigate', url: 'https://example.com' }]
        }, { 'x-api-key': TEST_API_KEY });
        assert(createRes.status === 200, 'should create task successfully', { status: createRes.status, body: createRes.body });

        // PATCH the task
        const patchRes = await httpRequest('PATCH', `/api/tasks/${taskId}`, {
            name: 'Updated Task Name',
            mode: 'agent',
            actions: [{ type: 'click', selector: '#main-button' }]
        }, { 'x-api-key': TEST_API_KEY });
        assert(patchRes.status === 200, 'should patch task successfully', { status: patchRes.status, body: patchRes.body });
        assert(patchRes.body && patchRes.body.status === 'success', 'should return status: success', { body: patchRes.body });
        assert(patchRes.body && patchRes.body.id === taskId, 'should return correct task id', { body: patchRes.body });
        assert(patchRes.body && patchRes.body.updatedAt, 'should return updatedAt timestamp', { body: patchRes.body });
        assert(patchRes.body && patchRes.body.task, 'should return updated task object', { body: patchRes.body });
        assert(patchRes.body && patchRes.body.task && patchRes.body.task.name === 'Updated Task Name', 'should have updated name', { taskName: patchRes.body?.task?.name });
    }

    // Test 8: Create a task, DELETE it, verify response shape
    console.log('Test 8: Create task, DELETE it, verify response');
    {
        const taskId = 'task_test_delete_' + Date.now();
        // Create task
        const createRes = await httpRequest('POST', '/api/tasks', {
            id: taskId,
            name: 'Task To Delete',
            mode: 'agent',
            actions: []
        }, { 'x-api-key': TEST_API_KEY });
        assert(createRes.status === 200, 'should create task successfully');

        // DELETE the task
        const delRes = await httpRequest('DELETE', `/api/tasks/${taskId}`, null, {
            'x-api-key': TEST_API_KEY
        });
        assert(delRes.status === 200, 'should delete task successfully');
        assert(delRes.body && delRes.body.deleted === true, 'should return deleted: true');
        assert(delRes.body && delRes.body.id === taskId, 'should return correct task id');
        assert(delRes.body && delRes.body.message === 'Task successfully removed.', 'should return success message');

        // Verify task is gone
        const getRes = await httpRequest('GET', `/api/tasks`, null, { 'x-api-key': TEST_API_KEY });
        const taskExists = (getRes.body || []).some(t => t.id === taskId);
        assert(!taskExists, 'task should no longer exist in list');
    }

    // Test 9: POST /api/browser/open with auth (may fail due to no display, but auth should pass)
    console.log('Test 9: POST /api/browser/open with auth');
    {
        const res = await httpRequest('POST', '/api/browser/open', { url: 'https://example.com' }, {
            'x-api-key': TEST_API_KEY
        });
        // Either it launches (200) or fails due to no display (409/500) — both prove auth passed
        assert(res.status !== 401, 'should not return 401 (auth should pass)');
        assert(res.status !== 403, 'should not return 403 (auth should pass)');
    }

    // Test 10: POST /api/inspector/highlight with auth (may have session from Test 9, or not)
    console.log('Test 10: POST /api/inspector/highlight with auth');
    {
        const res = await httpRequest('POST', '/api/inspector/highlight', { targetHint: 'login button' }, {
            'x-api-key': TEST_API_KEY
        });
        // Auth should pass — any non-401/non-403 response proves the endpoint exists and auth works
        assert(res.status !== 401, 'should not return 401 (auth should pass)');
        assert(res.status !== 403, 'should not return 403 (auth should pass)');
        // If 404, should be NO_ACTIVE_SESSION (or null body if server returns plain 404)
        if (res.status === 404) {
            assert(res.body === null || res.body.error === 'NO_ACTIVE_SESSION', 'should return NO_ACTIVE_SESSION or null for 404', { body: res.body });
        } else if (res.status === 200) {
            assert(res.body && res.body.success === true, 'should return success: true for 200', { body: res.body });
        }
    }

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
    return failed === 0;
}

// Main
(async () => {
    try {
        await setup();
        const success = await runTests();
        await teardown();
        process.exit(success ? 0 : 1);
    } catch (e) {
        console.error('Test error:', e);
        try { await teardown(); } catch (e2) {}
        process.exit(1);
    }
})();