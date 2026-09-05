const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '../../..');
const imageTag = `figranium-v1-qualification:${process.pid}`;
let imageBuilt = false;

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
        timeout: options.timeout || 60_000,
        ...options
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed (${result.status})\nSTDOUT:\n${result.stdout || ''}\nSTDERR:\n${result.stderr || ''}`);
    }
    return (result.stdout || '').trim();
}

function dockerAvailable() {
    const result = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8', timeout: 15_000 });
    return !result.error && result.status === 0 && Boolean((result.stdout || '').trim());
}

async function ensureImage() {
    if (imageBuilt) return;
    run('docker', ['build', '-t', imageTag, '.'], { timeout: 15 * 60_000 });
    const inspect = run('docker', ['image', 'inspect', imageTag, '--format', '{{.Id}}']);
    assert.ok(inspect.startsWith('sha256:'), 'Built image must be inspectable');
    imageBuilt = true;
}

function seedQualificationApiKey(dataDir) {
    const apiKey = crypto.randomBytes(32).toString('hex');
    const apiKeyPath = path.join(dataDir, 'api_key.json');
    fs.writeFileSync(apiKeyPath, JSON.stringify({ apiKey }), { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(apiKeyPath, 0o600);
}

function containerDiagnostics(containerName) {
    const inspect = spawnSync('docker', ['inspect', containerName, '--format', 'status={{.State.Status}} exit={{.State.ExitCode}} error={{.State.Error}}'], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 15_000
    });
    const logs = spawnSync('docker', ['logs', '--tail', '200', containerName], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 15_000
    });
    return [
        `Inspect: ${(inspect.stdout || inspect.stderr || '').trim()}`,
        `Logs:\n${(logs.stdout || '')}${logs.stderr || ''}`
    ].join('\n');
}

async function waitForContainerHealth(containerName, timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;
    let lastResult = '';

    while (Date.now() < deadline) {
        const state = spawnSync('docker', ['inspect', containerName, '--format', '{{.State.Running}}'], {
            cwd: repoRoot,
            encoding: 'utf8',
            timeout: 10_000
        });

        if (state.status === 0 && state.stdout.trim() !== 'true') {
            throw new Error(`Container exited before becoming healthy.\n${containerDiagnostics(containerName)}`);
        }

        // Keep the per-run qualification key out of host command arguments, env vars,
        // logs, and workflow artifacts. curl reads it from the isolated bind mount
        // inside the container and sends it using Figranium's normal x-api-key header.
        const health = spawnSync('docker', [
            'exec', containerName,
            'sh', '-lc',
            'curl -fsS --max-time 2 -H "x-api-key: $(node -p \'JSON.parse(require("fs").readFileSync("/app/data/api_key.json", "utf8")).apiKey\')" http://127.0.0.1:11345/api/health'
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
            timeout: 5_000
        });

        lastResult = `${health.stdout || ''}${health.stderr || ''}`.trim();
        if (health.status === 0) {
            try {
                const data = JSON.parse(health.stdout);
                if (data.status === 'ok') return data;
            } catch {
                // Keep waiting until the endpoint returns valid health JSON.
            }
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Container health endpoint did not become ready inside the production container. Last probe: ${lastResult || 'no response'}\n${containerDiagnostics(containerName)}`);
}

async function cleanup() {
    if (!imageBuilt || !dockerAvailable()) return;
    spawnSync('docker', ['image', 'rm', '-f', imageTag], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 60_000
    });
    imageBuilt = false;
}

