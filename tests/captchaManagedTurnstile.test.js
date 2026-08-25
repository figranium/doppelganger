const assert = require('assert');
const { JSDOM } = require('jsdom');
const { installTurnstileInterceptor } = require('../src/agent/figranite/captcha-interceptor');
const { buildRemoteTask, injectSolution, parseCaptchaFrameUrl } = require('../src/agent/figranite/captcha-client');

async function testManagedRenderCapture() {
    const previous = {
        turnstile: global.turnstile,
        captcha: global.__figraniumCaptcha,
        addEventListener: global.addEventListener,
        navigator: Object.getOwnPropertyDescriptor(global, 'navigator')
    };
    let pagehide;
    let nativeCalls = 0;
    let callbackToken = null;
    Object.defineProperty(global, 'navigator', { configurable: true, value: { userAgent: 'active-agent' } });
    global.addEventListener = (_name, callback) => { pagehide = callback; };
    global.turnstile = { render: () => { nativeCalls += 1; return 'native-widget'; } };
    try {
        installTurnstileInterceptor({ blockManaged: true });
        const widgetId = global.turnstile.render('#widget', {
            sitekey: '0x4AAAAAAADnPIDROrmt1Wwj',
            action: 'managed',
            cData: 'one-time-data',
            chlPageData: 'one-time-page-data',
            callback: (token) => { callbackToken = token; }
        });
        assert(widgetId.startsWith('figranium-turnstile-'));
        assert.strictEqual(nativeCalls, 0, 'Managed render must not consume one-time parameters');
        assert.strictEqual(global.__figraniumCaptcha.turnstile.siteKey, '0x4AAAAAAADnPIDROrmt1Wwj');
        assert.strictEqual(global.__figraniumCaptcha.turnstile.blocked, true);

        const task = await buildRemoteTask({
            url: () => 'https://example.test/cdn-cgi/challenge',
            evaluate: async () => 'active-agent'
        }, global.__figraniumCaptcha.turnstile, 'turnstile', { baseUrl: 'https://api.2captcha.com' });
        assert.strictEqual(task.action, 'managed');
        assert.strictEqual(task.data, 'one-time-data');
        assert.strictEqual(task.pagedata, 'one-time-page-data');
        assert.strictEqual(task.cData, undefined);
        assert.strictEqual(task.chlPageData, undefined);

        const antiTask = await buildRemoteTask({
            url: () => 'https://example.test/cdn-cgi/challenge',
            evaluate: async () => 'active-agent'
        }, global.__figraniumCaptcha.turnstile, 'turnstile', { baseUrl: 'https://api.anti-captcha.com' });
        assert.strictEqual(antiTask.cData, 'one-time-data');
        assert.strictEqual(antiTask.chlPageData, 'one-time-page-data');
        assert.strictEqual(antiTask.data, undefined);
        assert.strictEqual(antiTask.pagedata, undefined);

        const dom = new JSDOM('<input name="cf-turnstile-response" value="">');
        const domPrevious = {
            window: global.window,
            document: global.document,
            HTMLTextAreaElement: global.HTMLTextAreaElement,
            HTMLInputElement: global.HTMLInputElement,
            Event: global.Event
        };
        Object.assign(global, {
            window: dom.window,
            document: dom.window.document,
            HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
            HTMLInputElement: dom.window.HTMLInputElement,
            Event: dom.window.Event
        });
        try {
            await injectSolution({ evaluate: async (operation, argument) => operation(argument) }, 'turnstile', 'managed-token');
            assert.strictEqual(callbackToken, 'managed-token');
            assert.strictEqual(global.__figraniumCaptcha.turnstile.callbackInvoked, true);
            assert.strictEqual(dom.window.document.querySelector('[name="cf-turnstile-response"]').value, 'managed-token');
        } finally {
            Object.assign(global, domPrevious);
            dom.window.close();
        }
    } finally {
        pagehide?.();
        global.turnstile = previous.turnstile;
        global.__figraniumCaptcha = previous.captcha;
        global.addEventListener = previous.addEventListener;
        if (previous.navigator) Object.defineProperty(global, 'navigator', previous.navigator);
        else delete global.navigator;
    }
}

async function main() {
    const parsed = parseCaptchaFrameUrl('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/f/av0/rch/abc/0x4AAAAAAADnPIDROrmt1Wwj/light');
    assert.strictEqual(parsed.captchaType, 'turnstile');
    assert.strictEqual(parsed.siteKey, '0x4AAAAAAADnPIDROrmt1Wwj');
    const recaptcha = parseCaptchaFrameUrl('https://www.google.com/recaptcha/api2/anchor?k=recaptcha-site-key');
    assert.strictEqual(recaptcha.captchaType, 'recaptcha_v2');
    assert.strictEqual(recaptcha.siteKey, 'recaptcha-site-key');
    await testManagedRenderCapture();
    console.log('All managed Turnstile tests passed!');
}

main().catch((error) => { console.error(error); process.exit(1); });
