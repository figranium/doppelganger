const assert = require('assert');
const { executeAction } = require('../src/agent/figranite/action-handler');

async function testWaitsForReadyCaptchaAndStoresResult() {
    let checks = 0;
    const page = {
        evaluate: async (_operation, selector) => {
            assert.strictEqual(selector, '#captcha-scope');
            checks += 1;
            return checks < 3 ? null : { siteKey: 'site-key', captchaType: 'recaptcha_v2', ready: true };
        },
        waitForTimeout: async () => undefined
    };
    const runtimeVars = {};
    const logs = [];
    const result = await executeAction({
        id: 'wait_1',
        type: 'wait_captcha',
        selector: '#captcha-scope',
        captchaType: 'recaptcha_v2',
        timeout: 1000,
        varName: 'captchaReady'
    }, { page, runtimeVars, logs, resolveTemplate: (value) => value, options: {} });

    assert.strictEqual(result.ready, true);
    assert.strictEqual(result.challenge, 'recaptcha_v2');
    assert.strictEqual(result.siteKey, 'site-key');
    assert.deepStrictEqual(runtimeVars.captchaReady, result);
    assert(logs.some((line) => line.includes('Captcha ready')));
}

async function testReadinessTimeout() {
    const page = {
        evaluate: async () => null,
        waitForTimeout: async () => new Promise((resolve) => setTimeout(resolve, 2))
    };
    await assert.rejects(
        () => executeAction({ id: 'wait_2', type: 'wait_captcha', timeout: 5 }, {
            page, runtimeVars: {}, logs: [], resolveTemplate: (value) => value, options: {}
        }),
        /no ready CAPTCHA found/
    );
}

async function main() {
    await testWaitsForReadyCaptchaAndStoresResult();
    await testReadinessTimeout();
    console.log('All wait_captcha action tests passed!');
}

main().catch((error) => { console.error(error); process.exit(1); });
