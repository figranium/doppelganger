const express = require('express');
const bcrypt = require('bcryptjs');
const { loadUsers, saveUsers, saveSession } = require('../storage');
const { authRateLimiter } = require('../middleware');

const router = express.Router();

router.get('/check-setup', async (req, res) => {
    try {
        const users = await loadUsers();
        res.json({ setupRequired: users.length === 0 });
    } catch (e) {
        console.error('[AUTH] check-setup error:', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/setup', authRateLimiter, async (req, res) => {
    const users = await loadUsers();
    if (users.length > 0) return res.status(403).json({ error: 'ALREADY_SETUP' });
    const { name, email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!name || !normalizedEmail || !password) return res.status(400).json({ error: 'MISSING_FIELDS' });

    // Basic email validation: limit length and use a ReDoS-safe regex.
    if (normalizedEmail.length > 255 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: 'INVALID_EMAIL' });
    }

    // Enforce minimum password length
    if (String(password).length < 8) {
        return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = { id: Date.now(), name, email: normalizedEmail, password: hashedPassword };
    await saveUsers([newUser]);


    req.session.regenerate(async (err) => {
        if (err) {
            console.error('[AUTH] Setup session regenerate failed:', err);
            return res.status(500).json({ error: 'SESSION_REGENERATE_FAILED' });
        }
        req.session.user = { id: newUser.id, name: newUser.name, email: newUser.email };
        try {
            await saveSession(req);
            res.json({ success: true });
        } catch (saveErr) {
            console.error('[AUTH] Setup session save failed:', saveErr);
            return res.status(500).json({ error: 'SESSION_SAVE_FAILED' });
        }
    });
});

router.post('/login', authRateLimiter, async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const users = await loadUsers();
    const user = users.find(u => String(u.email || '').toLowerCase() === normalizedEmail);

    // Timing-safe login: Always perform a bcrypt.compare to prevent user enumeration via timing attacks.
    // If user not found, compare against a dummy hash to maintain consistent response timing.
    // The dummy hash uses 12 rounds to match the rounds used during user setup.
    const DUMMY_HASH = '$2b$12$ROIlwVQgCzLuLoE6wDpqde0hhUzGqMywgkLIrOE5lom6P2F0fhbBO'; // dummy bcrypt hash (12 rounds)
    const hashToCompare = user ? user.password : DUMMY_HASH;
    const isPasswordValid = await bcrypt.compare(password || '', hashToCompare);

    if (user && isPasswordValid) {
        req.session.regenerate(async (err) => {
            if (err) {
                console.error('[AUTH] Login session regenerate failed:', err);
                return res.status(500).json({ error: 'SESSION_REGENERATE_FAILED' });
            }
            req.session.user = { id: user.id, name: user.name, email: user.email };
            try {
                await saveSession(req);
                res.json({ success: true });
            } catch (saveErr) {
                console.error('[AUTH] Login session save failed:', saveErr);
                return res.status(500).json({ error: 'SESSION_SAVE_FAILED' });
            }
        });
    } else {
        res.status(401).json({ error: 'INVALID' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

router.get('/me', (req, res) => {
    res.json(req.session.user ? { authenticated: true, user: req.session.user } : { authenticated: false });
});

module.exports = router;
