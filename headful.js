const { chromium } = require('./stealth-chromium');
const fs = require('fs');
const path = require('path');
const { getProxySelection } = require('./proxy-rotation');
const { selectUserAgent } = require('./user-agent-settings');
const { validateUrl } = require('./url-utils');
const { parseBooleanFlag } = require('./common-utils');
const { Mutex } = require('./src/server/utils');

const HEADFUL_PROFILE_DIR = path.join(__dirname, 'data', 'browser-profile-headful');
const HEADFUL_STATE_PATH = path.join(__dirname, 'data', 'headful-storage-state.json');

const headfulMutex = new Mutex();

async function saveHeadfulStorageState(context) {
    if (!context) return;
    try {
        const state = await context.storageState();
        const now = Date.now() / 1000;
        const cookies = (state.cookies || []).filter(c => !c.expires || c.expires === -1 || c.expires > now);
        if (cookies.length === 0) return;
        await fs.promises.mkdir(path.join(__dirname, 'data'), { recursive: true });
        await fs.promises.writeFile(HEADFUL_STATE_PATH, JSON.stringify({ cookies }, null, 2));
        console.log(`[HEADFUL] Saved ${cookies.length} cookies to headful-storage-state.json`);
    } catch (e) {
        console.error('[HEADFUL] Failed to save storage state:', e.message);
    }
}

const EventEmitter = require('events');
const headfulEventEmitter = new EventEmitter();

let activeSession = null;

const teardownActiveSession = async () => {
    if (!activeSession) return;
    try {
        if (activeSession.interval) clearInterval(activeSession.interval);
    } catch { }
    if (activeSession.context && !activeSession.statelessExecution) {
        await saveHeadfulStorageState(activeSession.context);
    }
    try {
        if (activeSession.browser) {
            await activeSession.browser.close();
        }
    } catch { }
    activeSession = null;
};

