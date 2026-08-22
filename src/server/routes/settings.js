const express = require('express');
const crypto = require('crypto');
const { requireAuthForSettings, csrfProtection, dataRateLimiter } = require('../middleware');
const { validateUrl } = require('../../../url-utils');
const {
    loadApiKey, saveApiKey,
    loadGeminiApiKey, saveGeminiApiKey,
    loadOpenAiApiKey, saveOpenAiApiKey,
    loadClaudeApiKey, saveClaudeApiKey,
    loadOllamaApiKey, saveOllamaApiKey,
    loadAiModels, saveAiModels,
    loadThemeConfig, saveThemeConfig,
    loadCaptchaSettings, saveCaptchaSettings
} = require('../storage');
const cookie = require('cookie');
const { getUserAgentConfig, setUserAgentSelection } = require('../../../user-agent-settings');
const { listProxies, addProxy, addProxies, updateProxy, deleteProxy, deleteProxies, setDefaultProxy, setIncludeDefaultInRotation, setRotationMode } = require('../../../proxy-rotation');

const router = express.Router();

function createNewApiKey() {
    return crypto.randomBytes(32).toString('hex');
}

async function validateProxyServer(server) {
    if (!server || typeof server !== 'string') return;
    let urlToCheck = server.trim();
    if (!urlToCheck.includes('://')) urlToCheck = 'http://' + urlToCheck;
    await validateUrl(urlToCheck);
}

// API Key
router.get('/api-key', requireAuthForSettings, async (req, res) => {
    try {
        const currentKey = await loadApiKey();
        res.json({ apiKey: currentKey || null });
    } catch (e) {
        console.error('[API_KEY] Load failed:', e);
        res.status(500).json({ error: 'API_KEY_LOAD_FAILED' });
    }
});

router.post('/api-key', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        const bodyKey = req.body && typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : '';
        if (bodyKey.length > 512) return res.status(400).json({ error: 'API_KEY_TOO_LONG' });
        const newKey = bodyKey || createNewApiKey();
        await saveApiKey(newKey);
        res.json({ apiKey: newKey });
    } catch (e) {
        console.error('[API_KEY] Save failed:', e);
        res.status(500).json({ error: 'API_KEY_SAVE_FAILED' });
    }
});

// User Agent
// User Agent
router.get('/user-agent', requireAuthForSettings, async (_req, res) => {
    try {
        res.json(await getUserAgentConfig());
    } catch (e) {
        console.error('[USER_AGENT] Load failed:', e);
        res.status(500).json({ error: 'USER_AGENT_LOAD_FAILED' });
    }
});

router.post('/user-agent', csrfProtection, requireAuthForSettings, async (req, res) => {
    if (typeof req.csrfToken === 'function') req.csrfToken();
    try {
        const selection = req.body && typeof req.body.selection === 'string' ? req.body.selection : null;
        await setUserAgentSelection(selection);
        res.json(await getUserAgentConfig());
    } catch (e) {
        console.error('[USER_AGENT] Save failed:', e);
        res.status(500).json({ error: 'USER_AGENT_SAVE_FAILED' });
    }
});

// Gemini API Key
router.get('/gemini-api-key', requireAuthForSettings, async (req, res) => {
    try {
        const keys = await loadGeminiApiKey();
        res.json({ geminiApiKeys: keys || [] });
    } catch (e) {
        console.error('[GEMINI_API_KEY] Load failed:', e);
        res.status(500).json({ error: 'GEMINI_API_KEY_LOAD_FAILED' });
    }
});

router.post('/gemini-api-key', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        let keys = [];
        if (req.body && Array.isArray(req.body.geminiApiKeys)) {
            keys = req.body.geminiApiKeys.map(k => typeof k === 'string' ? k.trim() : '').filter(k => k);
        } else if (req.body && typeof req.body.geminiApiKey === 'string') {
            const bodyKey = req.body.geminiApiKey.trim();
            if (bodyKey) keys.push(bodyKey);
        }
        if (keys.some(k => k.length > 512)) return res.status(400).json({ error: 'API_KEY_TOO_LONG' });
        await saveGeminiApiKey(keys);
        res.json({ geminiApiKeys: keys });
    } catch (e) {
        console.error('[GEMINI_API_KEY] Save failed:', e);
        res.status(500).json({ error: 'GEMINI_API_KEY_SAVE_FAILED' });
    }
});

