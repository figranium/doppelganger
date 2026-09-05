const assert = require('assert');
const { runFigranite } = require('../../../src/agent/figranite/index');
const { startTortureServer } = require('../torture-server');

let tortureServer = null;
const TORTURE_PORT = 11346;
const TORTURE_URL = `http://127.0.0.1:${TORTURE_PORT}`;

async function ensureTortureServer() {
    if (!tortureServer) {
        try { tortureServer = await startTortureServer(TORTURE_PORT); } catch { /* shared deterministic port may already be active */ }
    }
}

const tests = [
    {
        id: 'BLOCK-001', name: 'Action Blocks - type, select, click, press, wait_selector', subsystem: 'engine-blocks',
        setup: 'Torture server /form page',
        steps: 'Fill and submit the deterministic form using browser action blocks.',
        expected: 'The form submits and final HTML contains the submitted qualification username.', severity: 'CRITICAL', blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({ url: `${TORTURE_URL}/form`, mode: 'agent', actions: [
                { id: 'a1', type: 'type', selector: '#username-input', value: 'jules_tester', typeMode: 'replace' },
                { id: 'a2', type: 'type', selector: '#password-input', value: 'secret_pass_123' },
                { id: 'a3', type: 'select', selector: '#country-select', value: 'us' },
                { id: 'a4', type: 'click', selector: '#subscribe-checkbox' },
                { id: 'a5', type: 'press', key: 'Tab' },
                { id: 'a6', type: 'click', selector: '#submit-btn' },
                { id: 'a7', type: 'wait_selector', selector: '#form-submitted', timeout: 5000 }
            ] });
            assert.strictEqual(result.outcome, 'success');
            assert.ok(result.html.includes('Form Submitted Successfully'));
            assert.ok(result.html.includes('jules_tester'));
        }
    },
    {
        id: 'BLOCK-002', name: 'Action Blocks - hover, click, scroll, get_content', subsystem: 'engine-blocks',
        setup: 'Torture server /interactions page',
        steps: 'Hover a target, click a deterministic button, scroll a container, and capture click-result content.',
        expected: 'Execution succeeds and the click result is observable.', severity: 'CRITICAL', blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({ url: `${TORTURE_URL}/interactions`, mode: 'agent', actions: [
                { id: 'b1', type: 'hover', selector: '#hover-box' },
                { id: 'b2', type: 'click', selector: '#btn-single-click' },
                { id: 'b3', type: 'scroll', selector: '#scroll-container', value: '200' },
                { id: 'b4', type: 'get_content', selector: '#click-result', varName: 'click_res' }
            ] });
            assert.strictEqual(result.outcome, 'success');
            assert.ok(result.html.includes('Single Clicked') || result.logs.some(l => l.includes('Single Clicked')));
        }
    },
    {
        id: 'BLOCK-003', name: 'Action Block - JavaScript top-level return', subsystem: 'engine-blocks',
        setup: 'Torture server home page', steps: 'Execute JavaScript containing a top-level return.',
        expected: 'The wrapped script executes without an illegal-return syntax failure.', severity: 'HIGH', blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({ url: `${TORTURE_URL}/`, mode: 'agent', actions: [
                { id: 'c1', type: 'javascript', value: 'const title = document.title; return title.toUpperCase();' }
            ] });
            assert.strictEqual(result.outcome, 'success');
        }
    },
    {
        id: 'BLOCK-004', name: 'Data Blocks - set, csv, merge, http_request', subsystem: 'engine-blocks',
        setup: 'Torture server with deterministic /api/echo', steps: 'Execute set, CSV parse, merge, and HTTP request blocks.',
        expected: 'All data actions execute without engine failure.', severity: 'HIGH', blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({ url: `${TORTURE_URL}/`, mode: 'agent', actions: [
                { id: 'd1', type: 'set', varName: 'my_var', value: 'Hello Figranium' },
                { id: 'd2', type: 'csv', value: 'a,b\n1,2\n3,4', varName: 'parsed_csv' },
                { id: 'd3', type: 'merge', value: '{$parsed_csv}', varName: 'merged_data' },
                { id: 'd4', type: 'http_request', value: `${TORTURE_URL}/api/echo`, method: 'POST', body: '{"msg":"test"}', varName: 'http_resp' }
            ] });
            assert.strictEqual(result.outcome, 'success');
        }
    },
    {
        id: 'BLOCK-005', name: 'Control Flow - repeat, if, else, end', subsystem: 'engine-blocks',
        setup: 'Torture server home page', steps: 'Run repeat followed by deterministic if/else control flow.',
        expected: 'Repeat and conditional blocks execute and the repeat path is observed in logs.', severity: 'CRITICAL', blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({ url: `${TORTURE_URL}/`, mode: 'agent', actions: [
                { id: 'e1', type: 'set', varName: 'counter', value: '0' },
                { id: 'e2', type: 'repeat', value: '3' },
                { id: 'e3', type: 'javascript', value: 'document.title += "!";' },
                { id: 'e4', type: 'end' },
                { id: 'e5', type: 'if', conditionVar: 'counter', conditionOp: 'equals', conditionValue: '0' },
                { id: 'e6', type: 'do_nothing' }, { id: 'e7', type: 'else' }, { id: 'e8', type: 'do_nothing' }, { id: 'e9', type: 'end' }
            ] });
            assert.strictEqual(result.outcome, 'success');
            assert.ok(result.logs.some(l => l.includes('Repeat block')));
            assert.ok(result.logs.some(l => l.includes('If condition: true')));
        }
    },
    {
        id: 'BLOCK-006', name: 'Action Block - wait_downloads and file download', subsystem: 'engine-blocks',
        setup: 'Torture server download fixture', steps: 'Click deterministic download link and wait for completion.',
        expected: 'The expected filename appears in result.downloads.', severity: 'CRITICAL', blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({ url: `${TORTURE_URL}/`, mode: 'agent', actions: [
                { id: 'f1', type: 'click', selector: '#link-download' }, { id: 'f2', type: 'wait_downloads', value: '5' }
            ] });
            assert.strictEqual(result.outcome, 'success');
            assert.ok(Array.isArray(result.downloads) && result.downloads.length > 0, 'Downloads array should contain intercepted file');
            assert.strictEqual(result.downloads[0].name, 'torture_sample.txt');
        }
    },
    {
        id: 'BLOCK-007', name: 'Action Blocks - get_content, do_nothing, stop', subsystem: 'engine-blocks',
        setup: 'Torture server home page', steps: 'Capture title content, execute do_nothing, then stop with success.',
        expected: 'Execution terminates intentionally with outcome="success".', severity: 'HIGH', blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({ url: `${TORTURE_URL}/`, mode: 'agent', actions: [
                { id: 'g1', type: 'get_content', selector: '#title', varName: 'main_title' }, { id: 'g2', type: 'do_nothing' }, { id: 'g3', type: 'stop', value: 'success' }
            ] });
            assert.strictEqual(result.outcome, 'success');
        }
    },
    {
        id: 'BLOCK-008', name: 'Control Flow - while loop exits on changed page state', subsystem: 'engine-blocks',
        setup: 'Torture server home page', steps: 'Initialize a page counter, loop while it is below three, mutate it inside the loop, and assert loop termination.',
        expected: 'The while condition is true three times, then false, and final HTML records counter=3.', severity: 'CRITICAL', blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({ url: `${TORTURE_URL}/`, mode: 'agent', actions: [
                { id: 'w1', type: 'javascript', value: 'window.qualCounter = 0; document.body.dataset.qualCounter = "0";' },
                { id: 'w2', type: 'while', value: 'window.qualCounter < 3' },
                { id: 'w3', type: 'javascript', value: 'window.qualCounter += 1; document.body.dataset.qualCounter = String(window.qualCounter);' },
                { id: 'w4', type: 'end' }
            ] });
            assert.strictEqual(result.outcome, 'success');
            assert.ok(result.logs.filter(l => l.includes('While condition: true')).length >= 3);
            assert.ok(result.logs.some(l => l.includes('While condition: false')));
            assert.ok(result.html.includes('data-qual-counter="3"'));
        }
    },
    {
        id: 'BLOCK-009', name: 'Control Flow - foreach iterates deterministic DOM collection', subsystem: 'engine-blocks',
        setup: 'Torture server home page containing multiple links', steps: 'Iterate all anchor elements, persist the current loop index into a runtime variable, and expose the final loop count/index into page state after the loop.',
        expected: 'For-each starts, the loop body runs through the final anchor, and the final page state reports the DOM collection size.', severity: 'CRITICAL', blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({ url: `${TORTURE_URL}/`, mode: 'agent', actions: [
                { id: 'fe1', type: 'foreach', selector: 'a' },
                { id: 'fe2', type: 'set', varName: 'last_foreach_index', value: '{$loop.index}' },
                { id: 'fe3', type: 'end' },
                { id: 'fe4', type: 'javascript', value: 'document.body.dataset.qualForeachCount = "{$loop.count}"; document.body.dataset.qualForeachLast = "{$last_foreach_index}";' }
            ] });
            assert.strictEqual(result.outcome, 'success');
            const collectionSize = (result.html.match(/<a\b/gi) || []).length;
            assert.ok(collectionSize > 0, 'Foreach must iterate at least one anchor');
            assert.ok(result.logs.some(l => l.includes(`For-each item 1/${collectionSize}`)), 'Foreach must report the collection size when it starts');
            assert.ok(result.html.includes(`data-qual-foreach-count="${collectionSize}"`), 'Final loop.count must match the DOM collection size');
            assert.ok(result.html.includes(`data-qual-foreach-last="${collectionSize - 1}"`), 'Loop body must execute through the final foreach item');
        }
    },
    {
        id: 'BLOCK-010', name: 'Control Flow - on_error catches a failing action', subsystem: 'engine-blocks',
        setup: 'Torture server home page', steps: 'Register on_error, intentionally click a missing selector, and mutate page state from the handler.',
        expected: 'The failure is logged, the handler executes, and the final page proves handler execution.', severity: 'CRITICAL', blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({ url: `${TORTURE_URL}/`, mode: 'agent', actions: [
                { id: 'oe1', type: 'on_error' },
                { id: 'oe2', type: 'javascript', value: 'document.body.dataset.qualErrorHandled = "yes";' },
                { id: 'oe3', type: 'end' },
                { id: 'oe4', type: 'click', selector: '#qualification-element-that-does-not-exist' }
            ] });
            assert.strictEqual(result.outcome, 'success');
            assert.ok(result.logs.some(l => l.includes('On-error handler registered.')));
            assert.ok(result.logs.some(l => l.includes('FAILED action click')));
            assert.ok(result.html.includes('data-qual-error-handled="yes"'));
        }
    }
];

module.exports = { tests };
