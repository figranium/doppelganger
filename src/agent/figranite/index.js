const fs = require('fs');
const path = require('path');
const { selectUserAgent } = require('../../../user-agent-settings');
const { safeFormatHTML } = require('../../../html-utils');
const { validateUrl } = require('../../../url-utils');
const { parseBooleanFlag, sanitizeRunId, toCsvString } = require('../../../common-utils');
const { runExtractionScript } = require('../sandbox');
const { cleanHtml } = require('../dom-utils');
const { launchBrowser, createBrowserContext } = require('../browser');
const cabinets = require('../../server/cabinets');

// New Modules
const { buildBlockMap, randomBetween, getForeachItems } = require('./helpers');
const { evalStructuredCondition, evalCondition } = require('./logic-handler');
const { executeAction } = require('./action-handler');
const { solveCaptcha } = require('./captcha-client');
const { resolveTaskOutcome, inspectPageForAntiBot } = require('../outcomes');
const { setStopChecker, setStopCleaner, consumeStopRequest, clearStopRequest, registerActiveRun, unregisterActiveRun } = require('../execution-control');

// Action types after which an auto-solve pass (task-level `autoSolveCaptcha`) checks for
// a challenge — the points where navigation or a form interaction commonly triggers one.
const AUTO_CAPTCHA_TRIGGER_TYPES = new Set(['navigate', 'goto', 'click', 'type', 'fill']);

async function maybeAutoSolveCaptcha({ enabled, actionType, page, logs, identity }) {
    if (!enabled || !AUTO_CAPTCHA_TRIGGER_TYPES.has(actionType)) return;
    try {
        const detectionTimeout = Math.max(1, Number(process.env.CAPTCHA_AUTO_DETECT_TIMEOUT_MS) || 5000);
        const result = await solveCaptcha(page, { timeout: 120000, detectionTimeout, logs, identity });
        logs.push(`Auto-solved captcha: ${result.challenge} (${result.duration}ms)`);
    } catch (err) {
        if (err && err.noChallengeFound) return;
        logs.push(`[CAPTCHA ERROR] Auto-solve attempt failed: ${err.message}`);
    }
}

let progressReporter = null;
const setProgressReporter = (reporter) => {
    progressReporter = reporter;
};

const reportProgress = (runId, payload) => {
    if (!runId || typeof progressReporter !== 'function') return;
    try {
        progressReporter(runId, payload);
    } catch {
        // ignore
    }
};

const TEST_INPUT_FIELDS = [
    'selector', 'value', 'key', 'conditionVar', 'conditionVarType', 'conditionOp',
    'conditionValue', 'typeMode', 'method', 'headers', 'body', 'timeout', 'captchaType',
    'cabinetId', 'markAsUploaded',
];

const buildResolvedActionInputs = (action, resolveTemplate) => {
    const inputs = {};
    for (const key of TEST_INPUT_FIELDS) {
        const value = action?.[key];
        if (value === undefined || value === null || value === '') continue;
        inputs[key] = typeof value === 'string' ? resolveTemplate(value) : value;
    }
    return inputs;
};

const snapshotTestVariables = (runtimeVars) => Object.fromEntries(
    Object.entries(runtimeVars || {}).filter(([name]) => name !== 'html')
);

const isStopRequested = (runId) => {
    return consumeStopRequest(runId);
};

class TaskInputError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TaskInputError';
        this.code = 'INVALID_TASK_INPUT';
        this.isTaskInputError = true;
    }
}