// OpenAI API Key
router.get('/openai-api-key', requireAuthForSettings, async (req, res) => {
    try {
        const keys = await loadOpenAiApiKey();
        res.json({ openAiApiKeys: keys || [] });
    } catch (e) {
        console.error('[OPENAI_API_KEY] Load failed:', e);
        res.status(500).json({ error: 'OPENAI_API_KEY_LOAD_FAILED' });
    }
});

router.post('/openai-api-key', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        let keys = [];
        if (req.body && Array.isArray(req.body.openAiApiKeys)) {
            keys = req.body.openAiApiKeys.map(k => typeof k === 'string' ? k.trim() : '').filter(k => k);
        } else if (req.body && typeof req.body.openAiApiKey === 'string') {
            const bodyKey = req.body.openAiApiKey.trim();
            if (bodyKey) keys.push(bodyKey);
        }
        if (keys.some(k => k.length > 512)) return res.status(400).json({ error: 'API_KEY_TOO_LONG' });
        await saveOpenAiApiKey(keys);
        res.json({ openAiApiKeys: keys });
    } catch (e) {
        console.error('[OPENAI_API_KEY] Save failed:', e);
        res.status(500).json({ error: 'OPENAI_API_KEY_SAVE_FAILED' });
    }
});

// Claude API Key
router.get('/claude-api-key', requireAuthForSettings, async (req, res) => {
    try {
        const keys = await loadClaudeApiKey();
        res.json({ claudeApiKeys: keys || [] });
    } catch (e) {
        console.error('[CLAUDE_API_KEY] Load failed:', e);
        res.status(500).json({ error: 'CLAUDE_API_KEY_LOAD_FAILED' });
    }
});

router.post('/claude-api-key', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        let keys = [];
        if (req.body && Array.isArray(req.body.claudeApiKeys)) {
            keys = req.body.claudeApiKeys.map(k => typeof k === 'string' ? k.trim() : '').filter(k => k);
        } else if (req.body && typeof req.body.claudeApiKey === 'string') {
            const bodyKey = req.body.claudeApiKey.trim();
            if (bodyKey) keys.push(bodyKey);
        }
        if (keys.some(k => k.length > 512)) return res.status(400).json({ error: 'API_KEY_TOO_LONG' });
        await saveClaudeApiKey(keys);
        res.json({ claudeApiKeys: keys });
    } catch (e) {
        console.error('[CLAUDE_API_KEY] Save failed:', e);
        res.status(500).json({ error: 'CLAUDE_API_KEY_SAVE_FAILED' });
    }
});

// Ollama API Key (stores base URLs)
router.get('/ollama-api-key', requireAuthForSettings, async (req, res) => {
    try {
        const keys = await loadOllamaApiKey();
        res.json({ ollamaApiKeys: keys || [] });
    } catch (e) {
        console.error('[OLLAMA_API_KEY] Load failed:', e);
        res.status(500).json({ error: 'OLLAMA_API_KEY_LOAD_FAILED' });
    }
});

router.post('/ollama-api-key', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        let keys = [];
        if (req.body && Array.isArray(req.body.ollamaApiKeys)) {
            keys = req.body.ollamaApiKeys.map(k => typeof k === 'string' ? k.trim() : '').filter(k => k);
        } else if (req.body && typeof req.body.ollamaApiKey === 'string') {
            const bodyKey = req.body.ollamaApiKey.trim();
            if (bodyKey) keys.push(bodyKey);
        }
        if (keys.some(k => k.length > 512)) return res.status(400).json({ error: 'URL_TOO_LONG' });

        // Validate URLs to prevent SSRF
        for (const raw of keys) {
            let baseUrl = raw;
            try {
                const parsed = JSON.parse(raw);
                baseUrl = parsed.url || '';
            } catch {
                // Not JSON, treat as plain URL
            }
            if (baseUrl) {
                try {
                    await validateUrl(baseUrl);
                } catch (err) {
                    return res.status(400).json({ error: 'INVALID_URL', message: 'Invalid Ollama URL' });
                }
            }
        }

        await saveOllamaApiKey(keys);
        res.json({ ollamaApiKeys: keys });
    } catch (e) {
        console.error('[OLLAMA_API_KEY] Save failed:', e);
        res.status(500).json({ error: 'OLLAMA_API_KEY_SAVE_FAILED' });
    }
});

