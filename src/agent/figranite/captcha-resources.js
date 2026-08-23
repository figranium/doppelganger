const os = require('os');
const fs = require('fs');
const { execFile, execFileSync } = require('child_process');
const { promisify } = require('util');
const { probeCompanion } = require('./captcha-companion-client');

const execFileAsync = promisify(execFile);

function readNumericFile(filePath, readFile = fs.readFileSync) {
    try {
        const raw = readFile(filePath, 'utf8').trim();
        if (!raw || raw === 'max') return null;
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : null;
    } catch {
        return null;
    }
}

function parseMacAvailableMemory(vmStatOutput) {
    const text = String(vmStatOutput || '');
    const pageSize = Number(text.match(/page size of\s+(\d+)\s+bytes/i)?.[1]);
    if (!Number.isFinite(pageSize) || pageSize <= 0) return null;
    const pages = { free: 0, inactive: 0, speculative: 0 };
    for (const match of text.matchAll(/Pages\s+(free|inactive|speculative):\s*(\d+)\.?/gi)) {
        pages[match[1].toLowerCase()] = Number(match[2]);
    }
    const availablePages = pages.free + pages.inactive + pages.speculative;
    return availablePages > 0 ? availablePages * pageSize : null;
}

function readMacAvailableMemory(runVmStat = () => execFileSync('vm_stat', { encoding: 'utf8', timeout: 1500, maxBuffer: 64 * 1024 })) {
    try {
        return parseMacAvailableMemory(runVmStat());
    } catch {
        return null;
    }
}

function getMemorySnapshot(overrides = {}) {
    const readFile = overrides.readFile || fs.readFileSync;
    const platform = overrides.platform || process.platform;
    const hostTotalBytes = overrides.hostTotalBytes ?? os.totalmem();
    const macAvailableBytes = overrides.macAvailableBytes
        ?? (platform === 'darwin' ? readMacAvailableMemory(overrides.runVmStat) : null);
    const hostAvailableBytes = overrides.hostAvailableBytes
        ?? macAvailableBytes
        ?? os.freemem();
    const cgroupLimitBytes = overrides.cgroupLimitBytes
        ?? readNumericFile('/sys/fs/cgroup/memory.max', readFile)
        ?? readNumericFile('/sys/fs/cgroup/memory/memory.limit_in_bytes', readFile);
    const cgroupUsedBytes = overrides.cgroupUsedBytes
        ?? readNumericFile('/sys/fs/cgroup/memory.current', readFile)
        ?? readNumericFile('/sys/fs/cgroup/memory/memory.usage_in_bytes', readFile);
    const effectiveTotalBytes = cgroupLimitBytes && cgroupLimitBytes < hostTotalBytes ? cgroupLimitBytes : hostTotalBytes;
    const cgroupAvailableBytes = cgroupLimitBytes && cgroupUsedBytes !== null ? Math.max(0, cgroupLimitBytes - cgroupUsedBytes) : null;
    const effectiveAvailableBytes = cgroupAvailableBytes === null ? hostAvailableBytes : Math.min(hostAvailableBytes, cgroupAvailableBytes);
    return {
        totalMb: effectiveTotalBytes / (1024 * 1024),
        availableMb: effectiveAvailableBytes / (1024 * 1024),
        cgroupLimitMb: cgroupLimitBytes ? cgroupLimitBytes / (1024 * 1024) : null,
        swapQualified: false
    };
}

async function probeNvidia() {
    try {
        const { stdout } = await execFileAsync('nvidia-smi', [
            '--query-gpu=memory.total,memory.free',
            '--format=csv,noheader,nounits'
        ], { timeout: 1500, maxBuffer: 64 * 1024 });
        const devices = stdout.trim().split(/\r?\n/).map((line) => {
            const [totalMb, availableMb] = line.split(',').map((value) => Number(value.trim()));
            return { totalMb, availableMb };
        }).filter((item) => Number.isFinite(item.totalMb) && Number.isFinite(item.availableMb));
        if (!devices.length) return null;
        return devices.reduce((best, current) => current.availableMb > best.availableMb ? current : best);
    } catch {
        return null;
    }
}

async function probeOnnxBackends() {
    try {
        const ort = require('onnxruntime-node');
        const backends = await ort.listSupportedBackends();
        return backends.filter((item) => item.bundled).map((item) => item.name);
    } catch {
        return ['cpu'];
    }
}

async function getResourceSnapshot({ skipCompanion = false } = {}) {
    const memory = getMemorySnapshot();
    const [nvidia, backends, companion] = await Promise.all([
        probeNvidia(),
        probeOnnxBackends(),
        skipCompanion ? Promise.resolve(null) : probeCompanion()
    ]);
    const accelerators = [];
    if (nvidia) accelerators.push({ type: 'cuda', ...nvidia });
    if (globalThis.navigator?.gpu) {
        accelerators.push({ type: 'webgpu', totalMb: null, availableMb: null });
    }
    if (process.platform === 'darwin' && backends.includes('coreml')) {
        accelerators.push({ type: 'coreml', totalMb: memory.totalMb, availableMb: memory.availableMb });
    }
    if (companion) {
        accelerators.push({
            type: 'companion',
            totalMb: companion.memory.totalMb,
            availableMb: companion.memory.availableMb,
            backend: companion.backend,
            activeTier: companion.activeTier || null
        });
    }
    return { memory, accelerators, onnxBackends: backends, companion };
}

module.exports = {
    readNumericFile,
    parseMacAvailableMemory,
    readMacAvailableMemory,
    getMemorySnapshot,
    probeNvidia,
    probeOnnxBackends,
    getResourceSnapshot
};
