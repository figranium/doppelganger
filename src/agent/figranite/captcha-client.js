const { loadCaptchaSettings } = require('../../server/storage');
const { solveLocalCaptcha, readToken } = require('./captcha-local-solver');
const { parseFlag } = require('./captcha-model-manager');
const { validateUrl } = require('../../../url-utils');

const TASK_TYPES = Object.freeze({
    recaptcha_v2: { proxyless: 'RecaptchaV2TaskProxyless', proxy: 'RecaptchaV2Task' },
    recaptcha_v3: { proxyless: 'RecaptchaV3TaskProxyless', proxy: null },
    hcaptcha: { proxyless: 'HCaptchaTaskProxyless', proxy: 'HCaptchaTask' },
    turnstile: { proxyless: 'TurnstileTaskProxyless', proxy: null }
});
const capabilityCache = new Map();

function numberEnv(name, fallback, { min = 1, max = 600_000 } = {}) {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function redactSecrets(message, secrets = []) {
    let output = String(message || 'Unknown CAPTCHA solver error');
    for (const secret of secrets) {
        if (secret && String(secret).length >= 3) output = output.split(String(secret)).join('[REDACTED]');
    }
    output = output.replace(/(clientKey|apiKey|proxyPassword|password|authorization|cookie|token)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
    return output;
}

async function resolveSolverConfig() {
    const stored = await loadCaptchaSettings();
    const baseUrl = process.env.CAPTCHA_SOLVER_URL || process.env.OHMYCAPTCHA_URL || stored?.baseUrl || '';
    const clientKey = process.env.CAPTCHA_SOLVER_KEY || process.env.OHMYCAPTCHA_CLIENT_KEY || stored?.clientKey || '';
    return { baseUrl: baseUrl.replace(/\/+$/, ''), clientKey };
}

function parseCaptchaFrameUrl(rawUrl) {
    let url;
    try { url = new URL(rawUrl); } catch { return null; }
    const queryKey = url.searchParams.get('k') || url.searchParams.get('sitekey');
    if (url.hostname.includes('hcaptcha.com')) return queryKey ? { siteKey: queryKey, captchaType: 'hcaptcha' } : null;
    if (url.hostname.includes('recaptcha') || url.pathname.includes('/recaptcha/')) {
        return queryKey ? { siteKey: queryKey, captchaType: 'recaptcha_v2' } : null;
    }
    if (!url.hostname.includes('challenges.cloudflare.com')) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    const pathKey = segments.find((segment) => /^(?:0x|3x)[A-Za-z0-9_-]{8,}$/.test(segment));
    const siteKey = queryKey || pathKey;
    return siteKey ? { siteKey, captchaType: 'turnstile', managed: url.pathname.includes('/challenge-platform/') && !/^3x0+$/.test(siteKey) } : null;
}

async function locatorIsInteractable(locator, page) {
    if (!locator) return false;
    const visible = await locator.isVisible?.({ timeout: 150 }).catch(() => false);
    if (!visible) return false;
    const enabled = await locator.isEnabled?.({ timeout: 150 }).catch(() => true);
    if (!enabled) return false;
    const receivesPointer = await locator.evaluate?.((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.pointerEvents !== 'none' && style.visibility !== 'hidden' && style.display !== 'none'
            && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0
            && element.getAttribute('aria-disabled') !== 'true';
    }).catch(() => true);
    if (!receivesPointer) return false;
    const firstBox = await locator.boundingBox?.().catch(() => null);
    if (!firstBox) return true;
    await (page.waitForTimeout?.(75) || new Promise((resolve) => setTimeout(resolve, 75)));
    const secondBox = await locator.boundingBox?.().catch(() => null);
    if (!secondBox) return false;
    return Math.abs(firstBox.x - secondBox.x) < 1 && Math.abs(firstBox.y - secondBox.y) < 1
        && Math.abs(firstBox.width - secondBox.width) < 1 && Math.abs(firstBox.height - secondBox.height) < 1;
}

async function locatorIsVisible(locator) {
    if (!locator || typeof locator.isVisible !== 'function') return false;
    return locator.isVisible({ timeout: 150 }).catch(() => false);
}

async function detectCaptcha(page, selector, { requireReady = false } = {}) {
    const detected = await page.evaluate((sel) => {
        const root = sel ? document.querySelector(sel) : document;
        if (!root) return null;
        const widget = root.matches?.('[data-sitekey]') ? root : root.querySelector('[data-sitekey], .g-recaptcha, .h-captcha, .cf-turnstile');
        const captured = globalThis.__figraniumCaptcha?.turnstile;
        const capturedInScope = !sel || root === captured?.container || (captured?.container && root.contains?.(captured.container))
            || Boolean(root.querySelector?.('iframe[src*="challenges.cloudflare.com"], [name="cf-turnstile-response"]'));
        if (!widget && captured?.siteKey && capturedInScope) {
            return {
                siteKey: captured.siteKey,
                captchaType: 'turnstile',
                action: captured.action || undefined,
                cData: captured.cData || undefined,
                chlPageData: captured.chlPageData || undefined,
                callback: captured.callbackName || undefined,
                managed: Boolean(captured.managed),
                intercepted: Boolean(captured.blocked),
                userAgent: captured.userAgent || navigator.userAgent,
                ready: Boolean(captured.readyAt)
            };
        }
        if (!widget) return null;
        let captchaType = 'recaptcha_v2';
        if (widget.classList.contains('h-captcha')) captchaType = 'hcaptcha';
        else if (widget.classList.contains('cf-turnstile')) captchaType = 'turnstile';
        else if (widget.getAttribute('data-action')) captchaType = 'recaptcha_v3';
        const invisible = captchaType === 'recaptcha_v3' || widget.getAttribute('data-size') === 'invisible';
        const rect = widget.getBoundingClientRect();
        const style = getComputedStyle(widget);
        return {
            siteKey: widget.getAttribute('data-sitekey'),
            captchaType,
            action: widget.getAttribute('data-action') || captured?.action || undefined,
            callback: widget.getAttribute('data-callback') || undefined,
            dataS: widget.getAttribute('data-s') || undefined,
            invisible,
            cData: captured?.cData || undefined,
            chlPageData: captured?.chlPageData || undefined,
            managed: Boolean(captured?.managed),
            intercepted: Boolean(captured?.blocked),
            userAgent: captured?.userAgent || navigator.userAgent,
            ready: Boolean(captured?.readyAt) || invisible || (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden')
        };
    }, selector || null);
    if (detected?.siteKey && (!requireReady || detected.intercepted || detected.invisible)) return detected;
    for (const frame of page.frames?.() || []) {
        const frameDetected = parseCaptchaFrameUrl(frame.url());
        if (!frameDetected) continue;
        if (selector && frame.frameElement) {
            const frameElement = await frame.frameElement().catch(() => null);
            const inScope = await frameElement?.evaluate((element, sel) => Boolean(document.querySelector(sel)?.contains(element)), selector).catch(() => false);
            if (!inScope) continue;
        }
        if (detected?.captchaType && detected.captchaType !== frameDetected.captchaType) continue;
        if (!requireReady) return { ...frameDetected, ...detected };

        let ready = false;
        if (frameDetected.captchaType === 'recaptcha_v2') {
            ready = await locatorIsInteractable(frame.locator?.('#recaptcha-anchor, [role="checkbox"]').first?.(), page);
            if (!ready && frame.url().includes('/bframe')) {
                ready = await locatorIsVisible(frame.locator?.('.rc-imageselect-table-33, .rc-imageselect-table-44').first?.());
            }
        } else if (frameDetected.captchaType === 'hcaptcha') {
            ready = await locatorIsInteractable(frame.locator?.('#checkbox, [role="checkbox"]').first?.(), page);
            if (!ready) ready = await locatorIsVisible(frame.locator?.('.task-grid').first?.());
        } else {
            const target = frame.locator?.('input[type="checkbox"], [role="checkbox"], button, label').first?.();
            ready = await locatorIsInteractable(target, page);
            if (!ready) {
                const frameElement = await frame.frameElement?.().catch(() => null);
                ready = await frameElement?.isVisible?.().catch(() => false) || Boolean(detected?.ready);
            }
        }
        if (ready) return { ...frameDetected, ...detected, ready: true };
    }
    if (detected?.siteKey && (!requireReady || detected.ready !== false)
        && (!requireReady || detected.ready === undefined || typeof page.frames !== 'function')) return detected;
    return null;
}

async function waitForCaptcha(page, { captchaType, selector, timeout = 120_000 } = {}) {
    const startedAt = Date.now();
    const deadline = startedAt + Math.max(1, timeout);
    do {
        const detected = await detectCaptcha(page, selector, { requireReady: true });
        if (detected && (!captchaType || detected.captchaType === captchaType)) {
            return {
                ready: true,
                challenge: captchaType || detected.captchaType,
                duration: Date.now() - startedAt,
                ...(detected.siteKey ? { siteKey: detected.siteKey } : {}),
                detected
            };
        }
        if (Date.now() >= deadline) break;
        const delay = Math.min(150, Math.max(1, deadline - Date.now()));
        if (page.waitForTimeout) await page.waitForTimeout(delay); else await new Promise((resolve) => setTimeout(resolve, delay));
    } while (Date.now() <= deadline);
    const error = new Error(`wait_captcha: no ready${captchaType ? ` ${captchaType}` : ''} CAPTCHA found within ${timeout}ms`);
    error.noChallengeFound = true;
    throw error;
}

async function requestJson(url, { method = 'GET', body, timeout, secrets = [] } = {}) {
    let response;
    try {
        const validatedUrl = await validateUrl(url);
        response = await fetch(new URL(validatedUrl), {
            method,
            headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            redirect: 'manual',
            signal: AbortSignal.timeout(Math.max(1, timeout))
        });
    } catch (error) {
        let endpoint = 'configured endpoint';
        try { endpoint = new URL(url).origin; } catch { /* already described without echoing the URL */ }
        throw new Error(redactSecrets(`network failure at ${endpoint}: ${error.message}`, secrets));
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
        throw new Error('remote solver redirects are not allowed');
    }
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error(`remote solver returned malformed JSON (HTTP ${response.status})`); }
    if (!response.ok || payload.errorId) {
        throw new Error(redactSecrets(payload.errorDescription || payload.errorCode || `remote solver HTTP ${response.status}`, secrets));
    }
    return payload;
}

async function postJson(baseUrl, endpoint, body, timeout, secrets = []) {
    return requestJson(`${baseUrl}${endpoint}`, { method: 'POST', body, timeout, secrets });
}

async function getEndpointCapabilities(baseUrl, timeout = 1500) {
    if (capabilityCache.has(baseUrl)) return capabilityCache.get(baseUrl);
    const promise = requestJson(`${baseUrl}/capabilities`, { timeout }).catch(() => null);
    capabilityCache.set(baseUrl, promise);
    return promise;
}

function buildProxyTaskFields(proxy, userAgent) {
    if (!proxy?.server) return null;
    let parsed;
    try { parsed = new URL(proxy.server.includes('://') ? proxy.server : `http://${proxy.server}`); }
    catch { throw new Error('active browser proxy has an invalid URL'); }
    const proxyType = parsed.protocol.replace(':', '').toLowerCase();
    if (!['http', 'https', 'socks4', 'socks5'].includes(proxyType)) throw new Error(`unsupported remote solver proxy protocol: ${proxyType}`);
    const port = Number(parsed.port || (proxyType === 'https' ? 443 : 80));
    return {
        proxyType,
        proxyAddress: parsed.hostname,
        proxyPort: port,
        ...((proxy.username || parsed.username) ? { proxyLogin: proxy.username || decodeURIComponent(parsed.username) } : {}),
        ...((proxy.password || parsed.password) ? { proxyPassword: proxy.password || decodeURIComponent(parsed.password) } : {}),
        ...(userAgent ? { userAgent } : {})
    };
}

async function collectBrowserContext(page, identity = {}) {
    const metadata = await page.evaluate(() => ({
        userAgent: navigator.userAgent,
        locale: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        viewport: { width: window.innerWidth, height: window.innerHeight, deviceScaleFactor: window.devicePixelRatio || 1 }
    })).catch(() => ({}));
    const origin = new URL(page.url()).origin;
    let cookies = [];
    try { cookies = await page.context().cookies(origin); } catch { /* fake pages and limited engines */ }
    return {
        version: 1,
        origin,
        userAgent: metadata.userAgent || identity.userAgent,
        locale: metadata.locale || identity.locale,
        timezone: metadata.timezone || identity.timezone,
        viewport: metadata.viewport || identity.viewport,
        cookies: cookies.map(({ name, value, domain, path, expires, httpOnly, secure, sameSite }) => ({ name, value, domain, path, expires, httpOnly, secure, sameSite }))
    };
}

async function buildRemoteTask(page, detected, captchaType, config, identity = {}) {
    const mapping = TASK_TYPES[captchaType];
    if (!mapping) throw new Error(`unsupported captchaType "${captchaType}"`);
    const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => identity.userAgent || null);
    const forwardProxy = parseFlag(process.env.CAPTCHA_REMOTE_FORWARD_PROXY) && identity.proxy;
    if (forwardProxy && !mapping.proxy) throw new Error(`${captchaType} has no compatible proxy-backed task type`);
    const task = {
        type: forwardProxy ? mapping.proxy : mapping.proxyless,
        websiteURL: page.url(),
        websiteKey: detected.siteKey
    };
    if (detected.action) {
        if (captchaType === 'turnstile') task.action = detected.action;
        else task.pageAction = detected.action;
    }
    if (detected.dataS) task.recaptchaDataSValue = detected.dataS;
    if (detected.invisible) task.isInvisible = true;
    if (captchaType === 'turnstile' && (detected.cData || detected.chlPageData)) {
        let hostname = '';
        try { hostname = new URL(config.baseUrl).hostname.toLowerCase(); } catch { /* validated when requests are sent */ }
        const antiCaptchaDialect = hostname.includes('anti-captcha.com');
        const twoCaptchaDialect = hostname.includes('2captcha.com') || hostname.includes('yescaptcha.com');
        if (!antiCaptchaDialect) {
            if (detected.cData) task.data = detected.cData;
            if (detected.chlPageData) task.pagedata = detected.chlPageData;
        }
        if (!twoCaptchaDialect) {
            if (detected.cData) task.cData = detected.cData;
            if (detected.chlPageData) task.chlPageData = detected.chlPageData;
        }
    }
    if (forwardProxy) Object.assign(task, buildProxyTaskFields(identity.proxy, userAgent));
    else if (userAgent) task.userAgent = userAgent;

    if (parseFlag(process.env.CAPTCHA_REMOTE_FORWARD_CONTEXT)) {
        const capabilities = await getEndpointCapabilities(config.baseUrl);
        const versions = capabilities?.browserContext?.versions || capabilities?.browserContextVersions || [];
        if (!versions.includes(1)) throw new Error('configured solver endpoint does not advertise browserContext version 1');
        task.browserContext = await collectBrowserContext(page, identity);
    }
    return task;
}

async function solveRemote(page, detected, captchaType, config, timeout, identity = {}) {
    const deadline = Date.now() + timeout;
    const task = await buildRemoteTask(page, detected, captchaType, config, identity);
    const secrets = [config.clientKey, identity.proxy?.password, ...(task.browserContext?.cookies || []).map((cookie) => cookie.value)];
    const created = await postJson(config.baseUrl, '/createTask', { clientKey: config.clientKey, task }, deadline - Date.now(), secrets);
    if (!created.taskId) throw new Error('remote solver did not return a taskId');
    while (Date.now() < deadline) {
        const payload = await postJson(config.baseUrl, '/getTaskResult', { clientKey: config.clientKey, taskId: created.taskId }, deadline - Date.now(), secrets);
        if (payload.status === 'ready') {
            const token = payload.solution?.gRecaptchaResponse || payload.solution?.token || payload.solution?.answer;
            if (!token) throw new Error('remote solver returned no usable token');
            return { token, provider: 'remote', device: 'provider', solution: payload.solution };
        }
        if (payload.status !== 'processing') throw new Error(`remote solver returned unexpected status "${payload.status}"`);
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000, Math.max(1, deadline - Date.now()))));
    }
    throw new Error('remote solver timed out waiting for a solution');
}

