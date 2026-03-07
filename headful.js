const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { getProxySelection } = require('./proxy-rotation');
const { selectUserAgent } = require('./user-agent-settings');
const { validateUrl } = require('./url-utils');
const { parseBooleanFlag } = require('./common-utils');
const { Mutex } = require('./src/server/utils');

const headfulMutex = new Mutex();

const STORAGE_STATE_PATH = path.join(__dirname, 'storage_state.json');
const STORAGE_STATE_FILE = (() => {
    try {
        if (fs.existsSync(STORAGE_STATE_PATH)) {
            const stat = fs.statSync(STORAGE_STATE_PATH);
            if (stat.isDirectory()) {
                return path.join(STORAGE_STATE_PATH, 'storage_state.json');
            }
        }
    } catch { }
    return STORAGE_STATE_PATH;
})();

let activeSession = null;

const teardownActiveSession = async () => {
    if (!activeSession) return;
    try {
        if (activeSession.interval) clearInterval(activeSession.interval);
    } catch { }
    try {
        if (activeSession.context && !activeSession.stateless) {
            await activeSession.context.storageState({ path: STORAGE_STATE_FILE });
        }
    } catch { }
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

    activeSession = { status: 'starting', startedAt: Date.now(), stateless: statelessExecution };

    const selectedUA = await selectUserAgent(false);

    let browser;
    try {
        const launchOptions = {
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1920,1080',
                '--window-position=0,0'
            ]
        };
        const selection = getProxySelection(rotateProxies);
        if (selection.proxy) {
            launchOptions.proxy = selection.proxy;
        }
        browser = await chromium.launch(launchOptions);

        const contextOptions = {
            viewport: null,
            userAgent: selectedUA,
            locale: 'en-US',
            timezoneId: 'America/New_York'
        };

        if (!statelessExecution && fs.existsSync(STORAGE_STATE_FILE)) {
            try {
                const rawState = JSON.parse(fs.readFileSync(STORAGE_STATE_FILE, 'utf8'));
                const targetHost = new URL(url).hostname;
                const targetDomain = targetHost.replace(/^www\./, '');

                if (rawState.cookies) {
                    rawState.cookies = rawState.cookies.filter(c => {
                        const cookieDomain = (c.domain || '').replace(/^\./, '');
                        return cookieDomain === targetDomain ||
                            cookieDomain.endsWith('.' + targetDomain) ||
                            targetDomain.endsWith('.' + cookieDomain);
                    });
                }

                if (rawState.origins) {
                    rawState.origins = rawState.origins.filter(o => {
                        try {
                            const originHost = new URL(o.origin).hostname.replace(/^www\./, '');
                            return originHost === targetDomain || originHost.endsWith('.' + targetDomain);
                        } catch { return false; }
                    });
                }

                contextOptions.storageState = rawState;
            } catch (e) {
                contextOptions.storageState = STORAGE_STATE_FILE;
            }
        }

        const context = await browser.newContext(contextOptions);
        await context.addInitScript(() => {
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
        });

        const page = await context.newPage();

        const closeIfExtra = async (extraPage) => {
            if (!extraPage || extraPage === page) return;
            try { await extraPage.close(); } catch { }
        };

        context.on('page', closeIfExtra);
        page.on('popup', async (popup) => {
            try { popup.close().catch(() => { }); } catch { }
            await closeIfExtra(popup);
        });

        await page.goto(url);

        const saveState = async () => {
            if (statelessExecution) return;
            try {
                await context.storageState({ path: STORAGE_STATE_FILE });
            } catch (e) { }
        };

        const interval = setInterval(saveState, 10000);
        activeSession = { browser, context, interval, status: 'running', startedAt: activeSession.startedAt, stateless: statelessExecution };

        page.on('close', async () => {
            clearInterval(interval);
            await saveState();
        });

        const responseData = {
            message: 'Headful session started.',
            userAgentUsed: selectedUA,
            path: statelessExecution ? null : STORAGE_STATE_FILE
        };

        if (res) {
            res.json(responseData);
        }

        await new Promise((resolve) => browser.on('disconnected', resolve));
        clearInterval(interval);
        await saveState();
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

module.exports = { runHeadful, handleHeadful, stopHeadful };
