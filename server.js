const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cookie = require('cookie');
const signature = require('cookie-signature');

// Catch unhandled promise rejections from playwright-extra stealth plugin.
// When pages close before the plugin finishes async CDP initialization,
// benign rejections bubble up and would otherwise crash the process.
process.on('unhandledRejection', (reason) => {
    const msg = reason && reason.message ? reason.message : String(reason);
    if (/Target page, context or browser has been closed/i.test(msg)) {
        console.warn('[STEALTH] Suppressed benign rejection:', msg);
        return;
    }
    console.error('Unhandled rejection:', reason);
});

// Constants
const {
    DEFAULT_PORT,
    DIST_DIR,
    DATA_DIR,
    SESSIONS_DIR,
    SESSION_SECRET_FILE,
    SESSION_TTL_SECONDS,
    NOVNC_PORT,
    WEBSOCKIFY_PATH,
    VNC_PASSWORD_FILE
} = require('./src/server/constants');

const {
    loadTasks,
    getTaskById
} = require('./src/server/storage');

// Context & Utils
const {
    executionStreams,
    stopRequests,
    sendExecutionUpdate
} = require('./src/server/state');
const {
    findAvailablePort,
    proxyWebsockify,
    isPortAvailable
} = require('./src/server/utils');
const { isValidWebSocketOrigin, fetchWithRedirectValidation } = require('./url-utils');

// Middleware
const {
    authRateLimiter,
    dataRateLimiter,
    csrfProtection,
    requireIpAllowlist,
    requireAuth,
    isIpAllowed,
    requireApiKey,
    requireAuthOrApiKey
} = require('./src/server/middleware');

// Feature Modules (Legacy/Existing)
const { handleScrape } = require('./scrape');
const { handleAgent, setProgressReporter, setStopChecker, setStopCleaner } = require('./src/agent/figranite');
const { normalizeTaskOutcome } = require('./src/agent/outcomes');
const { handleHeadful, stopHeadful, toggleInspectMode, headfulEventEmitter } = require('./headful');

// Routes
const authRoutes = require('./src/server/routes/auth');
const settingsRoutes = require('./src/server/routes/settings');
const taskRoutes = require('./src/server/routes/tasks');
const executionRoutes = require('./src/server/routes/executions');
const dataRoutes = require('./src/server/routes/data');
const viewRoutes = require('./src/server/routes/views');
const scheduleRoutes = require('./src/server/routes/schedules');
const credentialRoutes = require('./src/server/routes/credentials');
const healthRoutes = require('./src/server/routes/health');
const browserRoutes = require('./src/server/routes/browser');
const cabinetRoutes = require('./src/server/routes/cabinets');
const { pushOutput } = require('./src/server/outputProviders');
const { migrateStorageState } = require('./src/server/migrate-storage');
const { concurrencyGate } = require('./src/server/execution-queue');
const { validateUrl } = require('./url-utils');

const app = express();
app.disable('x-powered-by');
const port = Number(process.env.PORT) || DEFAULT_PORT;

// Session Secret Setup
let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
    try {
        if (fs.existsSync(SESSION_SECRET_FILE)) {
            SESSION_SECRET = fs.readFileSync(SESSION_SECRET_FILE, 'utf8').trim();
        } else {
            // Generate secret using crypto.randomBytes
            SESSION_SECRET = crypto.randomBytes(48).toString('hex');
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(SESSION_SECRET_FILE, SESSION_SECRET);
        }
    } catch (e) {
        console.warn('Failed to load session secret from disk, falling back to process env only.');
    }
}
if (!SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable is required');
}

// Ensure Directories
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// Trust Proxy
const TRUST_PROXY = ['1', 'true', 'yes'].includes(String(process.env.TRUST_PROXY || '').toLowerCase()) || process.env.RENDER === 'true';
if (TRUST_PROXY) {
    app.set('trust proxy', true);
}

