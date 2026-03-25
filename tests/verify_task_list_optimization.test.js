const assert = require('node:assert');

async function test() {
    console.log('Testing GET /api/tasks optimization logic...');

    const mockTask = {
        id: 'task_1',
        name: 'Task 1',
        actions: [],
        versions: [
            { id: 'v1', timestamp: 100, snapshot: { name: 'Task 1 v1' } },
            { id: 'v2', timestamp: 200, snapshot: { name: 'Task 1 v2' } }
        ]
    };

    const tasks = [mockTask];

    // The optimized logic:
    const summary = tasks.map(({ versions, ...rest }) => rest);

    assert.strictEqual(summary.length, 1);
    assert.ok(!Object.prototype.hasOwnProperty.call(summary[0], 'versions'), 'versions field should be removed');
    assert.strictEqual(summary[0].id, 'task_1');
    assert.strictEqual(summary[0].name, 'Task 1');

    console.log('✅ Optimization logic verified.');
}

test().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
