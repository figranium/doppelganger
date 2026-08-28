const assert = require('assert');
const {
    findAntiBotReason,
    inspectPageForAntiBot,
    normalizeTaskOutcome,
    resolveTaskOutcome
} = require('../src/agent/outcomes');
const {
    setStopChecker,
    setStopCleaner,
    consumeStopRequest,
    clearStopRequest
} = require('../src/agent/execution-control');
const { executeAction } = require('../src/agent/figranite/action-handler');
const { getExecutionOutcome, summarizeExecution } = require('../src/server/routes/executions');
const { handleAgent } = require('../src/agent/figranite');
const { handleScrape } = require('../scrape');

const mockResponse = () => {
    const state = { status: 200, body: null };
    const response = {
        status(code) { state.status = code; return response; },
        json(body) { state.body = body; return response; }
    };
    return { state, response };
};

async function run() {
    assert.strictEqual(resolveTaskOutcome(), 'success');
    assert.strictEqual(resolveTaskOutcome({ explicitOutcome: 'error' }), 'error');
    assert.strictEqual(resolveTaskOutcome({ stopped: true }), 'stopped');
    assert.strictEqual(resolveTaskOutcome({ crashed: true, stopped: true }), 'crashed');
    assert.strictEqual(resolveTaskOutcome({ antiBot: true, crashed: true, stopped: true }), 'anti_bot');
    assert.strictEqual(normalizeTaskOutcome('unknown', 'error'), 'error');

    assert.match(findAntiBotReason({ status: 403 }), /HTTP 403/);
    assert.match(findAntiBotReason({ status: 429 }), /HTTP 429/);
    assert.match(findAntiBotReason({ url: 'https://example.com/cdn-cgi/challenge-platform/test' }), /Cloudflare/);
    assert.match(findAntiBotReason({
        title: 'Just a moment...',
        html: '<main>Checking your browser before accessing the site</main>'
    }), /verification/);
    assert.match(findAntiBotReason({ html: '<div class="h-captcha" data-sitekey="key"></div>' }), /CAPTCHA/);
    assert.strictEqual(findAntiBotReason({
        html: '<script>const template = `<div class="h-captcha"></div>`;</script><main>Documentation</main>'
    }), null);
    assert.strictEqual(findAntiBotReason({
        html: '<div class="h-captcha" data-sitekey="key"></div>',
        captchaResolved: true
    }), null);

    const unresolvedPage = {
        url: () => 'https://example.com',
        title: async () => 'Verify',
        content: async () => '<div class="g-recaptcha" data-sitekey="key"></div>',
        evaluate: async () => false
    };
    assert.strictEqual((await inspectPageForAntiBot(unresolvedPage)).detected, true);
    assert.strictEqual((await inspectPageForAntiBot({ ...unresolvedPage, evaluate: async () => true })).detected, false);

    let stopPending = true;
    let clearedRunId = null;
    setStopChecker((runId) => runId === 'run-1' && stopPending && !(stopPending = false));
    setStopCleaner((runId) => { clearedRunId = runId; });
    assert.strictEqual(consumeStopRequest('run-1'), true);
    assert.strictEqual(consumeStopRequest('run-1'), false);
    clearStopRequest('run-1');
    assert.strictEqual(clearedRunId, 'run-1');

    for (const explicitOutcome of ['success', 'error']) {
        const logs = [];
        let stopped = false;
        let outcome = null;
        const result = await executeAction({ type: 'stop', value: explicitOutcome }, {
            logs,
            options: {},
            setStopRequested: (value) => { stopped = value; },
            setStopOutcome: (value) => { outcome = value; }
        });
        assert.strictEqual(stopped, true);
        assert.strictEqual(outcome, explicitOutcome);
        assert.strictEqual(result, explicitOutcome);
    }

    assert.strictEqual(getExecutionOutcome({ status: 200 }), 'success');
    assert.strictEqual(getExecutionOutcome({ status: 500 }), 'error');
    assert.strictEqual(getExecutionOutcome({ status: 200, result: { outcome: 'anti_bot' } }), 'anti_bot');
    assert.strictEqual(summarizeExecution({ id: 'x', status: 200, result: { outcome: 'stopped' } }).outcome, 'stopped');

    const agentMock = mockResponse();
    await handleAgent({ method: 'POST', body: { actions: [] }, query: {}, socket: {}, protocol: 'http' }, agentMock.response);
    assert.strictEqual(agentMock.state.status, 400);
    assert.strictEqual(agentMock.state.body.error, 'INVALID_TASK_INPUT');

    const scrapeMock = mockResponse();
    await handleScrape({ method: 'POST', body: {}, query: {} }, scrapeMock.response);
    assert.strictEqual(scrapeMock.state.status, 400);
    assert.strictEqual(scrapeMock.state.body.error, 'INVALID_SCRAPE_INPUT');

    setStopChecker(null);
    setStopCleaner(null);
    console.log('Task outcome tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
