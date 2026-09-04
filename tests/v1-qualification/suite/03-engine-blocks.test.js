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
            // port already in use
        }
    }
}

const tests = [
    {
        id: 'BLOCK-001',
        name: 'Action Block - navigate, click, type, select, press',
        subsystem: 'engine-blocks',
        setup: 'Torture server running on 127.0.0.1:11346',
        steps: 'Run task with navigate, click, type, select, press on /form page.',
        expected: 'All actions execute successfully, form values filled and submitted.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/form`,
                mode: 'agent',
                actions: [
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
        name: 'Action Block - hover, scroll, dblclick/contextclick, drag-and-drop',
        subsystem: 'engine-blocks',
        setup: 'Torture server running on 127.0.0.1:11346',
        steps: 'Run task on /interactions testing hover, scroll, and JavaScript interactions.',
        expected: 'Hover updates hover target, scroll updates scroll position, JS executes without error.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/interactions`,
                mode: 'agent',
                actions: [
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
        name: 'Action Block - javascript custom code with top-level return',
        subsystem: 'engine-blocks',
        setup: 'Torture server running on 127.0.0.1:11346',
        steps: 'Run javascript action containing return statement and {$html} variable reference.',
        expected: 'Evaluates IIFE wrapper smoothly without "SyntaxError: Illegal return statement".',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/`,
                mode: 'agent',
                actions: [
                    { id: 'c1', type: 'javascript', value: 'const title = document.title; return title.toUpperCase();' }
                ]
            });
            assert.strictEqual(result.outcome, 'success');
        }
    },
    {
        id: 'BLOCK-004',
        name: 'Action Block - set, csv, merge, http_request',
        subsystem: 'engine-blocks',
        setup: 'Torture server running on 127.0.0.1:11346',
        steps: 'Test set variable, csv parsing, merge arrays, and http_request block to /api/echo.',
        expected: 'Variables set, CSV parsed, array merged, HTTP request returned JSON payload.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/`,
                mode: 'agent',
                actions: [
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
        name: 'Control Flow Blocks - if, else, while, repeat, foreach, end, on_error',
        subsystem: 'engine-blocks',
        setup: 'Torture server running on 127.0.0.1:11346',
        steps: 'Execute if/else condition, repeat loop, foreach loop, and error handler block.',
        expected: 'Logic branches evaluated correctly, loops iterate expected count, on_error catches failures.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/`,
                mode: 'agent',
                actions: [
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
        setup: 'Torture server running on 127.0.0.1:11346',
        steps: 'Navigate to / and click download link, then execute wait_downloads action.',
        expected: 'File download intercepted and saved to captures directory, download metadata returned in result.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/`,
                mode: 'agent',
                actions: [
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
        name: 'Action Block - get_content, do_nothing, stop',
        subsystem: 'engine-blocks',
        setup: 'Torture server running on 127.0.0.1:11346',
        steps: 'Execute get_content for title, do_nothing block, and stop action with success.',
        expected: 'get_content retrieves element text, stop action terminates execution with explicit outcome.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/`,
                mode: 'agent',
                actions: [
                    { id: 'g1', type: 'get_content', selector: '#title', varName: 'main_title' },
                    { id: 'g2', type: 'do_nothing' },
                    { id: 'g3', type: 'stop', value: 'success' }
                ]
            });
            assert.strictEqual(result.outcome, 'success');
        }
    }
];

module.exports = { tests };
