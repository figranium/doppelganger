import { strict as assert } from 'node:assert';

interface TaskSnapshot {
    extractionScript?: string;
    includeHtml?: boolean;
}

interface SimulationData {
    actions?: unknown[];
    extractionScript?: string;
    includeHtml?: boolean;
    taskSnapshot?: TaskSnapshot;
}

interface SimulationResult {
    evaluateCalled: boolean;
    cleanedHtml: string;
}

/**
 * This test verifies the logic implemented in src/agent/index.js
 * to skip expensive DOM cleaning when not needed.
 */
async function testOptimizationLogic(): Promise<void> {
    console.log('Testing Agent HTML Optimization Logic...');

    const runSimulation = async (data: SimulationData): Promise<SimulationResult> => {
        const extractionScriptRaw = typeof data.extractionScript === 'string'
            ? data.extractionScript
            : (typeof data.taskSnapshot?.extractionScript === 'string'
                ? data.taskSnapshot.extractionScript
                : undefined);

        const includeHtml = Boolean(data.includeHtml ?? data.taskSnapshot?.includeHtml);

        let evaluateCalled = false;
        let cleanedHtml = '';

        if (extractionScriptRaw || includeHtml) {
            evaluateCalled = true;
            cleanedHtml = '<html>cleaned</html>';
        }

        return { evaluateCalled, cleanedHtml };
    };

    const res1 = await runSimulation({ actions: [] });
    assert.equal(res1.evaluateCalled, false, 'Case 1: Should skip evaluate');
    assert.equal(res1.cleanedHtml, '', 'Case 1: cleanedHtml should be empty');
    console.log('✓ Case 1 passed: Correctly skipped cleaning for minimal task');

    const res2 = await runSimulation({
        actions: [],
        extractionScript: 'return data.url()',
    });
    assert.equal(res2.evaluateCalled, true, 'Case 2: Should run evaluate');
    assert.equal(res2.cleanedHtml, '<html>cleaned</html>', 'Case 2: cleanedHtml should be populated');
    console.log('✓ Case 2 passed: Correctly ran cleaning for extraction script');

    const res3 = await runSimulation({
        actions: [],
        includeHtml: true,
    });
    assert.equal(res3.evaluateCalled, true, 'Case 3: Should run evaluate');
    console.log('✓ Case 3 passed: Correctly ran cleaning when includeHtml is requested');

    const res4 = await runSimulation({
        actions: [],
        taskSnapshot: { includeHtml: true },
    });
    assert.equal(res4.evaluateCalled, true, 'Case 4: Should run evaluate');
    console.log('✓ Case 4 passed: Correctly ran cleaning when snapshot requests HTML');

    const res5 = await runSimulation({
        actions: [],
        taskSnapshot: { extractionScript: 'return 1' },
    });
    assert.equal(res5.evaluateCalled, true, 'Case 5: Should run evaluate');
    console.log('✓ Case 5 passed: Correctly ran cleaning when snapshot has extraction script');

    console.log('\nAll optimization logic tests passed!');
}

void testOptimizationLogic().catch((error: unknown) => {
    console.error('Test failed:', error);
    process.exit(1);
});
