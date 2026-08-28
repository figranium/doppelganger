const TASK_OUTCOMES = Object.freeze(['success', 'error', 'stopped', 'crashed', 'anti_bot']);
const TASK_OUTCOME_SET = new Set(TASK_OUTCOMES);

const normalizeTaskOutcome = (value, fallback = 'success') => {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return TASK_OUTCOME_SET.has(normalized) ? normalized : fallback;
};

const resolveTaskOutcome = ({ antiBot = false, crashed = false, stopped = false, explicitOutcome } = {}) => {
    if (antiBot) return 'anti_bot';
    if (crashed) return 'crashed';
    if (stopped) return 'stopped';
    return normalizeTaskOutcome(explicitOutcome, 'success');
};

const stripPassiveMarkup = (html) => String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ');

const findAntiBotReason = ({ status, url, title, html, captchaResolved = false } = {}) => {
    const numericStatus = Number(status);
    if (numericStatus === 403 || numericStatus === 429) {
        return `main document returned HTTP ${numericStatus}`;
    }

    const currentUrl = String(url || '').toLowerCase();
    if (/\/cdn-cgi\/(challenge|challenge-platform)\b/.test(currentUrl)) {
        return 'Cloudflare challenge URL detected';
    }

    const activeMarkup = stripPassiveMarkup(html);
    const normalized = `${String(title || '')}\n${activeMarkup}`.replace(/\s+/g, ' ').toLowerCase();
    const hasChallengeWidget = /class=["'][^"']*\b(?:g-recaptcha|h-captcha|cf-turnstile)\b/i.test(activeMarkup)
        || /<iframe\b[^>]+src=["'][^"']*(?:recaptcha|hcaptcha\.com|challenges\.cloudflare\.com)/i.test(activeMarkup)
        || /<(?:input|textarea)\b[^>]+name=["'](?:g-recaptcha-response|h-captcha-response|cf-turnstile-response)["']/i.test(activeMarkup);

    if (hasChallengeWidget && !captchaResolved) return 'unresolved CAPTCHA challenge detected';
    if (normalized.includes('just a moment')
        && /(checking your browser|performing security verification|enable javascript and cookies)/.test(normalized)) {
        return 'browser verification challenge page detected';
    }
    if (normalized.includes('attention required') && normalized.includes('cloudflare')) {
        return 'Cloudflare access challenge detected';
    }
    if (normalized.includes('access denied')
        && /(request blocked|security service|incident id|reference #)/.test(normalized)) {
        return 'access-denied block page detected';
    }
    if (normalized.includes('verify you are human') && /(captcha|security check|robot)/.test(normalized)) {
        return 'human-verification challenge detected';
    }

    return null;
};

const inspectPageForAntiBot = async (page, { status } = {}) => {
    if (!page) return { detected: false, reason: null };
    let url = '';
    let title = '';
    let html = '';
    let captchaResolved = false;

    try { url = page.url?.() || ''; } catch { /* page may already be closed */ }
    try { title = await page.title?.() || ''; } catch { /* page may be navigating */ }
    try { html = await page.content?.() || ''; } catch { /* page may already be closed */ }
    try {
        captchaResolved = await page.evaluate(() => {
            const selectors = [
                '#g-recaptcha-response',
                'textarea[name="g-recaptcha-response"]',
                'textarea[name="h-captcha-response"]',
                'input[name="cf-turnstile-response"]',
                'textarea[name="cf-turnstile-response"]'
            ];
            return selectors.some((selector) => {
                const element = document.querySelector(selector);
                return Boolean(element && String(element.value || '').trim());
            });
        });
    } catch { /* content-based detection remains available */ }

    const reason = findAntiBotReason({ status, url, title, html, captchaResolved });
    return { detected: Boolean(reason), reason };
};

module.exports = {
    TASK_OUTCOMES,
    normalizeTaskOutcome,
    resolveTaskOutcome,
    findAntiBotReason,
    inspectPageForAntiBot
};
