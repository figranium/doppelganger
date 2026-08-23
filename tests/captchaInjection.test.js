const assert = require('assert');
const { JSDOM } = require('jsdom');
const { injectSolution } = require('../src/agent/figranite/captcha-client');

async function main() {
    const dom = new JSDOM('<textarea name="h-captcha-response"></textarea><textarea name="g-recaptcha-response"></textarea>');
    const previous = { window: global.window, document: global.document, HTMLTextAreaElement: global.HTMLTextAreaElement, HTMLInputElement: global.HTMLInputElement, Event: global.Event };
    Object.assign(global, {
        window: dom.window,
        document: dom.window.document,
        HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
        HTMLInputElement: dom.window.HTMLInputElement,
        Event: dom.window.Event
    });
    let callbackToken = null;
    let changes = 0;
    dom.window.callbacks = { solved: (token) => { callbackToken = token; } };
    for (const element of dom.window.document.querySelectorAll('textarea')) element.addEventListener('change', () => { changes += 1; });
    const page = { evaluate: async (operation, argument) => operation(argument) };
    try {
        await injectSolution(page, 'hcaptcha', 'injected-token', 'callbacks.solved');
        assert.strictEqual(dom.window.document.querySelector('textarea[name="h-captcha-response"]').value, 'injected-token');
        assert.strictEqual(dom.window.document.querySelector('textarea[name="g-recaptcha-response"]').value, 'injected-token');
        assert.strictEqual(changes, 2);
        assert.strictEqual(callbackToken, 'injected-token');
    } finally {
        Object.assign(global, previous);
        dom.window.close();
    }
    console.log('All CAPTCHA token-injection tests passed!');
}

main().catch((error) => { console.error(error); process.exit(1); });
