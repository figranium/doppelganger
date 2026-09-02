let stopChecker = null;
let stopCleaner = null;
const activeRuns = new Map();

const setStopChecker = (checker) => {
    stopChecker = typeof checker === 'function' ? checker : null;
};

const setStopCleaner = (cleaner) => {
    stopCleaner = typeof cleaner === 'function' ? cleaner : null;
};

const scheduleForceStopTimer = (runId, runInfo) => {
    if (!runInfo || runInfo.timer) return;
    runInfo.timer = setTimeout(() => {
        const currentRun = activeRuns.get(runId);
        if (currentRun && typeof currentRun.forceStop === 'function') {
            try {
                currentRun.forceStop();
            } catch (err) {
                // Ignore errors during forceStop
            }
        }
    }, 3000);
};

const registerActiveRun = (runId, options = {}) => {
    if (!runId) return;
    const cleanRunId = String(runId);
    const existing = activeRuns.get(cleanRunId);
    if (existing?.timer) {
        clearTimeout(existing.timer);
    }

    const runInfo = {
        forceStop: typeof options.forceStop === 'function' ? options.forceStop : null,
        timer: null
    };
    activeRuns.set(cleanRunId, runInfo);

    if (consumeStopRequest(cleanRunId)) {
        scheduleForceStopTimer(cleanRunId, runInfo);
    }
};

const unregisterActiveRun = (runId) => {
    if (!runId) return;
    const cleanRunId = String(runId);
    const runInfo = activeRuns.get(cleanRunId);
    if (runInfo?.timer) {
        clearTimeout(runInfo.timer);
    }
    activeRuns.delete(cleanRunId);
};

const requestStop = (runId) => {
    if (!runId) return;
    const cleanRunId = String(runId);
    if (stopChecker && typeof stopChecker.add === 'function') {
        stopChecker.add(cleanRunId);
    }
    const runInfo = activeRuns.get(cleanRunId);
    if (runInfo) {
        scheduleForceStopTimer(cleanRunId, runInfo);
    }
};

const consumeStopRequest = (runId) => {
    if (!runId || !stopChecker) return false;
    try {
        if (typeof stopChecker === 'function') {
            return Boolean(stopChecker(runId));
        }
        if (typeof stopChecker.has === 'function') {
            return Boolean(stopChecker.has(runId));
        }
        return false;
    } catch {
        return false;
    }
};

const clearStopRequest = (runId) => {
    if (!runId || !stopCleaner) return;
    try {
        stopCleaner(runId);
    } catch {
        // Cancellation cleanup must not change the task result.
    }
};

module.exports = {
    setStopChecker,
    setStopCleaner,
    consumeStopRequest,
    clearStopRequest,
    registerActiveRun,
    unregisterActiveRun,
    requestStop
};
