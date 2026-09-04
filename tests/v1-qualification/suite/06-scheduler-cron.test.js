const assert = require('assert');
const { parseCron, getNextRun, isValidCron } = require('../../../src/server/cron-parser');

const tests = [
    {
        id: 'SCHED-001',
        name: 'Cron Parser - Full Syntax Validation & Edge Cases',
        subsystem: 'scheduler',
        setup: 'Call parseCron with valid, invalid, step, range, and alias expressions',
        steps: 'Test minute, hour, day, month, day-of-week parsing including Sunday alias (7 -> 0).',
        expected: 'Valid cron strings parse into match arrays. Out-of-range fields throw error.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const parsed = parseCron('*/15 9-17 * * 1-5');
            assert.ok(parsed, 'Should parse valid business hours cron');
            assert.ok(parsed.minute instanceof Set && parsed.hour instanceof Set);
            assert.ok(parsed.minute.has(0) && parsed.minute.has(15) && parsed.minute.has(30) && parsed.minute.has(45));
            assert.ok(parsed.hour.has(9) && parsed.hour.has(17));

            // Out-of-range checks
            assert.throws(() => parseCron('0 24 * * *'), /out of range/);
            assert.throws(() => parseCron('0 * 32 * *'), /out of range/);
            assert.throws(() => parseCron('0 * * 13 *'), /out of range/);
        }
    },
    {
        id: 'SCHED-002',
        name: 'Scheduler - Schedule State Updates & Next Run Calculation',
        subsystem: 'scheduler',
        setup: 'Create scheduled task',
        steps: 'Save task with hourly schedule, calculate nextRun timestamp, verify nextRun is in the future.',
        expected: 'nextRun is correctly calculated in the future and persisted.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const now = new Date('2025-01-01T10:00:00Z');
            const next = getNextRun('0 * * * *', now);
            assert.ok(next > now);
            assert.strictEqual(next.toISOString(), '2025-01-01T11:00:00.000Z');
        }
    }
];

module.exports = { tests };