async function runFigranite(data, options = {}) {
    let { url, actions, wait: globalWait, rotateUserAgents, rotateProxies, humanTyping, stealth = {}, sessionId } = data;
    const autoSolveCaptcha = parseBooleanFlag(data.autoSolveCaptcha);

    const runtimeVars = { ...(data.taskVariables || data.variables || {}) };
    let lastBlockOutput = null;
    runtimeVars['block.output'] = lastBlockOutput;

    const setBlockOutput = (value) => {
        lastBlockOutput = value;
        runtimeVars['block.output'] = value;
    };

    const resolveTemplate = (input) => {
        if (typeof input !== 'string' || !input.includes('{$')) return input;
        return input.replace(/\{\$([\w.]+)\}/g, (_match, name) => {
            if (name === 'now') return new Date().toISOString();
            const value = runtimeVars[name];
            if (value === undefined || value === null) return '';
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                return String(value);
            }
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        });
    };

    if (!url || typeof url !== 'string') {
        throw new TaskInputError('URL is required.');
    }
    try {
        await validateUrl(resolveTemplate(url));
    } catch (error) {
        throw new TaskInputError(error.message || 'Invalid or restricted URL.');
    }

    const runId = data.runId ? String(data.runId) : null;
    const captureRunId = sanitizeRunId(runId) || `run_${Date.now()}_unknown`;
    const includeShadowDomRaw = data.includeShadowDom;
    const includeShadowDom = includeShadowDomRaw === undefined
        ? true
        : !(String(includeShadowDomRaw).toLowerCase() === 'false' || includeShadowDomRaw === false);
    const disableRecordingRaw = data.disableRecording;
    const disableRecording = parseBooleanFlag(disableRecordingRaw);
    const statelessExecutionRaw = data.statelessExecution;
    const statelessExecution = parseBooleanFlag(statelessExecutionRaw);
    const isTestMode = options.testMode === true;
    const testRunStartedAt = Date.now();
    const testTargetActionId = options.stopAfterActionId ? String(options.stopAfterActionId) : null;
    let testTargetStatus = 'not_reached';
    let testTargetOutput;
    let testTargetError;
    let testTargetInputs = {};
    let testTargetVariables = snapshotTestVariables(runtimeVars);
    let testTargetStartedAt = null;
    let testTargetDurationMs = 0;
    let stopAfterTargetReached = false;

    const reportActionProgress = (action, status, output, error) => {
        reportProgress(runId, { actionId: action.id, status });
        if (!testTargetActionId || String(action.id) !== testTargetActionId) return;

        if (!testTargetStartedAt) {
            testTargetStartedAt = Date.now();
            testTargetInputs = buildResolvedActionInputs(action, resolveTemplate);
        }

        if (status === 'running') return;
        testTargetStatus = status;
        testTargetOutput = output;
        testTargetError = error;
        testTargetVariables = snapshotTestVariables(runtimeVars);
        testTargetDurationMs = Date.now() - testTargetStartedAt;
        stopAfterTargetReached = true;
    };
    const {
        allowTypos = false,
        idleMovements = false,
        overscroll = false,
        deadClicks = false,
        fatigue = false,
        naturalTyping = false,
        cursorGlide = false,
        randomizeClicks = false
    } = stealth;

    if (typeof actions === 'string') {
        try {
            actions = JSON.parse(actions);
        } catch (e) {
            throw new TaskInputError('Invalid actions JSON format.');
        }
    }

    if (!actions || !Array.isArray(actions)) {
        throw new TaskInputError('Actions array is required.');
    }

    reportProgress(data.runId, { status: 'started' });

    const hasCaptchaSolver = autoSolveCaptcha || actions.some((action) => action?.type === 'solve_captcha');
    const hasCaptchaWait = actions.some((action) => action?.type === 'wait_captcha');

    const basePort = options.localPort || process.env.PORT || process.env.VITE_BACKEND_PORT || '11345';
    const protocol = options.protocol || 'http';
    const baseUrl = `${protocol}://127.0.0.1:${basePort}`;

    const resolveMaybe = (value) => {
        if (typeof value !== 'string') return value;
        return resolveTemplate(value);
    };

    let browser;
    let context;
    let page;
    const logs = [];
    let lastMainDocumentStatus = null;
    let isForceStopped = false;
    let stopRequested = false;
    let stopOutcome = 'success';
    let userStopped = false;

    const forceStop = async () => {
        isForceStopped = true;
        userStopped = true;
        stopRequested = true;
        logs.push('Execution force-stopped by user after 3s timeout.');
        try {
            if (page) await page.close().catch(() => {});
            if (context) await context.close().catch(() => {});
            if (browser) await browser.close().catch(() => {});
        } catch {
            // ignore
        }
    };

    if (runId) {
        registerActiveRun(runId, { forceStop });
    }

    try {
        const useRotateProxies = String(rotateProxies).toLowerCase() === 'true' || rotateProxies === true;
        const headless = options.headless !== undefined ? options.headless : true;
        const launchOptions = await launchBrowser({ rotateProxies: useRotateProxies, headless });

        const recordingsDir = path.join(__dirname, '../../data/recordings');
        await fs.promises.mkdir(recordingsDir, { recursive: true });

        const selectedUA = await selectUserAgent(rotateUserAgents);
        const rotateViewport = String(data.rotateViewport).toLowerCase() === 'true' || data.rotateViewport === true;

        context = await createBrowserContext(launchOptions, {
            userAgent: selectedUA,
            rotateViewport,
            statelessExecution,
            disableRecording,
            recordingsDir,
            includeShadowDom,
            sessionId,
            captchaInterceptionMode: hasCaptchaSolver ? 'solve' : (hasCaptchaWait ? 'observe' : null)
        });
        browser = context.browser();

        const downloads = [];
        const successfulUploads = new Map();
        const pendingDownloads = new Set();
        const newDownloadListeners = new Set();

        const setupPageDownload = (p) => {
            p.on('download', async (download) => {
                for (const listener of newDownloadListeners) listener();

                const originalName = download.suggestedFilename() || 'download';
                logs.push(`[DOWNLOAD] Intercepted: ${originalName}`);
                const promise = new Promise(async (resolve) => {
                    try {
                        const stored = await cabinets.saveDownload(data.downloadCabinetId, download, originalName, {
                            sourceTaskId: data.taskId || null,
                            sourceRunId: runId || null,
                            sourceUrl: download.url()
                        });
                        downloads.push({
                            name: originalName,
                            url: download.url(),
                            path: `/api/cabinets/${stored.cabinetId}/items/${stored.item.id}/download`,
                            cabinetId: stored.cabinetId,
                            itemId: stored.item.id,
                            kind: stored.item.kind
                        });
                        logs.push(`[DOWNLOAD] Saved locally: ${originalName}`);
                    } catch (e) {
                        logs.push(`[DOWNLOAD ERROR]: ${e.message}`);
                        console.error('Download failed:', e.message);
                    } finally {
                        resolve();
                    }
                });
                pendingDownloads.add(promise);
                promise.finally(() => pendingDownloads.delete(promise));
            });
        };
        context.on('page', setupPageDownload);
        context.pages().forEach(setupPageDownload);

        // Persistent context auto-creates a blank page; reuse it or open a new one
        const existingPages = context.pages();
        page = existingPages.length > 0 ? existingPages[0] : await context.newPage();
        page.on?.('response', (response) => {
            try {
                const request = response.request?.();
                const isDocument = request?.resourceType?.() === 'document';
                const isMainFrame = !response.frame || response.frame() === page.mainFrame?.();
                if (isDocument && isMainFrame) lastMainDocumentStatus = response.status?.() ?? lastMainDocumentStatus;
            } catch {
                // Response metadata is best-effort.
            }
        });

        const initialResponse = await page.goto(resolveTemplate(url), { waitUntil: 'domcontentloaded', timeout: 60000 });
        lastMainDocumentStatus = initialResponse?.status?.() ?? lastMainDocumentStatus;

        let actionIdx = 0;
        const baseDelay = (ms) => {
            const fatigueMultiplier = fatigue ? 1 + (actionIdx * 0.1) : 1;
            const microPause = fatigue && Math.random() < 0.08 ? randomBetween(120, 480) : 0;
            return ((ms + Math.random() * 140) * fatigueMultiplier) + microPause;
        };

        const { startToEnd, startToElse, elseToEnd, endToStart } = buildBlockMap(actions);
        const repeatState = new Map();
        const foreachState = new Map();
        let errorHandler = null;
        let inErrorHandler = false;

        const setLoopVars = (item, index, count) => {
            runtimeVars['loop.index'] = index;
            runtimeVars['loop.count'] = count;
            runtimeVars['loop.item'] = item;
            if (item && typeof item === 'object') {
                if ('text' in item) runtimeVars['loop.text'] = item.text;
                if ('html' in item) runtimeVars['loop.html'] = item.html;
            } else {
                runtimeVars['loop.text'] = item;
                runtimeVars['loop.html'] = '';
            }
        };

        const ensureCapturesDir = async () => {
            const capturesDir = path.join(__dirname, '../../public', 'captures');
            // ⚡ Bolt: Use non-blocking directory creation
            await fs.promises.mkdir(capturesDir, { recursive: true });
            return capturesDir;
        };

        const captureScreenshot = async (label) => {
            const capturesDir = await ensureCapturesDir();
            const safeLabel = label ? String(label).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) : '';
            const nameSuffix = safeLabel ? `_${safeLabel}` : '';
            const screenshotName = `${captureRunId}_agent_${Date.now()}${nameSuffix}.png`;
            const screenshotPath = path.join(capturesDir, screenshotName);
            await page.screenshot({ path: screenshotPath, fullPage: false });
            return `/captures/${screenshotName}`;
        };

        // ⚡ Bolt: Pre-calculate which actions need {$html} or loop.html to avoid repeated JSON.stringify (O(N) instead of O(N^2))
        const actionNeedsHtml = new Array(actions.length);
        const actionNeedsLoopHtml = new Array(actions.length);
        for (let i = 0; i < actions.length; i++) {
            const s = JSON.stringify(actions[i]);
            actionNeedsHtml[i] = s.includes('{$html}');
            actionNeedsLoopHtml[i] = s.includes('loop.html');
        }

        // ⚡ Bolt: Pre-calculate foreach blocks that reference 'loop.html' to optimize innerHTML fetching
        const foreachNeedsHtml = actions.map((act, i) => {
            if (act.type !== 'foreach') return false;
            const endIndex = startToEnd[i];
            if (endIndex === undefined) return true; // Safety fallback
            for (let j = i + 1; j < endIndex; j++) {
                if (actionNeedsLoopHtml[j]) return true;
            }
            return false;
        });

        // ⚡ Bolt: Hoist static action options out of the execution loop to avoid redundant object spreading (O(N))
        const actionOptions = {
            ...data,
            api_key: data.apiKey || data.key,
            deadClicks,
            humanTyping,
            allowTypos,
            naturalTyping,
            fatigue,
            idleMovements,
            overscroll,
            cursorGlide,
            randomizeClicks
        };

        let index = 0;
        const maxSteps = Math.max(actions.length * 20, 1000);
        let steps = 0;
        let lastMouse = null;

        // ⚡ Bolt: Hoist full actionContext out of loop to eliminate O(N) object creation and spread overhead.
        // Using getters for lastBlockOutput and lastMouse ensures they stay in sync with the loop's state.
        const actionContext = {
            page,
            logs,
            runtimeVars,
            resolveTemplate,
            captureScreenshot,
            baseDelay,
            options: actionOptions,
            baseUrl,
            solverIdentity: {
                proxy: launchOptions.proxy || null,
                userAgent: selectedUA,
                locale: 'en-US',
                timezone: 'America/New_York',
                viewport: page.viewportSize?.() || null
            },
            get lastBlockOutput() { return lastBlockOutput; },
            get lastMouse() { return lastMouse; },
            set lastMouse(val) { lastMouse = val; },
            setStopOutcome: (out) => { stopOutcome = out; },
            setStopRequested: (req) => { stopRequested = req; },
            pendingDownloads,
            successfulUploads,
            waitForNewDownload: () => new Promise(res => {
                newDownloadListeners.add(res);
                setTimeout(() => newDownloadListeners.delete(res), 15000);
            })
        };

        if (url) {
            await maybeAutoSolveCaptcha({ enabled: autoSolveCaptcha, actionType: 'navigate', page, logs, identity: actionContext.solverIdentity });
        }

        while (index < actions.length) {
            if (stopAfterTargetReached) break;
            if (isStopRequested(runId)) {
                logs.push('Execution stopped by user.');
                userStopped = true;
                break;
            }
            if (steps++ > maxSteps) {
                logs.push('Execution aborted: possible infinite loop.');
                break;
            }

            const act = actions[index];

            if (options.stopAtActionId && act.id === options.stopAtActionId) {
                logs.push(`Handoff requested at action ${act.id}. Stop executing.`);
                if (options.handoffContext) {
                    try { await page.waitForLoadState('networkidle', { timeout: 2000 }); } catch (e) { }
                    try { await page.waitForTimeout(500); } catch (e) { }
                }
                break;
            }

            actionIdx += 1;

            if (actionNeedsHtml[index]) {
                try {
                    runtimeVars.html = await page.content();
                } catch (err) {
                    runtimeVars.html = '';
                }
            }

            if (act.disabled) {
                logs.push(`SKIPPED disabled action: ${act.type}`);
                reportActionProgress(act, 'skipped');
                index += 1;
                continue;
            }

            if (act.type === 'on_error') {
                const endIndex = startToEnd[index];
                if (endIndex !== undefined) {
                    reportActionProgress(act, 'running');
                    errorHandler = { start: index + 1, end: endIndex };
                    logs.push('On-error handler registered.');
                    reportActionProgress(act, 'success');
                    index = endIndex + 1;
                    continue;
                }
            }

            if (act.type === 'if') {
                try {
                    reportActionProgress(act, 'running');
                    const hasStructured = act.conditionVarType || act.conditionOp || act.conditionVar || act.conditionValue;
                    const condition = hasStructured
                        ? await evalStructuredCondition(act, page, runtimeVars, resolveTemplate)
                        : await evalCondition(act.value, page, runtimeVars, lastBlockOutput, resolveTemplate);
                    setBlockOutput(condition);
                    logs.push(`If condition: ${condition ? 'true' : 'false'}`);
                    reportActionProgress(act, 'success', condition);
                    if (!condition) {
                        const elseIndex = startToElse[index];
                        if (elseIndex !== undefined) {
                            index = elseIndex + 1;
                        } else {
                            index = (startToEnd[index] ?? index) + 1;
                        }
                        continue;
                    }
                } catch (err) {
                    logs.push(`FAILED condition: ${err.message}`);
                    reportActionProgress(act, 'error', undefined, err.message);
                    if (errorHandler && !inErrorHandler) {
                        inErrorHandler = true;
                        index = errorHandler.start;
                        continue;
                    }
                }
                index += 1;
                continue;
            }

            if (act.type === 'else') {
                reportActionProgress(act, 'success');
                index = (elseToEnd[index] ?? index) + 1;
                continue;
            }

            if (act.type === 'while') {
                try {
                    reportActionProgress(act, 'running');
                    const hasStructured = act.conditionVarType || act.conditionOp || act.conditionVar || act.conditionValue;
                    const condition = hasStructured
                        ? await evalStructuredCondition(act, page, runtimeVars, resolveTemplate)
                        : await evalCondition(act.value, page, runtimeVars, lastBlockOutput, resolveTemplate);
                    setBlockOutput(condition);
                    logs.push(`While condition: ${condition ? 'true' : 'false'}`);
                    reportActionProgress(act, 'success', condition);
                    if (!condition) {
                        index = (startToEnd[index] ?? index) + 1;
                        continue;
                    }
                } catch (err) {
                    logs.push(`FAILED condition: ${err.message}`);
                    reportActionProgress(act, 'error', undefined, err.message);
                    if (errorHandler && !inErrorHandler) {
                        inErrorHandler = true;
                        index = errorHandler.start;
                        continue;
                    }
                }
                index += 1;
                continue;
            }

            if (act.type === 'repeat') {
                reportActionProgress(act, 'running');
                const rawCount = parseInt(resolveMaybe(act.value) || '0', 10);
                const count = Number.isFinite(rawCount) ? rawCount : 0;
                let state = repeatState.get(index);
                if (!state) {
                    state = { remaining: count };
                    repeatState.set(index, state);
                }
                if (state.remaining <= 0) {
                    repeatState.delete(index);
                    reportActionProgress(act, 'success', 0);
                    index = (startToEnd[index] ?? index) + 1;
                    continue;
                }
                logs.push(`Repeat block: ${state.remaining} remaining`);
                setBlockOutput(state.remaining);
                reportActionProgress(act, 'success', state.remaining);
                index += 1;
                continue;
            }

            if (act.type === 'foreach') {
                reportActionProgress(act, 'running');
                let state = foreachState.get(index);
                if (!state) {
                    const items = await getForeachItems(act, page, runtimeVars, foreachNeedsHtml[index]);
                    state = { items, index: 0 };
                    foreachState.set(index, state);
                }
                if (!state.items || state.items.length === 0) {
                    foreachState.delete(index);
                    reportActionProgress(act, 'success', []);
                    index = (startToEnd[index] ?? index) + 1;
                    continue;
                }
                const item = state.items[state.index];
                setLoopVars(item, state.index, state.items.length);
                setBlockOutput(item);
                logs.push(`For-each item ${state.index + 1}/${state.items.length}`);
                reportActionProgress(act, 'success', item);
                index += 1;
                continue;
            }

            if (act.type === 'end') {
                reportActionProgress(act, 'success');
                const startIndex = endToStart[index];
                if (startIndex !== undefined) {
                    const startAction = actions[startIndex];
                    if (startAction.type === 'while') {
                        index = startIndex;
                        continue;
                    }
                    if (startAction.type === 'repeat') {
                        const state = repeatState.get(startIndex);
                        if (state) {
                            state.remaining -= 1;
                            if (state.remaining > 0) {
                                setBlockOutput(state.remaining);
                                index = startIndex + 1;
                                continue;
                            }
                            repeatState.delete(startIndex);
                        }
                    }
                    if (startAction.type === 'foreach') {
                        const state = foreachState.get(startIndex);
                        if (state) {
                            state.index += 1;
                            if (state.index < state.items.length) {
                                const item = state.items[state.index];
                                setLoopVars(item, state.index, state.items.length);
                                setBlockOutput(item);
                                index = startIndex + 1;
                                continue;
                            }
                            foreachState.delete(startIndex);
                        }
                    }
                }
                index += 1;
                if (inErrorHandler && errorHandler && index > errorHandler.end) {
                    break;
                }
                continue;
            }

            if (stopRequested) break;

            try {
                reportActionProgress(act, 'running');
                const result = await executeAction(act, actionContext);

                if (stopRequested) {
                    setBlockOutput(result);
                    reportActionProgress(act, stopOutcome === 'error' ? 'error' : 'success', result);
                    break;
                }

                if (result !== undefined) setBlockOutput(result);
                reportActionProgress(act, 'success', result);

                await maybeAutoSolveCaptcha({ enabled: autoSolveCaptcha, actionType: act.type, page, logs, identity: actionContext.solverIdentity });
            } catch (err) {
                if (act.type === 'solve_captcha' || act.type === 'wait_captcha') {
                    logs.push(`[CAPTCHA ERROR] ${act.type}: ${err.message}`);
                    for (const attempt of err.attempts || []) {
                        logs.push(`[CAPTCHA] ${attempt.provider} ${attempt.status}${attempt.error ? `: ${attempt.error}` : ''}`);
                    }
                }
                logs.push(`FAILED action ${act.type}: ${err.message}`);
                reportActionProgress(act, 'error', undefined, err.message);
                if (errorHandler && !inErrorHandler) {
                    inErrorHandler = true;
                    index = errorHandler.start;
                    continue;
                }
            }

            if (stopRequested) break;

            index += 1;
            if (inErrorHandler && errorHandler && index > errorHandler.end) break;
        }

        if (userStopped && isTestMode) {
            testTargetStatus = 'stopped';
            testTargetDurationMs = Date.now() - (testTargetStartedAt || testRunStartedAt);
            testTargetVariables = snapshotTestVariables(runtimeVars);
        }

        if (!isTestMode && !userStopped && globalWait) await page.waitForTimeout(parseFloat(globalWait) * 1000);
        if (!isTestMode && !userStopped) await page.waitForTimeout(baseDelay(500));

        if (!isTestMode && !userStopped && pendingDownloads.size > 0) {
            logs.push(`Waiting for ${pendingDownloads.size} pending download(s)...`);
            try {
                await Promise.race([
                    Promise.all(Array.from(pendingDownloads)),
                    new Promise(resolve => setTimeout(resolve, 30000))
                ]);
            } catch (e) { }
        }

        const extractionScriptRaw = !isTestMode && typeof data.extractionScript === 'string'
            ? data.extractionScript
            : (!isTestMode && data.taskSnapshot && typeof data.taskSnapshot.extractionScript === 'string' ? data.taskSnapshot.extractionScript : undefined);

        const includeHtml = !isTestMode && !!(data.includeHtml ?? (data.taskSnapshot && data.taskSnapshot.includeHtml));

        let cleanedHtml = '';
        if (isTestMode) {
            cleanedHtml = '';
        } else if (extractionScriptRaw || includeHtml) {
            // Full DOM cleaning needed for extraction or explicit HTML output
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    await page.waitForLoadState('domcontentloaded').catch(() => { });
                    cleanedHtml = await page.evaluate(cleanHtml, includeShadowDom);
                    break;
                } catch (evalErr) {
                    if (attempt < 2 && /context was destroyed|navigation/i.test(evalErr.message)) {
                        await page.waitForTimeout(1000);
                        continue;
                    }
                    try {
                        cleanedHtml = await page.content();
                    } catch {
                        cleanedHtml = '';
                    }
                    break;
                }
            }
        } else {
            // No extraction script — capture raw HTML for display in the results pane
            try {
                await page.waitForLoadState('domcontentloaded').catch(() => {});
                cleanedHtml = await page.content();
            } catch {
                cleanedHtml = '';
            }
        }

        if (extractionScriptRaw && extractionScriptRaw.includes('{$html}')) {
            try {
                runtimeVars.html = await page.content();
            } catch (err) {
                runtimeVars.html = '';
            }
        }

        const extractionScript = extractionScriptRaw ? resolveTemplate(extractionScriptRaw) : undefined;
        const extraction = isTestMode
            ? { result: undefined, logs: [] }
            : await runExtractionScript(extractionScript, cleanedHtml, page.url(), includeShadowDom);

        const capturesDir = path.join(__dirname, '../../public', 'captures');
        // ⚡ Bolt: Use non-blocking directory creation
        await fs.promises.mkdir(capturesDir, { recursive: true });

        const screenshotName = `${captureRunId}_agent_${Date.now()}.png`;
        const screenshotPath = path.join(capturesDir, screenshotName);
        let screenshotSuccess = false;
        try {
            await page.screenshot({ path: screenshotPath, fullPage: false });
            screenshotSuccess = true;
        } catch (e) {
            console.error('Agent Screenshot failed:', e.message);
        }

        const extractionFormat = String(data.extractionFormat || (data.taskSnapshot && data.taskSnapshot.extractionFormat) || '').toLowerCase() === 'csv'
            ? 'csv'
            : 'json';
        const rawExtraction = extraction.result !== undefined ? extraction.result : (extraction.logs.length ? extraction.logs.join('\n') : undefined);
        const formattedExtraction = extractionFormat === 'csv' ? toCsvString(rawExtraction) : rawExtraction;

        if (!isTestMode && sessionId) {
            const cleanSessionId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '');
            if (cleanSessionId) {
                const sessionPath = path.join(__dirname, '../../../data/sessions', `${cleanSessionId}.json`);
                try {
                    await fs.promises.mkdir(path.dirname(sessionPath), { recursive: true });
                    await context.storageState({ path: sessionPath });
                    logs.push(`Saved persistent session state to ${cleanSessionId}.json`);
                } catch (e) {
                    console.error('Failed to save session path:', e.message);
                    logs.push(`Failed to save session state: ${e.message}`);
                }
            }
        }

        if (!userStopped && isStopRequested(runId)) {
            logs.push('Execution stopped by user.');
            userStopped = true;
        }
        const antiBot = await inspectPageForAntiBot(page, { status: lastMainDocumentStatus });
        const outcome = resolveTaskOutcome({
            antiBot: antiBot.detected,
            stopped: userStopped,
            explicitOutcome: stopRequested ? stopOutcome : 'success'
        });
        if (antiBot.reason) logs.push(`[OUTCOME] Anti-bot detected: ${antiBot.reason}.`);

        const outputData = {
            outcome,
            final_url: page.url() || url || '',
            downloads: downloads.length > 0 ? downloads : undefined,
            logs: logs || [],
            html: (extractionScript && !includeHtml) ? undefined : (typeof cleanedHtml === 'string' ? safeFormatHTML(cleanedHtml) : ''),
            data: formattedExtraction,
            screenshot_url: screenshotSuccess ? `/captures/${screenshotName}` : null,
            ...(isTestMode ? {
                testResult: {
                    actionId: testTargetActionId,
                    status: testTargetStatus,
                    durationMs: testTargetDurationMs || (Date.now() - testRunStartedAt),
                    resolvedInputs: testTargetInputs,
                    output: testTargetOutput,
                    error: testTargetError,
                    variables: testTargetVariables,
                }
            } : {})
        };

        const video = page.video();
        if (!options.handoffContext) {
            try { await context.close(); } catch { }
        }

        if (video) {
            try {
                const videoPath = await video.path();
                // ⚡ Bolt: Use non-blocking existence check
                const videoExists = videoPath && await fs.promises.access(videoPath).then(() => true).catch(() => false);
                if (videoExists) {
                    const recordingName = `${captureRunId}_agent_${Date.now()}.webm`;
                    const recordingPath = path.join(capturesDir, recordingName);
                    try {
                        // ⚡ Bolt: Use non-blocking move
                        await fs.promises.rename(videoPath, recordingPath);
                    } catch (err) {
                        if (err && err.code === 'EXDEV') {
                            // ⚡ Bolt: Use non-blocking copy/unlink if move across filesystems fails
                            await fs.promises.copyFile(videoPath, recordingPath);
                            await fs.promises.unlink(videoPath);
                        } else {
                            throw err;
                        }
                    }
                }
            } catch (e) {
                console.error('Recording save failed:', e.message);
            }
        }

        if (options.handoffContext) {
            return {
                ...outputData,
                _handoff: { browser, context, page }
            };
        }

        try { await browser.close(); } catch { }
        return outputData;
    } catch (error) {
        if (userStopped || isForceStopped || (runId && consumeStopRequest(runId))) {
            logs.push('Execution stopped by user.');
            return {
                outcome: 'stopped',
                final_url: (page && typeof page.isClosed === 'function' && !page.isClosed()) ? (page.url() || '') : (url || ''),
                logs: logs || [],
                html: '',
                data: null,
                screenshot_url: null,
            };
        }
        console.error('Engine Error:', error);
        const antiBot = await inspectPageForAntiBot(page, { status: lastMainDocumentStatus });
        if (antiBot.reason) {
            error.antiBotReason = antiBot.reason;
            logs.push(`[OUTCOME] Anti-bot detected: ${antiBot.reason}.`);
        }
        error.executionLogs = logs;
        try {
            if (context) await context.close();
        } catch { }
        if (browser) await browser.close();
        throw error;
    } finally {
        if (runId) {
            unregisterActiveRun(runId);
            clearStopRequest(runId);
        }
    }
}

async function handleAgent(req, res) {
    const data = (req.method === 'POST') ? req.body : req.query;
    const options = {
        localPort: req.socket && req.socket.localPort,
        protocol: req.protocol
    };

    try {
        const result = await runFigranite(data, options);
        reportProgress(data.runId, { status: 'finished', outcome: result.outcome });
        res.json(result);
    } catch (error) {
        if (error.isTaskInputError) {
            return res.status(400).json({ error: error.code, details: error.message });
        }
        const outcome = resolveTaskOutcome({ antiBot: Boolean(error.antiBotReason), crashed: true });
        const logs = Array.isArray(error.executionLogs) ? error.executionLogs : [];
        if (outcome === 'crashed') logs.push(`[OUTCOME] Execution crashed: ${error.message}.`);
        reportProgress(data.runId, { status: 'finished', outcome });
        res.json({ outcome, error: 'Figranite Engine failed', details: error.message, logs });
    } finally {
        clearStopRequest(data.runId);
    }
}

module.exports = {
    runFigranite,
    handleAgent,
    setProgressReporter,
    setStopChecker,
    setStopCleaner,
    maybeAutoSolveCaptcha,
    buildResolvedActionInputs,
    snapshotTestVariables,
    TaskInputError,
};
