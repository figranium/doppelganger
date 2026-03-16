const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { getProxySelection } = require('../../proxy-rotation');
const { installMouseHelper } = require('./dom-utils');

const stealth = StealthPlugin();
stealth.enabledEvasions.clear();
[
    'chrome.app',
    'chrome.csi',
    'chrome.loadTimes',
    'chrome.runtime',
    'defaultArgs',
    'iframe.contentWindow',
    'media.codecs',
    'navigator.hardwareConcurrency',
    'navigator.languages',
    'navigator.permissions',
    'navigator.plugins',
    'navigator.webdriver',
    'sourceurl',
    'user-agent-override',
    'webgl.vendor',
    'window.outerdimensions'
].forEach(e => stealth.enabledEvasions.add(e));
chromium.use(stealth);

const PROFILE_DIR = path.join(__dirname, '../../data/browser-profile');

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
        ...buildDnsArgs(!!selection.proxy)
    ];
    if (headless === false) {
        args.push('--disable-gpu');
    }

    const launchOptions = { headless, args };
    if (selection.proxy) {
        launchOptions.proxy = selection.proxy;
    }

    console.log(`[PROXY] Mode: ${selection.mode}; Target: ${selection.proxy ? selection.proxy.server : 'host_ip'}`);

    await fs.promises.mkdir(PROFILE_DIR, { recursive: true });
    // Store launch options for createBrowserContext to merge into persistent context
    launchOptions._proxySelection = selection;
    return launchOptions;
}

async function createBrowserContext(launchOptions, options = {}) {
    const {
        userAgent,
        rotateViewport,
        statelessExecution,
        storageStateFile,
        disableRecording,
        recordingsDir,
        includeShadowDom
    } = options;

    const viewport = rotateViewport
        ? { width: 1280 + Math.floor(Math.random() * 640), height: 720 + Math.floor(Math.random() * 360) }
        : { width: 1366, height: 768 };

    const contextOptions = {
        headless: launchOptions.headless,
        args: launchOptions.args,
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

    const context = await chromium.launchPersistentContext(PROFILE_DIR, contextOptions);

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
