/**
 * Tests for src/server/cron-parser.js
 * Run: node tests/cron-parser.test.js
 */

const { parseCron, isValidCron, getNextRun, scheduleToCron, describeCron, PRESETS } = require('../src/server/cron-parser');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
    } else {
        failed++;
        console.error(`  FAIL: ${message}`);
    }
}

function section(name) {
    console.log(`\n  ${name}`);
}

// --- parseCron ---
section('parseCron');

const parsed = parseCron('*/15 9-17 * * 1-5');
assert(parsed.minute.has(0) && parsed.minute.has(15) && parsed.minute.has(30) && parsed.minute.has(45), 'minute */15 should have 0,15,30,45');
assert(parsed.minute.size === 4, 'minute */15 should have exactly 4 values');
assert(parsed.hour.has(9) && parsed.hour.has(17), 'hour 9-17 should contain 9 and 17');
assert(parsed.hour.size === 9, 'hour 9-17 should have 9 values');
assert(parsed.dayOfWeek.has(1) && parsed.dayOfWeek.has(5), 'dow 1-5 should contain 1 and 5');
assert(!parsed.dayOfWeek.has(0) && !parsed.dayOfWeek.has(6), 'dow 1-5 should not contain 0 or 6');

const everyMin = parseCron('* * * * *');
assert(everyMin.minute.size === 60, '* minute should have 60 values');

const list = parseCron('1,15,30 * * * *');
assert(list.minute.has(1) && list.minute.has(15) && list.minute.has(30), 'list 1,15,30 should work');
assert(list.minute.size === 3, 'list should have exactly 3 values');

// Day-of-week 7 should map to 0 (Sunday)
const dow7 = parseCron('0 0 * * 7');
assert(dow7.dayOfWeek.has(0), 'dow 7 should map to 0');
assert(!dow7.dayOfWeek.has(7), 'dow 7 should not have 7 in set');

// --- Presets ---
section('Presets');

assert(isValidCron('@hourly'), '@hourly should be valid');
assert(isValidCron('@daily'), '@daily should be valid');
assert(isValidCron('@weekly'), '@weekly should be valid');
assert(isValidCron('@monthly'), '@monthly should be valid');
assert(isValidCron('@yearly'), '@yearly should be valid');

const hourly = parseCron('@hourly');
assert(hourly.minute.has(0) && hourly.minute.size === 1, '@hourly should be minute 0 only');

// --- isValidCron ---
section('isValidCron');

assert(isValidCron('* * * * *'), '* * * * * is valid');
assert(isValidCron('0 9 * * 1-5'), '0 9 * * 1-5 is valid');
assert(!isValidCron(''), 'empty string is invalid');
assert(!isValidCron('* * *'), '3-field is invalid');
assert(!isValidCron('abc'), 'garbage is invalid');
assert(!isValidCron('* * * * * *'), '6-field is invalid');

// --- getNextRun ---
section('getNextRun');

// Next run for '0 9 * * *' from 8:00 should be same day 9:00
const from800 = new Date(2026, 2, 12, 8, 0, 0);
const next1 = getNextRun('0 9 * * *', from800);
assert(next1.getHours() === 9, 'next run from 8:00 for 0 9 should be 9:00');
assert(next1.getMinutes() === 0, 'next run minutes should be 0');
assert(next1.getDate() === 12, 'should be same day');

// From 10:00 should be next day 9:00
const from1000 = new Date(2026, 2, 12, 10, 0, 0);
const next2 = getNextRun('0 9 * * *', from1000);
assert(next2.getHours() === 9, 'next run from 10:00 should be 9:00');
assert(next2.getDate() === 13, 'should be next day');

// Every 5 minutes
const from1001 = new Date(2026, 2, 12, 10, 1, 0);
const next3 = getNextRun('*/5 * * * *', from1001);
assert(next3.getMinutes() === 5, 'next */5 from :01 should be :05');

// --- scheduleToCron ---
section('scheduleToCron');

assert(scheduleToCron({ frequency: 'interval', intervalMinutes: 5 }) === '*/5 * * * *', 'interval 5m');
assert(scheduleToCron({ frequency: 'interval', intervalMinutes: 15 }) === '*/15 * * * *', 'interval 15m');
assert(scheduleToCron({ frequency: 'hourly', minute: 30 }) === '30 * * * *', 'hourly at :30');
assert(scheduleToCron({ frequency: 'daily', hour: 9, minute: 0 }) === '0 9 * * *', 'daily at 9:00');
assert(scheduleToCron({ frequency: 'weekly', hour: 9, minute: 0, daysOfWeek: [1, 3, 5] }) === '0 9 * * 1,3,5', 'weekly MWF');
assert(scheduleToCron({ frequency: 'monthly', hour: 0, minute: 0, dayOfMonth: 15 }) === '0 0 15 * *', 'monthly 15th');

// Non-evenly divisible interval
const cron7 = scheduleToCron({ frequency: 'interval', intervalMinutes: 7 });
assert(cron7.includes(','), 'interval 7 should list minutes');

// --- describeCron ---
section('describeCron');

assert(describeCron('* * * * *') === 'Every minute', 'describe * * * * *');
assert(describeCron('*/5 * * * *') === 'Every 5 minutes', 'describe */5');
assert(describeCron('0 * * * *').includes('hour'), 'describe 0 * * * * mentions hour');
assert(describeCron('0 9 * * *').includes('9:00'), 'describe 0 9 * * * mentions 9:00');
assert(describeCron('0 9 * * 1,2,3,4,5').includes('weekday'), 'describe weekday');
assert(describeCron('0 0 1 * *').includes('1st'), 'describe monthly 1st');
assert(describeCron('@daily') === 'Every day at midnight', 'describe @daily');
assert(describeCron('@hourly') === 'Every hour', 'describe @hourly');

// --- Error handling ---
section('Error handling');

try {
    parseCron(null);
    assert(false, 'null should throw');
} catch { assert(true, 'null throws'); }

try {
    parseCron('bad cron');
    assert(false, 'bad cron should throw');
} catch { assert(true, 'bad cron throws'); }

try {
    scheduleToCron({});
    assert(false, 'empty config should throw');
} catch { assert(true, 'empty config throws'); }

// --- Summary ---
console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
