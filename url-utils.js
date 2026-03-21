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

/**
 * Validates a URL to prevent SSRF by blocking private IP ranges.
 * @param {string} urlStr The URL to validate.
 * @throws {Error} If the URL is invalid or points to a private network.
 */
async function validateUrl(urlStr) {
    if (!urlStr) return;

    let url;
    try {
        url = new URL(urlStr);
    } catch (e) {
        throw new Error('Invalid URL');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Only HTTP and HTTPS protocols are allowed');
    }

    if (ALLOW_PRIVATE_NETWORKS) return;

    let hostname = url.hostname;
    // Strip brackets from IPv6 hostnames
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        hostname = hostname.substring(1, hostname.length - 1);
    }

    // Direct check for common private hostnames
    const lowerHost = hostname.toLowerCase();
    if (lowerHost === 'localhost' || lowerHost.endsWith('.localhost')) {
        throw new Error('Access to private network is restricted');
    }

    // Resolve hostname to IP
    try {
        // dns.lookup follows /etc/hosts and is what's typically used for connecting
        const addresses = await dns.lookup(hostname, { all: true });
        for (const addr of addresses) {
            if (isPrivateIP(addr.address)) {
                throw new Error('Access to private network is restricted');
            }
        }
    } catch (e) {
        if (e.message === 'Access to private network is restricted') {
            throw e;
        }

        // If it's already an IP address, check it directly
        if (net.isIP(hostname)) {
            if (isPrivateIP(hostname)) {
                throw new Error('Access to private network is restricted');
            }
        }

        // Rethrow if it's the specific restricted error
        if (e.message === 'Access to private network is restricted') {
            throw e;
        }

        // If we can't resolve it and it's not an IP, we allow it to proceed
        // to the browser where it will likely fail normally.
    }
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

module.exports = { validateUrl, isPrivateIP, isValidWebSocketOrigin };
