// Browser engine adapter. Two interchangeable engines behind one API:
//
// - Default: playwright-extra + puppeteer-extra-plugin-stealth — stock
//   Playwright Chromium patched with JS-level evasions.
// - USE_CLOAK_ENGINE=true: CloakBrowser (https://github.com/CloakHQ/cloakbrowser),
//   a stealth-patched Chromium binary driven through the same Playwright API.
//   License: CLOAKBROWSER_LICENSE_KEY env var (read natively by cloakbrowser;
//   `npx cloakbrowser login` also writes ~/.cloakbrowser/license.key). Without
//   a key the free legacy binary is used.
//
// cloakbrowser ships ESM-only, so its module is imported lazily and cached.
let cloakbrowserPromise = null;
function getCloakBrowser() {
    if (!cloakbrowserPromise) cloakbrowserPromise = import('cloakbrowser');
    return cloakbrowserPromise;
}

let legacyChromium = null;
function getLegacyChromium() {
    if (!legacyChromium) {
        const { chromium } = require('playwright-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');

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
        legacyChromium = chromium;
    }
    return legacyChromium;
}

function useCloakEngine() {
    const value = String(process.env.USE_CLOAK_ENGINE || '').toLowerCase();
    return value === 'true' || value === '1';
}

async function launch(options) {
    if (useCloakEngine()) {
        const { launch } = await getCloakBrowser();
        return launch(options);
    }
    return getLegacyChromium().launch(options);
}

// Options cloakbrowser handles at launch level. Everything else — including
// recordVideo, extraHTTPHeaders, permissions, storageState — must ride in
// `contextOptions`, which cloakbrowser forwards to the Playwright context.
const LAUNCH_KEYS = new Set([
    'headless', 'args', 'proxy', 'userAgent', 'viewport', 'colorScheme',
    'locale', 'timezone', 'timezoneId', 'licenseKey', 'browserVersion',
    'releaseChannel', 'humanize', 'humanPreset', 'humanConfig', 'geoip',
    'launchOptions', 'ignoreDefaultArgs'
]);

// CloakBrowser takes the profile dir as { userDataDir } instead of a
// positional first argument like stock Playwright.
async function launchPersistentContext(userDataDir, options = {}) {
    if (useCloakEngine()) {
        const { launchPersistentContext } = await getCloakBrowser();
        const launchOpts = {};
        const contextOptions = {};
        for (const [key, value] of Object.entries(options)) {
            (LAUNCH_KEYS.has(key) ? launchOpts : contextOptions)[key] = value;
        }
        return launchPersistentContext({
            ...launchOpts,
            userDataDir,
            ...(Object.keys(contextOptions).length ? { contextOptions } : {})
        });
    }
    return getLegacyChromium().launchPersistentContext(userDataDir, options);
}

// `chromium`-shaped export keeps existing callers (headful.js, src/agent/browser.js)
// working unchanged through whichever engine is active.
const chromium = { launch, launchPersistentContext };

module.exports = { launch, launchPersistentContext, chromium };
