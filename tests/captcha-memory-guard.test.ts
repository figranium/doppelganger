import assert from 'assert';
import { MemoryGuard, getEffectiveMemoryMb, cgroupReader, osMemoryReader } from '../src/agent/figranite/captcha/memoryGuard';
import { MemoryRevokedError } from '../src/agent/figranite/captcha/types';

const MB = 1024 * 1024;
const originalTotalmem = osMemoryReader.totalmem;
const originalReadFileSync = cgroupReader.readFileSync;

function mockTotalMemMb(mb: number) {
    osMemoryReader.totalmem = () => mb * MB;
}

function mockNoCgroup() {
    cgroupReader.readFileSync = () => {
        throw new Error('ENOENT');
    };
}

function restore() {
    osMemoryReader.totalmem = originalTotalmem;
    cgroupReader.readFileSync = originalReadFileSync;
}

async function testLowMemoryRejection() {
    for (const mb of [1024, 2047]) {
        mockNoCgroup();
        mockTotalMemMb(mb);

        const guard = new MemoryGuard();
        assert.strictEqual(guard.isRevoked, true, `Expected isRevoked=true at ${mb}MB`);
        assert.throws(
            () => guard.assertAllowed(),
            MemoryRevokedError,
            `Expected MemoryRevokedError to throw at ${mb}MB`
        );
    }
    console.log('PASS: low-memory rejection (1024MB, 2047MB)');
}

async function testEligibleSystemPass() {
    for (const mb of [2048, 4096, 8192]) {
        mockNoCgroup();
        mockTotalMemMb(mb);

        const guard = new MemoryGuard();
        assert.strictEqual(guard.isRevoked, false, `Expected isRevoked=false at ${mb}MB`);
        assert.doesNotThrow(() => guard.assertAllowed(), `Expected no throw at ${mb}MB`);
    }
    console.log('PASS: eligible system pass (2048MB, 4096MB, 8192MB)');
}

async function testCgroupV2LimitRespected() {
    mockTotalMemMb(8192);
    cgroupReader.readFileSync = (p: string) => {
        if (p === '/sys/fs/cgroup/memory.max') return String(1024 * MB);
        throw new Error('ENOENT');
    };

    const { mb, source } = getEffectiveMemoryMb();
    assert.strictEqual(source, 'cgroup-v2');
    assert.ok(mb < 2048, 'cgroup limit below OS total should be used and trigger revocation');

    const guard = new MemoryGuard();
    assert.strictEqual(guard.isRevoked, true, 'cgroup-constrained container should be revoked');
    console.log('PASS: cgroup v2 limit is honored over OS total memory');
}

async function testCgroupUnconstrainedFallsBackToOs() {
    mockTotalMemMb(4096);
    cgroupReader.readFileSync = (p: string) => {
        if (p === '/sys/fs/cgroup/memory.max') return 'max';
        throw new Error('ENOENT');
    };

    const { mb, source } = getEffectiveMemoryMb();
    assert.strictEqual(source, 'os');
    assert.strictEqual(Math.round(mb), 4096);
    console.log('PASS: unconstrained cgroup (max) falls back to OS total memory');
}

async function main() {
    try {
        await testLowMemoryRejection();
        await testEligibleSystemPass();
        await testCgroupV2LimitRespected();
        await testCgroupUnconstrainedFallsBackToOs();
        console.log('All memory guard tests passed.');
        process.exitCode = 0;
    } catch (err) {
        console.error(err);
        process.exitCode = 1;
    } finally {
        restore();
    }
}

main();
