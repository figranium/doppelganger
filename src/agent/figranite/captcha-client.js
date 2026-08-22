const os = require('os');
const fs = require('fs');
const { loadCaptchaSettings, loadEmbeddedCaptchaClientKey } = require('../../server/storage');

const MIN_REQUIRED_MB = 2048;
const CGROUP_V2_PATH = '/sys/fs/cgroup/memory.max';
const CGROUP_V1_PATH = '/sys/fs/cgroup/memory/memory.limit_in_bytes';

const CAPTCHA_TYPE_TASK_MAP = {
    recaptcha_v2: 'RecaptchaV2TaskProxyless',
    recaptcha_v3: 'RecaptchaV3TaskProxyless',
    hcaptcha: 'HCaptchaTaskProxyless',
    turnstile: 'TurnstileTaskProxyless'
};

function readCgroupLimitMb() {
    for (const path of [CGROUP_V2_PATH, CGROUP_V1_PATH]) {
        try {
            const raw = fs.readFileSync(path, 'utf8').trim();
            if (raw === 'max') continue;
            const bytes = Number(raw);
            if (Number.isFinite(bytes) && bytes > 0) return bytes / (1024 * 1024);
        } catch {
            // Not present on this platform/container — try the next path.
        }
    }
    return null;
}

// Requires at least 2 GB of available memory: the bundled solver runs its own headless browser.
function assertMemoryAllowed() {
    const osMb = os.totalmem() / (1024 * 1024);
    const cgroupMb = readCgroupLimitMb();
    const effectiveMb = cgroupMb !== null && cgroupMb < osMb ? cgroupMb : osMb;
    if (effectiveMb < MIN_REQUIRED_MB) {
        throw new Error('CAPTCHA solving disabled: requires at least 2 GB RAM');
    }
}

async function resolveSolverConfig() {
    const stored = await loadCaptchaSettings();
    const baseUrl = process.env.OHMYCAPTCHA_URL || stored?.baseUrl || 'http://127.0.0.1:8000';
    const clientKey = process.env.OHMYCAPTCHA_CLIENT_KEY || stored?.clientKey || (await loadEmbeddedCaptchaClientKey()) || '';
    return { baseUrl: baseUrl.replace(/\/+$/, ''), clientKey };
}

async function detectCaptcha(page, selector) {
    return page.evaluate((sel) => {
        const root = sel ? document.querySelector(sel) : document;
        if (!root) return null;

        const widget = root.querySelector('[data-sitekey]') || root.querySelector('.g-recaptcha, .h-captcha, .cf-turnstile');
        if (!widget) return null;

        const siteKey = widget.getAttribute('data-sitekey');
        if (!siteKey) return null;

        let captchaType = 'recaptcha_v2';
        if (widget.classList.contains('h-captcha')) captchaType = 'hcaptcha';
        else if (widget.classList.contains('cf-turnstile')) captchaType = 'turnstile';
        else if (widget.getAttribute('data-size') === 'invisible' && widget.getAttribute('data-badge')) captchaType = 'recaptcha_v3';

        return { siteKey, captchaType };
    }, selector || null);
}

async function postJson(baseUrl, path, body) {
    let response;
    try {
        response = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (err) {
        throw new Error(
            `solve_captcha: could not reach the captcha-solving service at ${baseUrl} (${err.message}). ` +
            `In Docker this starts automatically; outside Docker run "npm run captcha:dev" first, ` +
            `or set OHMYCAPTCHA_URL to point at a running instance.`
        );
    }
    return { response, payload: await response.json() };
}

async function createTask(baseUrl, clientKey, task) {
    const { response, payload } = await postJson(baseUrl, '/createTask', { clientKey, task });
    if (!response.ok || payload.errorId) {
        throw new Error(`solve_captcha: createTask failed: ${payload.errorDescription || response.statusText}`);
    }
    return payload.taskId;
}

async function pollTaskResult(baseUrl, clientKey, taskId, timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const { response, payload } = await postJson(baseUrl, '/getTaskResult', { clientKey, taskId });
        if (!response.ok || payload.errorId) {
            throw new Error(`solve_captcha: getTaskResult failed: ${payload.errorDescription || response.statusText}`);
        }
        if (payload.status === 'ready') return payload.solution;
        await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error('solve_captcha: timed out waiting for a solution');
}

async function injectSolution(page, captchaType, token) {
    await page.evaluate(({ captchaType: type, token: value }) => {
        const setField = (selector, fieldValue) => {
            const el = document.querySelector(selector);
            if (!el) return false;
            el.innerHTML = fieldValue;
            el.value = fieldValue;
            return true;
        };

        if (type === 'hcaptcha') {
            setField('textarea[name="h-captcha-response"]', value);
            setField('textarea[name="g-recaptcha-response"]', value);
        } else if (type === 'turnstile') {
            setField('textarea[name="cf-turnstile-response"]', value);
        } else {
            setField('#g-recaptcha-response', value);
            setField('textarea[name="g-recaptcha-response"]', value);
        }

        if (typeof window.grecaptchaCallback === 'function') window.grecaptchaCallback(value);
        if (typeof window.hcaptchaCallback === 'function') window.hcaptchaCallback(value);
        if (typeof window.turnstileCallback === 'function') window.turnstileCallback(value);
    }, { captchaType, token });
}

// Detects, solves via the bundled ohmycaptcha service, and injects the solution into the page.
async function solveCaptcha(page, { captchaType, selector, timeout = 60000 } = {}) {
    assertMemoryAllowed();

    // baseUrl is an admin-configured infrastructure endpoint (defaults to our own
    // embedded loopback instance), not attacker-controlled content, so it's exempt
    // from the SSRF-oriented validateUrl() checks applied to scraped page targets.
    const { baseUrl, clientKey } = await resolveSolverConfig();

    const detected = await detectCaptcha(page, selector);
    if (!detected) {
        const err = new Error('solve_captcha: no CAPTCHA challenge found on the page');
        err.noChallengeFound = true;
        throw err;
    }

    const resolvedType = captchaType || detected.captchaType;
    const taskType = CAPTCHA_TYPE_TASK_MAP[resolvedType];
    if (!taskType) {
        throw new Error(`solve_captcha: unsupported captchaType "${resolvedType}"`);
    }

    const startedAt = Date.now();
    const taskId = await createTask(baseUrl, clientKey, {
        type: taskType,
        websiteURL: page.url(),
        websiteKey: detected.siteKey
    });

    const solution = await pollTaskResult(baseUrl, clientKey, taskId, timeout);
    const token = solution.gRecaptchaResponse || solution.token || solution.answer;
    if (!token) {
        throw new Error('solve_captcha: solver returned no usable token');
    }

    await injectSolution(page, resolvedType, token);

    return { success: true, challenge: resolvedType, duration: Date.now() - startedAt };
}

module.exports = { solveCaptcha };
