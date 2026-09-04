const { chromium } = require('../../stealth-chromium');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { getProxySelection } = require('../../proxy-rotation');
const { setupNavigationProtection } = require('../../url-utils');
const { installMouseHelper } = require('./dom-utils');
const { getInjectableScript } = require('idcac-playwright');
const { installTurnstileInterceptor } = require('./figranite/captcha-interceptor');

const PROFILE_DIR = path.join(__dirname, '../../data/browser-profile');
const HEADFUL_STATE_PATH = path.join(__dirname, '../../data/headful-storage-state.json');

async function injectHeadfulCookies(context) {
    try {
        const raw = await fs.promises.readFile(HEADFUL_STATE_PATH, 'utf8');
        const state = JSON.parse(raw);
        const now = Date.now() / 1000;
        const cookies = (state.cookies || []).filter(c => !c.expires || c.expires === -1 || c.expires > now);
        if (cookies.length > 0) {
            await context.addCookies(cookies);
            console.log(`Injected ${cookies.length} cookies from headful session`);
        }
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('Failed to inject headful cookies:', e.message);
    }
}

function buildDnsArgs(hasProxy) {
    const args = ['--dns-prefetch-disable'];
    if (!hasProxy) {
        args.push(
            '--enable-features=DnsOverHttps',
            '--dns-over-https-mode=secure',
            '--dns-over-https-templates=https://cloudflare-dns.com/dns-query'
        );
    }
    return args;
}

async function launchBrowser(options = {}) {
    const { rotateProxies, headless = true } = options;
    const useRotateProxies = String(rotateProxies).toLowerCase() === 'true' || rotateProxies === true;
    const selection = getProxySelection(useRotateProxies);

    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--hide-scrollbars',
        '--mute-audio',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        ...buildDnsArgs(!!selection.proxy)
    ];
    if (headless === false) {
        args.push('--disable-gpu', '--window-size=1920,1080', '--window-position=0,0', '--start-maximized');
    }

    const launchOptions = { headless, args };
    if (selection.proxy) {
        const cleanProxy = { server: selection.proxy.server };
        if (selection.proxy.username) cleanProxy.username = selection.proxy.username;
        if (selection.proxy.password) cleanProxy.password = selection.proxy.password;
        launchOptions.proxy = cleanProxy;
    }

    console.log(`[PROXY] Mode: ${selection.mode}; Target: ${selection.proxy ? selection.proxy.server : 'host_ip'}`);

    launchOptions._proxySelection = selection;
    return launchOptions;
}

async function createBrowserContext(launchOptions, options = {}) {
    const {
        userAgent,
        rotateViewport,
        statelessExecution,
        disableRecording,
        recordingsDir,
        includeShadowDom,
        sessionId,
        captchaInterceptionMode
    } = options;

    const viewport = launchOptions.headless === false
        ? null
        : rotateViewport
            ? { width: 1280 + crypto.randomInt(0, 640), height: 720 + crypto.randomInt(0, 360) }
            : { width: 1366, height: 768 };

    const contextOptions = {
        userAgent: userAgent,
        viewport,
        ...(viewport !== null ? { deviceScaleFactor: 1 } : {}),
        locale: 'en-US',
        timezoneId: 'America/New_York',
        colorScheme: 'dark',
        permissions: ['geolocation'],
        acceptDownloads: true,
    };

    if (sessionId) {
        const cleanSessionId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '');
        if (cleanSessionId) {
            const sessionPath = path.join(__dirname, '../../data/sessions', `${cleanSessionId}.json`);
            try {
                await fs.promises.mkdir(path.dirname(sessionPath), { recursive: true });
                const exists = await fs.promises.access(sessionPath).then(() => true).catch(() => false);
                if (exists) {
                    contextOptions.storageState = sessionPath;
                    console.log(`Loading persistent session from ${cleanSessionId}.json`);
                }
            } catch (e) {
                console.error('Failed to load session path:', e.message);
            }
        }
    }

    if (launchOptions.proxy) {
        const cleanProxy = { server: launchOptions.proxy.server };
        if (launchOptions.proxy.username) cleanProxy.username = launchOptions.proxy.username;
        if (launchOptions.proxy.password) cleanProxy.password = launchOptions.proxy.password;
        contextOptions.proxy = cleanProxy;
    }

    if (!disableRecording && recordingsDir) {
        contextOptions.recordVideo = { dir: recordingsDir, size: viewport };
    }

    let context;
    if (statelessExecution) {
        const browser = await chromium.launch({
            headless: launchOptions.headless,
            args: launchOptions.args,
            ...(launchOptions.proxy ? { proxy: launchOptions.proxy } : {})
        });
        context = await browser.newContext(contextOptions);
    } else {
        await fs.promises.mkdir(PROFILE_DIR, { recursive: true });
        context = await chromium.launchPersistentContext(PROFILE_DIR, {
            headless: launchOptions.headless,
            args: launchOptions.args,
            ...contextOptions
        });
    }

    if (contextOptions.storageState && typeof contextOptions.storageState === 'string') {
        try {
            const raw = await fs.promises.readFile(contextOptions.storageState, 'utf8');
            const state = JSON.parse(raw);
            if (Array.isArray(state.cookies) && state.cookies.length > 0) {
                await context.addCookies(state.cookies);
            }
        } catch { }
    }

    // Highlight-tool handoffs use a short-lived (stateless) context. Restore
    // cookies captured from the previous interactive headful session for both
    // context types so logging in normally carries into that handoff.
    await injectHeadfulCookies(context);

    await setupNavigationProtection(context);
    await context.addInitScript(installMouseHelper);
    if (captchaInterceptionMode) {
        await context.addInitScript(installTurnstileInterceptor, {
            blockManaged: captchaInterceptionMode === 'solve'
        });
    }

    // idcac-playwright's injectable script relies on document.head existing
    // (it synchronously inserts a <style> element), so it must run once the
    // DOM is available rather than via addInitScript, which fires before
    // <head> is parsed and would throw/no-op.
    const idcacScript = getInjectableScript();
    const dismissCookieBanners = (page) => {
        page.on('domcontentloaded', () => {
            page.evaluate(idcacScript).catch(() => { });
        });
    };
    context.on('page', dismissCookieBanners);
    for (const page of context.pages()) dismissCookieBanners(page);

    if (includeShadowDom) {
        await context.addInitScript(() => {
            if (!Element.prototype.attachShadow) return;
            const original = Element.prototype.attachShadow;
            Element.prototype.attachShadow = function (init) {
                const options = init ? { ...init, mode: 'open' } : { mode: 'open' };
                return original.call(this, options);
            };
        });
    }

    return context;
}

module.exports = { launchBrowser, createBrowserContext };
