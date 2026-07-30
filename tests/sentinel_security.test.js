const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function() {
  if (arguments[0] === 'express-rate-limit') {
    return () => (req, res, next) => next();
  }
  if (arguments[0] === 'express') {
    const mock = () => ({});
    mock.Router = () => ({});
    mock.json = () => (req, res, next) => next();
    mock.static = () => (req, res, next) => next();
    return mock;
  }
  if (arguments[0] === 'pg') {
    return {
        Pool: function() {
            return {
                connect: () => ({
                    query: () => ({ rows: [] }),
                    release: () => {}
                }),
                query: () => ({ rows: [] })
            };
        }
    };
  }
  return originalRequire.apply(this, arguments);
};

const { requireAuthForSettings } = require('../src/server/middleware');
const { executeAction } = require('../src/agent/figranite/action-handler');
const assert = require('assert');

async function testAuthForSettings() {
    console.log('--- Testing requireAuthForSettings Security ---');

    const mockRes = {
        status: (code) => {
            mockRes.statusCode = code;
            return mockRes;
        },
        json: (data) => {
            mockRes.body = data;
            return mockRes;
        },
        redirect: (url) => {
            mockRes.redirectedTo = url;
            return mockRes;
        }
    };

    // Test 1: Unauthenticated request should be blocked even if NODE_ENV is NOT production
    console.log('Test 1: Unauthenticated request in development');
    process.env.NODE_ENV = 'development';
    let req1 = { session: {}, xhr: true, path: '/api/settings/api-key' };
    let nextCalled1 = false;
    requireAuthForSettings(req1, mockRes, () => { nextCalled1 = true; });

    assert.strictEqual(nextCalled1, false, 'Next should NOT be called when unauthenticated in development');
    assert.strictEqual(mockRes.statusCode, 401, 'Should return 401 for API request');
    console.log('PASS');

    // Test 2: Authenticated request should pass
    console.log('Test 2: Authenticated request');
    let req2 = { session: { user: { id: 1 } }, xhr: true, path: '/api/settings/api-key' };
    let nextCalled2 = false;
    requireAuthForSettings(req2, mockRes, () => { nextCalled2 = true; });

    assert.strictEqual(nextCalled2, true, 'Next should be called when authenticated');
    console.log('PASS');

    console.log('--- requireAuthForSettings Security Tests Passed ---');
}

async function testApiKeyLoopbackBypass() {
    console.log('\n--- Testing API Key Loopback Bypass (CVE Prevention) ---');

    const { requireApiKey } = require('../src/server/middleware');

    const mockRes = {
        status: (code) => {
            mockRes.statusCode = code;
            return mockRes;
        },
        json: (data) => {
            mockRes.body = data;
            return mockRes;
        }
    };

    // Test 1: Legitimate internal request (req.ip is loopback)
    console.log('Test 1: Legitimate internal request');
    let nextCalled1 = false;
    const req1 = {
        get: (header) => (header.toLowerCase() === 'x-internal-run' ? '1' : null),
        socket: { remoteAddress: '127.0.0.1' },
        ip: '127.0.0.1'
    };
    await requireApiKey(req1, mockRes, () => { nextCalled1 = true; });
    assert.strictEqual(nextCalled1, true, 'Next should be called for legitimate internal request');
    console.log('PASS');

    // Test 2: Spoofed internal request via local proxy (socket is loopback, but req.ip is external)
    console.log('Test 2: Spoofed internal request via local proxy');
    let nextCalled2 = false;
    const req2 = {
        get: (header) => (header.toLowerCase() === 'x-internal-run' ? '1' : null),
        socket: { remoteAddress: '127.0.0.1' },
        ip: '8.8.8.8'
    };
    await requireApiKey(req2, mockRes, () => { nextCalled2 = true; });
    assert.strictEqual(nextCalled2, false, 'Next should NOT be called for spoofed internal request');
    console.log('PASS');

    console.log('--- API Key Loopback Bypass Tests Passed ---');
}

async function testTaskIdSanitization() {
    console.log('\n--- Testing taskId Sanitization in agent start action ---');

    const logs = [];
    const context = {
        logs,
        resolveTemplate: (val) => val,
        options: {},
        baseUrl: 'http://localhost:11345',
        lastMouse: null,
        setStopOutcome: () => {},
        setStopRequested: () => {}
    };

    // Mock fetch
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
        logs.push(`Fetch called with URL: ${url}`);
        return {
            ok: true,
            json: async () => ({ success: true })
        };
    };

    const act = {
        type: 'start',
        value: '../../api/clear-cookies?'
    };

    try {
        await executeAction(act, context);
    } catch (e) {
        logs.push(`Action failed as expected: ${e.message}`);
    } finally {
        global.fetch = originalFetch;
    }

    const lastFetchLog = logs.find(l => l.startsWith('Fetch called with URL:'));
    console.log('Last fetch URL:', lastFetchLog);

    if (lastFetchLog && lastFetchLog.includes('..')) {
        throw new Error('TaskId was NOT sanitized, path traversal possible!');
    }

    assert.ok(logs.some(l => l.includes('Invalid task id.') || (l.startsWith('Fetch called with URL:') && !l.includes('..'))), 'TaskId should be sanitized');

    console.log('PASS: TaskId sanitization verified');
}

async function runTests() {
    await testAuthForSettings();
    await testApiKeyLoopbackBypass();
    await testTaskIdSanitization();
}

runTests().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
