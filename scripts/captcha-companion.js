#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

process.env.CAPTCHA_COMPANION_MODE = 'true';
process.env.CAPTCHA_DISABLE_COMPANION = 'true';
process.env.CAPTCHA_MODEL_DEVICE = process.env.CAPTCHA_MODEL_DEVICE || 'auto';

const { captchaModelManager } = require('../src/agent/figranite/captcha-model-manager');
const { selectModelTier, getMemorySnapshot, parseFlag } = require('../src/agent/figranite/captcha-model-manager');
const { TOKEN_FILE, DEFAULT_PORT } = require('../src/agent/figranite/captcha-companion-client');
const { loadVerifiedMlxRuntime } = require('../src/agent/figranite/captcha-mlx-runtime');

const dockerMode = process.argv.includes('--docker');
const host = dockerMode ? '0.0.0.0' : '127.0.0.1';
const port = Number(process.env.CAPTCHA_COMPANION_PORT || DEFAULT_PORT);
const MAX_BODY_BYTES = 7 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const INFERENCE_TIMEOUT_MS = Number(process.env.CAPTCHA_COMPANION_INFERENCE_TIMEOUT_MS || 45_000);
let detectQueue = Promise.resolve();
const modelRoot = path.resolve(process.env.CAPTCHA_MODEL_CACHE_DIR || path.join(process.cwd(), 'data', 'captcha-model'));
let activeMlx = null;
let initializationError = null;

