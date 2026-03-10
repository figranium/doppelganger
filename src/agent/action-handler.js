const { validateUrl } = require('../../url-utils');
const { parseCoords, parseValue, parseCsv } = require('../../common-utils');
const { moveMouseHumanlike, idleMouse, overshootScroll, humanType } = require('./human-interaction');
const { loadApiKey } = require('../server/storage'); // Need to access server storage for internal API key loading

const normalizeVarRef = (raw) => {
    if (!raw) return '';
    const trimmed = String(raw).trim();
    const match = trimmed.match(/^\{\$([\w.]+)\}$/);
    return match ? match[1] : trimmed;
};

const getMergeSources = (raw, runtimeVars, resolveTemplate) => {
    const resolveMaybe = (val) => typeof val === 'string' ? resolveTemplate(val) : val;
    const resolved = resolveMaybe(raw);
    if (Array.isArray(resolved)) return resolved;
    if (resolved && typeof resolved === 'object') return [resolved];
    if (typeof resolved !== 'string') {
        return resolved === undefined || resolved === null ? [] : [resolved];
    }
    const tokens = resolved
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean);
    if (tokens.length === 0) return [];
    const sources = [];
    tokens.forEach((token) => {
        const name = normalizeVarRef(token);
        if (Object.prototype.hasOwnProperty.call(runtimeVars, name)) {
            sources.push(runtimeVars[name]);
            return;
        }
        sources.push(parseValue(token));
    });
    return sources;
};

const mergeSources = (sources) => {
    const list = Array.isArray(sources) ? sources : [];
    if (list.length === 0) return [];
    const arraysOnly = list.every(Array.isArray);
    if (arraysOnly) return list.flat();
    const objectsOnly = list.every((item) => item && typeof item === 'object' && !Array.isArray(item));
    if (objectsOnly) return Object.assign({}, ...list);
    const merged = [];
    list.forEach((item) => {
        if (Array.isArray(item)) {
            merged.push(...item);
        } else if (item !== undefined) {
            merged.push(item);
        }
    });
    return merged;
};

const getLocationalCoords = async (page, selectorValue, lastMouse) => {
    const handle = await page.$(selectorValue);
    if (!handle) return null;
    await handle.scrollIntoViewIfNeeded();

    // Stability check: Wait for the bounding box to stop moving (sign of settling layout/animations)
    let box = null;
    let lastBox = null;
    const stabilityStart = Date.now();
    const stabilityTimeout = 400; // max wait for layout to settle

    while (Date.now() - stabilityStart < stabilityTimeout) {
        box = await handle.boundingBox();
        if (box && lastBox &&
            Math.abs(box.x - lastBox.x) < 0.5 &&
            Math.abs(box.y - lastBox.y) < 0.5 &&
            Math.abs(box.width - lastBox.width) < 0.5 &&
            Math.abs(box.height - lastBox.height) < 0.5) {
            break; // stable
        }
        lastBox = box;
        await page.waitForTimeout(30);
    }

    if (!box) return null;

    if (!lastMouse) {
        const viewport = page.viewportSize() || { width: 1280, height: 720 };
        lastMouse = { x: viewport.width / 2, y: viewport.height / 2 };
    }

    // Ensure we never click the absolute edge. Padding is 20% of the element, but at least 2 pixels,
    // and strictly capped at 40% of the element (so we never pad past the center).
    const padX = Math.min(Math.max(2, box.width * 0.2), box.width * 0.4);
    const padY = Math.min(Math.max(2, box.height * 0.2), box.height * 0.4);

    const minX = box.x + padX;
    const maxX = box.x + box.width - padX;
    const minY = box.y + padY;
    const maxY = box.y + box.height - padY;

    // Pick a uniformly random point within the padded box boundaries
    const targetX = minX + Math.random() * Math.max(0, maxX - minX);
    const targetY = minY + Math.random() * Math.max(0, maxY - minY);

    return { x: targetX, y: targetY, box };
};

