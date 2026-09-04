const assert = require('assert');
const { parseCron, getNextRun } = require('../../../src/server/cron-parser');

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
        name: 'Scheduler Runtime - Persisted Cron Executes Task',
        subsystem: 'scheduler',
        setup: 'Requires an isolated scheduler clock, temporary Task, and deterministic execution fixture',
        steps: 'Persist an enabled schedule, advance/run the scheduler, verify exactly one execution, then disable and prove no further executions occur.',
        expected: 'The real scheduler executes persisted schedules exactly when due and respects disable/removal.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => ({ status: 'NOT_TESTED', reason: 'Cron parsing is tested, but the previous suite never exercised the scheduler runtime. A deterministic clock-backed scheduler fixture is still required.' })
    }
];

module.exports = { tests };
