const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    isApprovedDownloadUrl,
    safeArtifactPath,
    fetchWithApprovedRedirects,
    downloadModelArtifacts,
    verifyArtifactDirectory
} = require('../src/agent/figranite/captcha-model-downloader');
const { MODEL_MANIFESTS, APPLE_MLX_MANIFEST } = require('../src/agent/figranite/captcha-model-manifest');

const payload = Buffer.from('pinned-captcha-artifact');
const manifest = {
    id: 'approved/model',
    revision: '0123456789abcdef',
    files: [{ path: 'onnx/model.onnx', size: payload.length, sha256: crypto.createHash('sha256').update(payload).digest('hex') }]
};

function response(body) {
    return new Response(body, { status: 200, headers: { 'content-length': String(body.length) } });
}

async function main() {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'figranium-captcha-artifacts-'));
    assert(isApprovedDownloadUrl('https://huggingface.co/example/model'));
    assert(isApprovedDownloadUrl('https://cas-bridge.xethub.hf.co/blob'));
    assert(!isApprovedDownloadUrl('https://huggingface.co.evil.test/model'));
    assert.throws(() => safeArtifactPath(root, '../escape'), /Unsafe/);
    for (const model of [...Object.values(MODEL_MANIFESTS), APPLE_MLX_MANIFEST]) {
        for (const artifact of model.files) assert.match(artifact.sha256, /^[a-f0-9]{64}$/, `${model.id}/${artifact.path}`);
    }
    const previousFetch = global.fetch;
    try {
        global.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://evil.test/model' } });
        await assert.rejects(() => fetchWithApprovedRedirects('https://huggingface.co/approved/model'), /unapproved host/);
    } finally {
        global.fetch = previousFetch;
    }

    const tampered = Buffer.from(payload);
    tampered[0] ^= 0xff;
    await assert.rejects(() => downloadModelArtifacts('test', root, {
        manifest,
        fetchImpl: async () => response(tampered)
    }), /checksum mismatch/);
    assert.strictEqual(await fs.promises.access(path.join(root, 'onnx/model.onnx.part')).then(() => true).catch(() => false), false);

    await downloadModelArtifacts('test', root, { manifest, fetchImpl: async () => response(payload) });
    assert.strictEqual(await verifyArtifactDirectory('test', root, { manifest }), true);
    await fs.promises.writeFile(path.join(root, 'unlisted.bin'), 'no');
    await assert.rejects(() => verifyArtifactDirectory('test', root, { manifest }), /Unlisted/);
    await fs.promises.rm(root, { recursive: true, force: true });
    console.log('All CAPTCHA artifact-verification tests passed!');
}

main().catch((error) => { console.error(error); process.exit(1); });
