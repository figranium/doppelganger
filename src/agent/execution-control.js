let stopChecker = null;
let stopCleaner = null;

const setStopChecker = (checker) => {
    stopChecker = typeof checker === 'function' ? checker : null;
};

const setStopCleaner = (cleaner) => {
    stopCleaner = typeof cleaner === 'function' ? cleaner : null;
};

const consumeStopRequest = (runId) => {
    if (!runId || !stopChecker) return false;
    try {
        return Boolean(stopChecker(runId));
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

module.exports = { setStopChecker, setStopCleaner, consumeStopRequest, clearStopRequest };
