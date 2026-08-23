const { loadCaptchaSettings } = require('../../server/storage');
const { solveLocalCaptcha } = require('./captcha-local-solver');
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

async function detectCaptcha(page, selector) {
    const detected = await page.evaluate((sel) => {
        const root = sel ? document.querySelector(sel) : document;
        if (!root) return null;
        const widget = root.matches?.('[data-sitekey]') ? root : root.querySelector('[data-sitekey], .g-recaptcha, .h-captcha, .cf-turnstile');
        if (!widget) return null;
        let captchaType = 'recaptcha_v2';
        if (widget.classList.contains('h-captcha')) captchaType = 'hcaptcha';
        else if (widget.classList.contains('cf-turnstile')) captchaType = 'turnstile';
        else if (widget.getAttribute('data-action')) captchaType = 'recaptcha_v3';
        const invisible = widget.getAttribute('data-size') === 'invisible';
        return {
            siteKey: widget.getAttribute('data-sitekey'),
            captchaType,
            action: widget.getAttribute('data-action') || undefined,
            callback: widget.getAttribute('data-callback') || undefined,
            dataS: widget.getAttribute('data-s') || undefined,
            invisible
        };
    }, selector || null);
    if (detected?.siteKey) return detected;
    for (const frame of page.frames?.() || []) {
        let url;
        try { url = new URL(frame.url()); } catch { continue; }
        const siteKey = url.searchParams.get('k') || url.searchParams.get('sitekey');
        if (!siteKey) continue;
        if (url.hostname.includes('hcaptcha.com')) return { siteKey, captchaType: 'hcaptcha' };
        if (url.hostname.includes('challenges.cloudflare.com')) return { siteKey, captchaType: 'turnstile' };
        if (url.hostname.includes('recaptcha')) return { siteKey, captchaType: 'recaptcha_v2' };
    }
    return null;
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
    if (detected.action) task.pageAction = detected.action;
    if (detected.dataS) task.recaptchaDataSValue = detected.dataS;
    if (detected.invisible) task.isInvisible = true;
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
    await page.evaluate(({ type, value, configuredCallback }) => {
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
        const resolveCallback = (name) => name?.split('.').reduce((object, key) => object?.[key], window);
        for (const name of [configuredCallback, 'grecaptchaCallback', 'hcaptchaCallback', 'turnstileCallback']) {
            const callback = resolveCallback(name);
            if (typeof callback === 'function') { callback(value); break; }
        }
    }, { type: captchaType, value: token, configuredCallback: callbackName });
}

async function solveCaptcha(page, { captchaType, selector, timeout = 60_000, logs = [], identity = {} } = {}) {
    const detected = await detectCaptcha(page, selector);
    if (!detected) {
        const error = new Error('solve_captcha: no CAPTCHA challenge found on the page');
        error.noChallengeFound = true;
        throw error;
    }
    const resolvedType = captchaType || detected.captchaType;
    if (!TASK_TYPES[resolvedType]) throw new Error(`solve_captcha: unsupported captchaType "${resolvedType}"`);
    const startedAt = Date.now();
    const attempts = [];
    const config = await resolveSolverConfig();
    const skipLocal = parseFlag(process.env.SKIP_LOCAL_CAPTCHA_MODEL);
    const localReserve = skipLocal ? 0 : Math.min(timeout - 1, numberEnv('CAPTCHA_LOCAL_FALLBACK_MIN_MS', 15_000, { min: 1000 }));
    const configuredRemoteTimeout = numberEnv('CAPTCHA_REMOTE_TIMEOUT_MS', Math.max(1, timeout - localReserve));
    const remoteTimeout = Math.max(1, Math.min(configuredRemoteTimeout, timeout - localReserve));
    let result;

    if (config.baseUrl) {
        const attemptStarted = Date.now();
        try {
            result = await solveRemote(page, detected, resolvedType, config, remoteTimeout, identity);
            attempts.push({ provider: 'remote', status: 'success', duration: Date.now() - attemptStarted });
        } catch (error) {
            const safeMessage = redactSecrets(error.message, [config.clientKey, identity.proxy?.password]);
            attempts.push({ provider: 'remote', status: 'failed', duration: Date.now() - attemptStarted, error: safeMessage });
            logs.push(`Remote CAPTCHA solver failed; trying local solver: ${safeMessage}`);
        }
    } else {
        attempts.push({ provider: 'remote', status: 'unavailable', duration: 0, error: 'CAPTCHA_SOLVER_URL is not configured' });
    }

    if (!result && !skipLocal) {
        const attemptStarted = Date.now();
        try {
            result = await solveLocalCaptcha(page, { captchaType: resolvedType, timeout: Math.max(1, timeout - (Date.now() - startedAt)), logs });
            attempts.push({ provider: 'local', status: 'success', duration: Date.now() - attemptStarted });
        } catch (error) {
            attempts.push({ provider: 'local', status: 'failed', duration: Date.now() - attemptStarted, error: redactSecrets(error.message) });
        }
    } else if (!result) {
        attempts.push({ provider: 'local', status: 'disabled', duration: 0, error: 'disabled by SKIP_LOCAL_CAPTCHA_MODEL' });
    }

    if (!result) {
        throw new Error(`solve_captcha: no solver route succeeded (${attempts.map((attempt) => `${attempt.provider}: ${attempt.error}`).join('; ')})`);
    }
    await injectSolution(page, resolvedType, result.token, detected.callback);
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
    resolveSolverConfig,
    requestJson,
    postJson,
    getEndpointCapabilities,
    buildProxyTaskFields,
    collectBrowserContext,
    buildRemoteTask,
    redactSecrets
};