// Session Cookie Secure
const SESSION_COOKIE_SECURE = ['1', 'true', 'yes'].includes(String(process.env.SESSION_COOKIE_SECURE || '').toLowerCase());
if (!SESSION_COOKIE_SECURE && process.env.NODE_ENV === 'production') {
    console.warn('[SECURITY] SESSION_COOKIE_SECURE is not enabled. Set SESSION_COOKIE_SECURE=1 when running behind HTTPS.');
}

// Wire up Agent Callbacks
setProgressReporter(sendExecutionUpdate);
setStopChecker((runId) => {
    if (!runId) return false;
    if (stopRequests.has(runId)) {
        stopRequests.delete(runId);
        return true;
    }
    return false;
});
setStopCleaner((runId) => stopRequests.delete(runId));

// App Middleware
app.use(requireIpAllowlist);

// Security Headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy
    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https://www.google.com https://*.gstatic.com https://cdn.jsdelivr.net https://raw.githubusercontent.com",
        "connect-src 'self' https://api.github.com https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://api.baserow.io",
        "media-src 'self' blob:",
        "frame-src 'self'"
    ].join('; ');
    res.setHeader('Content-Security-Policy', csp);

    if (SESSION_COOKIE_SECURE) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

app.use(express.json({ limit: '2mb' }));

const sessionStore = new FileStore({
    path: SESSIONS_DIR,
    ttl: SESSION_TTL_SECONDS,
    retries: 5,
    retryDelay: 100,
    reapInterval: 3600,
    logFn: () => { }
});

// Suppress session file store EPERM errors on Windows (antivirus/indexer file locking)
sessionStore.on('error', (err) => {
    if (err && err.code === 'EPERM') return; // Silently ignore
    if (err && err.code === 'ENOENT') return; // Session file deleted between read attempts
    console.error('[SESSION] Store error:', err);
});

app.use(session({
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: true,
    rolling: true,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: SESSION_COOKIE_SECURE,
        sameSite: 'strict',
        maxAge: SESSION_TTL_SECONDS * 1000
    }
}));

app.use(csrfProtection);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/executions', executionRoutes);
app.use('/api', dataRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/credentials', credentialRoutes);
app.use('/api/cabinets', cabinetRoutes);
app.use('/api/health', healthRoutes);
app.use('/api', browserRoutes);

// View Routes & Static
app.use('/', viewRoutes);

// Execution Entry Points (Top-level routes kept for compatibility/simplicity)
const registerExecution = (req, res, baseMeta = {}) => {
    // This is a simplified version of the one in server.js, 
    // relying on the fact that handleScrape/Agent/Headful will handle the response.
    // However, the original registerExecution wrapped res.json to capture result
    // and appended to execution log on finish.
    // We need to restore that logic here or import it.
    // Since it was local to server.js, I should probably implement it here or imports.
    // It depends on `appendExecution`.

    // For now, I will re-implement it here using imports.
    const { appendExecution } = require('./src/server/storage');

    const start = Date.now();
    const requestId = 'exec_' + start + '_' + Math.floor(Math.random() * 1000);
    res.locals.executionId = requestId;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        res.locals.executionResult = body;
        return originalJson(body);
    };
    res.on('finish', () => {
        const durationMs = Date.now() - start;
        const body = req.body || {};
        const entry = {
            id: requestId,
            timestamp: start,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs,
            source: body.runSource || req.query.runSource || baseMeta.source || 'api',
            mode: body.mode || baseMeta.mode || 'unknown',
            taskId: body.taskId || baseMeta.taskId || null,
            taskName: body.name || baseMeta.taskName || null,
            url: body.url || req.query.url || null,
            taskSnapshot: body.taskSnapshot || null,
            result: res.locals.executionResult || null,
            outcome: res.locals.executionResult?.outcome
                ? normalizeTaskOutcome(res.locals.executionResult.outcome)
                : undefined
        };
        appendExecution(entry).catch(err => console.error('Failed to append execution:', err));

        const outputConfig = body.output || (body.taskSnapshot && body.taskSnapshot.output);
        if (outputConfig && entry.result && entry.result.data !== undefined) {
            pushOutput(outputConfig, entry.result.data, requestId)
                .catch(err => console.error('[OUTPUT] Unexpected error:', err));
        }

        // Webhook callback: POST result to caller-provided URL
        const webhookUrl = res.locals.webhookUrl;
        if (webhookUrl && entry.result) {
            const payload = JSON.stringify({
                executionId: entry.id,
                taskId: entry.taskId,
                status: entry.status,
                outcome: entry.outcome,
                durationMs: entry.durationMs,
                result: entry.result
            });
            fetchWithRedirectValidation(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                signal: AbortSignal.timeout(10000)
            }).catch(err => console.error('[WEBHOOK] Failed to deliver:', err.message));
        }
    });
};

