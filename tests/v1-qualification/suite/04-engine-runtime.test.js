const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runFigranite } = require('../../../src/agent/figranite/index');
const { requestStop } = require('../../../src/agent/execution-control');
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
        id: 'ENGINE-001',
        name: 'Engine Runtime - Variable Interpolation & Expression Evaluation',
        subsystem: 'engine-runtime',
        setup: 'Torture server running',
        steps: 'Pass taskVariables with custom strings and {$now}; type resolved values into deterministic fields.',
        expected: 'Template placeholders are resolved before browser actions execute.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/form`, mode: 'agent', taskVariables: { target_name: 'test_user_777' },
                statelessExecution: true, disableRecording: true,
                actions: [
                    { id: 'v1', type: 'type', selector: '#username-input', value: '{$target_name}' },
                    { id: 'v2', type: 'type', selector: '#comments-textarea', value: 'Created at {$now}' }
                ]
            });
            assert.strictEqual(result.outcome, 'success');
            assert.ok(result.logs.some(l => l.includes('test_user_777')));
        }
    },
    {
        id: 'ENGINE-002',
        name: 'Engine Runtime - Structured Extraction',
        subsystem: 'engine-runtime',
        setup: 'Torture server running',
        steps: 'Run an extraction script against deterministic page content.',
        expected: 'Extraction returns the expected title and a nontrivial link count.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/`, mode: 'agent', statelessExecution: true, disableRecording: true,
                extractionScript: 'return { title: document.title, linkCount: document.querySelectorAll("a").length };', actions: []
            });
            assert.strictEqual(result.outcome, 'success');
            assert.ok(result.data);
            assert.strictEqual(result.data.title, 'Figranium Torture Site');
            assert.ok(result.data.linkCount >= 10);
        }
    },
    {
        id: 'ENGINE-003',
        name: 'Engine Runtime - Persistent Context Storage (sessionId)',
        subsystem: 'engine-runtime',
        setup: 'Torture server auth fixture',
        steps: 'Log in with a unique sessionId, then open the protected dashboard in a second execution using the same sessionId.',
        expected: 'The second execution reuses persisted browser state and reaches the protected dashboard.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const sessionId = `qual_session_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
            const sessionPath = path.join(__dirname, '../../../data/sessions', `${sessionId}.json`);
            try {
                const loginRes = await runFigranite({
                    url: `${TORTURE_URL}/auth/login`, mode: 'agent', sessionId, disableRecording: true,
                    actions: [
                        { id: 'l1', type: 'type', selector: '#auth-username', value: 'admin' },
                        { id: 'l2', type: 'type', selector: '#auth-password', value: 'secret123' },
                        { id: 'l3', type: 'click', selector: '#auth-submit-btn' },
                        { id: 'l4', type: 'wait', value: '1' }
                    ]
                });
                assert.strictEqual(loginRes.outcome, 'success');
                assert.ok(fs.existsSync(sessionPath), 'Session storageState file must be created');

                const dashRes = await runFigranite({
                    url: `${TORTURE_URL}/auth/dashboard`, mode: 'agent', sessionId, disableRecording: true,
                    actions: [{ id: 'd1', type: 'wait_selector', selector: '#dashboard-title' }]
                });
                assert.strictEqual(dashRes.outcome, 'success');
                assert.ok(dashRes.html.includes('Protected Auth Dashboard'));
            } finally {
                fs.rmSync(sessionPath, { force: true });
            }
        }
    },
    {
        id: 'ENGINE-004',
        name: 'Engine Runtime - Cancellation and Stop Outcome',
        subsystem: 'engine-runtime',
        setup: 'Torture server running',
        steps: 'Start a long wait and issue requestStop(runId) while it is active.',
        expected: 'Execution aborts gracefully and returns outcome="stopped".',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const runId = `stop_run_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
            const taskPromise = runFigranite({
                url: `${TORTURE_URL}/`, mode: 'agent', runId, statelessExecution: true, disableRecording: true,
                actions: [{ id: 's1', type: 'wait', value: '10' }]
            });
            setTimeout(() => requestStop(runId), 300);
            const result = await taskPromise;
            assert.strictEqual(result.outcome, 'stopped');
        }
    },
    {
        id: 'ENGINE-005',
        name: 'Engine Runtime - Stealth Options Execute Successfully',
        subsystem: 'engine-runtime',
        setup: 'Torture server form fixture',
        steps: 'Execute a deterministic form interaction with all supported humanization flags enabled.',
        expected: 'Stealth/humanization options do not crash or stall execution.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/form`, mode: 'agent', statelessExecution: true, disableRecording: true,
                stealth: { allowTypos: true, idleMovements: true, overscroll: true, deadClicks: true, fatigue: true, naturalTyping: true, cursorGlide: true, randomizeClicks: true },
                actions: [
                    { id: 'st1', type: 'type', selector: '#username-input', value: 'stealth_user' },
                    { id: 'st2', type: 'click', selector: '#country-select' }
                ]
            });
            assert.strictEqual(result.outcome, 'success');
        }
    },
    {
        id: 'ENGINE-006',
        name: 'Engine Runtime - Headless and Headful Browser Parity',
        subsystem: 'engine-runtime',
        setup: 'Torture server and DISPLAY/Xvfb for headful execution',
        steps: 'Run the same stateless deterministic extraction once headless and once headful.',
        expected: 'Both modes complete successfully and return the same deterministic page identity.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            if (!process.env.DISPLAY && process.platform === 'linux') {
                return { status: 'BLOCKED', reason: 'Headful qualification requires DISPLAY/Xvfb on Linux.' };
            }
            const task = {
                url: `${TORTURE_URL}/`, mode: 'agent', statelessExecution: true, disableRecording: true,
                extractionScript: 'return { title: document.title, marker: document.querySelector("#title")?.textContent?.trim() };', actions: []
            };
            const headless = await runFigranite(task, { headless: true });
            const headful = await runFigranite(task, { headless: false });
            assert.strictEqual(headless.outcome, 'success');
            assert.strictEqual(headful.outcome, 'success');
            assert.deepStrictEqual(headful.data, headless.data);
            assert.strictEqual(headful.data.title, 'Figranium Torture Site');
        }
    },
    {
        id: 'ENGINE-007',
        name: 'Engine Runtime - Concurrent Stateless Executions',
        subsystem: 'engine-runtime',
        setup: 'Torture server running',
        steps: 'Launch four independent stateless executions concurrently with unique input values.',
        expected: 'All four complete successfully and preserve their own input/output state without cross-run contamination.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const runs = Array.from({ length: 4 }, (_, i) => runFigranite({
                url: `${TORTURE_URL}/form`, mode: 'agent', statelessExecution: true, disableRecording: true,
                extractionScript: `return { value: document.querySelector('#username-input')?.value };`,
                actions: [{ id: `c-${i}`, type: 'type', selector: '#username-input', value: `concurrent-${i}` }]
            }, { headless: true }));
            const results = await Promise.all(runs);
            results.forEach((result, i) => {
                assert.strictEqual(result.outcome, 'success');
                assert.strictEqual(result.data?.value, `concurrent-${i}`);
            });
        }
    }
];

module.exports = { tests };
