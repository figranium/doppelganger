#!/usr/bin/env node
const fs = require('fs');
const { captchaModelManager, getMemorySnapshot } = require('../src/agent/figranite/captcha-model-manager');

function currentUse() {
    for (const file of ['/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory/memory.usage_in_bytes']) {
        try { return Number(fs.readFileSync(file, 'utf8').trim()); } catch { /* unsupported cgroup layout */ }
    }
    return process.memoryUsage().rss;
}

async function main() {
    let peakBytes = currentUse();
    const sampler = setInterval(() => { peakBytes = Math.max(peakBytes, currentUse()); }, 25);
    try {
        await captchaModelManager.start();
        const status = captchaModelManager.status();
        const expected = process.env.CAPTCHA_ACCEPT_EXPECTED_TIER || '';
        if ((status.activeTier || '') !== expected) throw new Error(`Expected tier ${expected || 'none'}, got ${status.activeTier || 'none'}: ${status.error || ''}`);
        console.log(JSON.stringify({ status, memory: getMemorySnapshot(), peakBytes }));
    } finally {
        clearInterval(sampler);
        await captchaModelManager.stop();
    }
}

main().catch((error) => { console.error(error); process.exit(1); });
