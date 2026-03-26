const { fetchWithRedirectValidation, validateUrl } = require('../url-utils');
const { ALLOW_PRIVATE_NETWORKS } = require('../src/server/constants');
const assert = require('assert');

async function testWebhookRedirects() {
    console.log('--- Testing Webhook Redirect Validation ---');

    // Mock fetch to simulate redirects
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
        if (url === 'http://malicious-webhook.com') {
            return {
                status: 302,
                headers: {
                    get: (name) => name === 'location' ? 'http://127.0.0.1/sensitive' : null
                }
            };
        }
        if (url === 'http://safe-redirect.com') {
            return {
                status: 302,
                headers: {
                    get: (name) => name === 'location' ? 'https://www.google.com/' : null
                }
            };
        }
        if (url === 'https://www.google.com/') {
            return { status: 200, ok: true };
        }
        if (url === 'http://127.0.0.1/sensitive') {
            return { status: 200, ok: true };
        }
        return { status: 404 };
    };

    try {
        if (!ALLOW_PRIVATE_NETWORKS) {
            console.log('Test 1: Malicious redirect to private IP (should be BLOCKED)');
            try {
                await fetchWithRedirectValidation('http://malicious-webhook.com');
                assert.fail('Should have thrown an error for malicious redirect');
            } catch (err) {
                assert.strictEqual(err.message, 'Access to private network is restricted');
                console.log('PASS: Malicious redirect blocked');
            }
        } else {
            console.log('Test 1: Malicious redirect to private IP (should be ALLOWED when ALLOW_PRIVATE_NETWORKS=true)');
            const res = await fetchWithRedirectValidation('http://malicious-webhook.com');
            assert.strictEqual(res.status, 200);
            console.log('PASS: Malicious redirect allowed as configured');
        }

        console.log('Test 2: Safe redirect (should be ALLOWED)');
        const res = await fetchWithRedirectValidation('http://safe-redirect.com');
        assert.strictEqual(res.status, 200);
        console.log('PASS: Safe redirect allowed');

    } finally {
        global.fetch = originalFetch;
    }
}

async function testUrlValidationCache() {
    console.log('\n--- Testing URL Validation Cache ---');

    const start = Date.now();
    await validateUrl('https://www.wikipedia.org');
    const firstCall = Date.now() - start;

    const start2 = Date.now();
    await validateUrl('https://www.wikipedia.org');
    const secondCall = Date.now() - start2;

    console.log(`First call: ${firstCall}ms, Second call (cached): ${secondCall}ms`);
    // Cache should be essentially instant
    assert(secondCall < 2, 'Cached call should be super fast');
    console.log('PASS: Cache works');
}

async function runAll() {
    try {
        console.log(`Environment: ALLOW_PRIVATE_NETWORKS = ${ALLOW_PRIVATE_NETWORKS}`);
        await testWebhookRedirects();
        await testUrlValidationCache();
        console.log('\nAll verification tests PASSED');
    } catch (err) {
        console.error('Verification FAILED:', err);
        process.exit(1);
    }
}

runAll();
