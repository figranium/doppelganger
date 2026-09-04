const assert = require('assert');
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

async function waitForHealth(port, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/api/health`);
            if (res.status === 200) {
                const data = await res.json();
                if (data.status === 'ok') return;
            }
        } catch (error) {
            lastError = error;
        }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`Container health endpoint did not become ready${lastError ? `: ${lastError.message}` : ''}`);
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
        name: 'Docker Runtime - Startup, Health, Restart, and /app/data Volume Persistence',
        subsystem: 'container-runtime',
        setup: 'Built qualification image and working Docker daemon',
        steps: 'Run the image with an isolated /app/data bind mount and ephemeral host port, verify /api/health, create a persistence marker, restart the same container, verify health again and confirm the marker remains.',
        expected: 'The production container starts, becomes healthy, survives restart, and preserves mounted application data.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            if (!dockerAvailable()) return { status: 'BLOCKED', reason: 'Docker daemon is unavailable in this qualification environment.' };
            await ensureImage();

            const containerName = `figranium-v1-qual-${process.pid}-${Date.now()}`;
            const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figranium-v1-data-'));
            try {
                run('docker', [
                    'run', '-d', '--name', containerName,
                    '-p', '127.0.0.1::11345',
                    '-v', `${dataDir}:/app/data`,
                    imageTag
                ], { timeout: 60_000 });

                const portLine = run('docker', ['port', containerName, '11345/tcp']);
                const match = portLine.match(/:(\d+)\s*$/m);
                assert.ok(match, `Could not resolve published port from: ${portLine}`);
                const port = Number(match[1]);
                await waitForHealth(port);

                const marker = `qualification-${Date.now()}`;
                fs.writeFileSync(path.join(dataDir, 'qualification-marker.txt'), marker, 'utf8');
                assert.strictEqual(run('docker', ['exec', containerName, 'cat', '/app/data/qualification-marker.txt']), marker);

                run('docker', ['restart', containerName], { timeout: 60_000 });
                await waitForHealth(port);
                assert.strictEqual(run('docker', ['exec', containerName, 'cat', '/app/data/qualification-marker.txt']), marker, 'Mounted /app/data must survive restart');
            } finally {
                spawnSync('docker', ['rm', '-f', containerName], { cwd: repoRoot, encoding: 'utf8', timeout: 30_000 });
                fs.rmSync(dataDir, { recursive: true, force: true });
            }
        }
    }
];

module.exports = { tests };