// Proxies
router.get('/proxies', requireAuthForSettings, (_req, res) => {
    try {
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Load failed:', e);
        res.status(500).json({ error: 'PROXY_LOAD_FAILED' });
    }
});

router.post('/proxies', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    const { server, username, password, label, isRotatingPool, estimatedPoolSize } = req.body || {};
    if (!server || typeof server !== 'string') {
        return res.status(400).json({ error: 'MISSING_SERVER' });
    }

    // SSRF Validation
    try {
        await validateProxyServer(server);
    } catch (err) {
        return res.status(400).json({ error: 'INVALID_URL', message: err.message });
    }

    try {
        const result = addProxy({ server, username, password, label, isRotatingPool, estimatedPoolSize });
        if (!result) return res.status(400).json({ error: 'INVALID_PROXY' });
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Add failed:', e);
        res.status(500).json({ error: 'PROXY_SAVE_FAILED' });
    }
});

router.post('/proxies/import', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    const entries = req.body && Array.isArray(req.body.proxies) ? req.body.proxies : [];
    if (entries.length === 0) {
        return res.status(400).json({ error: 'MISSING_PROXIES' });
    }

    // SSRF Validation for each entry
    for (const entry of entries) {
        const serverRaw = entry.server || entry.url || entry.proxy;
        try {
            await validateProxyServer(serverRaw);
        } catch (err) {
            return res.status(400).json({ error: 'INVALID_URL', message: `Invalid proxy server: ${serverRaw}. ${err.message}` });
        }
    }

    try {
        const result = addProxies(entries);
        if (!result) return res.status(400).json({ error: 'INVALID_PROXY' });
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Import failed:', e);
        res.status(500).json({ error: 'PROXY_IMPORT_FAILED' });
    }
});

router.put('/proxies/:id', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id || id === 'host') return res.status(400).json({ error: 'INVALID_ID' });
    const { server, username, password, label, isRotatingPool, estimatedPoolSize } = req.body || {};
    if (!server || typeof server !== 'string') {
        return res.status(400).json({ error: 'MISSING_SERVER' });
    }

    // SSRF Validation
    try {
        await validateProxyServer(server);
    } catch (err) {
        return res.status(400).json({ error: 'INVALID_URL', message: err.message });
    }

    try {
        const result = updateProxy(id, { server, username, password, label, isRotatingPool, estimatedPoolSize });
        if (!result) return res.status(404).json({ error: 'PROXY_NOT_FOUND' });
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Update failed:', e);
        res.status(500).json({ error: 'PROXY_UPDATE_FAILED' });
    }
});

router.delete('/proxies/:id', csrfProtection, dataRateLimiter, requireAuthForSettings, (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'MISSING_ID' });
    try {
        const result = deleteProxy(id);
        if (!result) return res.status(404).json({ error: 'PROXY_NOT_FOUND' });
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Delete failed:', e);
        res.status(500).json({ error: 'PROXY_DELETE_FAILED' });
    }
});

router.delete('/proxies', csrfProtection, dataRateLimiter, requireAuthForSettings, (req, res) => {
    const ids = req.body && Array.isArray(req.body.ids) ? req.body.ids : [];
    if (ids.length === 0) {
        return res.status(400).json({ error: 'MISSING_IDS' });
    }
    try {
        const result = deleteProxies(ids);
        if (!result) return res.status(400).json({ error: 'PROXIES_NOT_DELETED' });
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Bulk delete failed:', e);
        res.status(500).json({ error: 'PROXIES_BULK_DELETE_FAILED' });
    }
});

router.post('/proxies/default', csrfProtection, dataRateLimiter, requireAuthForSettings, (req, res) => {
    const id = req.body && req.body.id ? String(req.body.id) : '';
    try {
        const result = setDefaultProxy(id || null);
        if (!result) return res.status(404).json({ error: 'PROXY_NOT_FOUND' });
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Default failed:', e);
        res.status(500).json({ error: 'PROXY_DEFAULT_FAILED' });
    }
});

router.post('/proxies/rotation', csrfProtection, dataRateLimiter, requireAuthForSettings, (req, res) => {
    const body = req.body || {};
    const hasIncludeDefault = Object.prototype.hasOwnProperty.call(body, 'includeDefaultInRotation');
    const includeDefaultInRotation = !!body.includeDefaultInRotation;
    const rotationMode = typeof body.rotationMode === 'string' ? body.rotationMode : null;
    try {
        if (hasIncludeDefault) setIncludeDefaultInRotation(includeDefaultInRotation);
        if (rotationMode) setRotationMode(rotationMode);
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Rotation toggle failed:', e);
        res.status(500).json({ error: 'PROXY_ROTATION_FAILED' });
    }
});