function ensureToken() {
    const configured = String(process.env.CAPTCHA_COMPANION_TOKEN || '').trim();
    if (configured) return;
    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
    if (!fs.existsSync(TOKEN_FILE)) fs.writeFileSync(TOKEN_FILE, `${crypto.randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
    else fs.chmodSync(TOKEN_FILE, 0o600);
}

function readToken() {
    const token = String(process.env.CAPTCHA_COMPANION_TOKEN || '').trim();
    if (token) return token;
    try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { return ''; }
}

function sendJson(response, status, payload) {
    const body = JSON.stringify(payload);
    response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
    response.end(body);
}

function authorized(request) {
    const token = readToken();
    const supplied = String(request.headers.authorization || '');
    const expected = `Bearer ${token}`;
    if (!token || supplied.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

async function readJson(request) {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large'), { status: 413 });
        chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw Object.assign(new Error('Malformed JSON'), { status: 400 }); }
}

function enqueueDetect(operation) {
    const pending = detectQueue.then(operation, operation);
    detectQueue = pending.catch(() => undefined);
    return pending;
}

async function removeModelDirectories(names) {
    for (const name of names) await fs.promises.rm(path.join(modelRoot, name), { recursive: true, force: true });
}

async function activateMlx() {
    if (activeMlx) return activeMlx;
    let runtime;
    try {
        runtime = await loadVerifiedMlxRuntime(modelRoot);
    } catch (error) {
        const enospc = error?.code === 'ENOSPC' || /ENOSPC|no space left/i.test(error?.message || '');
        if (!enospc || !captchaModelManager.status().healthy) throw error;
        await captchaModelManager.stop();
        await removeModelDirectories(['owlvit', 'florence2']);
        runtime = await loadVerifiedMlxRuntime(modelRoot);
    }
    const previousMlx = activeMlx;
    activeMlx = runtime;
    await captchaModelManager.stop();
    await removeModelDirectories(['owlvit', 'florence2']);
    await previousMlx?.dispose?.().catch?.(() => undefined);
    await fs.promises.mkdir(modelRoot, { recursive: true });
    const temporary = path.join(modelRoot, '.active.json.tmp');
    await fs.promises.writeFile(temporary, JSON.stringify({
        tier: 'florence2', model: 'mlx-community/Florence-2-base-ft-4bit', backend: 'companion', device: 'mlx', activatedAt: new Date().toISOString()
    }, null, 2), { mode: 0o600 });
    await fs.promises.rename(temporary, path.join(modelRoot, 'active.json'));
    return runtime;
}

async function activateOnnx(tier) {
    const previousTier = process.env.CAPTCHA_MODEL_TIER;
    process.env.CAPTCHA_MODEL_TIER = tier;
    try {
        await captchaModelManager.start();
        await captchaModelManager.reconcile();
        if (!captchaModelManager.status().healthy) throw new Error(captchaModelManager.status().error || 'Native ONNX backend is unhealthy');
    } finally {
        if (previousTier === undefined) delete process.env.CAPTCHA_MODEL_TIER;
        else process.env.CAPTCHA_MODEL_TIER = previousTier;
    }
    const previousMlx = activeMlx;
    activeMlx = null;
    await previousMlx?.dispose?.().catch?.(() => undefined);
    await removeModelDirectories(['florence2-mlx', '.staging-florence2-mlx']);
}

async function detectTier(tier, image, label, threshold) {
    if (tier === 'florence2'
        && process.env.CAPTCHA_MODEL_DEVICE !== 'cpu'
        && !parseFlag(process.env.CAPTCHA_COMPANION_DISABLE_MLX)) {
        try {
            const runtime = await activateMlx();
            return { detections: await runtime.detect(image, label, threshold), backend: 'companion', device: 'mlx' };
        } catch (error) {
            initializationError = `MLX unavailable; using native ONNX: ${error.message}`;
            console.warn(`[CAPTCHA_COMPANION] ${initializationError}`);
        }
    }
    await activateOnnx(tier);
    const previousTier = process.env.CAPTCHA_MODEL_TIER;
    process.env.CAPTCHA_MODEL_TIER = tier;
    try {
        const detections = await captchaModelManager.detect(image, label, threshold);
        const status = captchaModelManager.status();
        return { detections, backend: status.backend, device: status.device };
    } finally {
        if (previousTier === undefined) delete process.env.CAPTCHA_MODEL_TIER;
        else process.env.CAPTCHA_MODEL_TIER = previousTier;
    }
}

async function initializeCompanion() {
    const tier = selectModelTier(getMemorySnapshot());
    if (!tier) throw new Error('Host has insufficient available unified memory for a companion model');
    await detectTier(tier, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAGUlEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAB4Gx4gAAE7Bq0AAAAASUVORK5CYII=', 'base64'), 'object', 0.99);
    initializationError = null;
}

const server = http.createServer(async (request, response) => {
    try {
        if (!authorized(request)) return sendJson(response, 401, { error: 'UNAUTHORIZED' });
        if (request.method === 'GET' && request.url === '/v1/health') {
            const status = captchaModelManager.status();
            const mlxHealthy = Boolean(activeMlx);
            return sendJson(response, 200, {
                ...status,
                healthy: mlxHealthy || status.healthy,
                activeTier: mlxHealthy ? 'florence2' : status.activeTier,
                version: 1,
                backend: mlxHealthy ? 'mlx' : status.device === 'coreml' ? 'coreml' : 'onnx-native',
                error: initializationError || status.error,
                memory: { totalMb: os.totalmem() / 1048576, availableMb: os.freemem() / 1048576 }
            });
        }
        if (request.method === 'POST' && request.url === '/v1/detect') {
            return enqueueDetect(async () => {
                const body = await readJson(request);
                if (!['owlvit', 'florence2'].includes(body.tier)) return sendJson(response, 400, { error: 'INVALID_TIER' });
                if (typeof body.label !== 'string' || !body.label.trim() || typeof body.imageBase64 !== 'string') {
                    return sendJson(response, 400, { error: 'INVALID_REQUEST' });
                }
                const image = Buffer.from(body.imageBase64, 'base64');
                if (!image.length || image.length > MAX_IMAGE_BYTES) return sendJson(response, 413, { error: 'INVALID_IMAGE_SIZE' });
                const inference = detectTier(body.tier, image, body.label.trim(), Number(body.threshold));
                let timeoutHandle;
                const timeout = new Promise((resolve) => {
                    timeoutHandle = setTimeout(() => resolve({ timedOut: true }), INFERENCE_TIMEOUT_MS);
                    timeoutHandle.unref?.();
                });
                const outcome = await Promise.race([
                    inference.then((result) => ({ result }), (error) => ({ error })),
                    timeout
                ]);
                clearTimeout(timeoutHandle);
                if (outcome.timedOut) {
                    sendJson(response, 504, { error: 'INFERENCE_TIMEOUT' });
                    await inference.catch(() => undefined); // keep server-level concurrency at one
                    return undefined;
                }
                if (outcome.error) throw outcome.error;
                return sendJson(response, 200, outcome.result);
            });
        }
        return sendJson(response, 404, { error: 'NOT_FOUND' });
    } catch (error) {
        return sendJson(response, error.status || 500, { error: error.message || 'COMPANION_ERROR' });
    }
});

async function shutdown() {
    server.close();
    await activeMlx?.dispose?.().catch?.(() => undefined);
    await captchaModelManager.stop().catch(() => undefined);
    process.exit(0);
}

server.requestTimeout = Math.max(INFERENCE_TIMEOUT_MS + 5000, 50_000);
server.headersTimeout = 10_000;

if (require.main === module) {
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    ensureToken();
    initializeCompanion().catch((error) => {
        initializationError = error.message;
        console.warn(`[CAPTCHA_COMPANION] Initial model probe failed: ${error.message}`);
    });
    server.listen(port, host, () => console.log(`[CAPTCHA_COMPANION] Listening on http://${host}:${port}`));
}

module.exports = { authorized, readJson, server };
