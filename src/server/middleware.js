const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { REQUEST_LIMIT_WINDOW_MS, AUTH_RATE_LIMIT_MAX, DATA_RATE_LIMIT_MAX } = require('./constants');
const { loadAllowedIps, loadApiKey } = require('./storage');
const { normalizeIp } = require('./utils');

const authRateLimiter = rateLimit({
    windowMs: REQUEST_LIMIT_WINDOW_MS,
    max: AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false
});

const dataRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: DATA_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'TOO_MANY_REQUESTS' }
});

const csrfProtection = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }
    const origin = req.get('Origin');
    const referer = req.get('Referer');
    const host = req.get('Host');

    let originHost = null;
    if (origin) {
        try {
            originHost = new URL(origin).host;
        } catch {
            return res.status(403).json({ error: 'CSRF_INVALID_ORIGIN' });
        }
    }

    let refererHost = null;
    if (referer) {
        try {
            refererHost = new URL(referer).host;
        } catch {
            return res.status(403).json({ error: 'CSRF_INVALID_REFERER' });
        }
    }

    if (originHost && originHost !== host) {
        return res.status(403).json({ error: 'CSRF_ORIGIN_MISMATCH' });
    }
    if (refererHost && refererHost !== host) {
        return res.status(403).json({ error: 'CSRF_REFERER_MISMATCH' });
    }

    if (!origin && !referer) {
        const isApi = req.xhr || req.get('x-api-key') || req.get('authorization') || req.get('x-internal-run') || req.get('key');
        if (!isApi) {
            return res.status(403).json({ error: 'CSRF_MISSING_ORIGIN' });
        }
    }

    next();
};

const isIpAllowed = async (ip) => {
    const allowlist = await loadAllowedIps();
    if (!allowlist || allowlist.size === 0) return true;
    return allowlist.has(normalizeIp(ip));
};

const requireIpAllowlist = async (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
    if (await isIpAllowed(ip)) return next();
    if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'IP_NOT_ALLOWED' });
    }
    return res.status(403).send('Forbidden');
};

const requireAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        if (req.xhr || req.path.startsWith('/api/')) {
            res.status(401).json({ error: 'UNAUTHORIZED' });
        } else {
            res.redirect('/login');
        }
    }
};

const requireAuthForSettings = (req, res, next) => {
    // Always require authentication for settings, even in development.
    return requireAuth(req, res, next);
};

const requireAuthOrApiKey = async (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    return requireApiKey(req, res, next);
};

const isLoopback = (ip) => {
    const normalized = normalizeIp(ip);
    return normalized === '127.0.0.1' || normalized === '::1';
};

const requireApiKey = async (req, res, next) => {
    const internalRun = req.get('x-internal-run');
    if (internalRun === '1' && isLoopback(req.ip)) {
        return next();
    }
    const headerKey = req.get('x-api-key') || req.get('key');
    const authHeader = req.get('authorization');
    const bearerKey = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : '';
    const bodyKey = typeof req.body === 'string' ? req.body : null;
    const providedKey =
        headerKey ||
        bearerKey ||
        (req.body && (req.body.apiKey || req.body.key)) ||
        bodyKey;

    let storedKey = null;
    try {
        storedKey = await loadApiKey();
    } catch (err) {
        // fall through
    }

    if (!storedKey) {
        return res.status(403).json({ error: 'API_KEY_NOT_SET' });
    }

    if (!providedKey || typeof providedKey !== 'string') {
        return res.status(401).json({ error: 'INVALID_API_KEY' });
    }

    // Secure comparison using HMAC-SHA256 to mitigate timing attacks and satisfy CodeQL constraints.
    // We treat the API key as the HMAC key and a random salt as the message. This avoids CodeQL flagging
    // "hashing of a password" (which implies storage) while ensuring a constant-time comparison of the result.
    const salt = crypto.randomBytes(32);
    const providedHmac = crypto.createHmac('sha256', providedKey).update(salt).digest();
    const storedHmac = crypto.createHmac('sha256', storedKey).update(salt).digest();

    if (!crypto.timingSafeEqual(providedHmac, storedHmac)) {
        return res.status(401).json({ error: 'INVALID_API_KEY' });
    }
    next();
};

module.exports = {
    authRateLimiter,
    dataRateLimiter,
    csrfProtection,
    requireIpAllowlist,
    requireAuth,
    requireAuthForSettings,
    requireApiKey,
    requireAuthOrApiKey,
    isIpAllowed
};