async function injectSolution(page, captchaType, token, callbackName) {
    return page.evaluate(({ type, value, configuredCallback }) => {
        const selectors = type === 'hcaptcha'
            ? ['textarea[name="h-captcha-response"]', 'textarea[name="g-recaptcha-response"]']
            : type === 'turnstile'
                ? ['input[name="cf-turnstile-response"]', 'textarea[name="cf-turnstile-response"]']
                : ['#g-recaptcha-response', 'textarea[name="g-recaptcha-response"]'];
        for (const selector of selectors) for (const element of document.querySelectorAll(selector)) {
            const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
            if (setter) setter.call(element, value); else element.value = value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        }
        let callbackInvoked = false;
        if (type === 'turnstile') {
            const captured = globalThis.__figraniumCaptcha?.turnstile;
            if (typeof captured?.callback === 'function') {
                captured.callback(value);
                captured.callbackInvoked = true;
                callbackInvoked = true;
            }
        }
        const resolveCallback = (name) => name?.split('.').reduce((object, key) => object?.[key], window);
        for (const name of [configuredCallback, 'grecaptchaCallback', 'hcaptchaCallback', 'turnstileCallback']) {
            const callback = resolveCallback(name);
            if (typeof callback === 'function') { callback(value); callbackInvoked = true; break; }
        }
        return { callbackInvoked };
    }, { type: captchaType, value: token, configuredCallback: callbackName });
}

