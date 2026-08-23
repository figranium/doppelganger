const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

if (process.env.RUN_CAPTCHA_LIVE_TESTS !== '1') {
    console.log('Skipped live CAPTCHA model test (set RUN_CAPTCHA_LIVE_TESTS=1).');
    process.exit(0);
}

process.env.SKIP_LOCAL_CAPTCHA_MODEL = 'false';
process.env.CAPTCHA_MODEL_DEVICE = process.env.CAPTCHA_MODEL_DEVICE || 'cpu';
const { CaptchaModelManager, getMemorySnapshot, MODEL_MANIFESTS } = require('../src/agent/figranite/captcha-model-manager');

const probeImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAGUlEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAB4Gx4gAAE7Bq0AAAAASUVORK5CYII=', 'base64');

function currentCgroupUse() {
    for (const file of ['/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory/memory.usage_in_bytes']) {
        try { return Number(fs.readFileSync(file, 'utf8').trim()); } catch { /* native host */ }
    }
    return process.memoryUsage().rss;
}

async function runTier(tier) {
    const memory = getMemorySnapshot();
    const minimum = MODEL_MANIFESTS[tier].minimumTotalMb;
    assert(memory.totalMb >= minimum, `${tier} live test requires at least ${minimum} MiB effective memory`);
    process.env.CAPTCHA_MODEL_TIER = tier;
    const cache = await fs.promises.mkdtemp(path.join(os.tmpdir(), `figranium-live-${tier}-`));
    const manager = new CaptchaModelManager({ modelRoot: cache });
    let peakBytes = currentCgroupUse();
    const sampler = setInterval(() => { peakBytes = Math.max(peakBytes, currentCgroupUse()); }, 25);
    const started = Date.now();
    try {
        await manager.start();
        const probeMs = Date.now() - started;
        const inferenceStarted = Date.now();
        const detections = await manager.detect(probeImage, 'object', 0.99);
        const inferenceMs = Date.now() - inferenceStarted;
        assert(Array.isArray(detections));
        const status = manager.status();
        assert.strictEqual(status.activeTier, tier);
        const artifactBytes = MODEL_MANIFESTS[tier].files.reduce((sum, artifact) => sum + artifact.size, 0);
        const cgroupLimitBytes = memory.cgroupLimitMb ? memory.cgroupLimitMb * 1048576 : null;
        if (tier === 'owlvit' && cgroupLimitBytes) assert(peakBytes < cgroupLimitBytes * 0.9, `peak cgroup use ${peakBytes} exceeded 90%`);
        const report = { tier, backend: status.backend, device: status.device, artifactBytes, probeMs, inferenceMs, peakBytes, cgroupLimitBytes };
        console.log(JSON.stringify(report, null, 2));
    } finally {
        clearInterval(sampler);
        await manager.stop();
        await fs.promises.rm(cache, { recursive: true, force: true });
    }
}

runTier(process.env.RUN_CAPTCHA_FLORENCE_TESTS === '1' ? 'florence2' : 'owlvit')
    .catch((error) => { console.error(error); process.exit(1); });
