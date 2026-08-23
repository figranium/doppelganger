const assert = require('assert');
const { captchaModelManager } = require('../src/agent/figranite/captcha-model-manager');
const { normalizePrompt, normalizeBox, mapDetectionsToCells, solveImageGrid, PROVIDERS } = require('../src/agent/figranite/captcha-grid-solver');

function fixture(captchaType, size) {
    const adapter = PROVIDERS[captchaType];
    const side = Math.sqrt(size);
    const state = { clicks: [], replacementVersion: 0, submitted: false };
    const cells = {
        count: async () => size,
        nth: (index) => ({
            boundingBox: async () => ({ x: (index % side) * 100, y: Math.floor(index / side) * 100, width: 100, height: 100 }),
            screenshot: async () => Buffer.from(`tile-${index}-${index === 0 ? state.replacementVersion : 0}`),
            click: async () => {
                state.clicks.push(index);
                if (index === 0 && state.replacementVersion === 0) state.replacementVersion = 1;
            }
        })
    };
    const first = (selector) => {
        if (selector === adapter.grid) return {
            isVisible: async () => true,
            boundingBox: async () => ({ x: 0, y: 0, width: side * 100, height: side * 100 }),
            screenshot: async () => Buffer.from(`grid-${state.replacementVersion}`)
        };
        if (selector === adapter.instruction) return { innerText: async () => captchaType === 'hcaptcha' ? 'Please click all images containing buses' : 'Select all squares with buses' };
        if (selector === adapter.error) return { innerText: async () => '' };
        if (selector === adapter.submit || selector === adapter.noMatch) return { click: async () => { state.submitted = true; } };
        throw new Error(`Unexpected selector ${selector}`);
    };
    const frame = {
        url: () => captchaType === 'hcaptcha' ? 'https://newassets.hcaptcha.com/captcha/v1/challenge' : 'https://www.google.com/recaptcha/api2/bframe',
        locator: (selector) => selector === adapter.cells ? cells : { first: () => first(selector) }
    };
    return {
        state,
        page: { frames: () => [frame], waitForTimeout: async () => undefined }
    };
}

async function runFixture(captchaType, size) {
    const { page, state } = fixture(captchaType, size);
    const originalDetect = captchaModelManager.detect;
    captchaModelManager.detect = async (image) => image.toString().startsWith('grid-')
        ? [{ box: [5, 5, 95, 95], label: 'bus', score: 0.9 }]
        : [];
    try {
        const token = await solveImageGrid(page, {
            captchaType,
            deadline: Date.now() + 10_000,
            waitForToken: async () => state.submitted ? `${captchaType}-token` : null,
            logs: []
        });
        assert.strictEqual(token, `${captchaType}-token`);
        assert.deepStrictEqual(state.clicks, [0, 0], 'changed replacement tile should be clicked once per fingerprint');
    } finally {
        captchaModelManager.detect = originalDetect;
    }
}

async function main() {
    assert.strictEqual(normalizePrompt(PROVIDERS.recaptcha_v2, 'Select all squares with buses.'), 'buses');
    assert.strictEqual(normalizePrompt(PROVIDERS.hcaptcha, 'Please click all images containing bicycles'), 'bicycles');
    assert.deepStrictEqual(normalizeBox({ box: { left: 1, top: 2, right: 5, bottom: 7 } }), { xmin: 1, ymin: 2, xmax: 5, ymax: 7 });
    assert.deepStrictEqual(mapDetectionsToCells([{ box: [1, 1, 99, 99] }], { x: 10, y: 20 }, [
        { x: 10, y: 20, width: 100, height: 100 }, { x: 110, y: 20, width: 100, height: 100 }
    ]), [0]);
    await runFixture('recaptcha_v2', 9);
    await runFixture('hcaptcha', 16);
    console.log('All CAPTCHA grid-adapter tests passed!');
}

main().catch((error) => { console.error(error); process.exit(1); });