// AI Models
router.get('/ai-models', requireAuthForSettings, async (req, res) => {
    try {
        res.json(await loadAiModels());
    } catch (e) {
        console.error('[AI_MODELS] Load failed:', e);
        res.status(500).json({ error: 'AI_MODELS_LOAD_FAILED' });
    }
});

router.post('/ai-models', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        const { gemini, openai, claude, ollama } = req.body || {};
        const current = await loadAiModels();
        const updated = {
            gemini: typeof gemini === 'string' && gemini.trim() ? gemini.trim() : current.gemini,
            openai: typeof openai === 'string' && openai.trim() ? openai.trim() : current.openai,
            claude: typeof claude === 'string' && claude.trim() ? claude.trim() : current.claude,
            ollama: typeof ollama === 'string' && ollama.trim() ? ollama.trim() : current.ollama,
        };
        await saveAiModels(updated);
        res.json(updated);
    } catch (e) {
        console.error('[AI_MODELS] Save failed:', e);
        res.status(500).json({ error: 'AI_MODELS_SAVE_FAILED' });
    }
});

// Theme Persistence Endpoints
router.get('/theme', dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        let theme = await loadThemeConfig();
        if (!theme) {
            // Check for existing theme cookies
            const cookies = cookie.parse(req.headers.cookie || '');
            const cookieTheme = cookies['figranium_theme'] || cookies['theme'];
            const validThemes = ['dark', 'light', 'solarized-light', 'solarized-dark'];
            if (cookieTheme && validThemes.includes(cookieTheme.trim())) {
                theme = cookieTheme.trim();
                await saveThemeConfig(theme);
            } else {
                theme = 'dark';
            }
        }
        res.json({ theme });
    } catch (e) {
        console.error('[THEME] Load failed:', e);
        res.status(500).json({ error: 'THEME_LOAD_FAILED' });
    }
});

router.post('/theme', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        const bodyTheme = req.body && typeof req.body.theme === 'string' ? req.body.theme.trim() : '';
        const validThemes = ['dark', 'light', 'solarized-light', 'solarized-dark'];
        const selectedTheme = validThemes.includes(bodyTheme) ? bodyTheme : 'dark';

        const savedTheme = await saveThemeConfig(selectedTheme);

        // Set persistent cookie for fast initial page load (1 year TTL)
        res.setHeader('Set-Cookie', cookie.serialize('figranium_theme', savedTheme, {
            path: '/',
            maxAge: 31536000,
            sameSite: 'lax',
            httpOnly: false
        }));

        res.json({ theme: savedTheme });
    } catch (e) {
        console.error('[THEME] Save failed:', e);
        res.status(500).json({ error: 'THEME_SAVE_FAILED' });
    }
});

// Captcha Solver Settings Endpoints
// A local ohmycaptcha instance is bundled and used by default; these fields only matter
// if the user wants to point at an external instance instead.
router.get('/captcha', requireAuthForSettings, async (req, res) => {
    try {
        const settings = await loadCaptchaSettings();
        res.json({ baseUrl: settings?.baseUrl || '', clientKey: settings?.clientKey ? '••••••••' : '' });
    } catch (e) {
        console.error('[SETTINGS] Failed to load captcha settings:', e);
        res.status(500).json({ error: 'CAPTCHA_SETTINGS_LOAD_FAILED' });
    }
});

router.post('/captcha', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        // Not passed through validateUrl(): this is an admin-configured infrastructure
        // endpoint (often an internal/private host on purpose), not scraped page content.
        const bodyBaseUrl = req.body && typeof req.body.baseUrl === 'string' ? req.body.baseUrl.trim() : '';
        const bodyClientKey = req.body && typeof req.body.clientKey === 'string' ? req.body.clientKey.trim() : '';
        const saved = await saveCaptchaSettings({ baseUrl: bodyBaseUrl, clientKey: bodyClientKey });
        res.json({ baseUrl: saved.baseUrl, clientKey: saved.clientKey ? '••••••••' : '' });
    } catch (e) {
        console.error('[SETTINGS] Failed to save captcha settings:', e);
        res.status(500).json({ error: 'CAPTCHA_SETTINGS_SAVE_FAILED' });
    }
});

module.exports = router;