async function runHeadful(data, options = {}) {
    const { res } = options;
    if (activeSession) {
        await teardownActiveSession();
    }

    const url = data.url || 'https://www.google.com';

    await validateUrl(url);

    const rotateProxiesRaw = data.rotateProxies;
    const rotateProxies = String(rotateProxiesRaw).toLowerCase() === 'true' || rotateProxiesRaw === true;
    const statelessExecutionRaw = data.statelessExecution;
    const statelessExecution = parseBooleanFlag(statelessExecutionRaw);

    const inspectModeEnabled = true;

    activeSession = { status: 'starting', startedAt: Date.now(), inspectModeEnabled };

    const selectedUA = await selectUserAgent(false);

    let browser;
    let context;
    let page;
    let navigated = false;

    try {
        if (data.targetActionId && data.taskSnapshot) {
            const { runAgent } = require('./src/agent');
            try {
                const reqScope = { ...data.taskSnapshot, variables: data.variables || data.taskVariables || {} };
                if (data.url) reqScope.url = data.url;

                const result = await runAgent(reqScope, {
                    headless: false,
                    handoffContext: true,
                    stopAtActionId: data.targetActionId
                });
                if (result && result._handoff) {
                    browser = result._handoff.browser;
                    context = result._handoff.context;
                    page = result._handoff.page;
                    navigated = true;
                }
            } catch (e) {
                console.error("Agent handoff failed:", e);
            }
        }

        if (!browser) {
            const selection = getProxySelection(rotateProxies);
            const hasProxy = !!selection.proxy;

            const args = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1920,1080',
                '--window-position=0,0',
                '--start-maximized',
                '--dns-prefetch-disable',
                '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'
            ];
            if (!hasProxy) {
                args.push(
                    '--enable-features=DnsOverHttps',
                    '--dns-over-https-mode=secure',
                    '--dns-over-https-templates=https://cloudflare-dns.com/dns-query'
                );
            }

            const contextOptions = {
                viewport: null,
                userAgent: selectedUA,
                locale: 'en-US',
                timezoneId: 'America/New_York',
                permissions: ['clipboard-read', 'clipboard-write'],
                ...(selection.proxy ? { proxy: selection.proxy } : {})
            };

            if (statelessExecution) {
                browser = await chromium.launch({ headless: false, args, ...(selection.proxy ? { proxy: selection.proxy } : {}) });
                context = await browser.newContext(contextOptions);
            } else {
                await fs.promises.mkdir(HEADFUL_PROFILE_DIR, { recursive: true });
                context = await chromium.launchPersistentContext(HEADFUL_PROFILE_DIR, { headless: false, args, ...contextOptions });
                browser = context.browser();
            }
        }

        const inspectInitFn = () => {
            Object.defineProperty(window, 'open', { writable: true, configurable: true, value: () => null });
            const handleLinkClick = (event) => {
                const path = event.composedPath ? event.composedPath() : [];
                const anchor = path.find(el => el.tagName === 'A');
                if (anchor && anchor.target === '_blank') {
                    event.preventDefault();
                    return;
                }
                if (event.type === 'auxclick' && event.button === 1 && anchor) {
                    event.preventDefault();
                }
            };
            document.addEventListener('click', handleLinkClick, true);
            document.addEventListener('auxclick', handleLinkClick, true);

            window.__figraniumInspectInit = () => {
                if (window._figraniumInspectHandler) return;

                const overlay = document.createElement('div');
                overlay.id = 'figranium-inspect-overlay';
                overlay.style.position = 'fixed';
                overlay.style.pointerEvents = 'none';
                overlay.style.zIndex = '2147483646';
                overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                overlay.style.border = '1px solid rgb(96, 165, 250)';
                overlay.style.boxSizing = 'border-box';
                overlay.style.transition = 'all 0.1s ease';
                overlay.style.display = 'none';
                document.body.appendChild(overlay);

                const tooltip = document.createElement('div');
                tooltip.id = 'figranium-inspect-tooltip';
                tooltip.style.position = 'fixed';
                tooltip.style.pointerEvents = 'none';
                tooltip.style.zIndex = '2147483647';
                tooltip.style.backgroundColor = '#1e293b';
                tooltip.style.color = '#f8fafc';
                tooltip.style.padding = '4px 8px';
                tooltip.style.borderRadius = '4px';
                tooltip.style.fontSize = '12px';
                tooltip.style.fontFamily = 'monospace';
                tooltip.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                tooltip.style.display = 'none';
                tooltip.style.whiteSpace = 'nowrap';
                tooltip.style.lineHeight = '1.4';
                document.body.appendChild(tooltip);

                window._figraniumGetSelectors = (el) => {
                    const isRandomId = (id) => {
                        if (!id) return true;
                        // Long numbers, UUIDs, explicit long strings
                        if (/\d{4,}/.test(id) || /^[0-9a-f]{8}-/i.test(id) || id.length > 30 || /[0-9]{3,}/.test(id)) return true;
                        // Google-style obfuscated classes (e.g. gLFyf, APjFqb)
                        if (/^[a-zA-Z]{4,8}$/.test(id) && /[A-Z]/.test(id) && /[a-z]/.test(id)) return true;
                        // Styled-components or CSS modules with hashes like css-1n7jcv, style_module__1xyz
                        if (/^css-[a-zA-Z0-9]+/.test(id) || /^sc-[a-zA-Z0-9]+/.test(id) || /_[a-zA-Z0-9]{5,}$/.test(id) || /-[a-zA-Z0-9]{5,}$/.test(id)) return true;
                        // Tailwind arbitrary values or very complex utility classes
                        if (id.includes('[') || id.includes(']')) return true;
                        return false;
                    };
                    const tag = el.tagName ? el.tagName.toLowerCase() : '';
                    if (!tag || tag === 'html' || tag === 'body') return [tag];

                    const selectors = new Set();

                    const isUnique = (sel) => {
                        try {
                            const nodes = document.querySelectorAll(sel);
                            return nodes.length === 1 && nodes[0] === el;
                        } catch (e) { return false; }
                    };

                    const addIfUnique = (sel) => {
                        if (isUnique(sel)) selectors.add(sel);
                    };

                    // 1. Name & placeholder (highest priority — most human-readable)
                    const topAttrs = ['name', 'placeholder'];
                    for (const attr of topAttrs) {
                        const val = el.getAttribute(attr);
                        if (val && val.length < 50 && !val.includes('"') && !val.includes('\n')) {
                            addIfUnique(`[${attr}="${val}"]`);
                            addIfUnique(`${tag}[${attr}="${val}"]`);
                        }
                    }

                    // 2. Text content (:has-text — very readable)
                    if ((tag === 'button' || tag === 'a' || tag === 'span' || tag === 'div' || tag === 'label' || tag === 'li' || tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3') && el.textContent) {
                        const text = el.textContent.trim().substring(0, 40);
                        if (text && !text.includes('\n') && !text.includes('"') && text.length > 1) {
                            const allTags = Array.from(document.querySelectorAll(tag));
                            const matches = allTags.filter(t => t.textContent.trim() === text);
                            if (matches.length === 1 && matches[0] === el) {
                                selectors.add(`${tag}:has-text("${text}")`);
                            }
                        }
                    }

                    // 3. Other semantic attributes
                    const semanticAttrs = ['aria-label', 'title', 'alt'];
                    for (const attr of semanticAttrs) {
                        const val = el.getAttribute(attr);
                        if (val && val.length < 50 && !val.includes('"') && !val.includes('\n')) {
                            addIfUnique(`[${attr}="${val}"]`);
                            addIfUnique(`${tag}[${attr}="${val}"]`);
                        }
                    }

                    // 4. Data attributes
                    const dataAttrs = ['data-testid', 'data-test-id', 'data-qa', 'data-cy'];
                    for (const attr of dataAttrs) {
                        const val = el.getAttribute(attr);
                        if (val) {
                            addIfUnique(`[${attr}="${val}"]`);
                            addIfUnique(`${tag}[${attr}="${val}"]`);
                        }
                    }

                    // 5. IDs
                    const id = el.id;
                    if (id && !isRandomId(id)) {
                        addIfUnique(`#${id}`);
                        addIfUnique(`${tag}#${id}`);
                    }

                    // 6. Other basic attributes
                    const otherAttrs = ['type', 'value', 'href', 'src'];
                    for (const attr of otherAttrs) {
                        const val = el.getAttribute(attr);
                        if (val && val.length < 50 && !val.includes('"') && !val.includes('\n') && !val.startsWith('data:')) {
                            addIfUnique(`${tag}[${attr}="${val}"]`);
                        }
                    }

                    // 7. Classes
                    const classes = el.className && typeof el.className === 'string' ?
                        el.className.trim().split(/\s+/).filter(c => c && !isRandomId(c)) : [];
                    const classStr = classes.length > 0 ? '.' + classes.join('.') : '';

                    if (classStr) {
                        addIfUnique(`${tag}${classStr}`);
                        if (classes.length === 1) addIfUnique(`${classStr}`);
                        if (classes.length > 1) {
                            for (let c of classes) addIfUnique(`${tag}.${c}`);
                        }
                    }

                    addIfUnique(tag);

                    // 7. Structural
                    if (el.parentElement) {
                        const siblings = Array.from(el.parentElement.children).filter(c => c.tagName === el.tagName);
                        const index = siblings.indexOf(el) + 1;
                        addIfUnique(`${tag}:nth-of-type(${index})`);
                        if (classStr) addIfUnique(`${tag}${classStr}:nth-of-type(${index})`);
                    }

                    // 8. Combinations with parents (Basic Path generation fallback)
                    if (selectors.size < 3) {
                        let path = '';
                        let current = el;
                        while (current && current !== document.body && current !== document.documentElement) {
                            let step = current.tagName.toLowerCase();

                            // add id if good
                            if (current.id && !isRandomId(current.id)) {
                                step += `#${current.id}`;
                            } else {
                                // Add nth-of-type if no id and has siblings of same tag
                                if (current.parentElement) {
                                    const sibs = Array.from(current.parentElement.children).filter(c => c.tagName === current.tagName);
                                    if (sibs.length > 1) step += `:nth-of-type(${sibs.indexOf(current) + 1})`;
                                }
                            }

                            path = path ? `${step} > ${path}` : step;
                            if (isUnique(path)) {
                                selectors.add(path);
                                break; // Stop as soon as we found a unique path
                            }

                            // Try ID anchor
                            if (current.id && !isRandomId(current.id) && isUnique(`#${current.id}`)) {
                                break; // We anchored on a unique ID
                            }

                            current = current.parentElement;
                        }
                    }

                    return Array.from(selectors).slice(0, 5);
                };

                window._figraniumInspectHandler = (e) => {
                    const element = e.composedPath ? e.composedPath()[0] : e.target;
                    if (!element || element === document || element === document.body) {
                        overlay.style.display = 'none';
                        tooltip.style.display = 'none';
                        return;
                    }

                    const rect = element.getBoundingClientRect();
                    overlay.style.display = 'block';
                    overlay.style.top = rect.top + 'px';
                    overlay.style.left = rect.left + 'px';
                    overlay.style.width = rect.width + 'px';
                    overlay.style.height = rect.height + 'px';

                    const selectors = window._figraniumGetSelectors(element);
                    tooltip.style.display = 'block';
                    tooltip.innerHTML = selectors.map((s, i) => i === 0 ? `<strong>${s}</strong>` : `<span style="opacity:0.7">${s}</span>`).join('<br/>');

                    let tipTop = e.clientY + 15;
                    let tipLeft = e.clientX + 15;

                    const tooltipRect = tooltip.getBoundingClientRect();
                    if (tipLeft + tooltipRect.width > window.innerWidth) {
                        tipLeft = e.clientX - tooltipRect.width - 15;
                    }
                    if (tipTop + tooltipRect.height > window.innerHeight) {
                        tipTop = e.clientY - tooltipRect.height - 15;
                    }

                    tooltip.style.top = tipTop + 'px';
                    tooltip.style.left = tipLeft + 'px';
                };

                window._figraniumInspectClickHandler = async (e) => {
                    if (!window._figraniumInspectHandler) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    const element = e.composedPath ? e.composedPath()[0] : e.target;
                    const selectors = window._figraniumGetSelectors(element);
                    const bestSelector = selectors[0] || '';

                    // Push to backend via Playwright binding
                    if (window.__figraniumOnElementSelected && selectors.length > 0) {
                        try {
                            await window.__figraniumOnElementSelected(JSON.stringify(selectors));
                        } catch (err) { }
                    }

                    try {
                        if (bestSelector && navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(bestSelector);
                        }
                    } catch (err) { }
                };

                document.addEventListener('mousemove', window._figraniumInspectHandler, true);
                document.addEventListener('click', window._figraniumInspectClickHandler, true);
            };

            window.__figraniumInspectDestroy = () => {
                const overlay = document.getElementById('figranium-inspect-overlay');
                if (overlay) overlay.remove();
                const tooltip = document.getElementById('figranium-inspect-tooltip');
                if (tooltip) tooltip.remove();
                if (window._figraniumInspectHandler) {
                    document.removeEventListener('mousemove', window._figraniumInspectHandler, true);
                    delete window._figraniumInspectHandler;
                }
                if (window._figraniumInspectClickHandler) {
                    document.removeEventListener('click', window._figraniumInspectClickHandler, true);
                    delete window._figraniumInspectClickHandler;
                }
            };

            window.addEventListener('DOMContentLoaded', async () => {
                if (window.__figraniumIsInspectEnabled) {
                    const enabled = await window.__figraniumIsInspectEnabled();
                    if (enabled) {
                        window.__figraniumInspectInit();
                    }
                }
            });
        };

        await context.addInitScript(inspectInitFn);

        await context.exposeBinding('__figraniumIsInspectEnabled', () => {
            return activeSession ? !!activeSession.inspectModeEnabled : false;
        });

        await context.exposeBinding('__figraniumOnElementSelected', (source, selector) => {
            headfulEventEmitter.emit('selectorSelected', selector);
        });

        if (!page) {
            // Persistent context auto-creates a blank page; reuse it or open a new one
            const existingPages = context.pages();
            page = existingPages.length > 0 ? existingPages[0] : await context.newPage();
            try {
                const cdp = await context.newCDPSession(page);
                const { windowId } = await cdp.send('Browser.getWindowForTarget');
                await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } });
            } catch (e) { }
        } else {
            try { await page.evaluate(inspectInitFn); } catch (e) { }
            try {
                await page.evaluate(() => {
                    if (window.__figraniumInspectInit) window.__figraniumInspectInit();
                });
            } catch (e) { }
        }

        const closeIfExtra = async (extraPage) => {
            if (!extraPage || extraPage === page) return;
            try { await extraPage.close(); } catch { }
        };

        context.on('page', closeIfExtra);
        page.on('popup', async (popup) => {
            try { popup.close().catch(() => { }); } catch { }
            await closeIfExtra(popup);
        });

        if (!navigated && url) {
            await page.goto(url).catch(() => { });
        }

        const syncInterval = statelessExecution ? null : setInterval(() => {
            if (activeSession && activeSession.context) {
                saveHeadfulStorageState(activeSession.context).catch(() => {});
            }
        }, 30000);
        activeSession = { browser, context, page, status: 'running', startedAt: activeSession.startedAt, inspectModeEnabled: activeSession.inspectModeEnabled, statelessExecution, interval: syncInterval };

        page.on('close', async () => { });

        const responseData = {
            message: 'Headful session started.',
            userAgentUsed: selectedUA
        };

        if (res) {
            res.json(responseData);
        }

        await new Promise((resolve) => browser.on('disconnected', resolve));
        if (syncInterval) clearInterval(syncInterval);
        if (!statelessExecution && context) {
            await saveHeadfulStorageState(context).catch(() => {});
        }
        activeSession = null;
        return responseData;
    } catch (error) {
        if (browser) await browser.close();
        activeSession = null;
        throw error;
    }
}

