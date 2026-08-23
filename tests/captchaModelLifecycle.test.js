const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CaptchaModelManager } = require('../src/agent/figranite/captcha-model-manager');

const resources = (totalMb, availableMb) => ({ memory: { totalMb, availableMb }, accelerators: [], onnxBackends: ['cpu'] });

async function exists(target) {
    return fs.promises.access(target).then(() => true).catch(() => false);
}

async function main() {
    const previousSkip = process.env.SKIP_LOCAL_CAPTCHA_MODEL;
    const previousTier = process.env.CAPTCHA_MODEL_TIER;
    process.env.SKIP_LOCAL_CAPTCHA_MODEL = 'false';
    process.env.CAPTCHA_MODEL_TIER = 'auto';
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'figranium-model-manager-'));
    await fs.promises.mkdir(path.join(root, '.staging-interrupted'));
    let snapshot = resources(4096, 2048);
    const downloads = [];
    const disposed = [];
    let failFlorenceProbe = false;
    const manager = new CaptchaModelManager({
        modelRoot: root,
        resourceProvider: async () => snapshot,
        downloader: async (tier, target) => {
            downloads.push(tier);
            await fs.promises.writeFile(path.join(target, 'verified.marker'), tier);
        },
        verifier: async (tier, target) => (await fs.promises.readFile(path.join(target, 'verified.marker'), 'utf8').catch(() => '')) === tier,
        runtimeLoader: async (tier) => ({
            probe: async () => { if (tier === 'florence2' && failFlorenceProbe) throw new Error('probe failed'); },
            detect: async () => [],
            dispose: async () => { disposed.push(tier); }
        })
    });
    await manager.start();
    assert.strictEqual(manager.status().activeTier, 'owlvit');
    assert.strictEqual(await exists(path.join(root, '.staging-interrupted')), false);

    snapshot = resources(16384, 8192);
    failFlorenceProbe = true;
    await assert.rejects(() => manager.reconcile(), /probe failed/);
    assert.strictEqual(manager.status().activeTier, 'owlvit', 'failed probe must not replace active runtime');
    assert.strictEqual(await exists(path.join(root, 'florence2')), false, 'failed replacement weights must be removed');

    failFlorenceProbe = false;
    await manager.reconcile();
    assert.strictEqual(manager.status().activeTier, 'florence2');
    assert.strictEqual(await exists(path.join(root, 'owlvit')), false);
    assert(disposed.includes('owlvit'));

    snapshot = resources(4096, 2048);
    await manager.reconcile();
    assert.strictEqual(manager.status().activeTier, 'owlvit');
    assert.strictEqual(await exists(path.join(root, 'florence2')), false);

    snapshot = resources(1024, 800);
    await manager.reconcile();
    assert.strictEqual(manager.status().healthy, false);

    await manager.stop();
    await fs.promises.rm(root, { recursive: true, force: true });

    const enospcRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'figranium-model-enospc-'));
    snapshot = resources(4096, 2048);
    let florenceAttempts = 0;
    const enospcManager = new CaptchaModelManager({
        modelRoot: enospcRoot,
        resourceProvider: async () => snapshot,
        downloader: async (tier, target) => {
            if (tier === 'florence2' && florenceAttempts++ === 0) throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
            await fs.promises.writeFile(path.join(target, 'verified.marker'), tier);
        },
        verifier: async (tier, target) => (await fs.promises.readFile(path.join(target, 'verified.marker'), 'utf8').catch(() => '')) === tier,
        runtimeLoader: async () => ({ probe: async () => undefined, detect: async () => [], dispose: async () => undefined })
    });
    await enospcManager.start();
    snapshot = resources(16384, 8192);
    await enospcManager.reconcile();
    assert.strictEqual(florenceAttempts, 2, 'ENOSPC replacement must retry only after releasing the old tier');
    assert.strictEqual(enospcManager.status().activeTier, 'florence2');
    assert.strictEqual(await exists(path.join(enospcRoot, 'owlvit')), false);
    await enospcManager.stop();
    await fs.promises.rm(enospcRoot, { recursive: true, force: true });

    const oomRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'figranium-model-oom-'));
    let runtimeLoads = 0;
    const oomManager = new CaptchaModelManager({
        modelRoot: oomRoot,
        resourceProvider: async () => resources(4096, 2048),
        downloader: async (tier, target) => fs.promises.writeFile(path.join(target, 'verified.marker'), tier),
        verifier: async (tier, target) => (await fs.promises.readFile(path.join(target, 'verified.marker'), 'utf8').catch(() => '')) === tier,
        runtimeLoader: async () => {
            runtimeLoads += 1;
            const shouldFail = runtimeLoads === 1;
            return {
                probe: async () => undefined,
                detect: async () => { if (shouldFail) throw new Error('ONNX out of memory'); return []; },
                dispose: async () => undefined
            };
        }
    });
    await oomManager.start();
    await assert.rejects(() => oomManager.detect(Buffer.from('x'), 'bus'), /out of memory/);
    for (let index = 0; index < 20 && runtimeLoads < 2; index += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert(runtimeLoads >= 2, 'OOM should trigger immediate reconciliation and runtime replacement');
    await oomManager.stop();
    await fs.promises.rm(oomRoot, { recursive: true, force: true });

    let probes = 0;
    process.env.SKIP_LOCAL_CAPTCHA_MODEL = 'true';
    const skipped = new CaptchaModelManager({ resourceProvider: async () => { probes += 1; return resources(65536, 65536); } });
    await skipped.start();
    assert.strictEqual(probes, 0, 'skip must prevent every resource probe');

    if (previousSkip === undefined) delete process.env.SKIP_LOCAL_CAPTCHA_MODEL; else process.env.SKIP_LOCAL_CAPTCHA_MODEL = previousSkip;
    if (previousTier === undefined) delete process.env.CAPTCHA_MODEL_TIER; else process.env.CAPTCHA_MODEL_TIER = previousTier;
    assert(downloads.filter((tier) => tier === 'florence2').length >= 2);
    console.log('All CAPTCHA model lifecycle tests passed!');
}

main().catch((error) => { console.error(error); process.exit(1); });
