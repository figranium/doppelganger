const express = require('express');
const { requireAuth } = require('../middleware');
const { loadTasks, saveTasks, getTaskById } = require('../storage');
const { taskMutex } = require('../state');
const { refreshSchedule, removeSchedule, getSchedulerStatus, resolveCron } = require('../scheduler');
const { isValidCron, describeCron, getNextRun } = require('../cron-parser');

const router = express.Router();

/**
 * GET /api/schedules
 * List all tasks that have schedules (enabled or not), with status info.
 */
router.get('/', requireAuth, async (req, res) => {
    const tasks = await loadTasks();
    const schedules = tasks
        .filter(t => t.schedule)
        .map(t => ({
            taskId: t.id,
            taskName: t.name,
            mode: t.mode,
            schedule: t.schedule
        }));
    res.json({ schedules });
});

/**
 * POST /api/schedules/:taskId
 * Create or update a schedule on a task.
 * Body: { enabled, frequency?, intervalMinutes?, hour?, minute?, daysOfWeek?, dayOfMonth?, cron? }
 */
router.post('/:taskId', requireAuth, async (req, res) => {
    await taskMutex.lock();
    try {
        const tasks = await loadTasks();
        const task = tasks.find(t => t.id === req.params.taskId);
        if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });

        const body = req.body || {};
        const schedule = {
            ...(task.schedule || {}),
            ...body,
        };

        // Validate the resulting cron
        const cron = resolveCron(schedule);
        if (schedule.enabled && !cron) {
            return res.status(400).json({ error: 'INVALID_SCHEDULE', message: 'Cannot resolve a valid cron expression from the provided schedule config.' });
        }

        // Compute metadata
        if (cron) {
            schedule.cron = cron;
            try {
                const nextRun = getNextRun(cron);
                schedule.nextRun = nextRun.getTime();
            } catch {
                schedule.nextRun = null;
            }
        }

        task.schedule = schedule;
        await saveTasks(tasks);

        // Notify scheduler
        await refreshSchedule(task.id);

        res.json({
            schedule: task.schedule,
            description: cron ? describeCron(cron) : null
        });
    } finally {
        taskMutex.unlock();
    }
});

/**
 * DELETE /api/schedules/:taskId
 * Remove/disable schedule from a task.
 */
router.delete('/:taskId', requireAuth, async (req, res) => {
    await taskMutex.lock();
    try {
        const tasks = await loadTasks();
        const task = tasks.find(t => t.id === req.params.taskId);
        if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });

        if (task.schedule) {
            task.schedule.enabled = false;
        }

        await saveTasks(tasks);
        removeSchedule(task.id);

        res.json({ success: true });
    } finally {
        taskMutex.unlock();
    }
});

/**
 * GET /api/schedules/:taskId/status
 * Get schedule status for a specific task.
 */
router.get('/:taskId/status', requireAuth, async (req, res) => {
    await loadTasks();
    const task = getTaskById(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });

    const schedule = task.schedule || {};
    const cron = resolveCron(schedule);

    res.json({
        schedule,
        cron,
        description: cron ? describeCron(cron) : null,
        isValid: cron ? isValidCron(cron) : false
    });
});

/**
 * POST /api/schedules/:taskId/describe
 * Validate and describe a schedule config without saving it.
 */
router.post('/:taskId/describe', requireAuth, async (req, res) => {
    const body = req.body || {};
    const cron = resolveCron(body);

    if (!cron) {
        return res.json({ valid: false, description: null, cron: null, nextRun: null });
    }

    let nextRun = null;
    try {
        nextRun = getNextRun(cron).getTime();
    } catch { }

    res.json({
        valid: true,
        cron,
        description: describeCron(cron),
        nextRun
    });
});

/**
 * GET /api/schedules/status/all
 * Get overall scheduler status.
 */
router.get('/status/all', requireAuth, async (_req, res) => {
    res.json(getSchedulerStatus());
});

module.exports = router;
