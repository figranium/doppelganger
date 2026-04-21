const { tryAiProviders } = require('../src/server/utils');

async function testParallelExecution() {
    console.log('Testing parallel execution...');
    const start = Date.now();
    const tasks = [
        async (signal) => {
            await new Promise(r => setTimeout(r, 200));
            if (signal.aborted) throw new Error('Aborted');
            return 'fast';
        },
        async (signal) => {
            await new Promise(r => setTimeout(r, 500));
            if (signal.aborted) throw new Error('Aborted');
            return 'slow';
        }
    ];

    const result = await tryAiProviders(tasks);
    const duration = Date.now() - start;

    console.log(`Result: ${result}`);
    console.log(`Duration: ${duration}ms`);

    if (result === 'fast' && duration < 400) {
        console.log('✓ Parallel execution test passed');
    } else {
        console.log('✗ Parallel execution test failed');
        process.exit(1);
    }
}

async function testFailover() {
    console.log('\nTesting failover...');
    const tasks = [
        async (signal) => {
            throw new Error('primary failed');
        },
        async (signal) => {
            await new Promise(r => setTimeout(r, 100));
            return 'secondary';
        }
    ];

    const result = await tryAiProviders(tasks);
    console.log(`Result: ${result}`);

    if (result === 'secondary') {
        console.log('✓ Failover test passed');
    } else {
        console.log('✗ Failover test failed');
        process.exit(1);
    }
}

async function testAllFail() {
    console.log('\nTesting all fail...');
    const tasks = [
        async (signal) => { throw new Error('fail 1'); },
        async (signal) => { throw new Error('fail 2'); }
    ];

    try {
        await tryAiProviders(tasks);
        console.log('✗ All fail test failed (should have thrown)');
        process.exit(1);
    } catch (err) {
        console.log(`Caught expected error: ${err.message}`);
        if (err.message.includes('fail 1') && err.message.includes('fail 2')) {
            console.log('✓ All fail test passed');
        } else {
            console.log('✗ All fail test failed (message mismatch)');
            process.exit(1);
        }
    }
}

async function testAbort() {
    console.log('\nTesting abort signal...');
    let slowTaskAborted = false;
    const tasks = [
        async (signal) => {
            return 'fast';
        },
        async (signal) => {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => resolve('slow'), 1000);
                signal.addEventListener('abort', () => {
                    clearTimeout(timeout);
                    slowTaskAborted = true;
                    reject(new Error('AbortError'));
                });
            });
        }
    ];

    await tryAiProviders(tasks);
    // Give it a tiny bit of time for the microtask queue
    await new Promise(r => setTimeout(r, 10));

    if (slowTaskAborted) {
        console.log('✓ Abort signal test passed');
    } else {
        console.log('✗ Abort signal test failed (slow task was not aborted)');
        process.exit(1);
    }
}

async function runTests() {
    try {
        await testParallelExecution();
        await testFailover();
        await testAllFail();
        await testAbort();
        console.log('\nAll tryAiProviders tests passed!');
    } catch (err) {
        console.error('Test suite failed:', err);
        process.exit(1);
    }
}

runTests();
