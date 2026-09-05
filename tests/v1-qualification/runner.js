process.env.ALLOW_PRIVATE_NETWORKS = '1';
// Repeated auth and UI qualification attempts intentionally exercise the same
// server process. Keep production's login throttling from becoming shared test
// state that makes later E2E attempts fail deterministically.
process.env.AUTH_RATE_LIMIT_MAX ||= '1000';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const VALID_STATUSES = new Set(['PASS', 'FAIL', 'FLAKY', 'BLOCKED', 'SKIPPED', 'NOT_TESTED']);

function maskSecrets(obj) {
    if (!obj) return obj;
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    const masked = str.replace(/(api[_-]?key|password|token|secret|auth)[\s"':=]+([^\s"',;]+)/gi, '$1="***MASKED***"');
    try {
        return typeof obj === 'string' ? masked : JSON.parse(masked);
    } catch {
        return masked;
    }
}

function getGitCommit() {
    try {
        const hash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
        const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        return `${branch}@${hash.slice(0, 8)} (${hash})`;
    } catch {
        return 'unknown-commit';
    }
}

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        layer: null,
        testId: null,
        seed: process.env.TEST_SEED || '42',
        repeat: Math.max(1, Number(process.env.QUALIFICATION_REPEAT || 2) || 2),
        historyDir: path.join(__dirname, '../../reports')
    };

    args.forEach(arg => {
        if (arg.startsWith('--layer=')) options.layer = arg.split('=')[1].toLowerCase();
        if (arg.startsWith('--test=')) options.testId = arg.split('=')[1].toUpperCase();
        if (arg.startsWith('--seed=')) options.seed = arg.split('=')[1];
        if (arg.startsWith('--repeat=')) options.repeat = Math.max(1, Number(arg.split('=')[1]) || 1);
        if (arg.startsWith('--history=')) options.historyDir = arg.split('=')[1];
    });

    return options;
}

