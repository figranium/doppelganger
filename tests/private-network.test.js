const { validateUrl } = require('../url-utils');
const assert = require('assert');

async function runTests() {
    console.log('--- Testing ALLOW_PRIVATE_NETWORKS flag ---');

    console.log('\nScenario 1: Flag EXPLICITLY DISABLED');
    process.env.ALLOW_PRIVATE_NETWORKS = 'false';
    // We need to re-require or clear cache because constants.js evaluates on load
    delete require.cache[require.resolve('../src/server/constants')];
    delete require.cache[require.resolve('../url-utils')];
    const { validateUrl: validateUrlDisabled } = require('../url-utils');

    try {
        await validateUrlDisabled('http://localhost');
        console.error('FAILED: localhost should be blocked when flag is explicitly false');
        process.exit(1);
    } catch (e) {
        console.log('✓ SUCCESS: localhost blocked as expected');
    }

    console.log('\nScenario 2: Flag DEFAULT (should be blocked)');
    delete process.env.ALLOW_PRIVATE_NETWORKS;
    delete require.cache[require.resolve('../src/server/constants')];
    delete require.cache[require.resolve('../url-utils')];
    const { validateUrl: validateUrlDefault } = require('../url-utils');

    try {
        await validateUrlDefault('http://localhost');
        console.error('FAILED: localhost should be blocked by default');
        process.exit(1);
    } catch (e) {
        console.log('✓ SUCCESS: localhost blocked by default as expected');
    }

    console.log('\nScenario 3: Flag EXPLICITLY ENABLED');
    process.env.ALLOW_PRIVATE_NETWORKS = 'true';
    delete require.cache[require.resolve('../src/server/constants')];
    delete require.cache[require.resolve('../url-utils')];
    const { validateUrl: validateUrlEnabled } = require('../url-utils');

    try {
        await validateUrlEnabled('http://localhost');
        console.log('✓ SUCCESS: localhost allowed as expected');
    } catch (e) {
        console.error('FAILED: localhost should be allowed when flag is true');
        console.error(e.message);
        process.exit(1);
    }

    console.log('\n--- All verification tests passed! ---');
}

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
