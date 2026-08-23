const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

if (process.env.RUN_CAPTCHA_LIVE_TESTS !== '1') {
    console.log('Skipped Docker CAPTCHA acceptance (set RUN_CAPTCHA_LIVE_TESTS=1).');
    process.exit(0);
}

const image = process.env.CAPTCHA_TEST_IMAGE || 'figranium-captcha-acceptance:local';

function docker(args, options = {}) {
    return execFileSync('docker', args, { stdio: 'pipe', encoding: 'utf8', timeout: options.timeout || 30 * 60_000 });
}

function main() {
    docker(['build', '--build-arg', 'INSTALL_VNC=0', '-t', image, '.'], { timeout: 30 * 60_000 });
    docker(['run', '--rm', '--entrypoint', 'sh', image, '-c', 'test ! -e /app/data/captcha-model']);
    for (const [memory, expected] of [['1g', ''], ['2g', 'owlvit'], ['4g', 'owlvit'], ['8g', 'florence2']]) {
        const cache = fs.mkdtempSync(path.join(os.tmpdir(), `figranium-docker-${memory}-`));
        try {
            const output = docker([
                'run', '--rm', '--memory', memory,
                '-v', `${cache}:/app/data`,
                '-e', 'CAPTCHA_DISABLE_COMPANION=true',
                '-e', 'CAPTCHA_MODEL_DEVICE=cpu',
                '-e', `CAPTCHA_ACCEPT_EXPECTED_TIER=${expected}`,
                '--entrypoint', 'node', image, '/app/scripts/captcha-container-probe.js'
            ], { timeout: 30 * 60_000 });
            const report = JSON.parse(output.trim().split(/\r?\n/).pop());
            assert.strictEqual(report.status.activeTier || '', expected);
            if (memory === '2g') assert(report.peakBytes < 0.9 * 2 * 1024 ** 3, '2 GiB peak cgroup use exceeded 90%');
        } finally {
            fs.rmSync(cache, { recursive: true, force: true });
        }
    }
    const skipped = docker([
        'run', '--rm', '--memory', '8g', '-e', 'SKIP_LOCAL_CAPTCHA_MODEL=true',
        '-e', 'CAPTCHA_ACCEPT_EXPECTED_TIER=', '--entrypoint', 'node', image, '/app/scripts/captcha-container-probe.js'
    ]);
    assert.strictEqual(JSON.parse(skipped.trim().split(/\r?\n/).pop()).status.healthy, false);
    console.log('Docker 1/2/4/8 GiB CAPTCHA acceptance passed!');
}

try { main(); } catch (error) { console.error(error.stdout || error.message); console.error(error.stderr || ''); process.exit(1); }
