process.env.ALLOW_PRIVATE_NETWORKS = '1';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Mask secrets helper
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

// Get git commit info
function getGitCommit() {
    try {
        const hash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
        const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        return `${branch}@${hash.slice(0, 8)} (${hash})`;
    } catch {
        return 'unknown-commit';
    }
}

// Parse CLI arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        layer: null,
        testId: null,
        seed: process.env.TEST_SEED || '42',
        historyDir: path.join(__dirname, '../../reports')
    };

    args.forEach(arg => {
        if (arg.startsWith('--layer=')) options.layer = arg.split('=')[1].toLowerCase();
        if (arg.startsWith('--test=')) options.testId = arg.split('=')[1].toUpperCase();
        if (arg.startsWith('--seed=')) options.seed = arg.split('=')[1];
        if (arg.startsWith('--history=')) options.historyDir = arg.split('=')[1];
    });

    return options;
}

// Load previous report for comparison
function loadPreviousReport(historyDir) {
    const reportPath = path.join(historyDir, 'v1-qualification-report.json');
    if (fs.existsSync(reportPath)) {
        try {
            return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        } catch {
            return null;
        }
    }
    return null;
}

async function runQualificationSuite() {
    const options = parseArgs();
    const startTime = new Date();
    console.log(`\n======================================================`);
    console.log(` FIGRANIUM PRE-V1 QUALIFICATION TEST SUITE`);
    console.log(` Seed: ${options.seed} | Layer: ${options.layer || 'ALL'} | TestID: ${options.testId || 'ALL'}`);
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

    for (const suite of suites) {
        if (options.layer && !suite.name.includes(options.layer)) continue;

        const modPath = path.join(__dirname, suite.path);
        if (!fs.existsSync(modPath)) continue;

        const mod = require(modPath);
        for (const test of mod.tests) {
            if (options.testId && test.id !== options.testId) continue;

            const testStart = Date.now();
            let status = 'PASS';
            let actualResult = 'Success';
            let errorDetails = null;
            let metricData = null;

            console.log(`[RUNNING] ${test.id} - ${test.name}`);

            try {
                const res = await test.run();
                if (res && res.metric) {
                    metricData = res;
                    perfMetrics[res.metric] = res.value;
                }
                console.log(`  └─ STATUS: \x1b[32mPASS\x1b[0m (${Date.now() - testStart}ms)`);
            } catch (err) {
                status = 'FAIL';
                actualResult = err.message || String(err);
                errorDetails = err.stack || String(err);
                console.log(`  └─ STATUS: \x1b[31mFAIL\x1b[0m - ${actualResult}`);

                // Save diagnostic artifacts
                const testArtifactsDir = path.join(artifactsDir, test.id);
                fs.mkdirSync(testArtifactsDir, { recursive: true });
                fs.writeFileSync(path.join(testArtifactsDir, 'error.log'), errorDetails);
                fs.writeFileSync(path.join(testArtifactsDir, 'test_metadata.json'), JSON.stringify(maskSecrets({
                    test,
                    actualResult,
                    errorDetails
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
                durationMs: Date.now() - testStart,
                errorDetails,
                metricData
            });
        }
    }

    const endTime = new Date();
    const durationSec = ((endTime - startTime) / 1000).toFixed(2);

    const totalExecuted = testResults.length;
    const passedTests = testResults.filter(t => t.status === 'PASS').length;
    const failedTests = testResults.filter(t => t.status === 'FAIL').length;
    const flakyTests = testResults.filter(t => t.status === 'FLAKY').length;
    const blockedTests = testResults.filter(t => t.status === 'BLOCKED').length;
    const skippedTests = testResults.filter(t => t.status === 'SKIPPED').length;

    const previousReport = loadPreviousReport(options.historyDir);
    const regressions = [];
    const newlyFailing = [];
    const newlyFixed = [];

    if (previousReport && previousReport.results) {
        const prevMap = new Map(previousReport.results.map(r => [r.id, r]));
        testResults.forEach(curr => {
            const prev = prevMap.get(curr.id);
            if (prev) {
                if (prev.status === 'PASS' && curr.status === 'FAIL') newlyFailing.push(curr.id);
                if (prev.status === 'FAIL' && curr.status === 'PASS') newlyFixed.push(curr.id);

                // Check performance regression
                if (prev.durationMs && curr.durationMs > prev.durationMs * 1.5 && curr.durationMs > 200) {
                    regressions.push(`${curr.id}: Execution time increased by ${((curr.durationMs - prev.durationMs) / prev.durationMs * 100).toFixed(1)}% (${prev.durationMs}ms -> ${curr.durationMs}ms)`);
                }
            }
        });
    }

    const v1Blockers = testResults.filter(t => t.status === 'FAIL' && t.blocksV1);
    const stabilityAssessment = v1Blockers.length === 0 ? 'STABLE_FOR_V1_RELEASE' : 'UNSTABLE_V1_BLOCKERS_PRESENT';

    // Group coverage by subsystem
    const subsystemCoverage = {};
    testResults.forEach(t => {
        if (!subsystemCoverage[t.subsystem]) {
            subsystemCoverage[t.subsystem] = { total: 0, pass: 0, fail: 0 };
        }
        subsystemCoverage[t.subsystem].total += 1;
        if (t.status === 'PASS') subsystemCoverage[t.subsystem].pass += 1;
        if (t.status === 'FAIL') subsystemCoverage[t.subsystem].fail += 1;
    });

    const reportJson = {
        commit: getGitCommit(),
        seed: options.seed,
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
            v1BlockersCount: v1Blockers.length,
            stabilityAssessment
        },
        subsystemCoverage,
        perfMetrics,
        diff: {
            newlyFailing,
            newlyFixed,
            regressions
        },
        results: testResults
    };

    // Save JSON report
    fs.writeFileSync(path.join(reportsDir, 'v1-qualification-report.json'), JSON.stringify(reportJson, null, 2));

    // Generate Markdown report
    const mdLines = [
        `# Figranium Pre-v1 Release Qualification & Stability Report`,
        ``,
        `**Status**: ${stabilityAssessment === 'STABLE_FOR_V1_RELEASE' ? '✅ **STABLE FOR V1 RELEASE**' : '❌ **UNSTABLE - V1 BLOCKERS PRESENT**'}`,
        ``,
        `## 1. Test Metadata & Environment`,
        `- **Tested Commit**: \`${reportJson.commit}\``,
        `- **Test Seed**: \`${reportJson.seed}\``,
        `- **Start Time**: \`${startTime.toISOString()}\``,
        `- **End Time**: \`${endTime.toISOString()}\``,
        `- **Duration**: \`${durationSec} seconds\``,
        `- **Node.js**: \`${reportJson.environment.node}\` (${reportJson.environment.platform} ${reportJson.environment.arch})`,
        `- **CPU / RAM**: \`${reportJson.environment.cpus} cores / ${reportJson.environment.memoryMb} MB\``,
        ``,
        `## 2. Summary Statistics`,
        `| Metric | Count |`,
        `| :--- | :--- |`,
        `| **Total Executed** | ${totalExecuted} |`,
        `| **Passed Tests** | ${passedTests} |`,
        `| **Failed Tests** | ${failedTests} |`,
        `| **Flaky Tests** | ${flakyTests} |`,
        `| **Blocked Tests** | ${blockedTests} |`,
        `| **Skipped Tests** | ${skippedTests} |`,
        `| **v1 Release Blockers** | ${v1Blockers.length} |`,
        ``,
        `## 3. Subsystem Coverage`,
        `| Subsystem | Total | Pass | Fail | Pass Rate |`,
        `| :--- | :--- | :--- | :--- | :--- |`
    ];

    Object.entries(subsystemCoverage).forEach(([sub, data]) => {
        const rate = Math.round((data.pass / data.total) * 100);
        mdLines.push(`| **${sub}** | ${data.total} | ${data.pass} | ${data.fail} | ${rate}% |`);
    });

    mdLines.push(
        ``,
        `## 4. Historical Regressions & Diffs`,
        newlyFailing.length ? `- **Newly Failing Tests**: ${newlyFailing.join(', ')}` : `- **Newly Failing Tests**: None`,
        newlyFixed.length ? `- **Newly Fixed Tests**: ${newlyFixed.join(', ')}` : `- **Newly Fixed Tests**: None`,
        regressions.length ? `- **Performance Regressions**:\n  - ${regressions.join('\n  - ')}` : `- **Performance Regressions**: None detected`,
        ``,
        `## 5. Performance Observations`,
        `| Metric | Observed Value |`,
        `| :--- | :--- |`
    );

    Object.entries(perfMetrics).forEach(([metric, val]) => {
        mdLines.push(`| \`${metric}\` | ${val} ms |`);
    });

    mdLines.push(
        ``,
        `## 6. Failed Test Cases & Reproduction Details`
    );

    if (failedTests === 0) {
        mdLines.push(`*No failed tests. All test cases passed successfully.*`);
    } else {
        testResults.filter(t => t.status === 'FAIL').forEach(f => {
            mdLines.push(
                `### ${f.id}: ${f.name}`,
                `- **Subsystem**: \`${f.subsystem}\``,
                `- **Severity**: \`${f.severity}\` | **Blocks v1**: \`${f.blocksV1}\``,
                `- **Setup**: ${f.setup}`,
                `- **Steps**: ${f.steps}`,
                `- **Expected**: ${f.expected}`,
                `- **Actual Error**: \`${f.actualResult}\``,
                `- **Artifacts**: \`reports/artifacts/${f.id}/\``,
                ``
            );
        });
    }

    mdLines.push(
        ``,
        `## 7. Insufficient Coverage & Known Limitations`,
        `- **Third-party CAPTCHA Services**: Real-time 2Captcha/Anti-Captcha APIs are tested via deterministic local mock proxies to eliminate flaky network conditions during CI runs.`,
        `- **Multi-node Cluster Execution**: Single-node execution queue and postgres lock parity are fully tested; multi-datacenter network partition testing is out of scope for pre-v1 release qualification.`,
        ``,
        `## 8. Final Release Assessment`,
        `**Assessment**: ${stabilityAssessment === 'STABLE_FOR_V1_RELEASE' ? 'FIGRANIUM IS STABLE AND READY FOR V1 RELEASE.' : 'FIGRANIUM HAS CRITICAL BLOCKING ISSUES THAT MUST BE RESOLVED BEFORE V1 RELEASE.'}`
    );

    fs.writeFileSync(path.join(reportsDir, 'v1-qualification-report.md'), mdLines.join('\n'));

    console.log(`\n======================================================`);
    console.log(` QUALIFICATION SUITE COMPLETE`);
    console.log(` Passed: ${passedTests}/${totalExecuted} | Failed: ${failedTests} | v1 Blockers: ${v1Blockers.length}`);
    console.log(` Reports written to:`);
    console.log(`   - Machine-Readable: reports/v1-qualification-report.json`);
    console.log(`   - Human-Readable:   reports/v1-qualification-report.md`);
    console.log(`======================================================\n`);

    if (v1Blockers.length > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

if (require.main === module) {
    runQualificationSuite().catch(err => {
        console.error('Fatal runner error:', err);
        process.exit(1);
    });
}

module.exports = { runQualificationSuite };
