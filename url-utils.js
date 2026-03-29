const dns = require('dns').promises;
const net = require('net');
const { ALLOW_PRIVATE_NETWORKS } = require('./src/server/constants');

/**
 * Checks if an IP address is private.
 * @param {string} ip The IP address to check.
 * @returns {boolean} True if the IP is private.
 */
function isPrivateIP(ip) {
    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        return (
            parts[0] === 0 ||
            parts[0] === 10 ||
            (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
            (parts[0] === 192 && parts[1] === 168) ||
            parts[0] === 127 ||
            (parts[0] === 169 && parts[1] === 254) ||
            (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
        );
    }
    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        const parts = lower.split(':');
        const last = parts[parts.length - 1];

        // Handle IPv4-mapped IPv6 addresses (::ffff:1.2.3.4 or ::ffff:7f00:1)
        const ffffIndex = parts.indexOf('ffff');
        if (ffffIndex !== -1) {
            const prefixAllZeros = parts.slice(0, ffffIndex).every(p => p === '' || p === '0');
            if (prefixAllZeros) {
                if (net.isIPv4(last)) {
                    return isPrivateIP(last);
                }
                const p1 = parseInt(parts[parts.length - 2], 16);
                const p2 = parseInt(parts[parts.length - 1], 16);
                if (!isNaN(p1) && !isNaN(p2)) {
                    return isPrivateIP(`${(p1 >> 8) & 0xff}.${p1 & 0xff}.${(p2 >> 8) & 0xff}.${p2 & 0xff}`);
                }
            }
        }

        // Handle IPv4-compatible IPv6 addresses (::1.2.3.4 or ::7f00:1)
        if (ffffIndex === -1) {
            const prefixAllZeros = parts.slice(0, -2).every(p => p === '' || p === '0');
            if (prefixAllZeros) {
                if (net.isIPv4(last)) {
                    return isPrivateIP(last);
                }
                const p1 = parseInt(parts[parts.length - 2], 16);
                const p2 = parseInt(parts[parts.length - 1], 16);
                if (!isNaN(p1) && !isNaN(p2)) {
                    return isPrivateIP(`${(p1 >> 8) & 0xff}.${p1 & 0xff}.${(p2 >> 8) & 0xff}.${p2 & 0xff}`);
                }
            }
        }

        // ::1 loopback, :: unspecified
        if (lower === '::1' || lower === '::' || lower === '0:0:0:0:0:0:0:0' || lower === '0:0:0:0:0:0:0:1') {
            return true;
        }

        // fe80:: link-local, fc00::/fd00:: unique local
        return (
            lower.startsWith('fe80:') ||
            lower.startsWith('fc') ||
            lower.startsWith('fd')
        );
    }
    return false;
}

const VALID_HOSTNAME_CACHE = new Set();
const INVALID_HOSTNAME_CACHE = new Set();
const CACHE_TTL = 30000; // 30 seconds
let lastCacheClear = Date.now();

/**
 * Validates a URL to prevent SSRF by blocking private IP ranges.
 * @param {string} urlStr The URL to validate.
 * @returns {string} The validated URL string.
 * @throws {Error} If the URL is invalid or points to a private network.
 */
async function validateUrl(urlStr) {
    if (!urlStr) return '';

    let url;
    try {
        url = new URL(urlStr);
    } catch (e) {
        throw new Error('Invalid URL');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Only HTTP and HTTPS protocols are allowed');
    }

    if (ALLOW_PRIVATE_NETWORKS) return url.href;

    let hostname = url.hostname;
    // Strip brackets from IPv6 hostnames
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        hostname = hostname.substring(1, hostname.length - 1);
    }

    const lowerHost = hostname.toLowerCase();

    // Cache management
    if (Date.now() - lastCacheClear > CACHE_TTL) {
        VALID_HOSTNAME_CACHE.clear();
        INVALID_HOSTNAME_CACHE.clear();
        lastCacheClear = Date.now();
    }

    if (VALID_HOSTNAME_CACHE.has(lowerHost)) return url.href;
    if (INVALID_HOSTNAME_CACHE.has(lowerHost)) {
        throw new Error('Access to private network is restricted');
    }

    // Direct check for common private hostnames
    if (lowerHost === 'localhost' || lowerHost.endsWith('.localhost')) {
        INVALID_HOSTNAME_CACHE.add(lowerHost);
        throw new Error('Access to private network is restricted');
    }

    // Resolve hostname to IP
    try {
        // If it's already an IP address, check it directly
        if (net.isIP(hostname)) {
            if (isPrivateIP(hostname)) {
                INVALID_HOSTNAME_CACHE.add(lowerHost);
                throw new Error('Access to private network is restricted');
            }
            return url.href;
        }

        // dns.lookup follows /etc/hosts and is what's typically used for connecting
        const addresses = await dns.lookup(hostname, { all: true });
        for (const addr of addresses) {
            if (isPrivateIP(addr.address)) {
                INVALID_HOSTNAME_CACHE.add(lowerHost);
                throw new Error('Access to private network is restricted');
            }
        }
        VALID_HOSTNAME_CACHE.add(lowerHost);
    } catch (e) {
        if (e.message === 'Access to private network is restricted') {
            throw e;
        }

        // If we can't resolve it and it's not an IP, we allow it to proceed
        // to the browser where it will likely fail normally.
    }

    return url.href;
}

