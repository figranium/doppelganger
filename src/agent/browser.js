const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { getProxySelection } = require('../../proxy-rotation');
const { installMouseHelper } = require('./dom-utils');

async function launchBrowser(options = {}) {
    const { rotateProxies, headless = true } = options;
    const launchOptions = {
        headless: headless,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--hide-scrollbars',
            '--mute-audio'
        ]
    };
    if (headless === false) {
        launchOptions.args.push('--disable-gpu');
    }
    const useRotateProxies = String(rotateProxies).toLowerCase() === 'true' || rotateProxies === true;
    const selection = getProxySelection(useRotateProxies);
    if (selection.proxy) {
        launchOptions.proxy = selection.proxy;
    }
    console.log(`[PROXY] Mode: ${selection.mode}; Target: ${selection.proxy ? selection.proxy.server : 'host_ip'}`);
    return await chromium.launch(launchOptions);
}

async function createBrowserContext(browser, options = {}) {
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
        userAgent: userAgent,
        viewport,
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        colorScheme: 'dark',
        permissions: ['geolocation'],
        acceptDownloads: true,
    };

    if (!statelessExecution && storageStateFile && fs.existsSync(storageStateFile)) {
        try {
            const stat = fs.statSync(storageStateFile);
            if (!stat.isDirectory()) {
                contextOptions.storageState = storageStateFile;
            }
        } catch { }
    }

    if (!disableRecording && recordingsDir) {
        contextOptions.recordVideo = { dir: recordingsDir, size: viewport };
    }

    const context = await browser.newContext(contextOptions);

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

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
