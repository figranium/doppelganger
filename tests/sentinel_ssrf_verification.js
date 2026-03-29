const { fetchWithRedirectValidation, validateUrl } = require('../url-utils');
const { ALLOW_PRIVATE_NETWORKS } = require('../src/server/constants');
const assert = require('assert');

async function testWebhookRedirects() {
    console.log('--- Testing Webhook Redirect Validation ---');

    // Mock fetch to simulate redirects
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
        const u = new URL(typeof url === 'string' ? url : url.href);
        if (u.hostname === 'malicious-webhook.com') {
            return {
                status: 302,
                ok: false,
                headers: {
                    get: (name) => name.toLowerCase() === 'location' ? 'http://127.0.0.1/sensitive' : null
                },
                text: async () => 'Redirecting...'
            };
        }
        if (u.hostname === 'cross-origin-redirect.com') {
            const auth = options.headers?.['Authorization'] || options.headers?.['authorization'];
            const hasAuth = !!auth;
            return {
                status: 302,
                ok: false,
                headers: {
                    get: (name) => name.toLowerCase() === 'location' ? 'https://attacker.com/' : null
                },
                text: async () => `Redirecting... (Auth present: ${hasAuth})`
            };
        }
        if (u.hostname === 'attacker.com') {
            const auth = options.headers?.['Authorization'] || options.headers?.['authorization'];
            const hasAuth = !!auth;
            return {
                status: 200,
                ok: true,
                text: async () => JSON.stringify({ hasAuth })
            };
        }
        if (u.hostname === 'safe-redirect.com') {
            return {
                status: 302,
                ok: false,
                headers: {
                    get: (name) => name.toLowerCase() === 'location' ? 'https://www.google.com/' : null
                },
                text: async () => 'Redirecting...'
            };
        }
        if (u.hostname === 'www.google.com') {
            return { status: 200, ok: true, text: async () => 'OK' };
        }
        if (u.hostname === '127.0.0.1') {
            return { status: 200, ok: true, text: async () => 'Sensitive' };
        }
        return { status: 404, ok: false, text: async () => 'Not Found' };
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

        console.log('Test 3: Cross-origin redirect (should STRIP credentials)');
        const res3 = await fetchWithRedirectValidation('http://cross-origin-redirect.com', {
            headers: { 'Authorization': 'Bearer secret-token' }
        });
        const data3 = JSON.parse(await res3.text());
        assert.strictEqual(data3.hasAuth, false, 'Credentials should have been stripped');
        console.log('PASS: Cross-origin credentials stripped');

    } finally {
        global.fetch = originalFetch;
    }
}

async function testUrlValidationNegativeCache() {
    console.log('\n--- Testing URL Validation Negative Cache ---');

    if (!ALLOW_PRIVATE_NETWORKS) {
        try {
            await validateUrl('http://localhost');
            assert.fail('Should have blocked localhost');
        } catch (err) {
            assert.strictEqual(err.message, 'Access to private network is restricted');
        }

        const start = Date.now();
        try {
            await validateUrl('http://localhost');
            assert.fail('Should have blocked localhost (cached)');
        } catch (err) {
            const duration = Date.now() - start;
            console.log(`Negative cache hit duration: ${duration}ms`);
            assert(duration < 5, 'Negative cache should be fast');
            assert.strictEqual(err.message, 'Access to private network is restricted');
        }
        console.log('PASS: Negative cache works');
    } else {
        console.log('SKIP: Negative cache test (requires ALLOW_PRIVATE_NETWORKS=false)');
    }
}

async function runAll() {
    try {
        console.log(`Environment: ALLOW_PRIVATE_NETWORKS = ${ALLOW_PRIVATE_NETWORKS}`);
        await testWebhookRedirects();
        await testUrlValidationNegativeCache();
        console.log('\nAll verification tests PASSED');
    } catch (err) {
        console.error('Verification FAILED:', err);
        process.exit(1);
    }
}

runAll();
