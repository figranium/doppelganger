const assert = require('assert');
const { runFigranite } = require('../../../src/agent/figranite/index');
const { startTortureServer } = require('../torture-server');

let tortureServer = null;
const TORTURE_PORT = 11346;
const TORTURE_URL = `http://127.0.0.1:${TORTURE_PORT}`;

async function ensureTortureServer() {
    if (!tortureServer) {
        try {
            tortureServer = await startTortureServer(TORTURE_PORT);
        } catch {
            // A shared qualification server may already own the deterministic port.
        }
    }
}

const tests = [
    {
        id: 'BLOCK-001',
        name: 'Action Blocks - type, select, click, press, wait_selector',
        subsystem: 'engine-blocks',
        setup: 'Torture server running on 127.0.0.1:11346',
        steps: 'Fill and submit the deterministic form using supported browser action blocks.',
        expected: 'The form is submitted and the final HTML contains the submitted qualification username.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/form`, mode: 'agent', actions: [
                    { id: 'a1', type: 'type', selector: '#username-input', value: 'jules_tester', typeMode: 'replace' },
                    { id: 'a2', type: 'type', selector: '#password-input', value: 'secret_pass_123' },
                    { id: 'a3', type: 'select', selector: '#country-select', value: 'us' },
                    { id: 'a4', type: 'click', selector: '#subscribe-checkbox' },
                    { id: 'a5', type: 'press', key: 'Tab' },
                    { id: 'a6', type: 'click', selector: '#submit-btn' },
                    { id: 'a7', type: 'wait_selector', selector: '#form-submitted', timeout: 5000 }
                ]
            });
            assert.strictEqual(result.outcome, 'success');
            assert.ok(result.html.includes('Form Submitted Successfully'));
            assert.ok(result.html.includes('jules_tester'));
        }
    },
    {
        id: 'BLOCK-002',
        name: 'Action Blocks - hover, click, scroll, get_content',
        subsystem: 'engine-blocks',
        setup: 'Torture server /interactions page',
        steps: 'Hover a target, click a deterministic button, scroll a container, and capture click-result content.',
        expected: 'Execution succeeds and the click result is observable in the page/log output.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/interactions`, mode: 'agent', actions: [
                    { id: 'b1', type: 'hover', selector: '#hover-box' },
                    { id: 'b2', type: 'click', selector: '#btn-single-click' },
                    { id: 'b3', type: 'scroll', selector: '#scroll-container', value: '200' },
                    { id: 'b4', type: 'get_content', selector: '#click-result', varName: 'click_res' }
                ]
            });
            assert.strictEqual(result.outcome, 'success');
            assert.ok(result.html.includes('Single Clicked') || result.logs.some(l => l.includes('Single Clicked')));
        }
    },
    {
        id: 'BLOCK-003',
        name: 'Action Block - JavaScript top-level return',
        subsystem: 'engine-blocks',
        setup: 'Torture server home page',
        steps: 'Execute a JavaScript block containing a top-level return statement.',
        expected: 'The wrapped script executes without an illegal-return syntax failure.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/`, mode: 'agent', actions: [
                    { id: 'c1', type: 'javascript', value: 'const title = document.title; return title.toUpperCase();' }
                ]
            });
            assert.strictEqual(result.outcome, 'success');
        }
    },
    {
        id: 'BLOCK-004',
        name: 'Data Blocks - set, csv, merge, http_request',
        subsystem: 'engine-blocks',
        setup: 'Torture server with deterministic /api/echo',
        steps: 'Execute set, CSV parse, merge, and HTTP request blocks in sequence.',
        expected: 'All data actions execute without engine failure.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/`, mode: 'agent', actions: [
                    { id: 'd1', type: 'set', varName: 'my_var', value: 'Hello Figranium' },
                    { id: 'd2', type: 'csv', value: 'a,b\n1,2\n3,4', varName: 'parsed_csv' },
                    { id: 'd3', type: 'merge', value: '{$parsed_csv}', varName: 'merged_data' },
                    { id: 'd4', type: 'http_request', value: `${TORTURE_URL}/api/echo`, method: 'POST', body: '{"msg":"test"}', varName: 'http_resp' }
                ]
            });
            assert.strictEqual(result.outcome, 'success');
        }
    },
    {
        id: 'BLOCK-005',
        name: 'Control Flow - repeat, if, else, end',
        subsystem: 'engine-blocks',
        setup: 'Torture server home page',
        steps: 'Run a repeat block followed by deterministic if/else control flow.',
        expected: 'Repeat and conditional blocks execute and the repeat path is observed in logs.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/`, mode: 'agent', actions: [
                    { id: 'e1', type: 'set', varName: 'counter', value: '0' },
                    { id: 'e2', type: 'repeat', value: '3' },
                    { id: 'e3', type: 'javascript', value: 'document.title += "!";' },
                    { id: 'e4', type: 'end' },
                    { id: 'e5', type: 'if', conditionVar: 'counter', conditionOp: 'equals', conditionValue: '0' },
                    { id: 'e6', type: 'do_nothing' },
                    { id: 'e7', type: 'else' },
                    { id: 'e8', type: 'do_nothing' },
                    { id: 'e9', type: 'end' }
                ]
            });
            assert.strictEqual(result.outcome, 'success');
            assert.ok(result.logs.some(l => l.includes('Repeat block')));
        }
    },
    {
        id: 'BLOCK-006',
        name: 'Action Block - wait_downloads and file download',
        subsystem: 'engine-blocks',
        setup: 'Torture server download fixture',
        steps: 'Click the deterministic download link and wait for download completion.',
        expected: 'The download is intercepted and the expected filename appears in result.downloads.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/`, mode: 'agent', actions: [
                    { id: 'f1', type: 'click', selector: '#link-download' },
                    { id: 'f2', type: 'wait_downloads', value: '5' }
                ]
            });
            assert.strictEqual(result.outcome, 'success');
            assert.ok(Array.isArray(result.downloads) && result.downloads.length > 0, 'Downloads array should contain intercepted file');
            assert.strictEqual(result.downloads[0].name, 'torture_sample.txt');
        }
    },
    {
        id: 'BLOCK-007',
        name: 'Action Blocks - get_content, do_nothing, stop',
        subsystem: 'engine-blocks',
        setup: 'Torture server home page',
        steps: 'Capture title content, execute do_nothing, then stop with success outcome.',
        expected: 'Execution terminates intentionally with outcome="success".',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/`, mode: 'agent', actions: [
                    { id: 'g1', type: 'get_content', selector: '#title', varName: 'main_title' },
                    { id: 'g2', type: 'do_nothing' },
                    { id: 'g3', type: 'stop', value: 'success' }
                ]
            });
            assert.strictEqual(result.outcome, 'success');
        }
    },
    {
        id: 'BLOCK-008',
        name: 'Control Flow - while, foreach, on_error',
        subsystem: 'engine-blocks',
        setup: 'Requires dedicated deterministic fixtures and independent assertions for each advanced control-flow block',
        steps: 'Exercise while, foreach and on_error independently, including success and failure paths.',
        expected: 'Each advanced control-flow block has independently verified behavior and failure handling.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => ({ status: 'NOT_TESTED', reason: 'The previous suite claimed these blocks without exercising them. Dedicated fixtures still need to be implemented.' })
    },
    {
        id: 'BLOCK-009',
        name: 'Advanced Pointer Interactions - double-click, context-click, drag-and-drop',
        subsystem: 'engine-blocks',
        setup: 'Requires explicit supported action types and deterministic interaction fixtures',
        steps: 'Exercise each supported advanced pointer interaction independently.',
        expected: 'Each supported interaction changes deterministic page state and is asserted independently.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => ({ status: 'NOT_TESTED', reason: 'The previous BLOCK-002 title claimed these interactions, but its implementation did not execute them.' })
    }
];

module.exports = { tests };
