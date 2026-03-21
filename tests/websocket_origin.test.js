const assert = require('assert');
const { isValidWebSocketOrigin } = require('../url-utils');

async function testWebSocketOrigin() {
    console.log('--- Testing WebSocket Origin Verification (CSWSH Protection) ---');

    // Test 1: Same Origin (Matches)
    console.log('Test 1: Same Origin');
    const headers1 = {
        origin: 'http://localhost:11345',
        host: 'localhost:11345'
    };
    assert.strictEqual(isValidWebSocketOrigin(headers1.origin, headers1.host), true, 'Same origin should be accepted');
    console.log('PASS');

    // Test 2: Different Origin (Mismatch)
    console.log('Test 2: Different Origin');
    const headers2 = {
        origin: 'http://evil.com',
        host: 'localhost:11345'
    };
    assert.strictEqual(isValidWebSocketOrigin(headers2.origin, headers2.host), false, 'Different origin should be rejected');
    console.log('PASS');

    // Test 3: No Origin Header (e.g., from a tool or non-browser client)
    console.log('Test 3: No Origin Header');
    const headers3 = {
        host: 'localhost:11345'
    };
    assert.strictEqual(isValidWebSocketOrigin(headers3.origin, headers3.host), true, 'Request without origin should be accepted (consistent with browser behavior for non-browser clients)');
    console.log('PASS');

    // Test 4: Invalid Origin URL
    console.log('Test 4: Invalid Origin URL');
    const headers4 = {
        origin: 'not-a-url',
        host: 'localhost:11345'
    };
    assert.strictEqual(isValidWebSocketOrigin(headers4.origin, headers4.host), false, 'Invalid origin URL should be rejected');
    console.log('PASS');

    // Test 5: Subdomain mismatch
    console.log('Test 5: Subdomain mismatch');
    const headers5 = {
        origin: 'http://sub.localhost:11345',
        host: 'localhost:11345'
    };
    assert.strictEqual(isValidWebSocketOrigin(headers5.origin, headers5.host), false, 'Different subdomain origin should be rejected');
    console.log('PASS');

    console.log('--- WebSocket Origin Verification Tests Passed ---');
}

testWebSocketOrigin().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
