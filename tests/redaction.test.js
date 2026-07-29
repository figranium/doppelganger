// Tests for sensitive-variable redaction.
// Run: node tests/redaction.test.js   (exit 0 = pass, 1 = fail)

const assert = require('assert');
const {
    MASK,
    MIN_SECRET_LENGTH,
    createRedactor,
    createRedactingLog,
    collectSecretValues,
    collectSecretVarNames,
    maskSecretVariables
} = require('../redaction');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('redacts a secret inside a log line', () => {
    const r = createRedactor(['hunter2pass']);
    assert.strictEqual(
        r.redactString('[FIGRANITE] Typing into #pw: hunter2pass'),
        `[FIGRANITE] Typing into #pw: ${MASK}`
    );
});

test('redacts every occurrence, not just the first', () => {
    const r = createRedactor(['s3cr3t-token']);
    const out = r.redactString('a s3cr3t-token b s3cr3t-token c');
    assert.strictEqual(out, `a ${MASK} b ${MASK} c`);
});

test('redacts nested objects and arrays', () => {
    const r = createRedactor(['p@ssw0rd']);
    const out = r.redact({
        logs: ['typed p@ssw0rd', 'ok'],
        result: { nested: { deep: ['p@ssw0rd'] }, count: 2 },
        html: '<input value="p@ssw0rd">'
    });
    assert.deepStrictEqual(out.logs, [`typed ${MASK}`, 'ok']);
    assert.deepStrictEqual(out.result.nested.deep, [MASK]);
    assert.strictEqual(out.result.count, 2);
    assert.strictEqual(out.html, `<input value="${MASK}">`);
});

test('redacts object keys as well as values', () => {
    const r = createRedactor(['leakyKeyName']);
    const out = r.redact({ leakyKeyName: 'value' });
    assert.deepStrictEqual(Object.keys(out), [MASK]);
});

test('leaves non-string primitives intact', () => {
    const r = createRedactor(['abcdef']);
    const out = r.redact({ n: 42, b: true, z: null, u: undefined });
    assert.strictEqual(out.n, 42);
    assert.strictEqual(out.b, true);
    assert.strictEqual(out.z, null);
    assert.strictEqual(out.u, undefined);
});

test('longer secrets win over overlapping shorter ones', () => {
    // If the short secret were applied first it would leave "-extra" exposed.
    const r = createRedactor(['token', 'token-extra-long']);
    assert.strictEqual(r.redactString('value=token-extra-long'), `value=${MASK}`);
});

test('values shorter than the minimum are ignored', () => {
    const skips = [];
    const r = createRedactor(['ab'], { onSkip: (m) => skips.push(m) });
    assert.strictEqual(r.hasSecrets(), false);
    assert.strictEqual(r.redactString('ab cab tab'), 'ab cab tab');
    assert.strictEqual(skips.length, 1);
    assert.ok(String(MIN_SECRET_LENGTH).length > 0);
});

test('no secrets means output passes through untouched', () => {
    const r = createRedactor([]);
    const input = { a: 'anything at all' };
    assert.strictEqual(r.redact(input), input);
    assert.strictEqual(r.hasSecrets(), false);
});

test('handles cyclic objects without hanging', () => {
    const r = createRedactor(['secretvalue']);
    const cyclic = { name: 'secretvalue' };
    cyclic.self = cyclic;
    const out = r.redact(cyclic);
    assert.strictEqual(out.name, MASK);
});

test('leaves non-plain objects (Date, Buffer) alone', () => {
    const r = createRedactor(['secretvalue']);
    const date = new Date();
    const out = r.redact({ when: date });
    assert.strictEqual(out.when, date);
});

test('addSecret extends coverage at runtime', () => {
    const r = createRedactor([]);
    assert.strictEqual(r.redactString('otp 998877'), 'otp 998877');
    r.addSecret('998877');
    assert.strictEqual(r.redactString('otp 998877'), `otp ${MASK}`);
});

test('numeric secret values are stringified', () => {
    const r = createRedactor([123456]);
    assert.strictEqual(r.redactString('pin=123456'), `pin=${MASK}`);
});

test('createRedactingLog redacts on push', () => {
    const r = createRedactor(['mypassword']);
    const logs = createRedactingLog(r);
    logs.push('Typing into #pw: mypassword');
    logs.push('unrelated');
    assert.deepStrictEqual(logs, [`Typing into #pw: ${MASK}`, 'unrelated']);
    assert.strictEqual(logs.length, 2);
    assert.ok(Array.isArray(logs));
});

test('createRedactingLog supports multiple entries per push', () => {
    const r = createRedactor(['mypassword']);
    const logs = createRedactingLog(r);
    logs.push('a mypassword', 'b mypassword');
    assert.deepStrictEqual(logs, [`a ${MASK}`, `b ${MASK}`]);
});

test('collectSecretValues reads the editor variable shape', () => {
    const values = collectSecretValues({
        user: { type: 'string', value: 'ada' },
        pass: { type: 'string', value: 'topsecret', secret: true }
    });
    assert.deepStrictEqual(values, ['topsecret']);
});

test('collectSecretValues reads the flattened shape via names', () => {
    const values = collectSecretValues({ user: 'ada', pass: 'topsecret' }, ['pass']);
    assert.deepStrictEqual(values, ['topsecret']);
});

test('collectSecretValues tolerates missing input', () => {
    assert.deepStrictEqual(collectSecretValues(null), []);
    assert.deepStrictEqual(collectSecretValues(undefined, ['x']), []);
});

test('collectSecretVarNames lists flagged names only', () => {
    const names = collectSecretVarNames({
        user: { type: 'string', value: 'ada' },
        pass: { type: 'string', value: 'x', secret: true },
        token: { type: 'string', value: 'y', secret: true }
    });
    assert.deepStrictEqual(names.sort(), ['pass', 'token']);
});

test('maskSecretVariables masks values but preserves structure', () => {
    const masked = maskSecretVariables({
        user: { type: 'string', value: 'ada' },
        pass: { type: 'string', value: 'topsecret', secret: true }
    });
    assert.strictEqual(masked.user.value, 'ada');
    assert.strictEqual(masked.pass.value, MASK);
    assert.strictEqual(masked.pass.secret, true);
    assert.strictEqual(masked.pass.type, 'string');
});

test('maskSecretVariables leaves empty secrets empty', () => {
    const masked = maskSecretVariables({ pass: { type: 'string', value: '', secret: true } });
    assert.strictEqual(masked.pass.value, '');
});

test('a secret derived into another variable is still redacted', () => {
    // The `set` action copies a secret into a new variable; substring matching
    // means the copy is covered without extra bookkeeping.
    const r = createRedactor(['derived-secret-value']);
    const out = r.redact({ copied: 'derived-secret-value', note: 'prefix derived-secret-value suffix' });
    assert.strictEqual(out.copied, MASK);
    assert.strictEqual(out.note, `prefix ${MASK} suffix`);
});

test('regex metacharacters in a secret are escaped', () => {
    const r = createRedactor(['a+b.*c?']);
    assert.strictEqual(r.redactString('value a+b.*c? here'), `value ${MASK} here`);
    assert.strictEqual(r.redactString('value aXbYYcZ here'), 'value aXbYYcZ here');
});

let failed = 0;
for (const { name, fn } of tests) {
    try {
        fn();
        console.log(`  PASS  ${name}`);
    } catch (err) {
        failed += 1;
        console.error(`  FAIL  ${name}`);
        console.error(`        ${err.message}`);
    }
}

console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed === 0 ? 0 : 1);