const preprocessScrapeRequest = (req) => {
    const vars = req.body?.taskVariables || req.body?.variables || req.query?.taskVariables || req.query?.variables || {};
    let safeVars = vars;
    if (typeof vars === 'string') {
        try { safeVars = JSON.parse(vars); } catch { }
    } else if (typeof vars !== 'object') {
        safeVars = {};
    }

    const resolve = (str) => {
        if (typeof str !== 'string') return str;
        return str.replace(/\{\$([\w.]+)\}/g, (_match, name) => {
            if (name === 'now') return new Date().toISOString();
            const value = safeVars[name];
            if (value === undefined || value === null) return '';
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                return String(value);
            }
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        });
    };

    if (req.body) {
        if (req.body.url) req.body.url = resolve(req.body.url);
        if (req.body.selector) req.body.selector = resolve(req.body.selector);
        if (req.body.extractionScript) req.body.extractionScript = resolve(req.body.extractionScript);
    }
    if (req.query) {
        if (req.query.url) req.query.url = resolve(req.query.url);
        if (req.query.selector) req.query.selector = resolve(req.query.selector);
        if (req.query.extractionScript) req.query.extractionScript = resolve(req.query.extractionScript);
    }
};

const executeTaskById = async (req, res) => {
    const taskId = req.params.id;
    let task;
    try {
        await loadTasks();
        task = getTaskById(taskId);
    } catch (e) {
        return res.status(500).json({ error: 'FAILED_TO_LOAD_TASK' });
    }

    if (!task) {
        return res.status(404).json({ error: 'TASK_NOT_FOUND' });
    }

    if (!req.body || typeof req.body !== 'object') {
        req.body = {};
    }

    // Webhook: validate and stash for post-execution delivery
    const webhookUrl = req.body.webhookUrl;
    if (webhookUrl) {
        try {
            await validateUrl(webhookUrl);
            res.locals.webhookUrl = webhookUrl;
        } catch (err) {
            return res.status(400).json({ error: 'INVALID_WEBHOOK_URL', message: 'Invalid URL or restricted destination' });
        }
    }

    registerExecution(req, res, { mode: task.mode || 'agent', taskId: task.id, taskName: task.name });

    const clientVars = req.body.variables || req.body.taskVariables || {};
    const taskVars = {};
    if (task.variables) {
        for (const [key, v] of Object.entries(task.variables)) {
            taskVars[key] = v.value;
        }
    }
    const runtimeVars = { ...taskVars, ...clientVars };

    req.body = {
        ...req.body,
        ...task,
        url: req.body.url || task.url,
        taskId: task.id,
        variables: runtimeVars,
        taskVariables: runtimeVars,
        actions: task.actions || [],
        mode: task.mode || 'agent',
        extractionScript: req.body.extractionScript || task.extractionScript
    };

    if (task.mode === 'scrape') {
        preprocessScrapeRequest(req);
        return handleScrape(req, res);
    } else if (task.mode === 'headful') {
        if (req.body && typeof req.body.url === 'string') {
            req.body.url = req.body.url.replace(/\{\$(\w+)\}/g, (_match, name) => {
                const value = runtimeVars[name];
                if (value === undefined || value === null) return '';
                return String(value);
            });
        }
        return handleHeadful(req, res);
    } else {
        return handleAgent(req, res);
    }
};

