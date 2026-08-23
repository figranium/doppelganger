const assert = require('assert');
const {
    buildProxyTaskFields,
    buildRemoteTask,
    collectBrowserContext,
    redactSecrets
} = require('../src/agent/figranite/captcha-client');

function fakePage() {
    let evaluateCalls = 0;
    const cookieCalls = [];
    return {
        cookieCalls,
        url: () => 'https://shop.example.test/checkout',
        evaluate: async () => {
            evaluateCalls += 1;
            if (evaluateCalls === 1) return 'Browser/123';
            return {
                userAgent: 'Browser/123', locale: 'fr-FR', timezone: 'Europe/Paris',
                viewport: { width: 1280, height: 720, deviceScaleFactor: 2 }
            };
        },
        context: () => ({
            cookies: async (origin) => {
                cookieCalls.push(origin);
                return [{ name: 'session', value: 'private-cookie', domain: 'shop.example.test', path: '/', secure: true }];
            }
        })
    };
}

async function main() {
    const proxyFields = buildProxyTaskFields({ server: 'socks5://alice:secret@proxy.test:1080' }, 'Browser/123');
    assert.deepStrictEqual(proxyFields, {
        proxyType: 'socks5', proxyAddress: 'proxy.test', proxyPort: 1080,
        proxyLogin: 'alice', proxyPassword: 'secret', userAgent: 'Browser/123'
    });

    const page = fakePage();
    const identity = { proxy: { server: 'http://proxy.test:8080', username: 'u', password: 'p' } };
    process.env.CAPTCHA_REMOTE_FORWARD_PROXY = 'true';
    process.env.CAPTCHA_REMOTE_FORWARD_CONTEXT = 'false';
    const task = await buildRemoteTask(page, { siteKey: 'key' }, 'hcaptcha', { baseUrl: 'https://solver.test' }, identity);
    assert.strictEqual(task.type, 'HCaptchaTask');
    assert.strictEqual(task.proxyAddress, 'proxy.test');
    assert(!task.browserContext);
    await assert.rejects(() => buildRemoteTask(fakePage(), { siteKey: 'key' }, 'turnstile', { baseUrl: 'https://solver.test' }, identity), /no compatible proxy-backed/);

    process.env.CAPTCHA_REMOTE_FORWARD_PROXY = 'false';
    process.env.CAPTCHA_REMOTE_FORWARD_CONTEXT = 'true';
    global.fetch = async () => new Response(JSON.stringify({ browserContext: { versions: [1] } }), {
        status: 200, headers: { 'content-type': 'application/json' }
    });
    const contextPage = fakePage();
    const contextTask = await buildRemoteTask(contextPage, { siteKey: 'key' }, 'recaptcha_v2', { baseUrl: 'https://context-solver.test' });
    assert.strictEqual(contextTask.browserContext.version, 1);
    assert.strictEqual(contextTask.browserContext.cookies[0].value, 'private-cookie');
    assert.deepStrictEqual(contextPage.cookieCalls, ['https://shop.example.test']);

    const directContext = await collectBrowserContext(fakePage());
    assert.strictEqual(directContext.origin, 'https://shop.example.test');
    assert(!redactSecrets('clientKey=topsecret proxyPassword=hunter2 cookie=sessiontoken', ['topsecret']).includes('topsecret'));
    assert(!redactSecrets('clientKey=topsecret proxyPassword=hunter2 cookie=sessiontoken').includes('hunter2'));
    assert(!redactSecrets('token=challenge-response').includes('challenge-response'));

    delete process.env.CAPTCHA_REMOTE_FORWARD_PROXY;
    delete process.env.CAPTCHA_REMOTE_FORWARD_CONTEXT;
    console.log('All CAPTCHA browser-identity tests passed!');
}

main().catch((error) => { console.error(error); process.exit(1); });