function loadPreviousReport(historyDir) {
    const reportPath = path.join(historyDir, 'v1-qualification-report.json');
    if (!fs.existsSync(reportPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    } catch {
        return null;
    }
}

function hashSeed(seed) {
    let h = 2166136261;
    for (const ch of String(seed)) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function createSeededRandom(seed) {
    let state = hashSeed(seed) || 0x6d2b79f5;
    return () => {
        state += 0x6d2b79f5;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function removeArtifactDir(artifactsDir, testId) {
    fs.rmSync(path.join(artifactsDir, testId), { recursive: true, force: true });
}

async function executeAttempt(test, options, attemptIndex) {
    Math.random = createSeededRandom(`${options.seed}:${test.id}`);
    const started = Date.now();
    let status = 'PASS';
    let actualResult = 'Success';
    let errorDetails = null;
    let metricData = null;

    try {
        const res = await test.run({ seed: options.seed, attempt: attemptIndex + 1, repeat: options.repeat });
        if (res && res.metric) metricData = res;
        if (res && res.status) {
            const requestedStatus = String(res.status).toUpperCase();
            if (!VALID_STATUSES.has(requestedStatus)) throw new Error(`Test returned unsupported status: ${requestedStatus}`);
            status = requestedStatus;
            actualResult = res.reason || res.actualResult || (status === 'PASS' ? 'Success' : status);
        }
    } catch (err) {
        status = 'FAIL';
        actualResult = err.message || String(err);
        errorDetails = err.stack || String(err);
    }

    return {
        attempt: attemptIndex + 1,
        status,
        actualResult,
        errorDetails,
        metricData,
        durationMs: Date.now() - started
    };
}

function collapseAttempts(attempts) {
    const statuses = [...new Set(attempts.map(a => a.status))];
    if (statuses.length === 1) return statuses[0];
    return 'FLAKY';
}

async function runQualificationSuite() {
    const options = parseArgs();
    const startTime = new Date();
    const originalRandom = Math.random;
    process.env.TEST_SEED = String(options.seed);

    console.log(`\n======================================================`);
    console.log(` FIGRANIUM PRE-V1 QUALIFICATION TEST SUITE`);
    console.log(` Seed: ${options.seed} | Repeat: ${options.repeat} | Layer: ${options.layer || 'ALL'} | TestID: ${options.testId || 'ALL'}`);
    console.log(` Commit: ${getGitCommit()}`);
    console.log(`======================================================\n`);

    const reportsDir = path.join(__dirname, '../../reports');
    const artifactsDir = path.join(reportsDir, 'artifacts');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.mkdirSync(artifactsDir, { recursive: true });

    const suites = [
        { name: 'unit', path: './suite/01-unit.test.js' },
        { name: 'api', path: './suite/02-api.test.js' },
        { name: 'blocks', path: './suite/03-engine-blocks.test.js' },
        { name: 'runtime', path: './suite/04-engine-runtime.test.js' },
        { name: 'persistence', path: './suite/05-persistence-db.test.js' },
        { name: 'scheduler', path: './suite/06-scheduler-cron.test.js' },
        { name: 'ui', path: './suite/07-ui-editor.test.js' },
        { name: 'container', path: './suite/08-container-runtime.test.js' },
        { name: 'performance', path: './suite/09-performance-regression.test.js' }
    ];

    const testResults = [];
    const perfMetrics = {};

    try {
        for (const suite of suites) {
            if (options.layer && !suite.name.includes(options.layer)) continue;
            const modPath = path.join(__dirname, suite.path);
            if (!fs.existsSync(modPath)) continue;
            const mod = require(modPath);

            try {
                if (typeof mod.setup === 'function') await mod.setup({ seed: options.seed });

                for (const test of mod.tests) {
                    if (options.testId && test.id !== options.testId) continue;
                    removeArtifactDir(artifactsDir, test.id);
                    console.log(`[RUNNING] ${test.id} - ${test.name}`);

                    const attempts = [];
                    for (let i = 0; i < options.repeat; i++) {
                        const attempt = await executeAttempt(test, options, i);
                        attempts.push(attempt);
                        console.log(`  ├─ attempt ${i + 1}/${options.repeat}: ${attempt.status} (${attempt.durationMs}ms)${attempt.actualResult !== 'Success' ? ` - ${attempt.actualResult}` : ''}`);
                    }

                    const status = collapseAttempts(attempts);
                    const durationMs = attempts.reduce((sum, a) => sum + a.durationMs, 0);
                    const firstNonPass = attempts.find(a => a.status !== 'PASS');
                    const actualResult = status === 'FLAKY'
                        ? `Inconsistent attempt statuses: ${attempts.map(a => a.status).join(', ')}`
                        : (firstNonPass?.actualResult || 'Success');
                    const errorDetails = firstNonPass?.errorDetails || null;
                    const metricData = attempts.map(a => a.metricData).find(Boolean) || null;
                    if (metricData?.metric) perfMetrics[metricData.metric] = metricData.value;

                    if (status !== 'PASS') {
                        const testArtifactsDir = path.join(artifactsDir, test.id);
                        fs.mkdirSync(testArtifactsDir, { recursive: true });
                        fs.writeFileSync(path.join(testArtifactsDir, 'error.log'), errorDetails || actualResult);
                        fs.writeFileSync(path.join(testArtifactsDir, 'test_metadata.json'), JSON.stringify(maskSecrets({
                            test: {
                                id: test.id,
                                name: test.name,
                                subsystem: test.subsystem,
                                setup: test.setup,
                                steps: test.steps,
                                expected: test.expected,
                                severity: test.severity,
                                blocksV1: test.blocksV1
                            },
                            status,
                            actualResult,
                            attempts
                        }), null, 2));
                    }

                    testResults.push({
                        id: test.id,
                        name: test.name,
                        subsystem: test.subsystem,
                        setup: test.setup,
                        steps: test.steps,
                        expected: test.expected,
                        actualResult,
                        status,
                        severity: test.severity,
                        blocksV1: test.blocksV1,
                        durationMs,
                        attempts,
                        errorDetails,
                        metricData
                    });
                    console.log(`  └─ FINAL: ${status}\n`);
                }
            } finally {
                if (typeof mod.cleanup === 'function') await mod.cleanup();
            }
        }
    } finally {
        Math.random = originalRandom;
    }

    const endTime = new Date();
    const durationSec = ((endTime - startTime) / 1000).toFixed(2);
    const count = status => testResults.filter(t => t.status === status).length;
    const totalExecuted = testResults.length;
    const passedTests = count('PASS');
    const failedTests = count('FAIL');
    const flakyTests = count('FLAKY');
    const blockedTests = count('BLOCKED');
    const skippedTests = count('SKIPPED');
    const notTested = count('NOT_TESTED');

    const previousReport = loadPreviousReport(options.historyDir);
    const regressions = [];
    const newlyFailing = [];
    const newlyFixed = [];
    if (previousReport?.results) {
        const prevMap = new Map(previousReport.results.map(r => [r.id, r]));
        for (const curr of testResults) {
            const prev = prevMap.get(curr.id);
            if (!prev) continue;
            if (prev.status === 'PASS' && curr.status !== 'PASS') newlyFailing.push(curr.id);
            if (prev.status !== 'PASS' && curr.status === 'PASS') newlyFixed.push(curr.id);
            if (prev.durationMs && curr.durationMs > prev.durationMs * 1.5 && curr.durationMs > 200) {
                regressions.push(`${curr.id}: Execution time increased by ${((curr.durationMs - prev.durationMs) / prev.durationMs * 100).toFixed(1)}% (${prev.durationMs}ms -> ${curr.durationMs}ms)`);
            }
        }
    }

    const v1Blockers = testResults.filter(t => t.status !== 'PASS' && t.blocksV1);
    const releaseGateFailures = testResults.filter(t => t.status !== 'PASS');
    const stabilityAssessment = releaseGateFailures.length === 0 ? 'STABLE_FOR_V1_RELEASE' : 'UNSTABLE_RELEASE_GATE_FAILED';

    const subsystemCoverage = {};
    for (const t of testResults) {
        if (!subsystemCoverage[t.subsystem]) subsystemCoverage[t.subsystem] = { total: 0, pass: 0, fail: 0, other: 0 };
        subsystemCoverage[t.subsystem].total += 1;
        if (t.status === 'PASS') subsystemCoverage[t.subsystem].pass += 1;
        else if (t.status === 'FAIL') subsystemCoverage[t.subsystem].fail += 1;
        else subsystemCoverage[t.subsystem].other += 1;
    }

    const reportJson = {
        commit: getGitCommit(),
        seed: options.seed,
        repeat: options.repeat,
        environment: {
            node: process.version,
            platform: process.platform,
            arch: process.arch,
            cpus: os.cpus().length,
            memoryMb: Math.round(os.totalmem() / 1024 / 1024)
        },
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        durationSec,
        summary: {
            totalExecuted,
            passedTests,
            failedTests,
            flakyTests,
            blockedTests,
            skippedTests,
            notTested,
            v1BlockersCount: v1Blockers.length,
            releaseGateFailures: releaseGateFailures.length,
            stabilityAssessment
        },
        subsystemCoverage,
        perfMetrics,
        diff: { newlyFailing, newlyFixed, regressions },
        results: testResults
    };

    fs.writeFileSync(path.join(reportsDir, 'v1-qualification-report.json'), JSON.stringify(reportJson, null, 2));

    const mdLines = [
        '# Figranium Pre-v1 Release Qualification & Stability Report',
        '',
        `**Status**: ${stabilityAssessment === 'STABLE_FOR_V1_RELEASE' ? '✅ **STABLE FOR V1 RELEASE**' : '❌ **RELEASE GATE FAILED**'}`,
        '',
        '## Test Metadata & Environment',
        `- **Tested Commit**: \`${reportJson.commit}\``,
        `- **Test Seed**: \`${reportJson.seed}\``,
        `- **Attempts per test**: \`${reportJson.repeat}\``,
        `- **Duration**: \`${durationSec} seconds\``,
        `- **Node.js**: \`${reportJson.environment.node}\` (${reportJson.environment.platform} ${reportJson.environment.arch})`,
        `- **CPU / RAM**: \`${reportJson.environment.cpus} cores / ${reportJson.environment.memoryMb} MB\``,
        '',
        '## Summary',
        `- Passed: **${passedTests}/${totalExecuted}**`,
        `- Failed: **${failedTests}**`,
        `- Flaky: **${flakyTests}**`,
        `- Blocked: **${blockedTests}**`,
        `- Skipped: **${skippedTests}**`,
        `- Not tested: **${notTested}**`,
        `- Release-gate failures: **${releaseGateFailures.length}**`,
        '',
        '## Historical Regressions',
        `- Newly failing: ${newlyFailing.length ? newlyFailing.join(', ') : 'None'}`,
        `- Newly fixed: ${newlyFixed.length ? newlyFixed.join(', ') : 'None'}`,
        `- Performance regressions: ${regressions.length ? regressions.join('; ') : 'None detected'}`,
        '',
        '## Non-passing Tests'
    ];

    const nonPassing = testResults.filter(t => t.status !== 'PASS');
    if (!nonPassing.length) mdLines.push('*None.*');
    for (const t of nonPassing) {
        mdLines.push(
            `### ${t.id}: ${t.name}`,
            `- Status: **${t.status}**`,
            `- Expected: ${t.expected}`,
            `- Actual: ${t.actualResult}`,
            `- Attempts: ${t.attempts.map(a => `${a.attempt}:${a.status}`).join(', ')}`,
            `- Artifacts: \`reports/artifacts/${t.id}/\``,
            ''
        );
    }

    mdLines.push('', '## Final Release Assessment', `**Assessment**: ${stabilityAssessment === 'STABLE_FOR_V1_RELEASE' ? 'ALL QUALIFICATION TESTS PASSED CONSISTENTLY.' : 'ONE OR MORE QUALIFICATION TESTS DID NOT PASS CONSISTENTLY; AUTOMATIC RELEASE MUST NOT PROCEED.'}`);
    fs.writeFileSync(path.join(reportsDir, 'v1-qualification-report.md'), mdLines.join('\n'));

    console.log(`\n======================================================`);
    console.log(` QUALIFICATION SUITE COMPLETE`);
    console.log(` Passed: ${passedTests}/${totalExecuted} | Non-passing: ${releaseGateFailures.length} | v1 blockers: ${v1Blockers.length}`);
    console.log(`======================================================\n`);

    process.exit(releaseGateFailures.length === 0 ? 0 : 1);
}

if (require.main === module) {
    runQualificationSuite().catch(err => {
        console.error('Fatal runner error:', err);
        process.exit(1);
    });
}

module.exports = { runQualificationSuite, createSeededRandom };
