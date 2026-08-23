const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const { APPLE_MLX_MANIFEST } = require('./captcha-model-manifest');
const { downloadModelArtifacts, verifyArtifactDirectory } = require('./captcha-model-downloader');

const PROBE_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAGUlEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAB4Gx4gAAE7Bq0AAAAASUVORK5CYII=',
    'base64'
);

class MlxFlorenceRuntime {
    constructor(processHandle) {
        this.process = processHandle;
        this.pending = new Map();
        this.nextId = 1;
        this.closed = false;
    }

    static async create(modelDir, timeout = 60_000) {
        const python = path.resolve(process.cwd(), 'data', 'captcha-companion', 'venv', 'bin', 'python3');
        const worker = path.resolve(process.cwd(), 'scripts', 'captcha-mlx-worker.py');
        if (!fs.existsSync(python)) throw new Error('Pinned MLX environment is not installed; run npm run captcha:companion:install');
        const child = spawn(python, [worker, modelDir], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', PYTHONUNBUFFERED: '1' }
        });
        const runtime = new MlxFlorenceRuntime(child);
        const ready = new Promise((resolve, reject) => {
            runtime.readyResolve = resolve;
            runtime.readyReject = reject;
        });
        readline.createInterface({ input: child.stdout }).on('line', (line) => runtime._handleLine(line));
        child.stderr.on('data', (chunk) => {
            const message = chunk.toString().trim();
            if (message) runtime.lastDiagnostic = message.slice(-1000);
        });
        child.once('error', (error) => runtime._close(error));
        child.once('exit', (code, signal) => runtime._close(new Error(`MLX worker exited (${signal || code})${runtime.lastDiagnostic ? `: ${runtime.lastDiagnostic}` : ''}`)));
        const timer = setTimeout(() => runtime.readyReject?.(new Error('MLX worker startup timed out')), timeout);
        timer.unref?.();
        try {
            await ready;
            clearTimeout(timer);
            return runtime;
        } catch (error) {
            clearTimeout(timer);
            await runtime.dispose();
            throw error;
        }
    }

    _handleLine(line) {
        let payload;
        try { payload = JSON.parse(line); } catch { return; }
        if (Object.prototype.hasOwnProperty.call(payload, 'ready')) {
            if (payload.ready) this.readyResolve?.(payload);
            else this.readyReject?.(new Error(payload.error || 'MLX worker failed to load'));
            this.readyResolve = null;
            this.readyReject = null;
            return;
        }
        const pending = this.pending.get(payload.id);
        if (!pending) return;
        this.pending.delete(payload.id);
        clearTimeout(pending.timer);
        if (payload.error) pending.reject(new Error(payload.error));
        else if (!Array.isArray(payload.detections)) pending.reject(new Error('MLX worker returned invalid detections'));
        else pending.resolve(payload.detections);
    }

    _close(error) {
        if (this.closed) return;
        this.closed = true;
        this.readyReject?.(error);
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pending.clear();
    }

    async detect(imageBuffer, label, threshold = APPLE_MLX_MANIFEST.threshold, timeout = 45_000) {
        if (this.closed) throw new Error('MLX worker is not running');
        const id = this.nextId++;
        const result = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('MLX inference timed out'));
            }, timeout);
            timer.unref?.();
            this.pending.set(id, { resolve, reject, timer });
        });
        this.process.stdin.write(`${JSON.stringify({ id, label, threshold, imageBase64: imageBuffer.toString('base64') })}\n`);
        return result;
    }

    async probe() {
        await this.detect(PROBE_PNG, 'object', 0.99, 30_000);
    }

    async dispose() {
        if (!this.closed) this.process.kill('SIGTERM');
        this._close(new Error('MLX worker stopped'));
    }
}

async function loadVerifiedMlxRuntime(modelRoot, options = {}) {
    const staging = path.join(modelRoot, '.staging-florence2-mlx');
    const target = path.join(modelRoot, 'florence2-mlx');
    await fs.promises.rm(staging, { recursive: true, force: true });
    let verified = await verifyArtifactDirectory('florence2_mlx', target, { manifest: APPLE_MLX_MANIFEST }).catch(() => false);
    if (!verified) {
        await fs.promises.rm(target, { recursive: true, force: true });
        await fs.promises.mkdir(staging, { recursive: true });
        try {
            await downloadModelArtifacts('florence2_mlx', staging, { manifest: APPLE_MLX_MANIFEST, fetchImpl: options.fetchImpl });
            verified = await verifyArtifactDirectory('florence2_mlx', staging, { manifest: APPLE_MLX_MANIFEST });
            if (!verified) throw new Error('MLX Florence artifact verification failed');
            await fs.promises.rename(staging, target);
        } catch (error) {
            await fs.promises.rm(staging, { recursive: true, force: true });
            throw error;
        }
    }
    let runtime;
    try {
        runtime = await MlxFlorenceRuntime.create(target);
        await runtime.probe();
        return runtime;
    } catch (error) {
        await runtime?.dispose?.().catch?.(() => undefined);
        await fs.promises.rm(staging, { recursive: true, force: true });
        await fs.promises.rm(target, { recursive: true, force: true });
        throw error;
    }
}

module.exports = { MlxFlorenceRuntime, loadVerifiedMlxRuntime };
