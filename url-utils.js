const dns = require('dns').promises;
const net = require('net');
const { ALLOW_PRIVATE_NETWORKS } = require('./src/server/constants');

/**
 * Checks if an IP address is private.
 *
 * Qualifies as a private network/blocked destination:
 *
 * IPv4 Ranges:
 * - 0.0.0.0/8 (Current network)
 * - 10.0.0.0/8 (Private-Use Networks - RFC 1918)
 * - 100.64.0.0/10 (Shared Address Space - RFC 6598)
 * - 127.0.0.0/8 (Loopback)
 * - 169.254.0.0/16 (Link-Local)
 * - 172.16.0.0/12 (Private-Use Networks - RFC 1918)
 * - 192.0.0.0/24 (IETF Protocol Assignments)
 * - 192.0.2.0/24 (TEST-NET-1)
 * - 192.168.0.0/16 (Private-Use Networks - RFC 1918)
 * - 198.18.0.0/15 (Benchmarking)
 * - 198.51.100.0/24 (TEST-NET-2)
 * - 203.0.113.0/24 (TEST-NET-3)
 * - 224.0.0.0/4 (Multicast)
 * - 240.0.0.0/4 (Reserved)
 *
 * IPv6 Ranges:
 * - ::/128 (Unspecified)
 * - ::1/128 (Loopback)
 * - fc00::/7 (Unique Local Address)
 * - fe80::/10 (Link-Local Unicast)
 * - ff00::/8 (Multicast)
 * - IPv4-mapped/compatible addresses pointing to the above IPv4 ranges
 *
 * Hostnames:
 * - localhost
 * - *.localhost
 * - host.docker.internal
 *
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
            (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
            (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) || // 192.0.0.0/24
            (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) || // 192.0.2.0/24
            (parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19) || // 198.18.0.0/15
            (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) || // 198.51.100.0/24
            (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) || // 203.0.113.0/24
            parts[0] >= 224 // 224.0.0.0/4 (Multicast) and 240.0.0.0/4 (Reserved)
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

        // Native IPv6 checks (Unspecified, Loopback, Link-Local, Unique Local, Multicast)
        const isUnspecified = parts.every(p => p === '0' || p === '0000' || p === '');
        const isLoopback = parts.slice(0, -1).every(p => p === '0' || p === '0000' || p === '') &&
            (parts[parts.length - 1] === '1' || parts[parts.length - 1] === '0001');

        if (isUnspecified || isLoopback) return true;

        const firstHex = parseInt(parts[0], 16);
        if (!isNaN(firstHex)) {
            if (firstHex >= 0xff00) return true; // ff00::/8 Multicast
            if (firstHex >= 0xfe80 && firstHex <= 0xfebf) return true; // fe80::/10 Link-local
            if (firstHex >= 0xfc00 && firstHex <= 0xfdff) return true; // fc00::/7 Unique local
        }
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
    if (
        lowerHost === 'localhost' ||
        lowerHost.endsWith('.localhost') ||
        lowerHost === 'host.docker.internal'
    ) {
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
        const originUrl = new URL(origin);
        const originHost = originUrl.host;
        if (originHost && host && originHost === host) {
            return true;
        }

        const originHostname = originUrl.hostname.toLowerCase();

        let hostHostname = host.toLowerCase();
        if (hostHostname.includes('[')) {
            const closeBracket = hostHostname.indexOf(']');
            if (closeBracket !== -1) {
                hostHostname = hostHostname.slice(1, closeBracket);
            }
        } else {
            const colonIndex = hostHostname.indexOf(':');
            if (colonIndex !== -1) {
                hostHostname = hostHostname.slice(0, colonIndex);
            }
        }

        const isExactLocal = (h) => {
            return h === 'localhost' || h === '127.0.0.1' || h === '::1';
        };

        if (isExactLocal(originHostname) && isExactLocal(hostHostname)) {
            return true;
        }

        return false;
    } catch (e) {
        return false;
    }
}

module.exports = { validateUrl, isPrivateIP, isValidWebSocketOrigin, fetchWithRedirectValidation, setupNavigationProtection };
