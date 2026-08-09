import * as fs from 'fs';
import * as os from 'os';
import type { MemoryStatus } from './types';
import { MemoryRevokedError } from './types';

const MIN_REQUIRED_MB = 2048;
const CGROUP_V2_PATH = '/sys/fs/cgroup/memory.max';
const CGROUP_V1_PATH = '/sys/fs/cgroup/memory/memory.limit_in_bytes';

/**
 * Indirection points so tests can stub OS/cgroup reads without patching
 * non-configurable properties on the built-in `os`/`fs` module objects.
 */
export const cgroupReader = {
    readFileSync: (path: string): string => fs.readFileSync(path, 'utf8'),
};

export const osMemoryReader = {
    totalmem: (): number => os.totalmem(),
};

function readCgroupLimit(): { bytes: number; source: MemoryStatus['source'] } | null {
    const paths: [string, MemoryStatus['source']][] = [
        [CGROUP_V2_PATH, 'cgroup-v2'],
        [CGROUP_V1_PATH, 'cgroup-v1'],
    ];
    for (const [cgroupPath, source] of paths) {
        try {
            const raw = cgroupReader.readFileSync(cgroupPath).trim();
            if (raw === 'max') continue; // v2 "max" means unconstrained
            const value = Number(raw);
            if (Number.isFinite(value) && value > 0) {
                return { bytes: value, source };
            }
        } catch {
            // File not present or unreadable on this platform/container — try next path.
        }
    }
    return null;
}

/**
 * Determines the effective memory ceiling: the smaller of OS total memory
 * and any active cgroup limit (containers are often capped below host RAM).
 */
export function getEffectiveMemoryMb(): { mb: number; source: MemoryStatus['source'] } {
    const totalOsBytes = osMemoryReader.totalmem();
    const cgroupResult = readCgroupLimit();

    if (cgroupResult !== null && cgroupResult.bytes < totalOsBytes) {
        return { mb: cgroupResult.bytes / (1024 * 1024), source: cgroupResult.source };
    }

    return { mb: totalOsBytes / (1024 * 1024), source: 'os' };
}

export class MemoryGuard {
    private status: MemoryStatus;

    constructor() {
        this.status = this.evaluate();
    }

    private evaluate(): MemoryStatus {
        const { mb, source } = getEffectiveMemoryMb();
        return {
            isRevoked: mb < MIN_REQUIRED_MB,
            totalMemoryMb: mb,
            source,
            checkedAt: Date.now(),
        };
    }

    /** Re-checks memory (useful in tests or long-lived processes where limits can change). */
    refresh(): MemoryStatus {
        this.status = this.evaluate();
        return this.status;
    }

    get isRevoked(): boolean {
        return this.status.isRevoked;
    }

    getStatus(): MemoryStatus {
        return this.status;
    }

    /** Throws MemoryRevokedError if the memory gate is closed. Call before any detection/handoff work. */
    assertAllowed(): void {
        if (this.status.isRevoked) {
            throw new MemoryRevokedError();
        }
    }
}
