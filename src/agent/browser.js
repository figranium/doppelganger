const { chromium } = require('../../stealth-chromium');
const fs = require('fs');
const path = require('path');
const { getProxySelection } = require('../../proxy-rotation');
const { setupNavigationProtection } = require('../../url-utils');
const { installMouseHelper } = require('./dom-utils');

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
            console.log(`[AGENT] Injected ${cookies.length} cookies from headful session`);
        }
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('[AGENT] Failed to inject headful cookies:', e.message);
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
        launchOptions.proxy = selection.proxy;
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
        includeShadowDom
    } = options;

    const viewport = launchOptions.headless === false
        ? null
        : rotateViewport
            ? { width: 1280 + Math.floor(Math.random() * 640), height: 720 + Math.floor(Math.random() * 360) }
            : { width: 1366, height: 768 };

    const contextOptions = {
        userAgent: userAgent,
        viewport,
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        colorScheme: 'dark',
        permissions: ['geolocation'],
        acceptDownloads: true,
    };

    if (launchOptions.proxy) {
        contextOptions.proxy = launchOptions.proxy;
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
        await injectHeadfulCookies(context);
    }

    await setupNavigationProtection(context);
    await context.addInitScript(installMouseHelper);

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
