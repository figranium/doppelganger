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

testAuthForSettings().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
