const assert = require('assert');
const {
    normalizeServer,
    createProxyId,
    normalizeProxy,
    normalizeRotationMode
} = require('../proxy-utils');

// 1. Test normalizeServer
console.log('Testing normalizeServer...');
assert.strictEqual(normalizeServer(''), '');
assert.strictEqual(normalizeServer(null), '');
assert.strictEqual(normalizeServer('  proxy.com  '), 'http://proxy.com');
assert.strictEqual(normalizeServer('https://proxy.com'), 'https://proxy.com');
assert.strictEqual(normalizeServer('http://proxy.com:8080'), 'http://proxy.com:8080');
console.log('✓ normalizeServer tests passed');

// 2. Test createProxyId
console.log('Testing createProxyId...');
const id1 = createProxyId('test-seed');
const id2 = createProxyId('test-seed');
const id3 = createProxyId('different-seed');
assert.strictEqual(id1, id2, 'Deterministic output failed');
assert.notStrictEqual(id1, id3, 'Unique output failed');
assert.ok(id1.startsWith('proxy_'), 'ID should start with proxy_');
assert.strictEqual(id1.length, 18, 'ID length should be proxy_ + 12 chars');
console.log('✓ createProxyId tests passed');

// 3. Test normalizeProxy
console.log('Testing normalizeProxy...');

// String inputs
const s1 = normalizeProxy('proxy.com');
assert.strictEqual(s1.server, 'http://proxy.com');
assert.strictEqual(s1.username, undefined);

const s2 = normalizeProxy('user:pass@proxy.com:8080');
assert.strictEqual(s2.server, 'http://proxy.com:8080');
assert.strictEqual(s2.username, 'user');
assert.strictEqual(s2.password, 'pass');

// Object inputs
const o1 = normalizeProxy({ server: 'proxy.com', username: 'u', password: 'p' });
assert.strictEqual(o1.server, 'http://proxy.com');
assert.strictEqual(o1.username, 'u');
assert.strictEqual(o1.password, 'p');

const o2 = normalizeProxy({ url: 'https://proxy.com', user: 'u2', pass: 'p2' });
assert.strictEqual(o2.server, 'https://proxy.com');
assert.strictEqual(o2.username, 'u2');
assert.strictEqual(o2.password, 'p2');

const o3 = normalizeProxy({ proxy: 'socks5://proxy.com', label: 'My Proxy' });
assert.strictEqual(o3.server, 'socks5://proxy.com');
assert.strictEqual(o3.label, 'My Proxy');

// Edge cases
assert.strictEqual(normalizeProxy(null), null);
assert.strictEqual(normalizeProxy(''), null);
assert.strictEqual(normalizeProxy({}), null);

// Rotating pool and falsy/null credentials edge cases
console.log('Testing rotating pool and falsy/null credentials...');
const rp1 = normalizeProxy({
    server: 'http://myrotatingpool.com:1234',
    username: null,
    password: null,
    isRotatingPool: true,
    estimatedPoolSize: 100
});
assert.strictEqual(rp1.server, 'http://myrotatingpool.com:1234');
assert.strictEqual(rp1.username, undefined, 'username should be normalized to undefined instead of null');
assert.strictEqual(rp1.password, undefined, 'password should be normalized to undefined instead of null');
assert.strictEqual(rp1.isRotatingPool, true);
assert.strictEqual(rp1.estimatedPoolSize, 100);

const rp2 = normalizeProxy({
    server: 'http://myrotatingpool.com:1234',
    user: null,
    pass: null,
    isRotatingPool: true
});
assert.strictEqual(rp2.username, undefined, 'user should be normalized to undefined instead of null');
assert.strictEqual(rp2.password, undefined, 'pass should be normalized to undefined instead of null');

const rp3 = normalizeProxy({
    server: 'http://myrotatingpool.com:1234',
    username: '',
    password: '',
    isRotatingPool: true
});
assert.strictEqual(rp3.username, undefined, 'empty string username should be normalized to undefined');
assert.strictEqual(rp3.password, undefined, 'empty string password should be normalized to undefined');

console.log('✓ normalizeProxy tests passed');

// 4. Test normalizeRotationMode
console.log('Testing normalizeRotationMode...');
assert.strictEqual(normalizeRotationMode('round-robin'), 'round-robin');
assert.strictEqual(normalizeRotationMode('random'), 'random');
assert.strictEqual(normalizeRotationMode('invalid'), 'round-robin');
assert.strictEqual(normalizeRotationMode(null), 'round-robin');
console.log('✓ normalizeRotationMode tests passed');

console.log('All proxy-utils tests passed successfully!');
