const assert = require('assert');
const scores = require('./fixtures/captcha/benchmark-scores.json');
const { MODEL_MANIFESTS } = require('../src/agent/figranite/captcha-model-manifest');
const { selectConfidenceThreshold } = require('../src/agent/figranite/captcha-benchmark');

for (const tier of ['owlvit', 'florence2']) {
    const selected = selectConfidenceThreshold(scores[tier]);
    assert.strictEqual(selected.threshold, MODEL_MANIFESTS[tier].threshold);
    assert(selected.recall >= 0.9);
    assert(selected.f1 >= 0.8);
}

assert.throws(() => selectConfidenceThreshold([{ match: true, score: 0.1 }, { match: false, score: 0.9 }]), /No threshold/);
console.log('All CAPTCHA confidence-calibration tests passed!');
