const express = require('express');
const { requireAuthOrApiKey } = require('../middleware');
const { launchApiSession, getActiveSession, ensureSessionId } = require('../../../headful');

const router = express.Router();

/**
 * In-page helper injected on demand: given an element, produce a best-effort
 * XPath. Defined as a string so it can be passed to page.evaluate.
 */
function buildXPathsInPage() {
    function getElementXPath(el) {
        if (!el || el.nodeType !== 1) return '';
        if (el.id) {
            return `//*[@id="${el.id}"]`;
        }
        const parts = [];
        while (el && el.nodeType === 1) {
            let index = 1;
            let sibling = el.previousElementSibling;
            while (sibling) {
                if (sibling.tagName === el.tagName) index++;
                sibling = sibling.previousElementSibling;
            }
            const tagName = el.tagName.toLowerCase();
            parts.unshift(`${tagName}[${index}]`);
            el = el.parentElement;
        }
        return '/' + parts.join('/');
    }
    return Array.from(arguments[0] ? [arguments[0]] : []).map(getElementXPath)[0] || '';
}

/**
 * Compute XPath for a given element handle, if page is available.
 */
async function getXPathForElement(page, elementHandle) {
    if (!page || !elementHandle) return '';
    try {
        return await page.evaluate((el) => {
            if (!el || el.nodeType !== 1) return '';
            if (el.id) return `//*[@id="${el.id}"]`;
            const parts = [];
            while (el && el.nodeType === 1) {
                let index = 1;
                let sibling = el.previousElementSibling;
                while (sibling) {
                    if (sibling.tagName === el.tagName) index++;
                    sibling = sibling.previousElementSibling;
                }
                parts.unshift(`${el.tagName.toLowerCase()}[${index}]`);
                el = el.parentElement;
            }
            return '/' + parts.join('/');
        }, elementHandle);
    } catch (e) {
        return '';
    }
}

/**
 * Find candidate elements for a targetHint. Strategy:
 *  1. If targetHint looks like a CSS selector (starts with #, ., [ or contains >, :, space-simple), try querySelector.
 *  2. Otherwise, search by visible text, name/placeholder/aria-label attributes.
 * Returns up to 5 unique elements.
 */
async function findCandidateElements(page, targetHint) {
    return await page.evaluate((hint) => {
        const results = [];
        const seen = new Set();
        const push = (el) => {
            if (el && !seen.has(el) && results.length < 5) {
                seen.add(el);
                results.push(el);
            }
        };
        const trimmed = (hint || '').trim();
        if (!trimmed) return [];

        // 1) Try as CSS selector
        try {
            const matches = document.querySelectorAll(trimmed);
            matches.forEach(push);
        } catch (e) { /* not a valid selector, fall through */ }

        // 2) Attribute-based matching (name, placeholder, aria-label, title, alt, value)
        if (results.length < 5) {
            const attrNames = ['name', 'placeholder', 'aria-label', 'title', 'alt', 'value', 'data-testid', 'data-test-id'];
            for (const attr of attrNames) {
                if (results.length >= 5) break;
                try {
                    document.querySelectorAll(`[${attr}="${trimmed.replace(/"/g, '\\"')}"]`).forEach(push);
                } catch (e) {}
            }
        }

        // 3) Text content matching (buttons, links, labels, headings)
        if (results.length < 5) {
            const textTags = ['button', 'a', 'label', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'li', 'p'];
            const lowerHint = trimmed.toLowerCase();
            for (const tag of textTags) {
                if (results.length >= 5) break;
                const els = Array.from(document.querySelectorAll(tag));
                for (const el of els) {
                    const text = (el.textContent || '').trim().toLowerCase();
                    if (text && (text === lowerHint || text.includes(lowerHint))) {
                        push(el);
                        if (results.length >= 5) break;
                    }
                }
            }
        }

        return results;
    }, targetHint);
}

/**
 * Compute selectors + xpath + confidence for each candidate element.
 */
async function buildSelectorResults(page, elements) {
    // Get CSS selectors using existing in-page helper
    const cssLists = await Promise.all(elements.map(async (el) => {
        try {
            return await page.evaluate((node) => {
                if (window._figraniumGetSelectors) {
                    return window._figraniumGetSelectors(node);
                }
                // fallback: tag name only
                return [node.tagName ? node.tagName.toLowerCase() : ''];
            }, el);
        } catch (e) {
            return [];
        }
    }));

    const xpaths = await Promise.all(elements.map((el) => getXPathForElement(page, el)));

    const results = [];
    for (let i = 0; i < elements.length; i++) {
        const cssList = cssLists[i] || [];
        const css = cssList[0] || '';
        const xpath = xpaths[i] || '';
        if (!css && !xpath) continue;
        // Confidence heuristic: first CSS selector gets highest score; drop as we fall back
        const base = 0.98 - (i * 0.05);
        results.push({ css, xpath, confidence: Math.max(0.5, base) });
    }
    return results;
}