const executeAction = async (act, context) => {
    const {
        page,
        logs,
        runtimeVars,
        resolveTemplate,
        captureScreenshot,
        baseDelay,
        options,
        baseUrl,
        lastBlockOutput,
        setStopOutcome,
        setStopRequested,
        pendingDownloads
    } = context;

    const {
        deadClicks,
        humanTyping,
        allowTypos,
        naturalTyping,
        fatigue,
        idleMovements,
        overscroll,
        cursorGlide,
        randomizeClicks
    } = options;

    const humanOptions = { allowTypos, naturalTyping, fatigue };
    const resolveMaybe = (val) => typeof val === 'string' ? resolveTemplate(val) : val;
    const { type, timeout } = act;
    const actionTimeout = timeout || 10000;
    let result = null;

    switch (type) {
        case 'navigate':
        case 'goto': {
            const targetUrl = resolveMaybe(act.value);
            try {
                await validateUrl(targetUrl);
            } catch (e) {
                throw new Error(`Access to private network is restricted`);
            }
            logs.push(`Navigating to: ${targetUrl}`);
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
            result = page.url();
            break;
        }
        case 'click': {
            const selectorValue = resolveMaybe(act.selector);
            const coords = parseCoords(String(selectorValue || ''));
            logs.push(`Clicking: ${selectorValue}`);
            if (coords) {
                await moveMouseHumanlike(page, coords.x, coords.y, { cursorGlide, startX: context.lastMouse?.x, startY: context.lastMouse?.y });
                await page.mouse.click(coords.x, coords.y, { delay: baseDelay(50) });
                context.lastMouse = { x: coords.x, y: coords.y };
                result = true;
                break;
            }
            await page.waitForSelector(selectorValue, { timeout: actionTimeout });

            if (!context.lastMouse) {
                const viewport = page.viewportSize() || { width: 1280, height: 720 };
                context.lastMouse = { x: viewport.width / 2, y: viewport.height / 2 };
            }

            // Neutral Dead Click
            if (deadClicks && Math.random() < 0.4) {
                logs.push('Performing neutral dead-click...');
                const viewport = page.viewportSize() || { width: 1280, height: 720 };
                const dcX = 10 + Math.random() * (viewport.width * 0.2);
                const dcY = 10 + Math.random() * (viewport.height * 0.2);
                await moveMouseHumanlike(page, dcX, dcY, { cursorGlide, startX: context.lastMouse?.x, startY: context.lastMouse?.y });
                await page.mouse.click(dcX, dcY, { delay: baseDelay(30) });
                context.lastMouse = { x: dcX, y: dcY };
                await page.waitForTimeout(baseDelay(200));
            }

            if (randomizeClicks) {
                const loc = await getLocationalCoords(page, selectorValue, context.lastMouse);
                if (loc) {
                    const { x: clickX, y: clickY, box } = loc;

                    await moveMouseHumanlike(page, clickX, clickY, { cursorGlide, startX: context.lastMouse?.x, startY: context.lastMouse?.y });
                    context.lastMouse = { x: clickX, y: clickY };

                    if (deadClicks && Math.random() < 0.25) {
                        const offsetX = (Math.random() - 0.5) * Math.min(20, box.width / 3);
                        const offsetY = (Math.random() - 0.5) * Math.min(20, box.height / 3);
                        if (cursorGlide) await moveMouseHumanlike(page, clickX + offsetX, clickY + offsetY, { cursorGlide, startX: clickX, startY: clickY });
                        await page.mouse.click(clickX + offsetX, clickY + offsetY, { delay: baseDelay(30) });
                        context.lastMouse = { x: clickX + offsetX, y: clickY + offsetY };
                        await page.waitForTimeout(baseDelay(120));
                    }

                    await page.waitForTimeout(baseDelay(50));
                    await page.mouse.click(clickX, clickY, { delay: baseDelay(50) });

                    // Verify the click landed on the target element
                    await page.waitForTimeout(80);
                    let clickMissed = false;
                    try {
                        const hitTarget = await page.evaluate(({ x, y, selector }) => {
                            const el = document.elementFromPoint(x, y);
                            if (!el) return true;
                            try {
                                return el.matches(selector) || !!el.closest(selector);
                            } catch {
                                return true;
                            }
                        }, { x: clickX, y: clickY, selector: selectorValue });

                        if (!hitTarget) {
                            const stillThere = await page.$(selectorValue);
                            clickMissed = !!stillThere;
                        }
                    } catch {
                        // evaluation failed (e.g. navigation), assume click landed
                    }

                    if (clickMissed) {
                        logs.push('Click may have missed, falling back to Playwright click.');
                        await page.click(selectorValue, { delay: baseDelay(50) });
                    }
                    // Update lastMouse after center click
                    const clickBox = await (await page.$(selectorValue))?.boundingBox();
                    if (clickBox) {
                        context.lastMouse = { x: clickBox.x + clickBox.width / 2, y: clickBox.y + clickBox.height / 2 };
                    }
                } else {
                    // getLocationalCoords failed, fall back to standard click
                    await page.click(selectorValue, { delay: baseDelay(50) });
                }
            } else {
                // No randomization — use standard Playwright click
                await page.click(selectorValue, { delay: baseDelay(50) });
                const clickBox = await (await page.$(selectorValue))?.boundingBox();
                if (clickBox) {
                    context.lastMouse = { x: clickBox.x + clickBox.width / 2, y: clickBox.y + clickBox.height / 2 };
                }
            }
            result = true;
            break;
        }
        case 'type':
        case 'fill': {
            const selectorValue = act.selector ? resolveMaybe(act.selector) : null;
            const valueText = resolveMaybe(act.value) || '';
            const typeMode = act.typeMode === 'append' ? 'append' : 'replace';

            const typeIntoSelector = async () => {
                if (!selectorValue) return;

                if (randomizeClicks) {
                    const loc = await getLocationalCoords(page, selectorValue, context.lastMouse);
                    if (loc) {
                        const { x: clickX, y: clickY } = loc;
                        await moveMouseHumanlike(page, clickX, clickY, { cursorGlide, startX: context.lastMouse?.x, startY: context.lastMouse?.y });
                        context.lastMouse = { x: clickX, y: clickY };
                        await page.mouse.click(clickX, clickY, { delay: baseDelay(50) });
                    } else {
                        await page.click(selectorValue, { delay: baseDelay(50) });
                        const typeBox = await (await page.$(selectorValue))?.boundingBox();
                        if (typeBox) {
                            context.lastMouse = { x: typeBox.x + typeBox.width / 2, y: typeBox.y + typeBox.height / 2 };
                        }
                    }
                } else {
                    await page.click(selectorValue, { delay: baseDelay(50) });
                    const typeBoxDefault = await (await page.$(selectorValue))?.boundingBox();
                    if (typeBoxDefault) {
                        context.lastMouse = { x: typeBoxDefault.x + typeBoxDefault.width / 2, y: typeBoxDefault.y + typeBoxDefault.height / 2 };
                    }
                }

                let isSpecialInput = false;
                try {
                    const type = await page.getAttribute(selectorValue, 'type', { timeout: 2000 });
                    isSpecialInput = ['date', 'time', 'datetime-local', 'month', 'week', 'color'].includes(type);
                } catch (e) {
                    // Not an input or selector not found yet, fall through to default behavior
                }

                if (isSpecialInput) {
                    await page.fill(selectorValue, valueText);
                } else {
                    if (typeMode === 'replace') {
                        // Try to clear the input field manually so we don't use page.fill() centering
                        await page.keyboard.press('Control+A');
                        await page.keyboard.press('Meta+A');
                        await page.keyboard.press('Backspace');
                    }

                    if (humanTyping) {
                        await humanType(page, null, valueText, humanOptions); // Uses null to type unconditionally where focused
                    } else {
                        await page.keyboard.insertText(valueText);
                    }
                }
            };

            if (selectorValue) {
                const coords = parseCoords(String(selectorValue));
                logs.push(`Typing into ${selectorValue}: ${valueText}`);
                if (coords) {
                    await moveMouseHumanlike(page, coords.x, coords.y, { cursorGlide, startX: context.lastMouse?.x, startY: context.lastMouse?.y });
                    await page.mouse.click(coords.x, coords.y, { delay: baseDelay(50) });
                    context.lastMouse = { x: coords.x, y: coords.y };
                    await typeIntoSelector();
                    result = valueText;
                    break;
                }
                await page.waitForSelector(selectorValue, { timeout: actionTimeout });
                await typeIntoSelector();
            } else {
                logs.push(`Typing (global): ${valueText}`);
                if (humanTyping) {
                    await humanType(page, null, valueText, humanOptions);
                } else {
                    await page.keyboard.type(valueText, { delay: baseDelay(50) });
                }
            }
            result = valueText;
            break;
        }
        case 'hover': {
            const selectorValue = resolveMaybe(act.selector);
            const coords = parseCoords(String(selectorValue || ''));
            logs.push(`Hovering: ${selectorValue}`);
            if (coords) {
                await moveMouseHumanlike(page, coords.x, coords.y, { cursorGlide, startX: context.lastMouse?.x, startY: context.lastMouse?.y });
                context.lastMouse = { x: coords.x, y: coords.y };
                result = true;
                break;
            }
            await page.waitForSelector(selectorValue, { timeout: actionTimeout });

            if (!context.lastMouse) {
                const viewport = page.viewportSize() || { width: 1280, height: 720 };
                context.lastMouse = { x: viewport.width / 2, y: viewport.height / 2 };
            }

            {
                if (randomizeClicks) {
                    const loc = await getLocationalCoords(page, selectorValue, context.lastMouse);
                    if (loc) {
                        const { x: hoverX, y: hoverY } = loc;
                        await moveMouseHumanlike(page, hoverX, hoverY, { cursorGlide, startX: context.lastMouse?.x, startY: context.lastMouse?.y });
                        context.lastMouse = { x: hoverX, y: hoverY };
                    } else {
                        await page.hover(selectorValue);
                        const box = await (await page.$(selectorValue))?.boundingBox();
                        if (box) {
                            context.lastMouse = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
                        }
                    }
                } else {
                    await page.hover(selectorValue);
                    const box = await (await page.$(selectorValue))?.boundingBox();
                    if (box) {
                        context.lastMouse = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
                    }
                }
            }
            await page.waitForTimeout(baseDelay(150));
            result = true;
            break;
        }
        case 'press':
            logs.push(`Pressing key: ${resolveMaybe(act.key)}`);
            await page.keyboard.press(resolveMaybe(act.key), { delay: baseDelay(50) });
            result = resolveMaybe(act.key);
            break;
        case 'wait':
            const ms = act.value ? parseFloat(resolveMaybe(act.value)) * 1000 : 2000;
            logs.push(`Waiting: ${ms}ms`);

            if (idleMovements) {
                logs.push('Simulating cursor restlessness...');
                // NEW: Use idleMouse with a timeout instead of Promise.race to ensure it cleans up
                const finalPos = await idleMouse(page, ms);
                if (finalPos) context.lastMouse = finalPos;
            } else {
                await page.waitForTimeout(ms);
            }
            result = ms;
            break;
        case 'wait_downloads': {
            const rawVal = resolveMaybe(act.value);
            const ms = (rawVal !== undefined && rawVal !== null && rawVal !== '') ? parseFloat(rawVal) * 1000 : 30000;

            if (!pendingDownloads || pendingDownloads.size === 0) {
                logs.push(`No active downloads found. Waiting up to 10s for a download to initiate...`);
                if (context.waitForNewDownload) {
                    await Promise.race([
                        context.waitForNewDownload(),
                        new Promise((resolve) => setTimeout(resolve, 10000))
                    ]);
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                }
            }

            if (pendingDownloads && pendingDownloads.size > 0) {
                logs.push(`Waiting for ${pendingDownloads.size} pending download(s) (${ms === 0 ? 'no' : ms + 'ms'} timeout)...`);
                try {
                    const waitPromises = [Promise.all(Array.from(pendingDownloads))];
                    if (ms > 0) waitPromises.push(new Promise((resolve) => setTimeout(resolve, ms)));
                    await Promise.race(waitPromises);
                    logs.push(`Downloads finished wait period.`);
                } catch (e) {
                    logs.push(`Wait downloads errored: ${e.message}`);
                }
            } else {
                logs.push(`No downloads initiated within the grace period.`);
            }
            result = true;
            break;
        }
        case 'wait_selector': {
            const selector = resolveMaybe(act.selector);
            const ms = act.value ? parseFloat(resolveMaybe(act.value)) * 1000 : 10000;
            logs.push(`Waiting for selector: ${selector} (${ms}ms)`);
            if (selector) {
                await page.waitForSelector(selector, { timeout: ms, state: 'visible' });
                result = true;
            } else {
                logs.push('No selector provided for wait_selector');
            }
            break;
        }
        case 'select':
            logs.push(`Selecting ${resolveMaybe(act.value)} from ${resolveMaybe(act.selector)}`);
            await page.waitForSelector(resolveMaybe(act.selector), { timeout: actionTimeout });
            await page.selectOption(resolveMaybe(act.selector), resolveMaybe(act.value));
            result = resolveMaybe(act.value);
            break;
        case 'scroll': {
            const amount = act.value ? parseInt(resolveMaybe(act.value), 10) : (400 + Math.random() * 400);
            const speedMs = act.key ? parseInt(resolveMaybe(act.key), 10) : 500;
            const durationMs = Number.isFinite(speedMs) && speedMs > 0 ? speedMs : 500;
            logs.push(`Scrolling page: ${amount}px over ${durationMs}ms...`);
            if (overscroll) {
                await overshootScroll(page, amount);
                await page.waitForTimeout(baseDelay(200));
            } else if (act.selector) {
                await page.evaluate(({ selector, y, duration }) => {
                    const el = document.querySelector(selector);
                    if (!el) return;
                    const start = el.scrollTop;
                    const target = start + y;
                    const startTime = performance.now();
                    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
                    const step = (now) => {
                        const elapsed = now - startTime;
                        const t = Math.min(1, elapsed / duration);
                        const next = start + (target - start) * easeOut(t);
                        el.scrollTop = next;
                        if (t < 1) requestAnimationFrame(step);
                    };
                    requestAnimationFrame(step);
                }, { selector: resolveMaybe(act.selector), y: amount, duration: durationMs });
                await page.waitForTimeout(baseDelay(durationMs));
            } else {
                await page.evaluate(({ y, duration }) => {
                    const start = window.scrollY || 0;
                    const target = start + y;
                    const startTime = performance.now();
                    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
                    const step = (now) => {
                        const elapsed = now - startTime;
                        const t = Math.min(1, elapsed / duration);
                        const next = start + (target - start) * easeOut(t);
                        window.scrollTo(0, next);
                        if (t < 1) requestAnimationFrame(step);
                    };
                    requestAnimationFrame(step);
                }, { y: amount, duration: durationMs });
                await page.waitForTimeout(baseDelay(durationMs));
            }
            result = amount;
            break;
        }
        case 'screenshot':
            logs.push('Capturing screenshot...');
            try {
                const shotUrl = await captureScreenshot(act.label || act.value || '');
                result = shotUrl;
                logs.push(`Screenshot saved: ${shotUrl}`);
            } catch (e) {
                logs.push(`Screenshot failed: ${e.message}`);
            }
            break;
        case 'javascript':
            logs.push('Running custom JavaScript...');
            if (act.value) {
                result = await page.evaluate((code) => {
                    const html = document.documentElement.outerHTML;
                    // eslint-disable-next-line no-eval
                    return eval(code);
                }, resolveMaybe(act.value));
            }
            break;
        case 'csv': {
            const source = act.value ? resolveMaybe(act.value) : lastBlockOutput;
            if (typeof source === 'string') {
                result = parseCsv(source);
            } else if (Array.isArray(source) || (source && typeof source === 'object')) {
                result = source;
            } else {
                result = [];
            }
            logs.push(`Parsed ${Array.isArray(result) ? result.length : 0} CSV rows.`);
            break;
        }
        case 'merge': {
            const sources = getMergeSources(act.value || '', runtimeVars, resolveTemplate);
            const merged = mergeSources(sources);
            if (act.varName) {
                const targetName = normalizeVarRef(act.varName);
                runtimeVars[String(targetName)] = merged;
            }
            if (Array.isArray(merged)) {
                logs.push(`Merged ${merged.length} item(s).`);
            } else if (merged && typeof merged === 'object') {
                logs.push(`Merged ${Object.keys(merged).length} field(s).`);
            } else {
                logs.push('Merged values.');
            }
            result = merged;
            break;
        }
        case 'set':
            if (act.varName) {
                const resolved = resolveMaybe(act.value || '');
                const parsed = parseValue(resolved);
                runtimeVars[String(act.varName)] = parsed;
                logs.push(`Set variable ${act.varName}`);
                result = parsed;
            }
            break;
        case 'stop':
            setStopRequested(true);
            setStopOutcome(act.value === 'error' ? 'error' : 'success');
            logs.push(`Stop task (${act.value === 'error' ? 'error' : 'success'}).`);
            result = act.value === 'error' ? 'error' : 'success';
            break;
        case 'start': {
            const taskId = resolveMaybe(act.value);
            if (!taskId) throw new Error('Missing task id.');
            const apiKey = (await loadApiKey()) || context.options.apiKey; // Handle API key from context option if needed, but mainly loadApiKey
            if (!apiKey) {
                logs.push('No API key available; attempting internal start.');
            }
            logs.push(`Starting task: ${taskId}`);
            const headers = {
                'Content-Type': 'application/json',
                'x-internal-run': '1'
            };
            if (apiKey) {
                headers['x-api-key'] = apiKey;
            }
            const response = await fetch(`${baseUrl}/tasks/${taskId}/api`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    variables: runtimeVars,
                    taskVariables: runtimeVars,
                    runSource: 'agent_block',
                    taskId
                })
            });
            const payload = await response.json();
            if (!response.ok) {
                const detail = payload?.error || payload?.message || response.statusText;
                throw new Error(`Start task failed: ${detail}`);
            }
            result = payload?.data ?? payload?.html ?? payload;
            break;
        }
    }
    return result;
};

module.exports = {
    executeAction
};
