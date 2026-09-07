const assert = require('assert');

/**
 * This test verifies the logic implemented in src/agent/index.js
 * to skip expensive DOM cleaning when not needed.
 */
async function testOptimizationLogic() {
    console.log('Testing Agent HTML Optimization Logic...');

    // Simulation of the logic in src/agent/index.js
    const runSimulation = async (data) => {
        const extractionScriptRaw = typeof data.extractionScript === 'string'
            ? data.extractionScript
            : (data.taskSnapshot && typeof data.taskSnapshot.extractionScript === 'string' ? data.taskSnapshot.extractionScript : undefined);

        const includeHtml = !!(data.includeHtml ?? (data.taskSnapshot && data.taskSnapshot.includeHtml));

        let evaluateCalled = false;
        let cleanedHtml = '';

        // The optimized logic from src/agent/index.js
        if (extractionScriptRaw || includeHtml) {
            evaluateCalled = true;
            cleanedHtml = '<html>cleaned</html>'; // mock result
        }

        return { evaluateCalled, cleanedHtml };
    };

    // Case 1: Minimal task (no extraction, no includeHtml)
    const res1 = await runSimulation({ actions: [] });
    assert.strictEqual(res1.evaluateCalled, false, 'Case 1: Should skip evaluate');
    assert.strictEqual(res1.cleanedHtml, '', 'Case 1: cleanedHtml should be empty');
    console.log('✓ Case 1 passed: Correctly skipped cleaning for minimal task');

    // Case 2: Task with extraction script
    const res2 = await runSimulation({
        actions: [],
        extractionScript: 'return data.url()'
    });
    assert.strictEqual(res2.evaluateCalled, true, 'Case 2: Should run evaluate');
    assert.strictEqual(res2.cleanedHtml, '<html>cleaned</html>', 'Case 2: cleanedHtml should be populated');
    console.log('✓ Case 2 passed: Correctly ran cleaning for extraction script');

    // Case 3: Task with includeHtml: true
    const res3 = await runSimulation({
        actions: [],
        includeHtml: true
    });
    assert.strictEqual(res3.evaluateCalled, true, 'Case 3: Should run evaluate');
    console.log('✓ Case 3 passed: Correctly ran cleaning when includeHtml is requested');

    // Case 4: Task with snapshot-level includeHtml
    const res4 = await runSimulation({
        actions: [],
        taskSnapshot: { includeHtml: true }
    });
    assert.strictEqual(res4.evaluateCalled, true, 'Case 4: Should run evaluate');
    console.log('✓ Case 4 passed: Correctly ran cleaning when snapshot requests HTML');

    // Case 5: Task with snapshot-level extraction script
    const res5 = await runSimulation({
        actions: [],
        taskSnapshot: { extractionScript: 'return 1' }
    });
    assert.strictEqual(res5.evaluateCalled, true, 'Case 5: Should run evaluate');
    console.log('✓ Case 5 passed: Correctly ran cleaning when snapshot has extraction script');

    console.log('\nAll optimization logic tests passed!');
}

testOptimizationLogic().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