const tests = [
    {
        id: 'CONTAINER-001',
        name: 'Deployment Layout - Captures Persistence Path Exists',
        subsystem: 'container-runtime',
        setup: 'Repository root directory structure',
        steps: 'Verify the public captures path exists in a supported location.',
        expected: 'A captures path exists for persisted screenshot/recording assets.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const publicCaptures = path.join(repoRoot, 'public/captures');
            const srcPublicCaptures = path.join(repoRoot, 'src/public/captures');
            assert.ok(fs.existsSync(publicCaptures) || fs.existsSync(srcPublicCaptures), 'Captures directory structure must exist');
        }
    },
    {
        id: 'CONTAINER-002',
        name: 'Deployment Configuration - Reverse Proxy Rate Limiter Safety',
        subsystem: 'container-runtime',
        setup: 'Server middleware source',
        steps: 'Inspect rate-limiter configuration for the reverse-proxy-safe xForwardedForHeader setting.',
        expected: 'Rate limiter configuration includes xForwardedForHeader: false.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const content = fs.readFileSync(path.join(repoRoot, 'src/server/middleware.js'), 'utf8');
            assert.ok(content.includes('xForwardedForHeader: false'), 'Middleware rate limiter must disable strict xForwardedForHeader validation');
        }
    },
    {
        id: 'CONTAINER-003',
        name: 'Docker Image - Production Build Completes and Image Is Inspectable',
        subsystem: 'container-runtime',
        setup: 'Working Docker daemon with network access required by the production Dockerfile',
        steps: 'Build the repository Dockerfile into a qualification image and inspect the resulting image ID.',
        expected: 'The exact repository builds successfully as a runnable Docker image.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            if (!dockerAvailable()) return { status: 'BLOCKED', reason: 'Docker daemon is unavailable in this qualification environment.' };
            await ensureImage();
        }
    },
    {
        id: 'CONTAINER-004',
        name: 'Docker Runtime - Startup, Authenticated Health, Restart, and /app/data Volume Persistence',
        subsystem: 'container-runtime',
        setup: 'Built qualification image, working Docker daemon, and an isolated per-run API key stored only in the temporary /app/data bind mount',
        steps: 'Create an ephemeral API key, run the image with an isolated /app/data bind mount and ephemeral published port, verify /api/health from inside the production container using x-api-key, confirm the port is published, create a persistence marker, restart the same container, verify authenticated health again and confirm the marker remains.',
        expected: 'The production container starts, serves a healthy authenticated API, publishes port 11345, survives restart, and preserves mounted application data without exposing the qualification key in CI arguments or logs.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            if (!dockerAvailable()) return { status: 'BLOCKED', reason: 'Docker daemon is unavailable in this qualification environment.' };
            await ensureImage();

            const containerName = `figranium-v1-qual-${process.pid}-${Date.now()}`;
            const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figranium-v1-data-'));
            try {
                seedQualificationApiKey(dataDir);

                run('docker', [
                    'run', '-d', '--name', containerName,
                    '-p', '127.0.0.1::11345',
                    '-v', `${dataDir}:/app/data`,
                    imageTag
                ], { timeout: 60_000 });

                const portLine = run('docker', ['port', containerName, '11345/tcp']);
                const match = portLine.match(/:(\d+)\s*$/m);
                assert.ok(match, `Could not resolve published port from: ${portLine}`);

                await waitForContainerHealth(containerName);

                const marker = `qualification-${Date.now()}`;
                fs.writeFileSync(path.join(dataDir, 'qualification-marker.txt'), marker, 'utf8');
                assert.strictEqual(run('docker', ['exec', containerName, 'cat', '/app/data/qualification-marker.txt']), marker);

                run('docker', ['restart', containerName], { timeout: 60_000 });
                await waitForContainerHealth(containerName);
                assert.strictEqual(run('docker', ['exec', containerName, 'cat', '/app/data/qualification-marker.txt']), marker, 'Mounted /app/data must survive restart');
            } finally {
                if (dockerAvailable()) {
                    spawnSync('docker', ['exec', containerName, 'sh', '-c', 'rm -rf /app/data/* /app/data/.[!.]* /app/data/..?* 2>/dev/null || true'], {
                        cwd: repoRoot,
                        encoding: 'utf8',
                        timeout: 30_000
                    });
                    spawnSync('docker', ['rm', '-f', containerName], { cwd: repoRoot, encoding: 'utf8', timeout: 30_000 });
                }
                fs.rmSync(dataDir, { recursive: true, force: true });
            }
        }
    }
];

module.exports = { tests, cleanup };