app.post('/tasks/:id/api', requireApiKey, dataRateLimiter, concurrencyGate, executeTaskById);
app.post('/api/tasks/:id/api', requireApiKey, dataRateLimiter, concurrencyGate, executeTaskById);

app.all('/scrape', requireAuth, dataRateLimiter, concurrencyGate, (req, res) => {
    registerExecution(req, res, { mode: 'scrape' });
    preprocessScrapeRequest(req);
    return handleScrape(req, res);
});
app.all('/scraper', requireAuth, dataRateLimiter, concurrencyGate, (req, res) => {
    registerExecution(req, res, { mode: 'scrape' });
    preprocessScrapeRequest(req);
    return handleScrape(req, res);
});
app.all('/agent', requireAuth, dataRateLimiter, concurrencyGate, (req, res) => {
    registerExecution(req, res, { mode: 'agent' });
    return handleAgent(req, res);
});
app.post('/headful', requireAuth, dataRateLimiter, concurrencyGate, (req, res) => {
    registerExecution(req, res, { mode: 'headful' });
    if (req.body) {
        // Flatten variables from {type, value} objects to plain values
        const rawVars = req.body.taskVariables || req.body.variables || {};
        const vars = {};
        for (const [key, v] of Object.entries(rawVars)) {
            vars[key] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
        }
        if (req.body.variables) req.body.variables = vars;
        if (req.body.taskVariables) req.body.taskVariables = vars;
        if (typeof req.body.url === 'string') {
            req.body.url = req.body.url.replace(/\{\$(\w+)\}/g, (_match, name) => {
                const value = vars[name];
                if (value === undefined || value === null) return '';
                return String(value);
            });
        }
    }
    return handleHeadful(req, res);
});
app.post('/headful/stop', requireAuth, stopHeadful);

// Captures may be written to either the root-level or the src-level public/captures
// directory depending on the entry point / image generation. Ensure both exist and
// serve statically from both so files written by any engine are surfaced.
const capturesDir = path.join(__dirname, 'public', 'captures');
const srcCapturesDir = path.join(__dirname, 'src', 'public', 'captures');

if (!fs.existsSync(capturesDir)) {
    fs.mkdirSync(capturesDir, { recursive: true });
}
if (!fs.existsSync(srcCapturesDir)) {
    fs.mkdirSync(srcCapturesDir, { recursive: true });
}

// NoVNC Setup
const novncDirCandidates = [
    '/opt/novnc',
    '/usr/share/novnc'
];
const novncDir = novncDirCandidates.find((candidate) => {
    try {
        return fs.existsSync(candidate);
    } catch {
        return false;
    }
});
const novncEnabled = !!novncDir;
if (novncDir) {
    app.use('/novnc', express.static(novncDir));
}

// Static Files
// File-type logos are versioned application assets. Keep them in the browser's
// HTTP cache instead of cookies (cookies are sent with every request and cannot
// safely hold binary SVG data).
app.use('/file-icons', express.static(path.join(__dirname, 'public', 'file-icons'), {
    maxAge: '1y',
    immutable: true,
    etag: true
}));
app.get('/captures/:legacyName', requireAuthOrApiKey, async (req, res, next) => {
    try {
        const entry = await require('./src/server/cabinets').resolveLegacyPath(req.params.legacyName);
        if (!entry) return next();
        return res.download(entry.path, entry.item.name);
    } catch { return next(); }
});
app.use('/captures', requireAuthOrApiKey, express.static(capturesDir), express.static(srcCapturesDir));
app.use('/screenshots', requireAuthOrApiKey, express.static(capturesDir), express.static(srcCapturesDir));
app.use(express.static(DIST_DIR));