/**
 * Perform a fetch with manual redirect following and validation at each hop.
 * Ensures sensitive headers (Authorization, Token) are stripped on cross-origin redirects.
 * @param {string} urlStr Initial URL.
 * @param {object} options Fetch options.
 * @param {number} maxRedirects Maximum number of redirects to follow.
 */
async function fetchWithRedirectValidation(urlStr, options = {}, maxRedirects = 5) {
    let currentUrl;
    try {
        currentUrl = new URL(urlStr);
    } catch (e) {
        throw new Error('Invalid URL');
    }

    let currentOptions = { ...options };
    let redirectCount = 0;

    while (redirectCount <= maxRedirects) {
        // validateUrl respects ALLOW_PRIVATE_NETWORKS internally
        const validatedHref = await validateUrl(currentUrl.href);

        // Explicitly reconstruct URL from validated href to ensure taint is cleared
        const safeUrl = new URL(validatedHref);

        // CodeQL mitigation: strictly verify protocol and pass URL object to fetch
        if (safeUrl.protocol !== 'http:' && safeUrl.protocol !== 'https:') {
            throw new Error('Only HTTP and HTTPS protocols are allowed');
        }

        const response = await fetch(safeUrl, {
            ...currentOptions,
            redirect: 'manual'
        });

        // Handle redirects (301, 302, 303, 307, 308)
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) return response;

            const nextUrl = new URL(location, safeUrl.href);
            const isCrossOrigin = nextUrl.origin !== currentUrl.origin;

            // Update options for the next request (shallow copy)
            const nextOptions = { ...currentOptions };
            if (nextOptions.headers) {
                nextOptions.headers = { ...nextOptions.headers };
            }

            // Strip sensitive headers on cross-origin redirects
            if (isCrossOrigin && nextOptions.headers) {
                const sensitiveHeaders = ['authorization', 'x-api-key', 'token', 'cookie', 'proxy-authorization'];
                for (const h of Object.keys(nextOptions.headers)) {
                    if (sensitiveHeaders.includes(h.toLowerCase())) {
                        delete nextOptions.headers[h];
                    }
                }
            }

            // Standards compliance: 301, 302, 303 redirects switch to GET and drop body
            if ([301, 302, 303].includes(response.status)) {
                nextOptions.method = 'GET';
                delete nextOptions.body;
                if (nextOptions.headers) {
                    for (const h of Object.keys(nextOptions.headers)) {
                        if (['content-type', 'content-length'].includes(h.toLowerCase())) {
                            delete nextOptions.headers[h];
                        }
                    }
                }
            }

            currentUrl = nextUrl;
            currentOptions = nextOptions;
            redirectCount++;
            continue;
        }

        return response;
    }

    throw new Error('Too many redirects');
}

/**
 * Sets up navigation protection for a Playwright context.
 * Intercepts requests and validates destination URLs.
 * @param {object} context Playwright context.
 */
async function setupNavigationProtection(context) {
    if (ALLOW_PRIVATE_NETWORKS) return;

    await context.route('**/*', async (route) => {
        const request = route.request();
        // Only validate main frame navigations for performance and to avoid breaking sub-resources
        if (request.isNavigationRequest() && request.frame() === request.frame().page().mainFrame()) {
            const url = request.url();
            const currentUrl = request.frame().url();

            try {
                // If it's a same-origin navigation, skip validation for speed
                if (currentUrl && currentUrl !== 'about:blank') {
                    const u1 = new URL(url);
                    const u2 = new URL(currentUrl);
                    if (u1.origin === u2.origin) {
                        return route.continue();
                    }
                }

                await validateUrl(url);
                return route.continue();
            } catch (err) {
                console.error(`[SECURITY] Navigation to ${url} blocked: ${err.message}`);
                return route.abort('blockedbyclient');
            }
        }
        return route.continue();
    });
}

/**
 * Verifies if a WebSocket origin matches the request host (CSWSH protection).
 * @param {string} origin The Origin header value.
 * @param {string} host The Host header value.
 * @returns {boolean} True if the origin is valid or missing.
 */
function isValidWebSocketOrigin(origin, host) {
    if (!origin) return true;
    try {
        const originHost = new URL(origin).host;
        return !!(originHost && host && originHost === host);
    } catch (e) {
        return false;
    }
}

module.exports = { validateUrl, isPrivateIP, isValidWebSocketOrigin, fetchWithRedirectValidation, setupNavigationProtection };
