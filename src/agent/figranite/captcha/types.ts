/**
 * Shared type contracts for the CAPTCHA/form detection and human-handoff module.
 * This module intentionally contains no solving logic — detection + handoff only.
 */

export type CaptchaCategory =
    | 'slider'
    | 'audio'
    | 'grid'
    | 'rotational'
    | 'distorted-text'
    | 'widget-frame'
    | 'form'
    | 'unknown';

export interface ElementCoordinates {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface DetectionResult {
    category: CaptchaCategory;
    selector: string;
    frameUrl: string | null;
    inShadowDom: boolean;
    coordinates: ElementCoordinates;
    signature: string;
    detectedAt: number;
}

export interface CaptchaTask {
    id: string;
    detection: DetectionResult;
    pageUrl: string;
    status: 'pending' | 'awaiting_human' | 'awaiting_solution' | 'resolved' | 'failed';
    createdAt: number;
}

export interface SolutionToken {
    taskId: string;
    value: string;
    coordinates?: { x: number; y: number }[];
    provider?: string;
}

/**
 * External integration point. Figranium never implements a solver itself;
 * this interface exists so a caller can plug in a human operator, a
 * third-party solving service, or a manual override, without the
 * detection/handoff module needing to know which.
 */
export interface SolverProvider {
    submitSolution(task: CaptchaTask, token: SolutionToken): Promise<void>;
}

export interface MemoryStatus {
    isRevoked: boolean;
    totalMemoryMb: number;
    source: 'os' | 'cgroup-v2' | 'cgroup-v1';
    checkedAt: number;
}

export class MemoryRevokedError extends Error {
    constructor(message = 'CAPTCHA execution disabled: requires at least 2 GB RAM') {
        super(message);
        this.name = 'MemoryRevokedError';
    }
}
