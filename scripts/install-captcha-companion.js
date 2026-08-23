#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    console.error('The CAPTCHA accelerator companion requires Apple Silicon macOS.');
    process.exit(1);
}

async function main() {
    const ort = require('onnxruntime-node');
    const backends = await ort.listSupportedBackends();
    if (!backends.some((backend) => backend.name === 'coreml' && backend.bundled)) {
        throw new Error('The installed ONNX Runtime does not include CoreMLExecutionProvider');
    }
    const dataDir = path.resolve(process.cwd(), 'data');
    const environmentDir = path.join(dataDir, 'captcha-companion', 'venv');
    const tokenFile = path.join(dataDir, 'captcha-companion-token');
    await fs.promises.mkdir(dataDir, { recursive: true });
    const candidates = [process.env.PYTHON, 'python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3'].filter(Boolean);
    const python = candidates.find((candidate) => {
        try {
            const version = execFileSync(candidate, ['-c', 'import sys; print(int(sys.version_info >= (3, 10)))'], { encoding: 'utf8', timeout: 5000 }).trim();
            return version === '1';
        } catch { return false; }
    });
    if (!python) throw new Error('Python 3.10 or newer is required for the pinned MLX companion environment');
    if (!fs.existsSync(path.join(environmentDir, 'bin', 'python3'))) {
        execFileSync(python, ['-m', 'venv', environmentDir], { stdio: 'inherit', timeout: 120_000 });
    }
    execFileSync(path.join(environmentDir, 'bin', 'python3'), [
        '-m', 'pip', 'install', '--disable-pip-version-check', '--requirement', path.join(__dirname, 'captcha-companion-requirements.txt')
    ], { stdio: 'inherit', timeout: 15 * 60_000 });
    const exists = await fs.promises.access(tokenFile).then(() => true).catch(() => false);
    if (!exists) await fs.promises.writeFile(tokenFile, `${crypto.randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
    else await fs.promises.chmod(tokenFile, 0o600).catch(() => undefined);
    console.log(`CAPTCHA companion isolated environment: ${environmentDir}`);
    console.log(`CAPTCHA companion ready. Authentication token: ${tokenFile}`);
    console.log('Model weights will be downloaded and verified only when the companion starts.');
}

main().catch((error) => {
    console.error(`CAPTCHA companion installation failed: ${error.message}`);
    process.exit(1);
});
