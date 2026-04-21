const express = require('express');
const crypto = require('crypto');
const { requireAuthOrApiKey, dataRateLimiter } = require('../middleware');
const { loadCredentials, saveCredentials } = require('../storage');
const { validateUrl, fetchWithRedirectValidation } = require('../../../url-utils');

const router = express.Router();

// GET /api/credentials
router.get('/', requireAuthOrApiKey, dataRateLimiter, async (req, res) => {
    try {
        const credentials = await loadCredentials();
        // Redact tokens before sending to client
        const redacted = credentials.map(({ config, ...rest }) => ({
            ...rest,
            config: { ...config, token: config.token ? '••••••••' : '' }
        }));
        res.json(redacted);
    } catch (err) {
        res.status(500).json({ error: 'FAILED_TO_LOAD_CREDENTIALS' });
    }
});

// POST /api/credentials
router.post('/', requireAuthOrApiKey, dataRateLimiter, async (req, res) => {
    const { name, provider, config } = req.body;
    if (!name || !provider || !config) {
        return res.status(400).json({ error: 'MISSING_FIELDS' });
    }
    if (provider !== 'baserow') {
        return res.status(400).json({ error: 'UNSUPPORTED_PROVIDER' });
    }
    if (!config.token || !config.baseUrl) {
        return res.status(400).json({ error: 'MISSING_CONFIG_FIELDS' });
    }
    try {
        await validateUrl(config.baseUrl);
    } catch (e) {
        return res.status(400).json({ error: 'INVALID_BASE_URL', details: 'Invalid base URL format or restricted destination' });
    }
    try {
        const credentials = await loadCredentials();
        const credential = {
            id: 'cred_' + crypto.randomBytes(8).toString('hex'),
            name: String(name).trim(),
            provider,
            config: {
                baseUrl: String(config.baseUrl).trim().replace(/\/$/, ''),
                token: String(config.token).trim()
            }
        };
        credentials.push(credential);
        await saveCredentials(credentials);
        const { config: cfg, ...rest } = credential;
        res.json({ ...rest, config: { ...cfg, token: '••••••••' } });
    } catch (err) {
        res.status(500).json({ error: 'FAILED_TO_SAVE_CREDENTIAL' });
    }
});

// PUT /api/credentials/:id
router.put('/:id', requireAuthOrApiKey, dataRateLimiter, async (req, res) => {
    const { name, config } = req.body;
    if (config && config.baseUrl) {
        try {
            await validateUrl(config.baseUrl);
        } catch (e) {
            return res.status(400).json({ error: 'INVALID_BASE_URL', details: 'Invalid base URL format or restricted destination' });
        }
    }
    try {
        const credentials = await loadCredentials();
        const idx = credentials.findIndex(c => c.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'CREDENTIAL_NOT_FOUND' });

        if (name) credentials[idx].name = String(name).trim();
        if (config) {
            if (config.baseUrl) credentials[idx].config.baseUrl = String(config.baseUrl).trim().replace(/\/$/, '');
            // Only update token if a real value (not the redacted placeholder) is provided
            if (config.token && !config.token.includes('•')) {
                credentials[idx].config.token = String(config.token).trim();
            }
        }
        await saveCredentials(credentials);
        const { config: cfg, ...rest } = credentials[idx];
        res.json({ ...rest, config: { ...cfg, token: '••••••••' } });
    } catch (err) {
        res.status(500).json({ error: 'FAILED_TO_UPDATE_CREDENTIAL' });
    }
});

// GET /api/credentials/:id/proxy/baserow/databases
// Lists all Baserow databases (applications of type "database") accessible by the credential.
router.get('/:id/proxy/baserow/databases', requireAuthOrApiKey, dataRateLimiter, async (req, res) => {
    try {
        const credentials = await loadCredentials();
        const credential = credentials.find(c => c.id === req.params.id);
        if (!credential) return res.status(404).json({ error: 'CREDENTIAL_NOT_FOUND' });

        const { baseUrl, token } = credential.config;
        await validateUrl(baseUrl);
        const url = `${baseUrl}/api/applications/`;
        const resp = await fetchWithRedirectValidation(url, {
            headers: { 'Authorization': `Token ${token}` }
        });
        if (!resp.ok) {
            return res.status(resp.status).json({ error: 'BASEROW_ERROR', detail: 'Failed to fetch databases from Baserow' });
        }
        const data = await resp.json();
        const items = Array.isArray(data) ? data : [];
        const databases = [];
        for (const item of items) {
            // Flat array of applications (each has type, workspace, etc.)
            if (item.type === 'database') {
                databases.push({
                    id: String(item.id),
                    name: item.name,
                    workspaceName: item.workspace?.name || item.group?.name || ''
                });
            }
            // Workspace-grouped format (workspace with nested applications)
            if (item.applications) {
                for (const app of item.applications) {
                    if (app.type === 'database') {
                        databases.push({
                            id: String(app.id),
                            name: app.name,
                            workspaceName: item.name || ''
                        });
                    }
                }
            }
        }
        res.json(databases);
    } catch (err) {
        res.status(500).json({ error: 'PROXY_ERROR', detail: 'Internal proxy error' });
    }
});

// GET /api/credentials/:id/proxy/baserow/databases/:dbId/tables
// Lists all tables within a Baserow database.
router.get('/:id/proxy/baserow/databases/:dbId/tables', requireAuthOrApiKey, dataRateLimiter, async (req, res) => {
    // Security: Validate dbId to prevent path traversal via URL manipulation.
    if (!/^\d+$/.test(req.params.dbId)) {
        return res.status(400).json({ error: 'INVALID_DATABASE_ID' });
    }
    try {
        const credentials = await loadCredentials();
        const credential = credentials.find(c => c.id === req.params.id);
        if (!credential) return res.status(404).json({ error: 'CREDENTIAL_NOT_FOUND' });

        const { baseUrl, token } = credential.config;
        await validateUrl(baseUrl);
        const resp = await fetchWithRedirectValidation(`${baseUrl}/api/database/tables/database/${req.params.dbId}/`, {
            headers: { 'Authorization': `Token ${token}` }
        });
        if (!resp.ok) {
            return res.status(resp.status).json({ error: 'BASEROW_ERROR', detail: 'Failed to fetch tables from Baserow' });
        }
        const data = await resp.json();
        const tables = (Array.isArray(data) ? data : []).map(t => ({ id: String(t.id), name: t.name }));
        res.json(tables);
    } catch (err) {
        res.status(500).json({ error: 'PROXY_ERROR', detail: 'Internal proxy error' });
    }
});

// DELETE /api/credentials/:id
router.delete('/:id', requireAuthOrApiKey, dataRateLimiter, async (req, res) => {
    try {
        const credentials = await loadCredentials();
        const filtered = credentials.filter(c => c.id !== req.params.id);
        if (filtered.length === credentials.length) {
            return res.status(404).json({ error: 'CREDENTIAL_NOT_FOUND' });
        }
        await saveCredentials(filtered);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'FAILED_TO_DELETE_CREDENTIAL' });
    }
});

module.exports = router;