async function handleHeadful(req, res) {
    await headfulMutex.lock();
    try {
        const data = { ...req.body, ...req.query };
        await runHeadful(data, { res });
    } catch (error) {
        const message = String(error && error.message ? error.message : error);
        const displayUnavailable = /missing x server|\$display|platform failed to initialize/i.test(message);
        if (!res.headersSent && displayUnavailable) {
            return res.status(409).json({ error: 'HEADFUL_DISPLAY_UNAVAILABLE', details: message });
        }
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to start headful session', details: message });
        }
    } finally {
        headfulMutex.unlock();
    }
}

async function stopHeadful(req, res) {
    if (!activeSession) {
        return res.status(200).json({ message: 'No active headful session.' });
    }

    await teardownActiveSession();
    if (res) res.json({ message: 'Headful session stopped.' });
}

async function toggleInspectMode(req, res) {
    if (!activeSession || !activeSession.context) {
        return res.status(400).json({ error: 'No active headful session.' });
    }
    const enabled = req.body.enabled === true || req.body.enabled === 'true';
    activeSession.inspectModeEnabled = enabled;

    try {
        const pages = activeSession.context.pages();
        for (const page of pages) {
            await page.evaluate((enabled) => {
                if (enabled) {
                    if (window.__figraniumInspectInit) window.__figraniumInspectInit();
                } else {
                    if (window.__figraniumInspectDestroy) window.__figraniumInspectDestroy();
                }
            }, enabled);
        }
        res.json({ message: `Inspect mode ${enabled ? 'enabled' : 'disabled'}` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to toggle inspect mode', details: String(error) });
    }
}

module.exports = { runHeadful, handleHeadful, stopHeadful, toggleInspectMode, headfulEventEmitter };
