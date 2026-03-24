const assert = require('assert');

// Simple mock for serializeTaskSnapshot logic as we can't easily require TS/ESM from CJS in sandbox
function serializeTaskSnapshot(task) {
    if (!task) return '';
    const { last_opened, versions, ...rest } = task;
    return JSON.stringify(rest);
}

function benchmark() {
    console.log('--- Benchmarking serializeTaskSnapshot Logic ---');

    const taskWithVersions = {
        id: 'task_1',
        name: 'Big Task',
        url: 'https://example.com',
        actions: Array(50).fill({ type: 'click', selector: 'button' }),
        versions: Array(30).fill({
            id: 'ver_1',
            timestamp: Date.now(),
            snapshot: {
                name: 'Snapshot',
                actions: Array(50).fill({ type: 'click', selector: 'button' })
            }
        })
    };

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
        serializeTaskSnapshot(taskWithVersions);
    }
    const end = performance.now();
    const duration = end - start;

    console.log(`Duration for 1000 serializations (with versions): ${duration.toFixed(2)}ms`);

    function oldSerializeTaskSnapshot(task) {
        if (!task) return '';
        const { last_opened, ...rest } = task;
        return JSON.stringify(rest);
    }

    const startOld = performance.now();
    for (let i = 0; i < 1000; i++) {
        oldSerializeTaskSnapshot(taskWithVersions);
    }
    const endOld = performance.now();
    const durationOld = endOld - startOld;

    console.log(`Duration for 1000 serializations (old logic): ${durationOld.toFixed(2)}ms`);
    console.log(`Speedup: ${(durationOld / duration).toFixed(2)}x`);

    const serialized = serializeTaskSnapshot(taskWithVersions);
    const parsed = JSON.parse(serialized);

    assert.strictEqual(parsed.id, 'task_1');
    assert.strictEqual(parsed.versions, undefined, 'Versions should be excluded from serialization');

    console.log('Verification successful: Versions excluded.');
}

try {
    benchmark();
} catch (err) {
    console.error('Benchmark failed:', err);
    process.exit(1);
}
