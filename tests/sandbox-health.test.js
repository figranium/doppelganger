const assert = require('assert');
// Mock JSDOM to avoid dependency issues in restricted environment if necessary,
// but let's see if we can just mock the parts of sandbox.js we need or if we can get it to run.
// Actually, createSafeProxy doesn't use JSDOM directly, but the file requires it.

// We can try to mock the require of jsdom if it's missing.
try {
    require('jsdom');
} catch (e) {
    const Module = require('module');
    const originalRequire = Module.prototype.require;
    Module.prototype.require = function(name) {
        if (name === 'jsdom') {
            return { JSDOM: function() { return { window: {} }; } };
        }
        return originalRequire.apply(this, arguments);
    };
}

const { createSafeProxy } = require('../src/agent/sandbox');

async function testCreateSafeProxy() {
    console.log('Testing createSafeProxy...');

    // Test with a simple object
    const obj = { a: 1, b: { c: 2 } };
    const proxyObj = createSafeProxy(obj);
    assert.strictEqual(proxyObj.a, 1);
    assert.strictEqual(proxyObj.b.c, 2);
    console.log('✓ Simple object proxy works');

    // Test with a function
    function testFn(x, y) {}
    const proxyFn = createSafeProxy(testFn);
    assert.strictEqual(typeof proxyFn, 'function');
    assert.strictEqual(proxyFn.name, 'testFn');
    assert.strictEqual(proxyFn.length, 2);
    console.log('✓ Function proxy works and maintains name/length');

    // Test property access and wrapping
    const nestedObj = { getFn: () => (a, b, c) => {} };
    const proxyNested = createSafeProxy(nestedObj);
    const fn = proxyNested.getFn();
    assert.strictEqual(typeof fn, 'function');
    assert.strictEqual(fn.length, 3);
    console.log('✓ Nested function proxy works');

    console.log('All createSafeProxy tests passed!');
}

testCreateSafeProxy().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