/**
 * POST /api/browser/open
 * Launch (or reattach) a managed browser session.
 * Body: { url, mode? ('headful'), devTools? }
 * Returns: { sessionId, status, wsEndpoint }
 */
router.post('/browser/open', requireAuthOrApiKey, async (req, res) => {
    try {
        const { url, mode = 'headful', devTools = false } = req.body || {};
        // mode is currently informational — only headful is supported via VNC stack
        const session = await launchApiSession({ url });
        if (!session || session.status !== 'running') {
            return res.status(409).json({ error: 'BROWSER_LAUNCH_FAILED', details: 'Session did not reach running state.' });
        }
        const sessionId = ensureSessionId(session);

        // Derive wsEndpoint if available (only for non-persistent contexts)
        let wsEndpoint = null;
        try {
            if (session.browser && typeof session.browser.wsEndpoint === 'function') {
                wsEndpoint = session.browser.wsEndpoint();
            }
        } catch (e) {}

        if (!wsEndpoint) {
            const port = process.env.PORT || 11345;
            wsEndpoint = `ws://localhost:${port}/devtools/browser/${sessionId}`;
        }

        res.json({ sessionId, status: 'launched', wsEndpoint });
    } catch (e) {
        const message = String(e && e.message ? e.message : e);
        const displayUnavailable = /missing x server|\$display|platform failed to initialize/i.test(message);
        if (displayUnavailable) {
            return res.status(409).json({ error: 'HEADFUL_DISPLAY_UNAVAILABLE', details: message });
        }
        res.status(500).json({ error: 'BROWSER_LAUNCH_FAILED', details: message });
    }
});

/**
 * POST /api/inspector/highlight
 * Activate highlight/inspect mode on the active session and return verified
 * selectors matching targetHint (if provided).
 * Body: { sessionId?, url?, targetHint? }
 * Returns: { success, selectors: [{css, xpath, confidence}], snapshot? }
 */
router.post('/inspector/highlight', requireAuthOrApiKey, async (req, res) => {
    try {
        const { sessionId, url, targetHint } = req.body || {};
        let session = getActiveSession();

        if (!session || session.status !== 'running') {
            // Attempt to launch one if URL given
            if (url) {
                session = await launchApiSession({ url });
            }
        }

        if (!session || session.status !== 'running' || !session.page) {
            return res.status(404).json({ error: 'NO_ACTIVE_SESSION', details: 'No running browser session available. Launch one first via /api/browser/open.' });
        }

        // Validate sessionId if provided
        const activeId = ensureSessionId(session);
        if (sessionId && sessionId !== activeId) {
            return res.status(409).json({ error: 'SESSION_ID_MISMATCH', activeSessionId: activeId });
        }

        // Enable inspect mode (idempotent)
        session.inspectModeEnabled = true;
        try {
            const pages = session.context ? session.context.pages() : [session.page];
            for (const p of pages) {
                await p.evaluate(() => {
                    if (window.__figraniumInspectInit) window.__figraniumInspectInit();
                }).catch(() => {});
            }
        } catch (e) {}

        const page = session.page;

        // Optionally navigate
        if (url) {
            try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}); } catch (e) {}
        }

        let selectors = [];
        if (targetHint) {
            const candidates = await findCandidateElements(page, targetHint);
            selectors = await buildSelectorResults(page, candidates);

            // Visually highlight the top match via overlay rectangle
            if (candidates.length > 0) {
                try {
                    await page.evaluate((el) => {
                        const overlayId = 'figranium-api-highlight';
                        let overlay = document.getElementById(overlayId);
                        if (!overlay) {
                            overlay = document.createElement('div');
                            overlay.id = overlayId;
                            overlay.style.position = 'fixed';
                            overlay.style.pointerEvents = 'none';
                            overlay.style.zIndex = '2147483646';
                            overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
                            overlay.style.border = '2px solid rgb(96, 165, 250)';
                            overlay.style.boxSizing = 'border-box';
                            document.body.appendChild(overlay);
                        }
                        const rect = el.getBoundingClientRect();
                        overlay.style.top = rect.top + 'px';
                        overlay.style.left = rect.left + 'px';
                        overlay.style.width = rect.width + 'px';
                        overlay.style.height = rect.height + 'px';
                        overlay.style.display = 'block';
                        el.scrollIntoView({ block: 'center', inline: 'center' });
                    }, candidates[0]);
                } catch (e) {}
            }
        }

        // Optional snapshot (small, JPEG to keep size down)
        let snapshot = null;
        try {
            const buf = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
            snapshot = buf.toString('base64');
        } catch (e) {}

        res.json({ success: true, selectors, snapshot });
    } catch (e) {
        const message = String(e && e.message ? e.message : e);
        res.status(500).json({ error: 'INSPECTOR_FAILED', details: message });
    }
});

module.exports = router;
