import type { CaptchaTask, DetectionResult, SolutionToken, SolverProvider } from './types';
import { MemoryGuard } from './memoryGuard';

/**
 * Shape of the existing project mouse trajectory generator
 * (src/agent/figranite/human-interaction.js: moveMouseHumanlike).
 * Declared structurally here since that file is plain CommonJS JS.
 */
export interface MouseTrajectoryDispatcher {
    (page: unknown, targetX: number, targetY: number, options?: Record<string, unknown>): Promise<void>;
}

export type CaptchaDetectedHandler = (task: CaptchaTask) => void | Promise<void>;
export type PauseForHumanHandler = (task: CaptchaTask) => void | Promise<void>;

/**
 * Coordinates detection events with human/external handoff. Deliberately
 * contains no automated solving: `onCaptchaDetected` and `pauseForHuman`
 * are stubs the host application wires up (UI banner, Slack ping, manual
 * queue, etc.), and `submitSolution` only accepts a solution that already
 * exists — produced by a human or an external SolverProvider — never one
 * computed here.
 */
export class CaptchaHandoffCoordinator {
    private readonly memoryGuard: MemoryGuard;
    private readonly tasks: Map<string, CaptchaTask> = new Map();
    private readonly mouseDispatcher: MouseTrajectoryDispatcher | null;
    private readonly solverProvider: SolverProvider | null;

    private onCaptchaDetectedHandler: CaptchaDetectedHandler | null = null;
    private pauseForHumanHandler: PauseForHumanHandler | null = null;

    constructor(options: {
        memoryGuard?: MemoryGuard;
        mouseDispatcher?: MouseTrajectoryDispatcher;
        solverProvider?: SolverProvider;
    } = {}) {
        this.memoryGuard = options.memoryGuard ?? new MemoryGuard();
        this.mouseDispatcher = options.mouseDispatcher ?? null;
        this.solverProvider = options.solverProvider ?? null;
    }

    onCaptchaDetected(handler: CaptchaDetectedHandler): void {
        this.onCaptchaDetectedHandler = handler;
    }

    onPauseForHuman(handler: PauseForHumanHandler): void {
        this.pauseForHumanHandler = handler;
    }

    /** Registers a detected element as a CaptchaTask and fires the detection hook. */
    async handleDetection(detection: DetectionResult, pageUrl: string): Promise<CaptchaTask> {
        this.memoryGuard.assertAllowed();

        const task: CaptchaTask = {
            id: `captcha_${detection.detectedAt}_${Math.random().toString(36).slice(2, 8)}`,
            detection,
            pageUrl,
            status: 'pending',
            createdAt: Date.now(),
        };
        this.tasks.set(task.id, task);

        if (this.onCaptchaDetectedHandler) {
            await this.onCaptchaDetectedHandler(task);
        }

        return task;
    }

    /** Marks a task as awaiting a human operator and invokes the pause hook. */
    async pauseForHuman(taskId: string): Promise<void> {
        const task = this.requireTask(taskId);
        task.status = 'awaiting_human';
        if (this.pauseForHumanHandler) {
            await this.pauseForHumanHandler(task);
        } else {
            task.status = 'awaiting_solution';
        }
    }

    /**
     * Accepts an externally-produced solution (human input or a
     * SolverProvider integration) and, if it includes target coordinates,
     * dispatches the cursor there via the project's existing human-like
     * mouse trajectory generator. This module never computes the token
     * or coordinates itself.
     */
    async submitSolution(taskId: string, token: SolutionToken, page?: unknown): Promise<void> {
        const task = this.requireTask(taskId);

        if (this.solverProvider) {
            await this.solverProvider.submitSolution(task, token);
        }

        if (token.coordinates?.length && page && this.mouseDispatcher) {
            for (const point of token.coordinates) {
                await this.mouseDispatcher(page, point.x, point.y, { cursorGlide: true });
            }
        }

        task.status = 'resolved';
    }

    getTask(taskId: string): CaptchaTask | undefined {
        return this.tasks.get(taskId);
    }

    private requireTask(taskId: string): CaptchaTask {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Unknown CaptchaTask id: ${taskId}`);
        }
        return task;
    }
}
