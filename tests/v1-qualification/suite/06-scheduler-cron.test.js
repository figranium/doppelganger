const assert = require('assert');
const { parseCron, getNextRun } = require('../../../src/server/cron-parser');
const scheduler = require('../../../src/server/scheduler');
const storage = require('../../../src/server/storage');
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
        id: 'SCHED-001',
        name: 'Cron Parser - Syntax Validation & Edge Cases',
        subsystem: 'scheduler',
        setup: 'Pure cron parser calls',
        steps: 'Parse step/range expressions and reject out-of-range hour/day/month values.',
        expected: 'Valid expressions produce expected sets and invalid ranges throw.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const parsed = parseCron('*/15 9-17 * * 1-5');
            assert.ok(parsed);
            assert.ok(parsed.minute instanceof Set && parsed.hour instanceof Set);
            assert.ok(parsed.minute.has(0) && parsed.minute.has(15) && parsed.minute.has(30) && parsed.minute.has(45));
            assert.ok(parsed.hour.has(9) && parsed.hour.has(17));
            assert.throws(() => parseCron('0 24 * * *'), /out of range/);
            assert.throws(() => parseCron('0 * 32 * *'), /out of range/);
            assert.throws(() => parseCron('0 * * 13 *'), /out of range/);
        }
    },
    {
        id: 'SCHED-002',
        name: 'Cron Parser - Deterministic Next Run Calculation',
        subsystem: 'scheduler',
        setup: 'Fixed reference timestamp',
        steps: 'Calculate the next run for an hourly cron from a known UTC instant.',
        expected: 'The next run is exactly the following hour.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const now = new Date('2025-01-01T10:00:00Z');
            const next = getNextRun('0 * * * *', now);
            assert.ok(next > now);
            assert.strictEqual(next.toISOString(), '2025-01-01T11:00:00.000Z');
        }
    },
    {
        id: 'SCHED-003',
        name: 'Scheduler Runtime - Persisted Schedule Executes and Records Task',
        subsystem: 'scheduler',
        setup: 'Temporary scheduled Task, deterministic torture server, restorable Task/execution storage',
        steps: 'Persist an enabled schedule, start the real scheduler, verify registration, invoke the production tick path, verify Task metadata and scheduler execution log, then remove the schedule and restore storage.',
        expected: 'The scheduler executes the Task successfully, persists last-run/next-run metadata, records a scheduler-sourced execution, and removes disabled schedule state.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureTortureServer();
            const originalTasks = JSON.parse(JSON.stringify(await storage.loadTasks()));
            const originalExecutions = JSON.parse(JSON.stringify(await storage.loadExecutions()));
            const taskId = `sched_qual_${Date.now()}`;
            const task = {
                id: taskId,
                name: 'Scheduler Qualification Task',
                url: `${TORTURE_URL}/`,
                mode: 'agent',
                actions: [],
                variables: {},
                schedule: { enabled: true, cron: '0 0 1 1 *' }
            };

            scheduler.stopScheduler();
            try {
                await storage.saveTasks([...originalTasks, task]);
                await scheduler.startScheduler();

                const before = scheduler.getSchedulerStatus();
                assert.strictEqual(before.running, true);
                assert.ok(before.tasks.some(entry => entry.taskId === taskId), 'Temporary scheduled Task must be registered');

                await scheduler.__testTick(taskId);

                const afterTasks = await storage.loadTasks();
                const persisted = afterTasks.find(t => t.id === taskId);
                assert.ok(persisted, 'Scheduled Task must remain persisted');
                assert.strictEqual(persisted.schedule.lastRunStatus, 'success');
                assert.ok(Number.isFinite(persisted.schedule.lastRun));
                assert.ok(Number.isFinite(persisted.schedule.lastRunDurationMs));
                assert.ok(Number.isFinite(persisted.schedule.nextRun));

                const executions = await storage.loadExecutions();
                const schedulerExecution = executions.find(e => e.taskId === taskId && e.source === 'scheduler');
                assert.ok(schedulerExecution, 'Scheduler execution must be recorded');
                assert.strictEqual(schedulerExecution.outcome, 'success');

                scheduler.removeSchedule(taskId);
                assert.ok(!scheduler.getSchedulerStatus().tasks.some(entry => entry.taskId === taskId));
            } finally {
                scheduler.stopScheduler();
                await storage.saveTasks(originalTasks);
                await storage.saveExecutions(originalExecutions);
            }
        }
    }
];

module.exports = { tests };
