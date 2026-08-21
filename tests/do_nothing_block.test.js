const { runFigranite: runAgent } = require('../src/agent/figranite/index');
const { executeAction } = require('../src/agent/figranite/action-handler');
const assert = require('assert');

async function testDoNothingAction() {
    console.log('Testing Do Nothing Block...');

    // 1. Unit test executeAction for 'do_nothing', 'noop', 'pass'
    const logs = [];
    const context = {
        logs,
        runtimeVars: {},
        resolveTemplate: (val) => val,
        options: {}
    };

    await executeAction({ id: '1', type: 'do_nothing' }, context);
    await executeAction({ id: '2', type: 'noop' }, context);
    await executeAction({ id: '3', type: 'pass' }, context);

    assert.strictEqual(logs.length, 3, 'Expected 3 logs');
    assert.strictEqual(logs[0], 'Do nothing');
    assert.strictEqual(logs[1], 'Do nothing');
    assert.strictEqual(logs[2], 'Do nothing');
    console.log('✓ Unit test executeAction for Do Nothing succeeded.');

    // 2. Integration test runAgent with a do_nothing action
    const task = {
        url: 'https://example.com',
        actions: [
            { id: 'act_1', type: 'set', varName: 'before', value: 'hello' },
            { id: 'act_2', type: 'do_nothing' },
            { id: 'act_3', type: 'set', varName: 'after', value: 'world' }
        ]
    };

    const res = await runAgent(task, { headless: true });
    assert(Array.isArray(res.logs), 'Expected logs array');
    assert(res.logs.some(l => l.includes('Do nothing')), 'Expected "Do nothing" in logs');
    assert(res.logs.some(l => l.includes('Set variable before')), 'Expected "Set variable before" in logs');
    assert(res.logs.some(l => l.includes('Set variable after')), 'Expected "Set variable after" in logs');
    console.log('✓ Integration test runAgent with Do Nothing succeeded.');

    console.log('All Do Nothing tests passed!');
}

testDoNothingAction().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
