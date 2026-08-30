const assert = require('node:assert/strict');
const { buildResolvedActionInputs, snapshotTestVariables } = require('../src/agent/figranite/index');

const runtimeVariables = {
    selector: '#submit',
    payload: { ready: true },
    count: 3,
    html: '<main>large page</main>',
    'block.output': 'previous',
};

const resolveTemplate = (value) => value.replace(/\{\$([\w.]+)\}/g, (_match, name) => {
    const resolved = runtimeVariables[name];
    return typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved ?? '');
});

const inputs = buildResolvedActionInputs({
    id: 'request',
    type: 'http_request',
    selector: '{$selector}',
    value: 'https://example.com/{$count}',
    method: 'POST',
    body: '{$payload}',
    timeout: 5000,
    varName: 'response',
}, resolveTemplate);

assert.deepEqual(inputs, {
    selector: '#submit',
    value: 'https://example.com/3',
    method: 'POST',
    body: '{"ready":true}',
    timeout: 5000,
});
assert.equal('varName' in inputs, false, 'Output targets are not execution inputs');

assert.deepEqual(snapshotTestVariables(runtimeVariables), {
    selector: '#submit',
    payload: { ready: true },
    count: 3,
    'block.output': 'previous',
});

console.log('Block test engine helpers passed');
