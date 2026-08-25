const assert = require('assert');

process.env.SKIP_LOCAL_CAPTCHA_MODEL = 'true';
const { postJson, solveCaptcha } = require('../src/agent/figranite/captcha-client');

function response(payload, { ok = true, status = 200 } = {}) {
    return { ok, status, json: async () => payload };
}

function fakePage() {
    let calls = 0;
    return {
        url: () => 'https://example.test/challenge',
        frames: () => [],
        evaluate: async () => {
            calls += 1;
            if (calls === 1) return { siteKey: 'site-key', captchaType: 'turnstile' };
            return undefined;
        }
    };
}

async function testProviderFailure() {
    global.fetch = async () => response({ errorId: 1, errorCode: 'ERROR_KEY_DOES_NOT_EXIST', errorDescription: 'bad key' });
    await assert.rejects(() => postJson('https://solver.test', '/createTask', {}, 1000), /bad key/);
}

async function testMalformedAndNetworkFailure() {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error('invalid'); } });
    await assert.rejects(() => postJson('https://solver.test', '/createTask', {}, 1000), /malformed JSON/);
    global.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(() => postJson('https://solver.test', '/createTask', {}, 1000), /network failure.*offline/);
}

async function testRemoteOnlyTerminalError() {
    process.env.CAPTCHA_SOLVER_URL = 'https://solver.test';
    process.env.CAPTCHA_SOLVER_KEY = 'bad';
    global.fetch = async () => response({ errorId: 1, errorDescription: 'authentication rejected' });
    await assert.rejects(() => solveCaptcha(fakePage(), { timeout: 1000 }), /remote: authentication rejected; local: disabled/);
}

async function testRemoteFailureFallsBackToActiveBrowser() {
    process.env.SKIP_LOCAL_CAPTCHA_MODEL = 'false';
    process.env.CAPTCHA_SOLVER_URL = 'https://solver.test';
    global.fetch = async () => { throw new Error('offline'); };
    let evaluateCalls = 0;
    const frame = {
        url: () => 'https://challenges.cloudflare.com/turnstile/v0/api.js',
        locator: () => ({ first: () => ({ count: async () => 1, click: async () => undefined }) })
    };
    const page = {
        url: () => 'https://example.test/challenge',
        frames: () => [frame],
        waitForTimeout: async () => undefined,
        evaluate: async () => {
            evaluateCalls += 1;
            if (evaluateCalls === 1) return { siteKey: 'site-key', captchaType: 'turnstile' };
            if (evaluateCalls === 2) return 'test-agent';
            if (evaluateCalls === 3) return null;
            if (evaluateCalls >= 4) return 'turnstile-token-that-is-long-enough';
            return undefined;
        }
    };
    const logs = [];
    const result = await solveCaptcha(page, { timeout: 1000, logs });
    assert.strictEqual(result.provider, 'local');
    assert(logs.some((line) => line.includes('trying local solver')));
    process.env.SKIP_LOCAL_CAPTCHA_MODEL = 'true';
}

async function testRemoteBudgetIsReservedForLocalFallback() {
    process.env.SKIP_LOCAL_CAPTCHA_MODEL = 'false';
    process.env.CAPTCHA_REMOTE_TIMEOUT_MS = '80';
    process.env.CAPTCHA_LOCAL_FALLBACK_MIN_MS = '1000';
    process.env.CAPTCHA_SOLVER_URL = 'https://slow-solver.test';
    global.fetch = async (url) => response(String(url).endsWith('/createTask') ? { taskId: 'slow' } : { status: 'processing' });
    let evaluateCalls = 0;
    const page = {
        url: () => 'https://example.test/challenge',
        frames: () => [{
            url: () => 'https://challenges.cloudflare.com/turnstile/v0/widget',
            locator: () => ({ first: () => ({ isVisible: async () => true, click: async () => undefined }) })
        }],
        waitForTimeout: async (milliseconds) => new Promise((resolve) => setTimeout(resolve, Math.min(milliseconds, 2))),
        evaluate: async () => {
            evaluateCalls += 1;
            if (evaluateCalls === 1) return { siteKey: 'site-key', captchaType: 'turnstile' };
            if (evaluateCalls === 2) return 'test-agent';
            if (evaluateCalls === 3) return '';
            if (evaluateCalls >= 4) return 'local-token';
            return undefined;
        }
    };
    const result = await solveCaptcha(page, { timeout: 1500 });
    assert.strictEqual(result.provider, 'local');
    assert.strictEqual(result.attempts[0].status, 'failed');
    assert(result.duration < 1000, `remote route consumed fallback budget (${result.duration}ms)`);
    delete process.env.CAPTCHA_REMOTE_TIMEOUT_MS;
    delete process.env.CAPTCHA_LOCAL_FALLBACK_MIN_MS;
    process.env.SKIP_LOCAL_CAPTCHA_MODEL = 'true';
}

async function main() {
    await testProviderFailure();
    await testMalformedAndNetworkFailure();
    await testRemoteOnlyTerminalError();
    await testRemoteFailureFallsBackToActiveBrowser();
    await testRemoteBudgetIsReservedForLocalFallback();
    console.log('All CAPTCHA router failure tests passed!');
}

main().catch((error) => { console.error(error); process.exit(1); });
