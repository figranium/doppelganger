const assert = require('assert');
const {
    selectModelTier,
    selectModelDevice,
    checksumBuffer,
    parseFlag,
    modelThreshold
} = require('../src/agent/figranite/captcha-model-manager');

const gib = (value) => value * 1024;

function testSkipPrecedence() {
    assert.strictEqual(selectModelTier({ totalMb: gib(64), availableMb: gib(32) }, {
        SKIP_LOCAL_CAPTCHA_MODEL: 'true', CAPTCHA_MODEL_TIER: 'florence2'
    }), null);
    assert.strictEqual(parseFlag('YES'), true);
}

function testTierSelection() {
    assert.strictEqual(selectModelTier({ totalMb: 2047, availableMb: 1800 }, {}), null);
    assert.strictEqual(selectModelTier({ totalMb: gib(2), availableMb: 900 }, {}), 'owlvit');
    assert.strictEqual(selectModelTier({ totalMb: gib(4), availableMb: gib(2) }, {}), 'owlvit');
    assert.strictEqual(selectModelTier({ totalMb: gib(8), availableMb: gib(4) }, {}), 'florence2');
    assert.strictEqual(selectModelTier({ totalMb: gib(8), availableMb: 511 }, {}), null);
    assert.strictEqual(selectModelTier({ totalMb: gib(8), availableMb: 1024 }, {}), 'owlvit');
    assert.strictEqual(selectModelTier({ totalMb: gib(16), availableMb: gib(8) }, { CAPTCHA_MODEL_TIER: 'owlvit' }), 'owlvit');
    assert.throws(() => selectModelTier({ totalMb: gib(4), availableMb: gib(2) }, { CAPTCHA_MODEL_TIER: 'florence2' }), /at least 8 GiB/);
}

function testDeviceSelection() {
    assert.strictEqual(selectModelDevice({ CAPTCHA_MODEL_DEVICE: 'auto' }), 'cpu');
    assert.strictEqual(selectModelDevice({ CAPTCHA_MODEL_DEVICE: 'cpu' }), 'cpu');
    assert.strictEqual(selectModelDevice({ CAPTCHA_MODEL_DEVICE: 'auto' }, {
        onnxBackends: ['cpu', 'cuda'], accelerators: [{ type: 'cuda', totalMb: gib(8), availableMb: gib(4) }]
    }), 'cuda');
    assert.throws(() => selectModelDevice({ CAPTCHA_MODEL_DEVICE: 'cuda' }), /expected auto or cpu/);
}

function testChecksums() {
    assert.strictEqual(checksumBuffer(Buffer.from('figranium')), '3efddc692dd955b114a6b84a77b848d39d7c7c9b0487b0e54a1341ed06b1fbcf');
}

function testThresholds() {
    assert.strictEqual(modelThreshold('owlvit', {}), 0.12);
    assert.strictEqual(modelThreshold('florence2', {}), 0.18);
    assert.strictEqual(modelThreshold('owlvit', { CAPTCHA_OWLVIT_THRESHOLD: '0.25' }), 0.25);
    assert.strictEqual(modelThreshold('owlvit', { CAPTCHA_OWLVIT_THRESHOLD: '2' }), 0.12);
}

testSkipPrecedence();
testTierSelection();
testDeviceSelection();
testChecksums();
testThresholds();
console.log('All CAPTCHA model-manager tests passed!');
