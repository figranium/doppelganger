const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth, dataRateLimiter } = require('../middleware');
const { getStorageStateFile } = require('../storage');
const { DATA_DIR } = require('../constants');

const router = express.Router();
// We need to resolve public/captures relative to where server.js runs usually, or use absolute path logic
// In constants we defined DIST_DIR, DATA_DIR. Captures are in public/captures relative to root probably.
// In server.js: const capturesDir = path.join(__dirname, 'public', 'captures');
// server.js was in root.
// Captures may be written to either the root-level or the src-level public/captures
// directory depending on the entry point / image generation. Unify by reading both.
const CAPTURES_DIRS = [
    path.join(__dirname, '../../../public/captures'),
    path.join(__dirname, '../../../src/public/captures')
];

const readCapturesDir = async (dir, runId) => {
    try {
        await fs.promises.access(dir);
    } catch {
        return [];
    }
    const entriesRaw = await fs.promises.readdir(dir);
    const entries = await Promise.all(
        entriesRaw
            .filter(name => /\.(png|jpg|jpeg|webm)$/i.test(name))
            .filter((name) => !runId || name.includes(runId))
            .map(async (name) => {
                const fullPath = path.join(dir, name);
                try {
                    const stat = await fs.promises.stat(fullPath);
                    const lower = name.toLowerCase();
                    const type = lower.endsWith('.webm') ? 'recording' : 'screenshot';
                    return {
                        name,
                        url: `/captures/${name}`,
                        size: stat.size,
                        modified: stat.mtimeMs,
                        type
                    };
                } catch {
                    return null;
                }
            })
    );
    return entries.filter(Boolean);
};

router.get('/captures', requireAuth, dataRateLimiter, async (_req, res) => {
    const runId = String(_req.query?.runId || '').trim();
    const seen = new Set();
    const entries = [];
    for (const dir of CAPTURES_DIRS) {
        for (const entry of await readCapturesDir(dir, runId)) {
            if (seen.has(entry.name)) continue;
            seen.add(entry.name);
            entries.push(entry);
        }
    }
    entries.sort((a, b) => b.modified - a.modified);
    res.json({ captures: entries });
});

router.get('/screenshots', requireAuth, dataRateLimiter, async (_req, res) => {
    const seen = new Set();
    const entries = [];
    for (const dir of CAPTURES_DIRS) {
        for (const entry of await readCapturesDir(dir, '')) {
            if (!/\.(png|jpg|jpeg)$/i.test(entry.name)) continue;
            if (seen.has(entry.name)) continue;
            seen.add(entry.name);
            entries.push(entry);
        }
    }
    entries.sort((a, b) => b.modified - a.modified);
    res.json({ screenshots: entries });
});

router.delete('/captures/:name', requireAuth, dataRateLimiter, (req, res) => {
    const name = req.params.name;
    // Security: Use path.basename to prevent path traversal via URL manipulation.
    // This ensures the filename is strictly a single component and doesn't contain relative paths.
    const safeName = path.basename(name);
    if (safeName !== name || name.includes('..') || name.includes('/') || name.includes('\\')) {
        return res.status(400).json({ error: 'INVALID_NAME' });
    }
    for (const dir of CAPTURES_DIRS) {
        const targetPath = path.join(dir, safeName);
        if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
            break;
        }
    }
    res.json({ success: true });
});

router.get('/cookies', requireAuth, dataRateLimiter, (req, res) => {
    const storageStateFile = getStorageStateFile();
    if (!fs.existsSync(storageStateFile)) return res.json({ cookies: [], origins: [] });
    try {
        const data = JSON.parse(fs.readFileSync(storageStateFile, 'utf8'));
        res.json({
            cookies: Array.isArray(data.cookies) ? data.cookies : [],
            origins: Array.isArray(data.origins) ? data.origins : []
        });
    } catch (e) {
        res.json({ cookies: [], origins: [] });
    }
});

router.post('/cookies/delete', requireAuth, dataRateLimiter, (req, res) => {
    const { name, domain, path: cookiePath } = req.body || {};
    if (!name) return res.status(400).json({ error: 'MISSING_NAME' });
    const storageStateFile = getStorageStateFile();
    if (!fs.existsSync(storageStateFile)) return res.json({ success: true });
    try {
        const data = JSON.parse(fs.readFileSync(storageStateFile, 'utf8'));
        const cookies = Array.isArray(data.cookies) ? data.cookies : [];
        const filtered = cookies.filter((cookie) => {
            if (cookie.name !== name) return true;
            if (domain && cookie.domain !== domain) return true;
            if (cookiePath && cookie.path !== cookiePath) return true;
            return false;
        });
        data.cookies = filtered;
        fs.writeFileSync(storageStateFile, JSON.stringify(data, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'DELETE_FAILED' });
    }
});

// Also handle the clear screenshots/cookies which were separate POSTs in server.js
router.post('/clear-screenshots', requireAuth, dataRateLimiter, async (req, res) => {
    try {
        // 1. Clear both captures dirs (screenshots and finalized recordings)
        for (const dir of CAPTURES_DIRS) {
            const capturesExist = await fs.promises.access(dir).then(() => true).catch(() => false);
            if (!capturesExist) continue;
            const entries = await fs.promises.readdir(dir);
            await Promise.all(entries.map(async (entry) => {
                const entryPath = path.join(dir, entry);
                try {
                    const stat = await fs.promises.stat(entryPath);
                    if (stat.isFile()) {
                        await fs.promises.unlink(entryPath);
                    }
                } catch (e) {
                    // Ignore individual file errors
                }
            }));
        }

        // 2. Clear data/recordings (temporary recordings)
        const recordingsDir = path.join(DATA_DIR, 'recordings');
        const recordingsExist = await fs.promises.access(recordingsDir).then(() => true).catch(() => false);
        if (recordingsExist) {
            const entries = await fs.promises.readdir(recordingsDir);
            await Promise.all(entries.map(async (entry) => {
                const entryPath = path.join(recordingsDir, entry);
                try {
                    const stat = await fs.promises.stat(entryPath);
                    if (stat.isFile()) {
                        await fs.promises.unlink(entryPath);
                    }
                } catch (e) {
                    // Ignore individual file errors
                }
            }));
        }
    } catch (e) {
        // Ignore general errors
    }
    res.json({ success: true });
});

router.post('/clear-cookies', requireAuth, dataRateLimiter, (req, res) => {
    const storageStateFile = getStorageStateFile();
    if (fs.existsSync(storageStateFile)) {
        fs.unlinkSync(storageStateFile);
    }
    res.json({ success: true });
});

module.exports = router;
