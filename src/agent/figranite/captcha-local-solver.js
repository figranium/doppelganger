const { captchaModelManager } = require('./captcha-model-manager');
const { solveImageGrid, PROVIDERS } = require('./captcha-grid-solver');

const TOKEN_SELECTORS = Object.freeze({
    recaptcha_v2: ['#g-recaptcha-response', 'textarea[name="g-recaptcha-response"]'],
    hcaptcha: ['textarea[name="h-captcha-response"]', 'textarea[name="g-recaptcha-response"]'],
    turnstile: ['input[name="cf-turnstile-response"]', 'textarea[name="cf-turnstile-response"]']
});

async function readToken(page, captchaType) {
    return page.evaluate(({ type, selectors }) => {
        for (const selector of selectors[type] || []) {
            for (const element of document.querySelectorAll(selector)) {
                const value = String(element.value || element.getAttribute('value') || '').trim();
                if (value) return value;
            }
        }
        if (type === 'recaptcha_v2' && globalThis.grecaptcha?.getResponse) {
            try { return globalThis.grecaptcha.getResponse() || ''; } catch { /* widget id may be required */ }
        }
        if (type === 'hcaptcha' && globalThis.hcaptcha?.getResponse) {
            try { return globalThis.hcaptcha.getResponse() || ''; } catch { /* widget id may be required */ }
        }
        if (type === 'turnstile' && globalThis.turnstile?.getResponse) {
            try { return globalThis.turnstile.getResponse() || ''; } catch { /* widget id may be required */ }
        }
        return '';
    }, { type: captchaType, selectors: TOKEN_SELECTORS }).catch(() => '');
}

async function waitForToken(page, captchaType, timeout) {
    const deadline = Date.now() + Math.max(0, timeout);
    do {
        const token = await readToken(page, captchaType);
        if (token) return token;
        if (Date.now() >= deadline) break;
        await page.waitForTimeout(Math.min(150, Math.max(1, deadline - Date.now())));
    } while (Date.now() <= deadline);
    return null;
}

async function waitForTokenOrChallenge(page, captchaType, timeout) {
    const adapter = PROVIDERS[captchaType];
    const deadline = Date.now() + Math.max(0, timeout);
    do {
        const token = await readToken(page, captchaType);
        if (token) return token;
        if (adapter) {
            for (const frame of page.frames?.() || []) {
                if (!adapter.framePatterns.some((pattern) => frame.url().includes(pattern))) continue;
                if (await frame.locator(adapter.grid).first().isVisible({ timeout: 100 }).catch(() => false)) return null;
            }
        }
        if (Date.now() >= deadline) break;
        await page.waitForTimeout(Math.min(150, Math.max(1, deadline - Date.now())));
    } while (Date.now() <= deadline);
    return null;
}

async function clickCheckbox(page, captchaType) {
    const patterns = captchaType === 'hcaptcha'
        ? ['hcaptcha.com/captcha', 'newassets.hcaptcha.com/captcha']
        : captchaType === 'turnstile'
            ? ['challenges.cloudflare.com']
            : ['/recaptcha/api2/anchor', '/recaptcha/enterprise/anchor'];
    const selector = captchaType === 'hcaptcha'
        ? '#checkbox, [role="checkbox"]'
        : captchaType === 'turnstile'
            ? 'input[type="checkbox"], [role="checkbox"]'
            : '#recaptcha-anchor, [role="checkbox"]';
    for (const frame of page.frames?.() || []) {
        if (!patterns.some((pattern) => frame.url().includes(pattern))) continue;
        const checkbox = frame.locator(selector).first();
        if (!await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) continue;
        const box = await checkbox.boundingBox().catch(() => null);
        if (box && page.mouse) {
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;
            await page.mouse.move(x, y, { steps: 8 });
            await page.mouse.down();
            await page.waitForTimeout(45);
            await page.mouse.up();
        } else {
            await checkbox.click({ timeout: 2000 });
        }
        return true;
    }
    return false;
}

async function executeHcaptchaWidget(page) {
    return page.evaluate(() => {
        if (typeof globalThis.hcaptcha?.execute !== 'function') return false;
        try {
            const pending = globalThis.hcaptcha.execute();
            if (pending && typeof pending.catch === 'function') pending.catch(() => {});
            return true;
        } catch {
            return false;
        }
    }).catch(() => false);
}

async function solveLocalCaptcha(page, { captchaType, timeout = 60_000, logs = [] } = {}) {
    if (!['recaptcha_v2', 'hcaptcha', 'turnstile'].includes(captchaType)) {
        throw new Error(`Local solver does not support ${captchaType}`);
    }
    const deadline = Date.now() + Math.max(1, timeout);
    let usedVisionModel = false;
    let token = await readToken(page, captchaType);
    if (!token) {
        await clickCheckbox(page, captchaType).catch((error) => logs.push(`Local ${captchaType} checkbox click failed: ${error.message}`));
        const initialWait = captchaType === 'hcaptcha' ? 1500 : 7000;
        token = await waitForTokenOrChallenge(page, captchaType, Math.min(initialWait, Math.max(0, deadline - Date.now())));
        if (!token && captchaType === 'hcaptcha' && Date.now() < deadline) {
            const executed = await executeHcaptchaWidget(page);
            if (executed) logs.push('Local hcaptcha widget required programmatic execution after checkbox interaction');
            token = await waitForTokenOrChallenge(page, captchaType, Math.min(5500, Math.max(0, deadline - Date.now())));
        }
    }
    if (!token && captchaType === 'turnstile') {
        throw new Error('Turnstile did not issue a token after the active-browser interaction');
    }
    if (!token) {
        const adapter = PROVIDERS[captchaType];
        const frameDeadline = Math.min(deadline, Date.now() + 4000);
        let challengeVisible = false;
        while (!challengeVisible && Date.now() < frameDeadline) {
            for (const frame of page.frames?.() || []) {
                if (!adapter.framePatterns.some((pattern) => frame.url().includes(pattern))) continue;
                challengeVisible = await frame.locator(adapter.grid).first().isVisible({ timeout: 100 }).catch(() => false);
                if (challengeVisible) break;
            }
            if (!challengeVisible) await page.waitForTimeout(100);
        }
        if (!challengeVisible) throw new Error(`${captchaType} did not expose an image challenge or token`);
        usedVisionModel = true;
        token = await solveImageGrid(page, { captchaType, deadline, waitForToken, logs });
    }
    if (!token) throw new Error(`${captchaType} challenge ended without producing a token`);
    const status = captchaModelManager.status();
    return {
        token,
        provider: 'local',
        ...(usedVisionModel && status.activeTier ? { model: status.activeTier } : {}),
        device: usedVisionModel ? (status.device || 'cpu') : 'browser'
    };
}

module.exports = { TOKEN_SELECTORS, readToken, waitForToken, waitForTokenOrChallenge, clickCheckbox, executeHcaptchaWidget, solveLocalCaptcha };
