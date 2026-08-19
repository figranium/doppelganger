const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getProxySelection } = require('./proxy-rotation');
const { selectUserAgent } = require('./user-agent-settings');
const { formatHTML } = require('./html-utils');
const { validateUrl } = require('./url-utils');
const { toCsvString } = require('./common-utils');

const HEADFUL_STATE_PATH = path.join(__dirname, 'data', 'headful-storage-state.json');
const USELESS_SELECTOR = 'script, style, svg, link, noscript';

function buildProxyUrl(proxy) {
    if (!proxy || !proxy.server) return undefined;
    const serverUrl = new URL(proxy.server);
    if (proxy.username) serverUrl.username = proxy.username;
    if (proxy.password) serverUrl.password = proxy.password;
    return serverUrl.toString();
}

async function buildCookieHeader(targetUrl) {
    try {
        const raw = await fs.promises.readFile(HEADFUL_STATE_PATH, 'utf8');
        const state = JSON.parse(raw);
        const now = Date.now() / 1000;
        const hostname = new URL(targetUrl).hostname;
        const cookies = (state.cookies || []).filter(c => {
            if (c.expires && c.expires !== -1 && c.expires <= now) return false;
            const domain = (c.domain || '').replace(/^\./, '');
            return hostname === domain || hostname.endsWith(`.${domain}`);
        });
        if (cookies.length === 0) return undefined;
        console.log(`[SCRAPE] Injected ${cookies.length} cookies from headful session`);
        return cookies.map(c => `${c.name}=${c.value}`).join('; ');
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('[SCRAPE] Failed to inject headful cookies:', e.message);
        return undefined;
    }
}

function outerHtmlOf($, selection) {
    return selection.map((i, el) => {
        $(el).find(USELESS_SELECTOR).remove();
        return $.html(el);
    }).get().join('\n');
}

async function runExtractionScript(script, html, pageUrl) {
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
            includeShadowDom: false
        });

        worker.stdin.write(input);
        worker.stdin.end();
    });
}

async function runScrape(data) {
    const url = data.url;
    const customHeaders = data.headers || {};
    const userSelector = data.selector;
    const rotateUserAgents = data.rotateUserAgents || false;
    const rotateProxiesRaw = data.rotateProxies;
    const rotateProxies = String(rotateProxiesRaw).toLowerCase() === 'true' || rotateProxiesRaw === true;
    const extractionScript = data.extractionScript;
    const extractionFormat = data.extractionFormat === 'csv' ? 'csv' : 'json';

    if (!url) {
        throw new Error('URL is required.');
    }

    await validateUrl(url);

    const selectedUA = await selectUserAgent(rotateUserAgents);
    const selection = getProxySelection(rotateProxies);
    const proxyUrl = buildProxyUrl(selection.proxy);
    const cookieHeader = await buildCookieHeader(url);

    const { gotScraping } = await import('got-scraping');
    const response = await gotScraping({
        url,
        headers: {
            'user-agent': selectedUA,
            ...(cookieHeader ? { cookie: cookieHeader } : {}),
            ...customHeaders
        },
        ...(proxyUrl ? { proxyUrl } : {}),
        timeout: { request: 60000 },
        throwHttpErrors: false
    });

    const html = response.body;
    const $ = cheerio.load(html);

    let productHtml = '';
    let usedFallback = false;

    if (userSelector) {
        const found = $(userSelector);
        if (found.length > 0) {
            productHtml = outerHtmlOf($, found);
        } else {
            usedFallback = true;
        }
    } else {
        usedFallback = true;
    }

    if (usedFallback) {
        const body = $('body');
        body.find(USELESS_SELECTOR).remove();
        productHtml = body.html() || '';
    }

    const extraction = await runExtractionScript(extractionScript, productHtml, url);

    const rawExtraction = extraction.result !== undefined ? extraction.result : (extraction.logs.length ? extraction.logs.join('\n') : undefined);
    const formattedExtraction = extractionFormat === 'csv' ? toCsvString(rawExtraction) : rawExtraction;

    const links = $('a[href]').map((i, el) => $(el).attr('href')).get()
        .map(href => {
            try {
                return new URL(href, url).href;
            } catch {
                return null;
            }
        })
        .filter(href => href && href.startsWith('http'));

    return {
        title: $('title').first().text().trim(),
        url: response.url || url,
        html: formatHTML(productHtml),
        data: formattedExtraction,
        is_partial: !usedFallback,
        selector_used: usedFallback ? (userSelector ? `${userSelector} (not found, using body)` : 'body (default)') : userSelector,
        links,
        screenshot_url: null
    };
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
