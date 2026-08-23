const assert = require('assert');
const { getMemorySnapshot, readNumericFile, parseMacAvailableMemory } = require('../src/agent/figranite/captcha-resources');
const { selectModelTier, selectModelBackend } = require('../src/agent/figranite/captcha-model-manager');

const mib = 1024 * 1024;

function main() {
    assert.strictEqual(readNumericFile('/unused', () => 'max'), null);
    assert.strictEqual(readNumericFile('/unused', () => String(2048 * mib)), 2048 * mib);
    const cgroup = getMemorySnapshot({
        hostTotalBytes: 16 * 1024 * mib,
        hostAvailableBytes: 8 * 1024 * mib,
        cgroupLimitBytes: 4 * 1024 * mib,
        cgroupUsedBytes: 3500 * mib
    });
    assert.strictEqual(cgroup.totalMb, 4096);
    assert.strictEqual(cgroup.availableMb, 596);
    assert.strictEqual(cgroup.swapQualified, false);
    assert.strictEqual(selectModelTier(cgroup, {}), 'owlvit');
    const v1Files = new Map([
        ['/sys/fs/cgroup/memory/memory.limit_in_bytes', String(2 * 1024 * mib)],
        ['/sys/fs/cgroup/memory/memory.usage_in_bytes', String(1024 * mib)]
    ]);
    const v1 = getMemorySnapshot({
        hostTotalBytes: 16 * 1024 * mib, hostAvailableBytes: 8 * 1024 * mib,
        readFile: (file) => { if (!v1Files.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return v1Files.get(file); }
    });
    assert.strictEqual(v1.cgroupLimitMb, 2048);
    assert.strictEqual(v1.availableMb, 1024);

    const macVmStat = `Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:                                     3906.\nPages inactive:                                70688.\nPages speculative:                              4386.\nPages stored in compressor:                   428961.`;
    const macAvailableBytes = parseMacAvailableMemory(macVmStat);
    assert.strictEqual(macAvailableBytes, (3906 + 70688 + 4386) * 16384);
    const mac = getMemorySnapshot({
        platform: 'darwin',
        hostTotalBytes: 8 * 1024 * mib,
        runVmStat: () => macVmStat
    });
    assert(mac.availableMb > 1024, 'macOS reclaimable pages should qualify a 2 GiB-capable host');
    assert.strictEqual(selectModelTier(mac, {}), 'owlvit');
    const pressuredMac = getMemorySnapshot({
        platform: 'darwin',
        hostTotalBytes: 8 * 1024 * mib,
        runVmStat: () => 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 100.\nPages inactive: 100.\nPages speculative: 100.'
    });
    assert(pressuredMac.availableMb < 512);
    assert.strictEqual(selectModelTier(pressuredMac, {}), null);

    const cuda = {
        memory: { totalMb: 4096, availableMb: 2048 },
        accelerators: [{ type: 'cuda', totalMb: 12288, availableMb: 9000 }],
        onnxBackends: ['cpu', 'cuda']
    };
    assert.strictEqual(selectModelTier(cuda, {}), 'florence2');
    assert.deepStrictEqual(selectModelBackend('florence2', cuda), { type: 'local', device: 'cuda' });

    const companion = {
        memory: { totalMb: 1024, availableMb: 300 },
        accelerators: [{ type: 'companion', totalMb: 16384, availableMb: 8000, backend: 'coreml' }],
        onnxBackends: ['cpu']
    };
    assert.strictEqual(selectModelTier(companion, {}), 'florence2');
    assert.deepStrictEqual(selectModelBackend('florence2', companion), { type: 'companion', device: 'coreml' });
    console.log('All CAPTCHA resource-detection tests passed!');
}

main();
