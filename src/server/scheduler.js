/**
 * In-process task scheduler.
 * Loads tasks with schedule.enabled = true, computes next runs,
 * and executes them at the correct time using setTimeout.
 */

const { loadTasks, saveTasks, getTaskById } = require('./storage');
const { appendExecution } = require('./storage');
const { getNextRun, scheduleToCron, isValidCron } = require('./cron-parser');
const { sendExecutionUpdate } = require('./state');

// Internal state
let schedulerTimer = null;
let scheduledTasks = new Map(); // taskId -> { cron, nextRun: Date }
let running = false;

/**
 * Resolve the effective cron expression for a task schedule.
 * Supports both visual (no-code) config and advanced raw cron.
 */
function resolveCron(schedule) {
    if (!schedule) return null;
    // If user supplied a raw cron expression (advanced mode)
    if (schedule.cron && isValidCron(schedule.cron)) {
        return schedule.cron;
    }
    // Otherwise build from visual config
    if (schedule.frequency) {
        try {
            return scheduleToCron(schedule);
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Load all tasks with active schedules and compute next runs.
 */
async function loadSchedules() {
    const tasks = await loadTasks();
    scheduledTasks.clear();

    for (const task of tasks) {
        if (!task.schedule || !task.schedule.enabled) continue;
        const cron = resolveCron(task.schedule);
        if (!cron) continue;

        try {
            const nextRun = getNextRun(cron);
            scheduledTasks.set(task.id, { cron, nextRun });
        } catch (err) {
            console.error(`[SCHEDULER] Failed to compute next run for task "${task.name}" (${task.id}):`, err.message);
        }
    }
}

/**
 * Find the soonest task and schedule a timer for it.
 */
function scheduleNext() {
    if (schedulerTimer) {
        clearTimeout(schedulerTimer);
        schedulerTimer = null;
    }

    if (scheduledTasks.size === 0 || !running) return;

    let soonestId = null;
    let soonestTime = Infinity;

    for (const [taskId, info] of scheduledTasks) {
        const t = info.nextRun.getTime();
        if (t < soonestTime) {
            soonestTime = t;
            soonestId = taskId;
        }
    }

    if (!soonestId) return;

    const delay = Math.max(0, soonestTime - Date.now());
    // Cap delay to 2^31-1 ms (~24.8 days) to avoid setTimeout overflow
    const safeDelay = Math.min(delay, 2147483647);

    schedulerTimer = setTimeout(() => {
        if (!running) return;
        // If we had to cap the delay, just re-schedule
        if (safeDelay < delay) {
            scheduleNext();
            return;
        }
        tick(soonestId);
    }, safeDelay);
}

/**
 * Execute a scheduled task and re-compute its next run.
 */
async function tick(taskId) {
    if (!running) return;

    const info = scheduledTasks.get(taskId);
    if (!info) {
        scheduleNext();
        return;
    }

    console.log(`[SCHEDULER] Executing task "${taskId}" (cron: ${info.cron})`);

    const startTime = Date.now();
    let status = 'success';
    let result = null;

    try {
        result = await executeScheduledTask(taskId);
    } catch (err) {
        status = 'error';
        console.error(`[SCHEDULER] Task "${taskId}" failed:`, err.message);
        result = { error: err.message };
    }

    const durationMs = Date.now() - startTime;

    // Update the task's schedule metadata
    try {
        const tasks = await loadTasks();
        const task = tasks.find(t => t.id === taskId);
        if (task && task.schedule) {
            task.schedule.lastRun = startTime;
            task.schedule.lastRunStatus = status;
            task.schedule.lastRunDurationMs = durationMs;

            // Recompute next run
            try {
                const cron = resolveCron(task.schedule);
                if (cron) {
                    const nextRun = getNextRun(cron);
                    task.schedule.nextRun = nextRun.getTime();
                    scheduledTasks.set(taskId, { cron, nextRun });
                }
            } catch {
                scheduledTasks.delete(taskId);
            }

            await saveTasks(tasks);
        }
    } catch (err) {
        console.error(`[SCHEDULER] Failed to update task "${taskId}" after execution:`, err.message);
    }

    // Log execution
    try {
        const entry = {
            id: 'sched_' + startTime + '_' + Math.floor(Math.random() * 1000),
            timestamp: startTime,
            method: 'POST',
            path: `/api/tasks/${taskId}/api`,
            status: status === 'success' ? 200 : 500,
            durationMs,
            source: 'scheduler',
            mode: 'unknown',
            taskId,
            taskName: null,
            url: null,
            result
        };

        // Try to get task name
        try {
            const task = getTaskById(taskId);
            if (task) {
                entry.taskName = task.name;
                entry.mode = task.mode || 'agent';
                entry.url = task.url || null;
            }
        } catch { }

        await appendExecution(entry);
    } catch (err) {
        console.error(`[SCHEDULER] Failed to log execution for task "${taskId}":`, err.message);
    }

    scheduleNext();
}

/**
 * Execute a task using the same logic as the API endpoint.
 * Creates mock req/res to reuse existing handlers.
 */
async function executeScheduledTask(taskId) {
    const tasks = await loadTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) throw new Error('Task not found: ' + taskId);

    // Lazy-require to avoid circular deps
    const { handleAgent } = require('../../agent');
    const { handleScrape } = require('../../scrape');

    // Build runtime variables
    const runtimeVars = {};
    if (task.variables) {
        for (const [key, v] of Object.entries(task.variables)) {
            runtimeVars[key] = v.value;
        }
    }

    // Construct mock request/response
    const body = {
        ...task,
        taskId: task.id,
        variables: runtimeVars,
        taskVariables: runtimeVars,
        actions: task.actions || [],
        mode: task.mode || 'agent',
        runSource: 'scheduler'
    };

    const mockReq = {
        method: 'POST',
        body,
        query: {},
        params: { id: taskId },
        protocol: 'http',
        socket: { remoteAddress: '127.0.0.1' },
        path: `/api/tasks/${taskId}/api`,
        on: () => { },
    };

    return new Promise((resolve, reject) => {
        let statusCode = 200;
        const mockRes = {
            status: (code) => { statusCode = code; return mockRes; },
            json: (data) => {
                if (statusCode >= 400) {
                    reject(new Error(data?.error || `HTTP ${statusCode}`));
                } else {
                    resolve(data);
                }
            },
            locals: {},
            on: () => { },
            setHeader: () => { },
            write: () => { },
            end: () => resolve(null),
        };

        const runId = 'sched_' + Date.now();
        mockReq.body.runId = runId;

        const handler = task.mode === 'scrape' ? handleScrape : handleAgent;

        try {
            sendExecutionUpdate(runId, { status: 'started' });
        } catch { }

        Promise.resolve(handler(mockReq, mockRes)).catch(reject);
    });
}

/**
 * Start the scheduler. Call this after the server starts.
 */
async function startScheduler() {
    if (running) return;
    running = true;
    console.log('[SCHEDULER] Starting scheduler...');

    try {
        await loadSchedules();
        const count = scheduledTasks.size;
        console.log(`[SCHEDULER] Loaded ${count} scheduled task(s).`);

        // Update nextRun on all scheduled tasks so frontend can display them
        if (count > 0) {
            const tasks = await loadTasks();
            let dirty = false;
            for (const [taskId, info] of scheduledTasks) {
                const task = tasks.find(t => t.id === taskId);
                if (task && task.schedule) {
                    const nextRunMs = info.nextRun.getTime();
                    if (task.schedule.nextRun !== nextRunMs) {
                        task.schedule.nextRun = nextRunMs;
                        dirty = true;
                    }
                }
            }
            if (dirty) await saveTasks(tasks);
        }

        scheduleNext();
    } catch (err) {
        console.error('[SCHEDULER] Failed to start:', err.message);
    }
}

/**
 * Stop the scheduler.
 */
function stopScheduler() {
    running = false;
    if (schedulerTimer) {
        clearTimeout(schedulerTimer);
        schedulerTimer = null;
    }
    scheduledTasks.clear();
    console.log('[SCHEDULER] Stopped.');
}

/**
 * Refresh the schedule for a specific task (call after task update).
 */
async function refreshSchedule(taskId) {
    const tasks = await loadTasks();
    const task = tasks.find(t => t.id === taskId);

    if (!task || !task.schedule || !task.schedule.enabled) {
        scheduledTasks.delete(taskId);
        scheduleNext();
        return;
    }

    const cron = resolveCron(task.schedule);
    if (!cron) {
        scheduledTasks.delete(taskId);
        scheduleNext();
        return;
    }

    try {
        const nextRun = getNextRun(cron);
        scheduledTasks.set(taskId, { cron, nextRun });

        // Persist nextRun
        task.schedule.nextRun = nextRun.getTime();
        await saveTasks(tasks);
    } catch (err) {
        console.error(`[SCHEDULER] Failed to refresh schedule for "${taskId}":`, err.message);
        scheduledTasks.delete(taskId);
    }

    scheduleNext();
}

/**
 * Remove the schedule for a specific task.
 */
function removeSchedule(taskId) {
    scheduledTasks.delete(taskId);
    scheduleNext();
}

/**
 * Get current scheduler status.
 */
function getSchedulerStatus() {
    const entries = [];
    for (const [taskId, info] of scheduledTasks) {
        entries.push({
            taskId,
            cron: info.cron,
            nextRun: info.nextRun.toISOString(),
            nextRunMs: info.nextRun.getTime()
        });
    }
    return {
        running,
        scheduledCount: scheduledTasks.size,
        tasks: entries
    };
}

module.exports = {
    startScheduler,
    stopScheduler,
    refreshSchedule,
    removeSchedule,
    getSchedulerStatus,
    resolveCron,
};
