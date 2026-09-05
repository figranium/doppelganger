const express = require('express');
const path = require('path');
const { requireAuth } = require('../middleware');
const { loadUsers } = require('../storage');
const { DIST_DIR } = require('../constants');

const router = express.Router();

// Login page
router.get('/login', async (req, res) => {
    // Check if already logged in
    if (req.session.user) {
        return res.redirect('/');
    }
    // Check if setup is needed
    const users = await loadUsers();
    if (users.length === 0) {
        return res.redirect('/signup');
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// Signup/setup page
router.get('/signup', async (req, res) => {
    const users = await loadUsers();
    if (users.length > 0) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// Dashboard (home)
router.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// Dashboard alias
router.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// Task editor - new task
router.get('/tasks/new', requireAuth, (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// Task editor - existing task
router.get('/tasks/:id', requireAuth, (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// Settings
router.get('/settings', requireAuth, (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// Captures
router.get('/captures', requireAuth, (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// Cabinets
router.get('/cabinets', requireAuth, (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// Executions (SPA routes)
router.get('/executions', requireAuth, (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
});

router.get('/executions/:id', requireAuth, (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
});

module.exports = router;
