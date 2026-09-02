const assert = require('assert');
const {
    registerActiveRun,
    unregisterActiveRun,
    requestStop,
    setStopChecker,
    setStopCleaner,
    consumeStopRequest,
    clearStopRequest
} = require('../src/agent/execution-control');

async function testForceStopTimeout() {
    console.log('Testing 3-second force stop timer...');
    const runId = 'test_force_stop_' + Date.now();
    let forceStopCalled = false;

    registerActiveRun(runId, {
        forceStop: () => {
            forceStopCalled = true;
        }
    });

    requestStop(runId);

    assert.strictEqual(forceStopCalled, false, 'forceStop should not be called immediately');

    // Wait 3.2 seconds for timeout to trigger
    await new Promise(resolve => setTimeout(resolve, 3200));

    assert.strictEqual(forceStopCalled, true, 'forceStop should be called after 3s timeout');
    unregisterActiveRun(runId);
    console.log('✔ 3-second force stop timer test passed');
}

async function testGracefulCompletionBeforeTimeout() {
    console.log('Testing graceful completion before timeout...');
    const runId = 'test_graceful_' + Date.now();
    let forceStopCalled = false;

    registerActiveRun(runId, {
        forceStop: () => {
            forceStopCalled = true;
        }
    });

    requestStop(runId);

    // Unregister active run after 1 second (simulating task finishing early)
    await new Promise(resolve => setTimeout(resolve, 1000));
    unregisterActiveRun(runId);

    // Wait past 3 seconds
    await new Promise(resolve => setTimeout(resolve, 2500));

    assert.strictEqual(forceStopCalled, false, 'forceStop should NOT be called if run completed and unregistered early');
    console.log('✔ Graceful completion test passed');
}

async function testStopRequestedBeforeRegistration() {
    console.log('Testing stop request issued before run registration...');
    const runId = 'test_pre_stop_' + Date.now();
    let forceStopCalled = false;

    const stopRequests = new Set();
    setStopChecker((id) => stopRequests.has(id));
    setStopCleaner((id) => stopRequests.delete(id));

    // Request stop before registering
    stopRequests.add(runId);

    // Register active run afterwards
    registerActiveRun(runId, {
        forceStop: () => {
            forceStopCalled = true;
        }
    });

    assert.strictEqual(forceStopCalled, false, 'forceStop should not be called immediately on registration');

    await new Promise(resolve => setTimeout(resolve, 3200));

    assert.strictEqual(forceStopCalled, true, 'forceStop should be called 3s after registration if stop was pre-requested');

    unregisterActiveRun(runId);
    clearStopRequest(runId);
    setStopChecker(null);
    setStopCleaner(null);
    console.log('✔ Pre-stop request test passed');
}

async function runAllTests() {
    await testForceStopTimeout();
    await testGracefulCompletionBeforeTimeout();
    await testStopRequestedBeforeRegistration();
    console.log('All force-stop tests passed!');
}

runAllTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
