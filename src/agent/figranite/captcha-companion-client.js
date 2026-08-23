const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const TOKEN_FILE = path.join(DATA_DIR, 'captcha-companion-token');
const DEFAULT_PORT = 11438;

function isDocker() {
    return fs.existsSync('/.dockerenv') || Boolean(process.env.CONTAINER);
}

function resolveCompanionConfig(env = process.env) {
    if (String(env.CAPTCHA_DISABLE_COMPANION || '').toLowerCase() === 'true') return null;
    let baseUrl = String(env.CAPTCHA_COMPANION_URL || '').trim();
    if (!baseUrl && process.platform === 'darwin') baseUrl = `http://127.0.0.1:${DEFAULT_PORT}`;
    if (!baseUrl && isDocker()) baseUrl = `http://host.docker.internal:${DEFAULT_PORT}`;
    if (!baseUrl) return null;
    let parsed;
    try { parsed = new URL(baseUrl); } catch { throw new Error('Invalid CAPTCHA_COMPANION_URL'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('CAPTCHA companion URL must use HTTP or HTTPS');
    let token = String(env.CAPTCHA_COMPANION_TOKEN || '').trim();
    if (!token) {
        try { token = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { /* optional */ }
    }
    return { baseUrl: baseUrl.replace(/\/+$/, ''), token };
}

async function companionRequest(endpoint, { method = 'GET', body, timeout = 1000 } = {}) {
    const config = resolveCompanionConfig();
    if (!config) return null;
    const headers = { Accept: 'application/json' };
    if (config.token) headers.Authorization = `Bearer ${config.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${config.baseUrl}${endpoint}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeout)
    });
    let payload;
    try { payload = await response.json(); } catch { throw new Error(`Apple companion returned malformed JSON (HTTP ${response.status})`); }
    if (!response.ok) throw new Error(payload.error || `Apple companion HTTP ${response.status}`);
    return payload;
}

async function probeCompanion(timeout = 750) {
    try {
        const health = await companionRequest('/v1/health', { timeout });
        if (!health?.healthy || !Number.isFinite(health.memory?.totalMb)) return null;
        return health;
    } catch {
        return null;
    }
}

async function detectWithCompanion(imageBuffer, label, tier, threshold, timeout = 30_000) {
    const payload = await companionRequest('/v1/detect', {
        method: 'POST',
        timeout,
        body: { tier, label, threshold, imageBase64: imageBuffer.toString('base64') }
    });
    if (!Array.isArray(payload?.detections)) throw new Error('Apple companion returned invalid detections');
    return { detections: payload.detections, backend: payload.backend || 'companion', device: payload.device || 'coreml' };
}

module.exports = {
    DEFAULT_PORT,
    TOKEN_FILE,
    isDocker,
    resolveCompanionConfig,
    companionRequest,
    probeCompanion,
    detectWithCompanion
};
