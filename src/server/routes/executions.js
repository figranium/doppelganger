const express = require('express');
const { requireAuth, requireApiKey } = require('../middleware');
const { loadExecutions, saveExecutions, getExecutionById } = require('../storage');
const { executionStreams, stopRequests, sendExecutionUpdate } = require('../state');

const router = express.Router();

const summarizeExecution = (exec) => ({
    id: exec.id,
    timestamp: exec.timestamp,
    method: exec.method,
    path: exec.path,
    status: exec.status,
    durationMs: exec.durationMs,
    source: exec.source,
    mode: exec.mode,
    taskId: exec.taskId,
    taskName: exec.taskName,
    url: exec.url
});

router.get('/', requireAuth, async (req, res) => {
    const executions = await loadExecutions();
    res.json({ executions: executions.map(summarizeExecution) });
});

router.get('/list', requireApiKey, async (req, res) => {
    const executions = await loadExecutions();
    res.json({ executions: executions.map(summarizeExecution) });
});

router.get('/stream', requireAuth, (req, res) => {
    const runId = String(req.query.runId || '').trim();
    if (!runId) return res.status(400).json({ error: 'MISSING_RUN_ID' });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    res.write('event: ready\ndata: {}\n\n');

    let clients = executionStreams.get(runId);
    if (!clients) {
        clients = new Set();
        executionStreams.set(runId, clients);
    }
    clients.add(res);

    const keepAlive = setInterval(() => {
        try {
            res.write(':keep-alive\n\n');
        } catch {
            // ignore
        }
    }, 20000);

    req.on('close', () => {
        clearInterval(keepAlive);
        clients.delete(res);
        if (clients.size === 0) executionStreams.delete(runId);
    });
});

router.get('/:id', requireAuth, async (req, res) => {
    await loadExecutions();
    const exec = getExecutionById(req.params.id);
    if (!exec) return res.status(404).json({ error: 'EXECUTION_NOT_FOUND' });
    res.json({ execution: exec });
});

router.post('/clear', requireAuth, async (req, res) => {
    await saveExecutions([]);
    res.json({ success: true });
});

router.post('/stop', requireAuth, (req, res) => {
    const runId = String(req.body?.runId || '').trim();
    if (!runId) return res.status(400).json({ error: 'MISSING_RUN_ID' });
    stopRequests.add(runId);
    // Try to notify the stream as well
    try {
        sendExecutionUpdate(runId, { status: 'stop_requested' });
    } catch {
        // ignore
    }
    res.json({ success: true });
});

router.delete('/:id', requireAuth, async (req, res) => {
    const id = req.params.id;
    const executions = (await loadExecutions()).filter(e => e.id !== id);
    await saveExecutions(executions);
    res.json({ success: true });
});

module.exports = router;
