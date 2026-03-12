const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getProxySelection } = require('./proxy-rotation');
const { selectUserAgent } = require('./user-agent-settings');
const { formatHTML } = require('./html-utils');
const { validateUrl } = require('./url-utils');
const { parseBooleanFlag, sanitizeRunId, toCsvString, cookieMatches } = require('./common-utils');
const { installMouseHelper } = require('./src/agent/dom-utils');

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

async function runScrape(data) {
    const url = data.url;
    const customHeaders = data.headers || {};
    const userSelector = data.selector;
    const waitInput = data.wait;
    const waitTime = waitInput ? parseFloat(waitInput) * 1000 : 2000;
    const rotateUserAgents = data.rotateUserAgents || false;
    const rotateViewportRaw = data.rotateViewport;
    const rotateViewport = String(rotateViewportRaw).toLowerCase() === 'true' || rotateViewportRaw === true;
    const runId = data.runId || null;
    const captureRunId = sanitizeRunId(runId) || `run_${Date.now()}_unknown`;
    const rotateProxiesRaw = data.rotateProxies;
    const rotateProxies = String(rotateProxiesRaw).toLowerCase() === 'true' || rotateProxiesRaw === true;
    const includeShadowDomRaw = data.includeShadowDom;
    const includeShadowDom = includeShadowDomRaw === undefined
        ? true
        : !(String(includeShadowDomRaw).toLowerCase() === 'false' || includeShadowDomRaw === false);
    const disableRecordingRaw = data.disableRecording;
    const disableRecording = parseBooleanFlag(disableRecordingRaw);
    const statelessExecutionRaw = data.statelessExecution;
    const statelessExecution = parseBooleanFlag(statelessExecutionRaw);
    const extractionScript = data.extractionScript;
    const extractionFormat = data.extractionFormat === 'csv' ? 'csv' : 'json';

    if (!url) {
        throw new Error('URL is required.');
    }

    await validateUrl(url);

    const selectedUA = await selectUserAgent(rotateUserAgents);

    let browser;
    let context;
    let page;
    try {
        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--hide-scrollbars',
                '--mute-audio'
            ]
        };
        const selection = getProxySelection(rotateProxies);
        if (selection.proxy) {
            launchOptions.proxy = selection.proxy;
        }

        browser = await chromium.launch(launchOptions);

        const recordingsDir = path.join(__dirname, 'data', 'recordings');
        await fs.promises.mkdir(recordingsDir, { recursive: true });

        const viewport = rotateViewport
            ? { width: 1280 + Math.floor(Math.random() * 640), height: 720 + Math.floor(Math.random() * 360) }
            : { width: 1366, height: 768 };

        const contextOptions = {
            userAgent: selectedUA,
            extraHTTPHeaders: customHeaders,
            viewport,
            deviceScaleFactor: 1,
            locale: 'en-US',
            timezoneId: 'America/New_York',
            colorScheme: 'dark',
            permissions: ['geolocation']
        };

        const shouldUseStorageState = !statelessExecution && await fs.promises.access(STORAGE_STATE_FILE).then(() => true).catch(() => false);
        if (shouldUseStorageState) {
            contextOptions.storageState = STORAGE_STATE_FILE;
        }

        if (!disableRecording) {
            contextOptions.recordVideo = { dir: recordingsDir, size: viewport };
        }

        context = await browser.newContext(contextOptions);

        let preloadedCookies = [];
        if (!statelessExecution && fs.existsSync(STORAGE_STATE_FILE)) {
            try {
                const state = JSON.parse(fs.readFileSync(STORAGE_STATE_FILE, 'utf8'));
                preloadedCookies = state.cookies || [];
            } catch (e) { }
        }

        await context.route('**/*', async (route) => {
            const request = route.request();
            const requestUrl = request.url();
            const resourceType = request.resourceType();

            const isDataRequest = ['document', 'script', 'xhr', 'fetch'].includes(resourceType);
            if (isDataRequest && preloadedCookies.length > 0) {
                const filteredCookies = preloadedCookies.filter(cookie => cookieMatches(cookie, requestUrl));
                if (filteredCookies.length > 0) {
                    const fileCookieMap = new Map();
                    filteredCookies.forEach(c => fileCookieMap.set(c.name, c.value));

                    const existingCookieHeader = request.headers()['cookie'] || '';
                    const existingCookies = existingCookieHeader.split(';').filter(Boolean).map(s => s.trim());

                    existingCookies.forEach(s => {
                        const [name, ...valParts] = s.split('=');
                        const val = valParts.join('=');
                        if (!fileCookieMap.has(name)) {
                            fileCookieMap.set(name, val);
                        }
                    });

                    const cookieHeader = Array.from(fileCookieMap.entries()).map(([n, v]) => `${n}=${v}`).join('; ');
                    const headers = { ...request.headers(), 'cookie': cookieHeader };
                    return route.continue({ headers });
                }
            }
            route.continue();
        });

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

        page = await context.newPage();

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 400;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight) { clearInterval(timer); resolve(); }
                }, 100);
            });
            window.scrollTo(0, 0);
        });

        await page.waitForTimeout(waitTime);

        let productHtml = '';
        let usedFallback = false;

        if (userSelector) {
            if (includeShadowDom) {
                productHtml = await page.evaluate((selector) => {
                    const stripUseless = (root) => {
                        const useless = root.querySelectorAll('script, style, svg, link, noscript');
                        useless.forEach(node => node.remove());
                    };

                    const cloneWithShadow = (root) => {
                        const clone = root.cloneNode(true);
                        const walkerOrig = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
                        const walkerClone = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);

                        while (walkerOrig.nextNode() && walkerClone.nextNode()) {
                            const orig = walkerOrig.currentNode;
                            const cloned = walkerClone.currentNode;
                            if (orig.shadowRoot) {
                                const template = document.createElement('template');
                                template.setAttribute('data-shadowroot', 'open');
                                template.innerHTML = orig.shadowRoot.innerHTML;
                                cloned.appendChild(template);
                            }
                        }

                        stripUseless(clone);
                        return clone;
                    };

                    const elements = Array.from(document.querySelectorAll(selector));
                    return elements.map(el => cloneWithShadow(el).outerHTML).join('\n');
                }, userSelector);
            } else {
                productHtml = await page.$$eval(userSelector, (elements) => {
                    return elements.map(el => {
                        const useless = el.querySelectorAll('script, style, svg, link, noscript');
                        useless.forEach(node => node.remove());
                        return el.outerHTML;
                    }).join('\n');
                });
            }
            if (!productHtml || productHtml.trim() === '') usedFallback = true;
        } else {
            usedFallback = true;
        }

        if (usedFallback) {
            productHtml = await page.evaluate((withShadow) => {
                const stripUseless = (root) => {
                    const useless = root.querySelectorAll('script, style, svg, link, noscript');
                    useless.forEach(node => node.remove());
                };

                const cloneWithShadow = (root) => {
                    const clone = root.cloneNode(true);
                    const walkerOrig = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
                    const walkerClone = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);

                    while (walkerOrig.nextNode() && walkerClone.nextNode()) {
                        const orig = walkerOrig.currentNode;
                        const cloned = walkerClone.currentNode;
                        if (orig.shadowRoot) {
                            const template = document.createElement('template');
                            template.setAttribute('data-shadowroot', 'open');
                            template.innerHTML = orig.shadowRoot.innerHTML;
                            cloned.appendChild(template);
                        }
                    }

                    stripUseless(clone);
                    return clone;
                };

                if (withShadow) {
                    return cloneWithShadow(document.body).innerHTML;
                }

                const body = document.body.cloneNode(true);
                stripUseless(body);
                return body.innerHTML;
            }, includeShadowDom);
        }

        const runExtractionScript = async (script, html, pageUrl) => {
            if (!script || typeof script !== 'string') return { result: undefined, logs: [] };

            return new Promise((resolve) => {
                const safeEnv = {
                    NODE_ENV: 'production',
                    PATH: process.env.PATH,
                    LANG: process.env.LANG,
                    TZ: process.env.TZ
                };

                const worker = spawn('node', [path.join(__dirname, 'extraction-worker.js')], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: safeEnv
                });

                let stdout = '';
                let stderr = '';

                const workerTimeout = 5000;
                const timer = setTimeout(() => {
                    worker.kill();
                    resolve({ result: 'Worker timed out', logs: [] });
                }, workerTimeout);

                worker.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                worker.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                worker.on('close', (code) => {
                    clearTimeout(timer);
                    if (code !== 0) {
                        resolve({ result: `Worker exited with code ${code}: ${stderr}`, logs: [] });
                        return;
                    }
                    try {
                        const output = JSON.parse(stdout);
                        resolve(output);
                    } catch (e) {
                        resolve({ result: `Worker output parse error: ${e.message}. Stdout: ${stdout}`, logs: [] });
                    }
                });

                worker.on('error', (err) => {
                    clearTimeout(timer);
                    resolve({ result: `Worker spawn error: ${err.message}`, logs: [] });
                });

                const input = JSON.stringify({
                    script,
                    html,
                    url: pageUrl,
                    includeShadowDom
                });

                worker.stdin.write(input);
                worker.stdin.end();
            });
        };

        const extraction = await runExtractionScript(extractionScript, productHtml, page.url());

        const capturesDir = path.join(__dirname, 'public', 'captures');
        await fs.promises.mkdir(capturesDir, { recursive: true });

        const screenshotName = `${captureRunId}_scrape_${Date.now()}.png`;
        const screenshotPath = path.join(capturesDir, screenshotName);
        try {
            await page.screenshot({ path: screenshotPath, fullPage: false });
        } catch (e) {
            console.error('Screenshot failed:', e.message);
        }

        const rawExtraction = extraction.result !== undefined ? extraction.result : (extraction.logs.length ? extraction.logs.join('\n') : undefined);
        const formattedExtraction = extractionFormat === 'csv' ? toCsvString(rawExtraction) : rawExtraction;

        const resultData = {
            title: await page.title(),
            url: page.url(),
            html: formatHTML(productHtml),
            data: formattedExtraction,
            is_partial: !usedFallback,
            selector_used: usedFallback ? (userSelector ? `${userSelector} (not found, using body)` : 'body (default)') : userSelector,
            links: await page.$$eval('a[href]', elements => {
                return elements.map(el => el.href).filter(href => href && href.startsWith('http'));
            }),
            screenshot_url: `/captures/${screenshotName}`
        };

        if (!statelessExecution) {
            try { await context.storageState({ path: STORAGE_STATE_FILE }); } catch { }
        }

        const video = page.video();
        await context.close();
        if (video) {
            try {
                const videoPath = await video.path();
                const videoExists = videoPath && await fs.promises.access(videoPath).then(() => true).catch(() => false);
                if (videoExists) {
                    const recordingName = `${captureRunId}_scrape_${Date.now()}.webm`;
                    const recordingPath = path.join(capturesDir, recordingName);
                    try {
                        await fs.promises.rename(videoPath, recordingPath);
                    } catch (err) {
                        if (err && err.code === 'EXDEV') {
                            await fs.promises.copyFile(videoPath, recordingPath);
                            await fs.promises.unlink(videoPath);
                        } else {
                            throw err;
                        }
                    }
                }
            } catch (e) {
                console.error('Recording save failed:', e.message);
            }
        }

        await browser.close();
        return resultData;
    } catch (error) {
        if (context && !statelessExecution) {
            try { await context.storageState({ path: STORAGE_STATE_FILE }); } catch { }
        }
        if (context) await context.close();
        if (browser) await browser.close();
        throw error;
    }
}

async function handleScrape(req, res) {
    const data = {
        ...req.body,
        ...req.query
    };

    try {
        const result = await runScrape(data);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to scrape', details: error.message });
    }
}

module.exports = { runScrape, handleScrape };
