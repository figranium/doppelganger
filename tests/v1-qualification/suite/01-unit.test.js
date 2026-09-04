const assert = require('assert');
const { safeFormatHTML } = require('../../../html-utils');
const { parseCoords, parseValue, parseCsv, sanitizeRunId } = require('../../../common-utils');
const { parseCron, isValidCron, getNextRun } = require('../../../src/server/cron-parser');
const { isPrivateIP, isValidWebSocketOrigin } = require('../../../url-utils');
const { normalizeProxy } = require('../../../proxy-utils');
const { selectUserAgent } = require('../../../user-agent-settings');

const tests = [
    {
        id: 'UNIT-001',
        name: 'HTML Utils - Formatting and Safety Fallback',
        subsystem: 'utils',
        setup: 'Pure function call with sample HTML strings',
        steps: 'Pass valid HTML and short collapsed HTML to safeFormatHTML.',
        expected: 'Valid HTML is formatted with tag separation. Short/collapsed HTML triggers safety fallback returning original string.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const html = '<div><p>Hello <span>World</span></p></div>';
            const formatted = safeFormatHTML(html);
            assert.ok(formatted.includes('<div>'), 'Should contain div tag');
            assert.ok(formatted.includes('<p>'), 'Should contain p tag');

            // Fallback check
            const shortRaw = '<a>x</a>';
            const safeResult = safeFormatHTML(shortRaw);
            assert.strictEqual(safeResult, shortRaw, 'Should trigger fallback for collapsed short HTML');
        }
    },
    {
        id: 'UNIT-002',
        name: 'Common Utils - Coordinate, Value, CSV, and RunId Parsing',
        subsystem: 'utils',
        setup: 'Pure function calls with various input strings',
        steps: 'Test parseCoords, parseValue, parseCsv, and sanitizeRunId.',
        expected: 'Coordinates parsed to {x,y}, values converted to numbers/booleans, CSV parsed to objects, RunId sanitized.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            assert.deepStrictEqual(parseCoords('100,200'), { x: 100, y: 200 });
            assert.strictEqual(parseCoords('invalid'), null);

            assert.strictEqual(parseValue('123'), 123);
            assert.strictEqual(parseValue('true'), true);
            assert.strictEqual(parseValue('hello'), 'hello');

            const csv = 'name,age\nAlice,30\nBob,25';
            const parsedCsv = parseCsv(csv);
            assert.strictEqual(parsedCsv.length, 2);
            assert.strictEqual(parsedCsv[0].name, 'Alice');

            assert.strictEqual(sanitizeRunId('run_123!@#$'), 'run_123');
        }
    },
    {
        id: 'UNIT-003',
        name: 'Cron Parser - Validation, Presets, and Ranges',
        subsystem: 'utils',
        setup: 'Call cron parser functions with preset and cron string expressions',
        steps: 'Validate presets, cron fields, next run dates, and invalid out-of-range cron strings.',
        expected: 'Presets resolve correctly, valid crons calculate next run, invalid crons throw or return false.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            assert.ok(isValidCron('@hourly'), '@hourly preset should be valid');
            assert.ok(isValidCron('0 * * * *'), '0 * * * * cron should be valid');
            assert.strictEqual(isValidCron('60 * * * *'), false, 'Minute 60 should be invalid');
            assert.strictEqual(isValidCron('0 25 * * *'), false, 'Hour 25 should be invalid');
            assert.strictEqual(isValidCron('0 * * * 10-2'), false, 'Descending range should be invalid');

            const next = getNextRun('0 * * * *', new Date('2025-01-01T12:00:00Z'));
            assert.ok(next instanceof Date, 'Should return Date instance');
            assert.strictEqual(next.getUTCHours(), 13, 'Next run should be 13:00');
        }
    },
    {
        id: 'UNIT-004',
        name: 'URL Utils - SSRF Protection and WebSocket Origin Validation',
        subsystem: 'utils',
        setup: 'Validate various target IPs and WebSocket origins',
        steps: 'Test isPrivateIP against public and restricted private IPs, test isValidWebSocketOrigin for loopback addresses.',
        expected: 'Private IPs return true, public IPs return false. Loopback WS origins return true.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            assert.strictEqual(isPrivateIP('127.0.0.1'), true, '127.0.0.1 must be private');
            assert.strictEqual(isPrivateIP('10.0.0.1'), true, '10.0.0.1 must be private');
            assert.strictEqual(isPrivateIP('169.254.169.254'), true, 'AWS metadata IP must be private');
            assert.strictEqual(isPrivateIP('8.8.8.8'), false, '8.8.8.8 must be public');

            assert.ok(isValidWebSocketOrigin('http://localhost:5173', '127.0.0.1:11345'), 'Loopback origins should match');
        }
    },
    {
        id: 'UNIT-005',
        name: 'Proxy Utils - Configuration Normalization',
        subsystem: 'utils',
        setup: 'Pass raw proxy strings and objects to normalizeProxy',
        steps: 'Normalize proxy strings with null/empty credentials, verify username/password converted to undefined.',
        expected: 'Falsy username/password mapped to undefined, valid server/credentials retained.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const raw = { server: 'http://proxy.example.com:8080', username: '', password: null };
            const normalized = normalizeProxy(raw);
            assert.strictEqual(normalized.username, undefined, 'Empty username should be undefined');
            assert.strictEqual(normalized.password, undefined, 'Null password should be undefined');
            assert.strictEqual(normalized.server, 'http://proxy.example.com:8080');
        }
    },
    {
        id: 'UNIT-006',
        name: 'User Agent Settings - Selection and Rotation',
        subsystem: 'utils',
        setup: 'Call selectUserAgent with rotation flag true/false',
        steps: 'Verify static default user agent and rotated user agent selection.',
        expected: 'Returns non-empty User-Agent string from allowed browser user agent list.',
        severity: 'MEDIUM',
        blocksV1: false,
        run: async () => {
            const staticUA = await selectUserAgent(false);
            const rotatedUA = await selectUserAgent(true);
            assert.ok(typeof staticUA === 'string' && staticUA.length > 10);
            assert.ok(typeof rotatedUA === 'string' && rotatedUA.length > 10);
        }
    }
];

module.exports = { tests };