// Headful Status Endpoint
app.get('/api/headful/status', requireAuth, async (req, res) => {
    if (!novncEnabled) {
        return res.json({ useNovnc: false });
    }
    // Check if the novnc port is actually in use
    const portAvailable = await isPortAvailable(NOVNC_PORT);
    // If the port is NOT available, something (websockify) is listening on it
    res.json({ useNovnc: !portAvailable });
});

app.get('/api/headful/selector_stream', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    res.write('event: ready\ndata: {}\n\n');

    const onSelectorSelected = (selector) => {
        try {
            res.write(`data: ${JSON.stringify({ selector })}\n\n`);
        } catch (err) {
            // ignore
        }
    };

    headfulEventEmitter.on('selectorSelected', onSelectorSelected);

    const keepAlive = setInterval(() => {
        try {
            res.write(':keep-alive\n\n');
        } catch {
            // ignore
        }
    }, 20000);

    req.on('close', () => {
        clearInterval(keepAlive);
        headfulEventEmitter.off('selectorSelected', onSelectorSelected);
    });
});

app.get('/headful/selector_stream', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    res.write('event: ready\ndata: {}\n\n');

    const onSelectorSelected = (selector) => {
        try {
            res.write(`data: ${JSON.stringify({ selector })}\n\n`);
        } catch (err) {
            // ignore
        }
    };

    headfulEventEmitter.on('selectorSelected', onSelectorSelected);

    const keepAlive = setInterval(() => {
        try {
            res.write(':keep-alive\n\n');
        } catch {
            // ignore
        }
    }, 20000);

    req.on('close', () => {
        clearInterval(keepAlive);
        headfulEventEmitter.off('selectorSelected', onSelectorSelected);
    });
});

app.post('/api/headful/inspect', requireAuth, toggleInspectMode);
app.post('/headful/inspect', requireAuth, toggleInspectMode);

app.get('/api/headful/vnc-password', requireAuth, (req, res) => {
    try {
        if (fs.existsSync(VNC_PASSWORD_FILE)) {
            const password = fs.readFileSync(VNC_PASSWORD_FILE, 'utf8').trim();
            res.json({ password });
        } else {
            res.status(404).json({ error: 'VNC_PASSWORD_NOT_FOUND' });
        }
    } catch (err) {
        res.status(500).json({ error: 'FAILED_TO_READ_VNC_PASSWORD' });
    }
});

// Client-side routes must remain reloadable. Keep this after all API and
// browser endpoints so unknown API paths still return their normal 404s.
app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/captures/') || req.path.startsWith('/screenshots/') || req.path.startsWith('/novnc/') || path.extname(req.path)) {
        return next();
    }
    if (!req.accepts('html')) return next();
    return requireAuth(req, res, () => res.sendFile(path.join(DIST_DIR, 'index.html')));
});