async function waitForCaptchaCompletion(page, captchaType, detected, timeout) {
    const deadline = Date.now() + Math.max(1, timeout);
    const initialUrl = page.url();
    do {
        const token = await readToken(page, captchaType);
        if (token) return { method: 'token' };
        if (detected.managed) {
            if (page.url() !== initialUrl) return { method: 'navigation' };
            const stillPresent = (page.frames?.() || []).some((frame) => frame.url().includes('challenges.cloudflare.com/cdn-cgi/challenge-platform'));
            if (!stillPresent) return { method: 'challenge-cleared' };
        }
        if (Date.now() >= deadline) break;
        const delay = Math.min(150, Math.max(1, deadline - Date.now()));
        if (page.waitForTimeout) await page.waitForTimeout(delay); else await new Promise((resolve) => setTimeout(resolve, delay));
    } while (Date.now() <= deadline);
    throw new Error(`${captchaType} solution was injected but the page did not confirm completion`);
}

async function applyManagedChallengeUserAgent(page, userAgent, logs) {
    if (!userAgent) return;
    await page.setExtraHTTPHeaders?.({ 'user-agent': userAgent });
    await page.evaluate((value) => {
        try { Object.defineProperty(Navigator.prototype, 'userAgent', { configurable: true, get: () => value }); } catch { /* best effort */ }
        try { Object.defineProperty(Navigator.prototype, 'appVersion', { configurable: true, get: () => value.replace(/^Mozilla\//, '') }); } catch { /* best effort */ }
    }, userAgent);
    logs.push('[CAPTCHA] Applied the managed-challenge solver user agent before callback submission');
}

async function solveCaptcha(page, { captchaType, selector, timeout = 60_000, detectionTimeout, logs = [], identity = {} } = {}) {
    const startedAt = Date.now();
    const ready = await waitForCaptcha(page, {
        captchaType,
        selector,
        timeout: Math.min(timeout, detectionTimeout ?? timeout)
    }).catch((error) => {
        error.message = error.message.replace(/^wait_captcha: no ready(.*?) CAPTCHA found within/, 'solve_captcha: no CAPTCHA challenge$1 became ready within');
        throw error;
    });
    const detected = ready.detected;
    const resolvedType = captchaType || detected.captchaType;
    if (!TASK_TYPES[resolvedType]) throw new Error(`solve_captcha: unsupported captchaType "${resolvedType}"`);
    const attempts = [];
    const config = await resolveSolverConfig();
    const skipLocal = parseFlag(process.env.SKIP_LOCAL_CAPTCHA_MODEL);
    const remainingAfterDetection = Math.max(1, timeout - (Date.now() - startedAt));
    const localReserve = skipLocal ? 0 : Math.min(remainingAfterDetection - 1, numberEnv('CAPTCHA_LOCAL_FALLBACK_MIN_MS', 15_000, { min: 1000 }));
    const configuredRemoteTimeout = numberEnv('CAPTCHA_REMOTE_TIMEOUT_MS', Math.max(1, remainingAfterDetection - localReserve));
    const remoteTimeout = Math.max(1, Math.min(configuredRemoteTimeout, remainingAfterDetection - localReserve));
    let result;

    if (config.baseUrl) {
        const attemptStarted = Date.now();
        try {
            result = await solveRemote(page, detected, resolvedType, config, remoteTimeout, identity);
            if (detected.managed && result.solution?.userAgent && detected.userAgent && result.solution.userAgent !== detected.userAgent) {
                await applyManagedChallengeUserAgent(page, result.solution.userAgent, logs);
            }
            attempts.push({ provider: 'remote', status: 'success', duration: Date.now() - attemptStarted });
        } catch (error) {
            const safeMessage = redactSecrets(error.message, [config.clientKey, identity.proxy?.password]);
            attempts.push({ provider: 'remote', status: 'failed', duration: Date.now() - attemptStarted, error: safeMessage });
            logs.push(`Remote CAPTCHA solver failed; trying local solver: ${safeMessage}`);
        }
    } else {
        attempts.push({ provider: 'remote', status: 'unavailable', duration: 0, error: 'CAPTCHA_SOLVER_URL is not configured' });
    }

    if (!result && detected.managed) {
        attempts.push({ provider: 'local', status: 'unsupported', duration: 0, error: 'managed Turnstile challenges require a configured remote solver' });
    } else if (!result && !skipLocal) {
        const attemptStarted = Date.now();
        try {
            result = await solveLocalCaptcha(page, { captchaType: resolvedType, timeout: Math.max(1, timeout - (Date.now() - startedAt)), logs });
            attempts.push({ provider: 'local', status: 'success', duration: Date.now() - attemptStarted });
        } catch (error) {
            const safeMessage = redactSecrets(error.message);
            attempts.push({ provider: 'local', status: 'failed', duration: Date.now() - attemptStarted, error: safeMessage });
            logs.push(`[CAPTCHA] Local ${resolvedType} solver failed: ${safeMessage}`);
        }
    } else if (!result) {
        attempts.push({ provider: 'local', status: 'disabled', duration: 0, error: 'disabled by SKIP_LOCAL_CAPTCHA_MODEL' });
    }

    if (!result) {
        const error = new Error(`solve_captcha: no solver route succeeded (${attempts.map((attempt) => `${attempt.provider}: ${attempt.error}`).join('; ')})`);
        error.attempts = attempts;
        throw error;
    }
    await injectSolution(page, resolvedType, result.token, detected.callback);
    await waitForCaptchaCompletion(page, resolvedType, detected, Math.max(1, timeout - (Date.now() - startedAt)));
    return {
        success: true,
        challenge: resolvedType,
        duration: Date.now() - startedAt,
        provider: result.provider,
        ...(result.model ? { model: result.model } : {}),
        ...(result.device ? { device: result.device } : {}),
        attempts
    };
}

module.exports = {
    TASK_TYPES,
    solveCaptcha,
    solveRemote,
    injectSolution,
    detectCaptcha,
    waitForCaptcha,
    waitForCaptchaCompletion,
    applyManagedChallengeUserAgent,
    parseCaptchaFrameUrl,
    resolveSolverConfig,
    requestJson,
    postJson,
    getEndpointCapabilities,
    buildProxyTaskFields,
    collectBrowserContext,
    buildRemoteTask,
    redactSecrets
};
