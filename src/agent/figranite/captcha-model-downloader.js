const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { MODEL_MANIFESTS } = require('./captcha-model-manifest');

const APPROVED_DOWNLOAD_HOSTS = Object.freeze([
    'huggingface.co',
    'hf.co',
    'xethub.hf.co'
]);

function isApprovedDownloadUrl(rawUrl) {
    let hostname;
    try {
        const url = new URL(rawUrl);
        if (url.protocol !== 'https:') return false;
        hostname = url.hostname.toLowerCase();
    } catch {
        return false;
    }
    return APPROVED_DOWNLOAD_HOSTS.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
}

function safeArtifactPath(root, relativePath) {
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('..')) {
        throw new Error(`Unsafe CAPTCHA model artifact path: ${relativePath}`);
    }
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(root, relativePath);
    if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`Artifact escapes model root: ${relativePath}`);
    return resolved;
}

async function checksumFile(filePath) {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    for await (const chunk of input) hash.update(chunk);
    return hash.digest('hex');
}

async function fetchWithApprovedRedirects(url, options = {}, maxRedirects = 5) {
    let current = url;
    for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
        if (!isApprovedDownloadUrl(current)) throw new Error(`Blocked model download redirect to unapproved host: ${current}`);
        const response = await fetch(current, { ...options, redirect: 'manual' });
        if (![301, 302, 303, 307, 308].includes(response.status)) return response;
        const location = response.headers.get('location');
        if (!location) throw new Error('Model download redirect omitted Location header');
        current = new URL(location, current).toString();
    }
    throw new Error('Model download exceeded redirect limit');
}

async function verifyArtifact(filePath, expected) {
    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (!stat?.isFile() || stat.size !== expected.size) return false;
    return await checksumFile(filePath) === expected.sha256;
}

async function downloadArtifact(manifest, artifact, root, fetchImpl = fetchWithApprovedRedirects) {
    const target = safeArtifactPath(root, artifact.path);
    if (await verifyArtifact(target, artifact)) return target;
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const partial = `${target}.part`;
    await fs.promises.rm(partial, { force: true });
    const encodedPath = artifact.path.split('/').map(encodeURIComponent).join('/');
    const url = `https://huggingface.co/${manifest.id}/resolve/${manifest.revision}/${encodedPath}`;
    const response = await fetchImpl(url, {
        headers: { 'Accept-Encoding': 'identity' },
        signal: AbortSignal.timeout(10 * 60_000)
    });
    if (!response.ok || !response.body) throw new Error(`Model download failed for ${artifact.path}: HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get('content-length'));
    const contentEncoding = response.headers.get('content-encoding');
    if ((!contentEncoding || contentEncoding === 'identity') && Number.isFinite(declaredLength) && declaredLength !== artifact.size) {
        throw new Error(`Model artifact size header mismatch for ${artifact.path}`);
    }
    const hash = crypto.createHash('sha256');
    let received = 0;
    const verifier = new (require('stream').Transform)({
        transform(chunk, _encoding, callback) {
            received += chunk.length;
            hash.update(chunk);
            callback(null, chunk);
        }
    });
    try {
        await pipeline(Readable.fromWeb(response.body), verifier, fs.createWriteStream(partial, { flags: 'wx', mode: 0o600 }));
        const digest = hash.digest('hex');
        if (received !== artifact.size || digest !== artifact.sha256) {
            throw new Error(`Model artifact checksum mismatch for ${artifact.path} (received ${received} bytes, sha256 ${digest})`);
        }
        await fs.promises.rename(partial, target);
        return target;
    } catch (error) {
        await fs.promises.rm(partial, { force: true }).catch(() => undefined);
        throw error;
    }
}

async function listFiles(root, current = root) {
    const entries = await fs.promises.readdir(current, { withFileTypes: true }).catch(() => []);
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) files.push(...await listFiles(root, fullPath));
        else files.push(path.relative(root, fullPath));
    }
    return files.sort();
}

async function verifyArtifactDirectory(tier, root, { rejectUnlisted = true, manifest: manifestOverride } = {}) {
    const manifest = manifestOverride || MODEL_MANIFESTS[tier];
    if (!manifest) throw new Error(`Unknown CAPTCHA model tier: ${tier}`);
    for (const artifact of manifest.files) {
        if (!await verifyArtifact(safeArtifactPath(root, artifact.path), artifact)) return false;
    }
    if (rejectUnlisted) {
        const allowed = new Set(manifest.files.map((artifact) => artifact.path));
        const actual = await listFiles(root);
        const unexpected = actual.filter((file) => !allowed.has(file));
        if (unexpected.length) throw new Error(`Unlisted CAPTCHA model artifact: ${unexpected[0]}`);
    }
    return true;
}

async function downloadModelArtifacts(tier, root, options = {}) {
    const manifest = options.manifest || MODEL_MANIFESTS[tier];
    if (!manifest) throw new Error(`Unknown CAPTCHA model tier: ${tier}`);
    await fs.promises.mkdir(root, { recursive: true });
    const maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
    for (const artifact of manifest.files) {
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                await downloadArtifact(manifest, artifact, root, options.fetchImpl);
                lastError = null;
                break;
            } catch (error) {
                lastError = error;
                if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
            }
        }
        if (lastError) throw lastError;
    }
    if (!await verifyArtifactDirectory(tier, root, { manifest })) throw new Error(`CAPTCHA model verification failed for ${tier}`);
    return manifest;
}

module.exports = {
    APPROVED_DOWNLOAD_HOSTS,
    isApprovedDownloadUrl,
    safeArtifactPath,
    checksumFile,
    fetchWithApprovedRedirects,
    verifyArtifact,
    verifyArtifactDirectory,
    downloadArtifact,
    downloadModelArtifacts
};