// Start Server
findAvailablePort(port, 20)
    .then((availablePort) => {
        if (availablePort !== port) {
            console.log(`Port ${port} in use, switched to ${availablePort}.`);
        }
        const server = app.listen(availablePort, '0.0.0.0', () => {
            const address = server.address();
            const displayPort = typeof address === 'object' && address ? address.port : availablePort;
            console.log(`Server running at http://localhost:${displayPort}`);

            // One-time migration of storage_state.json cookies into persistent browser profiles
            migrateStorageState().catch(err => console.error('[MIGRATION] Failed:', err.message));
            require('./src/server/cabinets').ensure().catch(err => console.error('[CABINETS] Initialization failed:', err.message));

            // Start the cron scheduler
            const { startScheduler } = require('./src/server/scheduler');
            startScheduler().catch(err => console.error('[SCHEDULER] Failed to start:', err.message));

            // Initialize proxies from DB if available
            const { loadProxyConfigAsync } = require('./proxy-rotation');
            loadProxyConfigAsync().catch(err => console.error('[PROXIES] Initial DB load failed:', err.message));

            // Reconcile the optional downloaded CAPTCHA model independently of browser
            // startup. The skip flag returns before resource probing or downloads.
            const { captchaModelManager } = require('./src/agent/figranite/captcha-model-manager');
            captchaModelManager.start().catch(err => console.warn('[CAPTCHA_MODEL] Startup skipped:', err.message));
        });
        server.on('upgrade', async (req, socket, head) => {
            if (!await isIpAllowed(req.socket?.remoteAddress)) {
                try { socket.destroy(); } catch { }
                return;
            }

            // Cross-Site WebSocket Hijacking (CSWSH) protection: verify Origin header matches Host
            if (!isValidWebSocketOrigin(req.headers.origin, req.headers.host)) {
                console.warn(`[SECURITY] CSWSH attempt blocked: Origin ${req.headers.origin} mismatch with Host ${req.headers.host}`);
                try { socket.destroy(); } catch { }
                return;
            }

            // Authentication check for WebSocket upgrade
            const cookies = cookie.parse(req.headers.cookie || '');
            const signedSid = cookies['connect.sid'];
            let isAuthenticated = false;

            if (signedSid && signedSid.startsWith('s:')) {
                const sid = signature.unsign(signedSid.slice(2), SESSION_SECRET);
                if (sid) {
                    const session = await new Promise((resolve) => {
                        sessionStore.get(sid, (err, sess) => resolve(err ? null : sess));
                    });
                    if (session && session.user) {
                        isAuthenticated = true;
                    }
                }
            }

            // Also allow API key authentication for WebSockets if needed
            if (!isAuthenticated) {
                const apiKey = req.headers['x-api-key'] || new URL(req.url, `http://${req.headers.host}`).searchParams.get('apiKey');
                if (apiKey) {
                    const { loadApiKey } = require('./src/server/storage');
                    const storedKey = await loadApiKey().catch(() => null);
                    if (storedKey && apiKey === storedKey) {
                        isAuthenticated = true;
                    }
                }
            }

            if (!isAuthenticated) {
                console.warn(`[SECURITY] Unauthenticated WebSocket upgrade attempt blocked from ${req.socket?.remoteAddress}`);
                try { socket.destroy(); } catch { }
                return;
            }

            const handled = proxyWebsockify(req, socket, head);
            if (!handled) {
                try { socket.destroy(); } catch { }
            }
        });
        server.on('error', (err) => {
            console.error('Server failed to start:', err.message || err);
            process.exit(1);
        });

        // Graceful shutdown handler
        let shutdownInProgress = false;
        const gracefulShutdown = async (signal) => {
            if (shutdownInProgress) return;
            shutdownInProgress = true;
            console.log(`[SHUTDOWN] Received ${signal}, shutting down gracefully...`);

            // Stop accepting new connections
            server.close(() => {
                console.log('[SHUTDOWN] HTTP server closed.');
            });

            // Stop scheduler
            try {
                const { stopScheduler } = require('./src/server/scheduler');
                stopScheduler();
            } catch { }

            try {
                const { captchaModelManager } = require('./src/agent/figranite/captcha-model-manager');
                await captchaModelManager.stop();
            } catch { }

            // Flush pending execution writes
            try {
                const { flushExecutions } = require('./src/server/storage');
                if (flushExecutions) await flushExecutions();
            } catch { }

            // Close database pool
            try {
                const { getPool } = require('./src/server/db');
                const pool = getPool();
                if (pool) await pool.end();
            } catch { }

            console.log('[SHUTDOWN] Cleanup complete.');
            process.exit(0);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    })
    .catch((err) => {
        console.error('Server failed to start:', err.message || err);
        process.exit(1);
    });
