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
        try {
            tortureServer = await startTortureServer(TORTURE_PORT);
        } catch {
            // port already in use
        }
    }
}

const tests = [
    {
        id: 'ENGINE-001',
        name: 'Engine Runtime - Variable Interpolation & Expression Evaluation',
        subsystem: 'engine-runtime',
        setup: 'Torture server running',
        steps: 'Pass taskVariables with custom strings, numbers, and dates. Verify {$var} and {$now} interpolation.',
        expected: 'Template placeholders replaced correctly in URLs, selector values, and action inputs.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/form`,
                mode: 'agent',
                taskVariables: { target_name: 'test_user_777' },
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
        name: 'Engine Runtime - Structured Extraction Fields & Groups',
        subsystem: 'engine-runtime',
        setup: 'Torture server running',
        steps: 'Run task with extractionScript extracting HTML elements and page data.',
        expected: 'Extraction produces formatted JSON/CSV output data.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/`,
                mode: 'agent',
                extractionScript: 'return { title: document.title, linkCount: document.querySelectorAll("a").length };',
                actions: []
            });
            assert.strictEqual(result.outcome, 'success');
            assert.ok(result.data, 'Result must contain extracted data');
            assert.strictEqual(result.data.title, 'Figranium Torture Site');
            assert.ok(result.data.linkCount >= 10);
        }
    },
    {
        id: 'ENGINE-003',
        name: 'Engine Runtime - Persistent Context Storage (sessionId)',
        subsystem: 'engine-runtime',
        setup: 'Torture server running auth page',
        steps: 'Run task 1 to login at /auth/login with sessionId="test_session_v1". Run task 2 with same sessionId to verify cookie/storage persistence.',
        expected: 'Task 1 logs in and saves storageState. Task 2 reuses session without needing re-login.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const sessionId = `qual_session_${Date.now()}`;

            // Step 1: Login
            const loginRes = await runFigranite({
                url: `${TORTURE_URL}/auth/login`,
                mode: 'agent',
                sessionId,
                actions: [
                    { id: 'l1', type: 'type', selector: '#auth-username', value: 'admin' },
                    { id: 'l2', type: 'type', selector: '#auth-password', value: 'secret123' },
                    { id: 'l3', type: 'click', selector: '#auth-submit-btn' },
                    { id: 'l4', type: 'wait', value: '1' }
                ]
            });
            assert.strictEqual(loginRes.outcome, 'success');

            // Step 2: Access protected dashboard directly using same sessionId
            const dashRes = await runFigranite({
                url: `${TORTURE_URL}/auth/dashboard`,
                mode: 'agent',
                sessionId,
                actions: [
                    { id: 'd1', type: 'wait_selector', selector: '#dashboard-title' }
                ]
            });
            assert.strictEqual(dashRes.outcome, 'success');
            assert.ok(dashRes.html.includes('Protected Auth Dashboard'));

            // Cleanup session file
            const sessionPath = path.join(__dirname, '../../../data/sessions', `${sessionId}.json`);
            if (fs.existsSync(sessionPath)) {
                fs.unlinkSync(sessionPath);
            }
        }
    },
    {
        id: 'ENGINE-004',
        name: 'Engine Runtime - Cancellation and Force-Stop Timeout',
        subsystem: 'engine-runtime',
        setup: 'Torture server running',
        steps: 'Start a long-running task with wait action, then call requestStop(runId).',
        expected: 'Engine detects stop request, aborts execution gracefully, and returns outcome="stopped".',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const runId = `stop_run_${Date.now()}`;
            const taskPromise = runFigranite({
                url: `${TORTURE_URL}/`,
                mode: 'agent',
                runId,
                actions: [
                    { id: 's1', type: 'wait', value: '10' }
                ]
            });

            // Trigger stop after 300ms
            setTimeout(() => {
                requestStop(runId);
            }, 300);

            const result = await taskPromise;
            assert.strictEqual(result.outcome, 'stopped', 'Stopped task must return outcome="stopped"');
        }
    },
    {
        id: 'ENGINE-005',
        name: 'Engine Runtime - Stealth Options Execution',
        subsystem: 'engine-runtime',
        setup: 'Torture server running',
        steps: 'Execute task with all stealth flags enabled (deadClicks, naturalTyping, idleMovements, overscroll, cursorGlide, randomizeClicks).',
        expected: 'Actions execute smoothly without crashing or stalling engine.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const result = await runFigranite({
                url: `${TORTURE_URL}/form`,
                mode: 'agent',
                stealth: {
                    allowTypos: true,
                    idleMovements: true,
                    overscroll: true,
                    deadClicks: true,
                    fatigue: true,
                    naturalTyping: true,
                    cursorGlide: true,
                    randomizeClicks: true
                },
                actions: [
                    { id: 'st1', type: 'type', selector: '#username-input', value: 'stealth_user' },
                    { id: 'st2', type: 'click', selector: '#country-select' }
                ]
            });
            assert.strictEqual(result.outcome, 'success');
        }
    }
];

module.exports = { tests };
