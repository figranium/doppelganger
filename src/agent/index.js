const fs = require('fs');
const path = require('path');
const { selectUserAgent } = require('../../user-agent-settings');
const { safeFormatHTML } = require('../../html-utils');
const { validateUrl } = require('../../url-utils');
const { parseBooleanFlag, sanitizeRunId, toCsvString } = require('../../common-utils');
const { runExtractionScript } = require('./sandbox');
const { cleanHtml } = require('./dom-utils');
const { launchBrowser, createBrowserContext } = require('./browser');

// New Modules
const { buildBlockMap, randomBetween, getForeachItems } = require('./helpers');
const { evalStructuredCondition, evalCondition } = require('./logic-handler');
const { executeAction } = require('./action-handler');

let progressReporter = null;
let stopChecker = null;

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

const setStopChecker = (checker) => {
    stopChecker = checker;
};

const isStopRequested = (runId) => {
    if (!runId || typeof stopChecker !== 'function') return false;
    try {
        return !!stopChecker(runId);
    } catch {
        return false;
    }
};

async function runAgent(data, options = {}) {
    let { url, actions, wait: globalWait, rotateUserAgents, rotateProxies, humanTyping, stealth = {} } = data;

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

    if (url) {
        await validateUrl(resolveTemplate(url));
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
            throw new Error('Invalid actions JSON format.');
        }
    }

    if (!actions || !Array.isArray(actions)) {
        throw new Error('Actions array is required.');
    }

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
            includeShadowDom
        });
        browser = context.browser();

        const logs = [];
        const downloads = [];
        const pendingDownloads = new Set();
        const newDownloadListeners = new Set();

        context.on('page', (p) => {
            p.on('download', async (download) => {
                for (const listener of newDownloadListeners) listener();

                const originalName = download.suggestedFilename() || 'download';
                logs.push(`[DOWNLOAD] Intercepted: ${originalName}`);
                const promise = new Promise(async (resolve) => {
                    try {
                        const safeName = originalName.replace(/[^a-zA-Z0-9_.-]/g, '_');
                        const downloadName = `${captureRunId}_dl_${Date.now()}_${safeName}`;
                        const customCapturesDir = path.join(__dirname, '../../public', 'captures');
                        if (!fs.existsSync(customCapturesDir)) {
                            fs.mkdirSync(customCapturesDir, { recursive: true });
                        }
                        const downloadPath = path.join(customCapturesDir, downloadName);

                        await download.saveAs(downloadPath);
                        downloads.push({
                            name: originalName,
                            url: download.url(),
                            path: `/captures/${downloadName}`
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
        });

        // Persistent context auto-creates a blank page; reuse it or open a new one
        const existingPages = context.pages();
        page = existingPages.length > 0 ? existingPages[0] : await context.newPage();

        if (url) {
            await page.goto(resolveTemplate(url), { waitUntil: 'domcontentloaded', timeout: 60000 });
        }

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
        let stopRequested = false;
        let stopOutcome = 'success';

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

        const ensureCapturesDir = () => {
            const capturesDir = path.join(__dirname, '../../public', 'captures');
            if (!fs.existsSync(capturesDir)) {
                fs.mkdirSync(capturesDir, { recursive: true });
            }
            return capturesDir;
        };

        const captureScreenshot = async (label) => {
            const capturesDir = ensureCapturesDir();
            const safeLabel = label ? String(label).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) : '';
            const nameSuffix = safeLabel ? `_${safeLabel}` : '';
            const screenshotName = `${captureRunId}_agent_${Date.now()}${nameSuffix}.png`;
            const screenshotPath = path.join(capturesDir, screenshotName);
            await page.screenshot({ path: screenshotPath, fullPage: false });
            return `/captures/${screenshotName}`;
        };

        // ⚡ Bolt: Pre-calculate which actions need {$html} to avoid repeated JSON.stringify in loop
        const actionNeedsHtml = actions.map(act => JSON.stringify(act).includes('{$html}'));

        // ⚡ Bolt: Pre-calculate foreach blocks that reference 'loop.html' to optimize innerHTML fetching
        const foreachNeedsHtml = actions.map((act, i) => {
            if (act.type !== 'foreach') return false;
            const endIndex = startToEnd[i];
            if (endIndex === undefined) return true; // Safety fallback
            const subActions = actions.slice(i + 1, endIndex);
            return subActions.some(sub => JSON.stringify(sub).includes('loop.html'));
        });

        let index = 0;
        const maxSteps = Math.max(actions.length * 20, 1000);
        let steps = 0;
        let lastMouse = null;

        while (index < actions.length) {
            if (isStopRequested(runId)) {
                logs.push('Execution stopped by user.');
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
                reportProgress(runId, { actionId: act.id, status: 'skipped' });
                index += 1;
                continue;
            }

            if (act.type === 'on_error') {
                const endIndex = startToEnd[index];
                if (endIndex !== undefined) {
                    reportProgress(runId, { actionId: act.id, status: 'running' });
                    errorHandler = { start: index + 1, end: endIndex };
                    logs.push('On-error handler registered.');
                    reportProgress(runId, { actionId: act.id, status: 'success' });
                    index = endIndex + 1;
                    continue;
                }
            }

            if (act.type === 'if') {
                try {
                    reportProgress(runId, { actionId: act.id, status: 'running' });
                    const hasStructured = act.conditionVarType || act.conditionOp || act.conditionVar || act.conditionValue;
                    const condition = hasStructured
                        ? evalStructuredCondition(act, runtimeVars, resolveTemplate)
                        : await evalCondition(act.value, page, runtimeVars, lastBlockOutput, resolveTemplate);
                    setBlockOutput(condition);
                    logs.push(`If condition: ${condition ? 'true' : 'false'}`);
                    reportProgress(runId, { actionId: act.id, status: 'success' });
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
                    reportProgress(runId, { actionId: act.id, status: 'error' });
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
                reportProgress(runId, { actionId: act.id, status: 'success' });
                index = (elseToEnd[index] ?? index) + 1;
                continue;
            }

            if (act.type === 'while') {
                try {
                    reportProgress(runId, { actionId: act.id, status: 'running' });
                    const hasStructured = act.conditionVarType || act.conditionOp || act.conditionVar || act.conditionValue;
                    const condition = hasStructured
                        ? evalStructuredCondition(act, runtimeVars, resolveTemplate)
                        : await evalCondition(act.value, page, runtimeVars, lastBlockOutput, resolveTemplate);
                    setBlockOutput(condition);
                    logs.push(`While condition: ${condition ? 'true' : 'false'}`);
                    reportProgress(runId, { actionId: act.id, status: 'success' });
                    if (!condition) {
                        index = (startToEnd[index] ?? index) + 1;
                        continue;
                    }
                } catch (err) {
                    logs.push(`FAILED condition: ${err.message}`);
                    reportProgress(runId, { actionId: act.id, status: 'error' });
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
                reportProgress(runId, { actionId: act.id, status: 'running' });
                const rawCount = parseInt(resolveMaybe(act.value) || '0', 10);
                const count = Number.isFinite(rawCount) ? rawCount : 0;
                let state = repeatState.get(index);
                if (!state) {
                    state = { remaining: count };
                    repeatState.set(index, state);
                }
                if (state.remaining <= 0) {
                    repeatState.delete(index);
                    reportProgress(runId, { actionId: act.id, status: 'success' });
                    index = (startToEnd[index] ?? index) + 1;
                    continue;
                }
                logs.push(`Repeat block: ${state.remaining} remaining`);
                setBlockOutput(state.remaining);
                reportProgress(runId, { actionId: act.id, status: 'success' });
                index += 1;
                continue;
            }

            if (act.type === 'foreach') {
                reportProgress(runId, { actionId: act.id, status: 'running' });
                let state = foreachState.get(index);
                if (!state) {
                    const items = await getForeachItems(act, page, runtimeVars, foreachNeedsHtml[index]);
                    state = { items, index: 0 };
                    foreachState.set(index, state);
                }
                if (!state.items || state.items.length === 0) {
                    foreachState.delete(index);
                    reportProgress(runId, { actionId: act.id, status: 'success' });
                    index = (startToEnd[index] ?? index) + 1;
                    continue;
                }
                const item = state.items[state.index];
                setLoopVars(item, state.index, state.items.length);
                setBlockOutput(item);
                logs.push(`For-each item ${state.index + 1}/${state.items.length}`);
                reportProgress(runId, { actionId: act.id, status: 'success' });
                index += 1;
                continue;
            }

            if (act.type === 'end') {
                reportProgress(runId, { actionId: act.id, status: 'success' });
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
                reportProgress(runId, { actionId: act.id, status: 'running' });
                const actionContext = {
                    page,
                    logs,
                    runtimeVars,
                    resolveTemplate,
                    captureScreenshot,
                    baseDelay,
                    options: {
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
                    },
                    baseUrl,
                    lastBlockOutput,
                    get lastMouse() { return lastMouse; },
                    set lastMouse(val) { lastMouse = val; },
                    setStopOutcome: (out) => { stopOutcome = out; },
                    setStopRequested: (req) => { stopRequested = req; },
                    pendingDownloads,
                    waitForNewDownload: () => new Promise(res => {
                        newDownloadListeners.add(res);
                        setTimeout(() => newDownloadListeners.delete(res), 15000);
                    })
                };
                const result = await executeAction(act, actionContext);

                if (stopRequested) {
                    setBlockOutput(result);
                    reportProgress(runId, { actionId: act.id, status: stopOutcome === 'error' ? 'error' : 'success' });
                    break;
                }

                if (result !== undefined) setBlockOutput(result);
                reportProgress(runId, { actionId: act.id, status: 'success' });
            } catch (err) {
                logs.push(`FAILED action ${act.type}: ${err.message}`);
                reportProgress(runId, { actionId: act.id, status: 'error' });
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

        if (globalWait) await page.waitForTimeout(parseFloat(globalWait) * 1000);
        await page.waitForTimeout(baseDelay(500));

        if (pendingDownloads.size > 0) {
            logs.push(`Waiting for ${pendingDownloads.size} pending download(s)...`);
            try {
                await Promise.race([
                    Promise.all(Array.from(pendingDownloads)),
                    new Promise(resolve => setTimeout(resolve, 30000))
                ]);
            } catch (e) { }
        }

        let cleanedHtml = '';
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await page.waitForLoadState('domcontentloaded').catch(() => {});
                cleanedHtml = await page.evaluate(cleanHtml, includeShadowDom);
                break;
            } catch (evalErr) {
                if (attempt < 2 && /context was destroyed|navigation/i.test(evalErr.message)) {
                    await page.waitForTimeout(1000);
                    continue;
                }
                // Final fallback: raw page content
                try {
                    cleanedHtml = await page.content();
                } catch {
                    cleanedHtml = '';
                }
                break;
            }
        }

        const extractionScriptRaw = typeof data.extractionScript === 'string'
            ? data.extractionScript
            : (data.taskSnapshot && typeof data.taskSnapshot.extractionScript === 'string' ? data.taskSnapshot.extractionScript : undefined);

        if (extractionScriptRaw && extractionScriptRaw.includes('{$html}')) {
            try {
                runtimeVars.html = await page.content();
            } catch (err) {
                runtimeVars.html = '';
            }
        }

        const extractionScript = extractionScriptRaw ? resolveTemplate(extractionScriptRaw) : undefined;
        const extraction = await runExtractionScript(extractionScript, cleanedHtml, page.url(), includeShadowDom);

        const capturesDir = path.join(__dirname, '../../public', 'captures');
        if (!fs.existsSync(capturesDir)) {
            fs.mkdirSync(capturesDir, { recursive: true });
        }

        const screenshotName = `${captureRunId}_agent_${Date.now()}.png`;
        const screenshotPath = path.join(capturesDir, screenshotName);
        try {
            await page.screenshot({ path: screenshotPath, fullPage: false });
        } catch (e) {
            console.error('Agent Screenshot failed:', e.message);
        }

        const includeHtml = !!(data.includeHtml ?? (data.taskSnapshot && data.taskSnapshot.includeHtml));
        const extractionFormat = String(data.extractionFormat || (data.taskSnapshot && data.taskSnapshot.extractionFormat) || '').toLowerCase() === 'csv'
            ? 'csv'
            : 'json';
        const rawExtraction = extraction.result !== undefined ? extraction.result : (extraction.logs.length ? extraction.logs.join('\n') : undefined);
        const formattedExtraction = extractionFormat === 'csv' ? toCsvString(rawExtraction) : rawExtraction;

        const outputData = {
            final_url: page.url() || url || '',
            downloads: downloads.length > 0 ? downloads : undefined,
            logs: logs || [],
            html: (extractionScript && !includeHtml) ? undefined : (typeof cleanedHtml === 'string' ? safeFormatHTML(cleanedHtml) : ''),
            data: formattedExtraction,
            screenshot_url: fs.existsSync(screenshotPath) ? `/captures/${screenshotName}` : null
        };

        const video = page.video();
        if (!options.handoffContext) {
            try { await context.close(); } catch { }
        }

        if (video) {
            try {
                const videoPath = await video.path();
                if (videoPath && fs.existsSync(videoPath)) {
                    const recordingName = `${captureRunId}_agent_${Date.now()}.webm`;
                    const recordingPath = path.join(capturesDir, recordingName);
                    try {
                        fs.renameSync(videoPath, recordingPath);
                    } catch (err) {
                        if (err && err.code === 'EXDEV') {
                            fs.copyFileSync(videoPath, recordingPath);
                            fs.unlinkSync(videoPath);
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
        console.error('Agent Error:', error);
        try {
            if (context) await context.close();
        } catch { }
        if (browser) await browser.close();
        throw error;
    }
}

async function handleAgent(req, res) {
    const data = (req.method === 'POST') ? req.body : req.query;
    const options = {
        localPort: req.socket && req.socket.localPort,
        protocol: req.protocol
    };

    try {
        const result = await runAgent(data, options);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Agent failed', details: error.message });
    }
}

module.exports = { runAgent, handleAgent, setProgressReporter, setStopChecker };
