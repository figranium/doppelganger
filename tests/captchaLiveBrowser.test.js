const assert = require('assert');
const http = require('http');
const { chromium } = require('playwright');
const { solveLocalCaptcha } = require('../src/agent/figranite/captcha-local-solver');

const FIXTURE_HOST = 'captcha.test';

if (process.env.RUN_CAPTCHA_LIVE_TESTS !== '1') {
    console.log('Skipped live CAPTCHA browser test (set RUN_CAPTCHA_LIVE_TESTS=1).');
    process.exit(0);
}

const pages = {
    '/turnstile': `<!doctype html><html><body><div id="turnstile-widget"></div><script>
        window.__captchaState = { ready: false, token: '', error: '' };
        window.onTurnstileReady = function () {
            turnstile.render('#turnstile-widget', {
                sitekey: '1x00000000000000000000AA',
                callback: function (token) { window.__captchaState.token = token; },
                'error-callback': function (code) { window.__captchaState.error = String(code); }
            });
            window.__captchaState.ready = true;
        };
    </script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileReady&render=explicit" async defer></script></body></html>`,
    '/hcaptcha': `<!doctype html><html><body><form><div id="hcaptcha"></div></form><script>
        window.__captchaState = { ready: false, token: '', error: '' };
        window.onHcaptchaReady = function () {
            hcaptcha.render('hcaptcha', {
                sitekey: '10000000-ffff-ffff-ffff-000000000001',
                callback: function (token) { window.__captchaState.token = token; },
                'error-callback': function (code) { window.__captchaState.error = String(code); }
            });
            window.__captchaState.ready = true;
        };
    </script><script src="https://js.hcaptcha.com/1/api.js?onload=onHcaptchaReady&render=explicit" async defer></script></body></html>`
};

async function main() {
    const server = http.createServer((request, response) => {
        response.writeHead(pages[request.url] ? 200 : 404, { 'Content-Type': 'text/html' });
        response.end(pages[request.url] || 'not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({
        headless: true,
        args: [`--host-resolver-rules=MAP ${FIXTURE_HOST} 127.0.0.1`]
    });
    let executed = [];
    try {
        const requestedProvider = process.env.CAPTCHA_LIVE_PROVIDER;
        const cases = [['/turnstile', 'turnstile'], ['/hcaptcha', 'hcaptcha']]
            .filter(([, captchaType]) => !requestedProvider || requestedProvider === captchaType);
        for (const [route, captchaType] of cases) {
            const page = await browser.newPage();
            const browserMessages = [];
            page.on('console', (message) => browserMessages.push(`${message.type()}: ${message.text()}`));
            page.on('pageerror', (error) => browserMessages.push(`pageerror: ${error.message}`));
            await page.goto(`http://${FIXTURE_HOST}:${server.address().port}${route}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
            await page.waitForFunction(() => window.__captchaState?.ready || window.__captchaState?.error, null, { timeout: 20_000 }).catch((error) => {
                throw new Error(`${captchaType} explicit render callback did not run: ${error.message}; browser=${JSON.stringify(browserMessages)}`);
            });
            if (captchaType === 'hcaptcha') {
                await page.waitForSelector('iframe', { timeout: 20_000 }).catch((error) => {
                    throw new Error(`${captchaType} widget frame did not load: ${error.message}; browser=${JSON.stringify(browserMessages)}`);
                });
            } else {
                await page.waitForFunction(() => window.__captchaState?.token || window.__captchaState?.error || document.querySelector('iframe'), null, { timeout: 20_000 }).catch(async (error) => {
                    const state = await page.evaluate(() => window.__captchaState);
                    throw new Error(`${captchaType} produced neither a token nor a widget frame: ${error.message}; state=${JSON.stringify(state)}; browser=${JSON.stringify(browserMessages)}`);
                });
            }
            const logs = [];
            let result;
            try {
                result = await solveLocalCaptcha(page, { captchaType, timeout: 10_000, logs });
            } catch (error) {
                const frames = await Promise.all(page.frames().map(async (frame) => ({
                    url: frame.url(),
                    checkbox: await frame.locator('#checkbox, [role="checkbox"]').count().catch(() => 0),
                    grid: await frame.locator('.task-grid').count().catch(() => 0),
                    checked: await frame.locator('#checkbox, [role="checkbox"]').first().getAttribute('aria-checked').catch(() => null)
                })));
                const state = await page.evaluate(() => ({
                    captcha: window.__captchaState,
                    responses: [...document.querySelectorAll('textarea, input')].map((element) => ({ name: element.name, value: element.value }))
                }));
                throw new Error(`${error.message}; logs=${JSON.stringify(logs)}; state=${JSON.stringify(state)}; frames=${JSON.stringify(frames)}; browser=${JSON.stringify(browserMessages)}`);
            }
            assert(result.token, `${captchaType} official test widget did not issue a token`);
            executed.push(captchaType);
            await page.close();
        }
    } finally {
        await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
    console.log(`Official ${executed.join(' and ')} browser-key test${executed.length === 1 ? '' : 's'} passed!`);
}

main().catch((error) => { console.error(error); process.exit(1); });
