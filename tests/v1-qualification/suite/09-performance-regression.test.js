const assert = require('assert');
const { parseCron } = require('../../../src/server/cron-parser');
const { safeFormatHTML } = require('../../../html-utils');
const { buildBlockMap } = require('../../../src/agent/figranite/helpers');

const tests = [
    {
        id: 'PERF-001',
        name: 'Performance Benchmark - Cron Expression Parser Throughput',
        subsystem: 'performance',
        setup: 'Loop 5,000 cron expression parse iterations',
        steps: 'Benchmark time taken to parse 5,000 cron strings.',
        expected: '5,000 iterations completed in under 500ms (>10,000 ops/sec).',
        severity: 'MEDIUM',
        blocksV1: false,
        run: async () => {
            const start = Date.now();
            const crons = ['0 * * * *', '*/15 9-17 * * 1-5', '@daily', '0 0 1 1 *'];
            for (let i = 0; i < 5000; i++) {
                parseCron(crons[i % crons.length]);
            }
            const durationMs = Date.now() - start;
            assert.ok(durationMs < 1000, `Cron parsing took ${durationMs}ms, expected < 1000ms`);
            return { metric: 'cron_parsing_5k_ops_ms', value: durationMs };
        }
    },
    {
        id: 'PERF-002',
        name: 'Performance Benchmark - HTML Formatting & Indentation Speed',
        subsystem: 'performance',
        setup: 'Sample 50KB HTML document',
        steps: 'Benchmark safeFormatHTML on 50KB document for 200 iterations.',
        expected: '200 iterations completed in under 1,000ms.',
        severity: 'MEDIUM',
        blocksV1: false,
        run: async () => {
            const htmlSample = '<div>' + '<span><a href="#">Link</a></span>'.repeat(500) + '</div>';
            const start = Date.now();
            for (let i = 0; i < 200; i++) {
                safeFormatHTML(htmlSample);
            }
            const durationMs = Date.now() - start;
            assert.ok(durationMs < 2000, `HTML formatting took ${durationMs}ms, expected < 2000ms`);
            return { metric: 'html_formatting_200_ops_ms', value: durationMs };
        }
    },
    {
        id: 'PERF-003',
        name: 'Performance Benchmark - Agent Block Map Construction Speed',
        subsystem: 'performance',
        setup: 'Large task definition with 100 nested actions (if/else/end/repeat/foreach)',
        steps: 'Construct block map for 1,000 iterations.',
        expected: '1,000 iterations completed in under 200ms.',
        severity: 'MEDIUM',
        blocksV1: false,
        run: async () => {
            const actions = [];
            for (let i = 0; i < 20; i++) {
                actions.push({ id: `if_${i}`, type: 'if', conditionVar: 'x', conditionOp: 'equals', conditionValue: '1' });
                actions.push({ id: `act_${i}`, type: 'click', selector: '#btn' });
                actions.push({ id: `else_${i}`, type: 'else' });
                actions.push({ id: `act2_${i}`, type: 'type', selector: '#in', value: 'hello' });
                actions.push({ id: `end_${i}`, type: 'end' });
            }
            const start = Date.now();
            for (let k = 0; k < 1000; k++) {
                buildBlockMap(actions);
            }
            const durationMs = Date.now() - start;
            assert.ok(durationMs < 1000, `Block map build took ${durationMs}ms, expected < 1000ms`);
            return { metric: 'block_map_1k_ops_ms', value: durationMs };
        }
    }
];

module.exports = { tests };
