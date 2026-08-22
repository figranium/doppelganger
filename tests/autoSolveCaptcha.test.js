const assert = require('assert');
const { maybeAutoSolveCaptcha } = require('../src/agent/figranite/index');

function makeFakePage({ found } = { found: true }) {
    let calls = 0;
    return {
        url: () => 'https://example.com/protected',
        evaluate: async () => {
            calls += 1;
            if (calls === 1) return found ? { siteKey: 'sk', captchaType: 'recaptcha_v2' } : null;
            return undefined;
        }
    };
}

function mockFetchSequence(responses) {
    let i = 0;
    global.fetch = async () => {
        const r = responses[Math.min(i, responses.length - 1)];
        i++;
        return { ok: true, status: 200, json: async () => r };
    };
}

async function testDisabledDoesNothing() {
    console.log('Testing auto-solve disabled...');
    const logs = [];
    global.fetch = async () => { throw new Error('should not be called'); };
    await maybeAutoSolveCaptcha({ enabled: false, actionType: 'navigate', page: makeFakePage(), logs });
    assert.strictEqual(logs.length, 0, 'Expected no logs when disabled');
    console.log('✓ Auto-solve disabled does nothing.');
}

async function testIgnoredActionType() {
    console.log('Testing auto-solve ignores non-trigger action types...');
    const logs = [];
    global.fetch = async () => { throw new Error('should not be called'); };
    await maybeAutoSolveCaptcha({ enabled: true, actionType: 'wait', page: makeFakePage(), logs });
    assert.strictEqual(logs.length, 0, 'Expected no logs for a non-trigger action type');
    console.log('✓ Auto-solve ignores non-trigger action types.');
}

async function testSilentlySkipsWhenNoChallenge() {
    console.log('Testing auto-solve silently skips when no challenge is present...');
    const logs = [];
    await maybeAutoSolveCaptcha({ enabled: true, actionType: 'navigate', page: makeFakePage({ found: false }), logs });
    assert.strictEqual(logs.length, 0, 'Expected no logs when no challenge is found (not an error)');
    console.log('✓ Auto-solve silently skips absent challenges.');
}

async function testSolvesWhenTriggered() {
    console.log('Testing auto-solve solves a detected challenge...');
    mockFetchSequence([
        { taskId: 'task_1' },
        { status: 'ready', solution: { gRecaptchaResponse: 'token' } }
    ]);
    const logs = [];
    await maybeAutoSolveCaptcha({ enabled: true, actionType: 'click', page: makeFakePage({ found: true }), logs });
    assert(logs.some((l) => l.includes('Auto-solved captcha')), 'Expected an auto-solve success log');
    console.log('✓ Auto-solve solves a detected challenge on a trigger action.');
}

async function main() {
    await testDisabledDoesNothing();
    await testIgnoredActionType();
    await testSilentlySkipsWhenNoChallenge();
    await testSolvesWhenTriggered();
    console.log('All auto-solve captcha tests passed!');
}

main().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
