const { chromium } = require('../../stealth-chromium');
const fs = require('fs');
const path = require('path');
const { STORAGE_STATE_PATH } = require('./constants');

const PROFILE_DIRS = [
    path.join(__dirname, '../../data/browser-profile'),
    path.join(__dirname, '../../data/browser-profile-scrape'),
    path.join(__dirname, '../../data/browser-profile-headful'),
];

async function migrateStorageState() {
    if (!fs.existsSync(STORAGE_STATE_PATH)) return;

    let state;
    try {
        const raw = fs.readFileSync(STORAGE_STATE_PATH, 'utf8');
        state = JSON.parse(raw);
    } catch {
        console.warn('[MIGRATION] Could not read storage_state.json, deleting it.');
        try { fs.unlinkSync(STORAGE_STATE_PATH); } catch {}
        return;
    }

    const cookies = state.cookies || [];
    if (cookies.length === 0) {
        console.log('[MIGRATION] storage_state.json has no cookies, deleting it.');
        try { fs.unlinkSync(STORAGE_STATE_PATH); } catch {}
        return;
    }

    const now = Date.now() / 1000;
    const validCookies = cookies.filter(c => !c.expires || c.expires === -1 || c.expires > now);
    if (validCookies.length === 0) {
        console.log('[MIGRATION] All cookies expired, deleting storage_state.json.');
        try { fs.unlinkSync(STORAGE_STATE_PATH); } catch {}
        return;
    }

    console.log(`[MIGRATION] Migrating ${validCookies.length} cookies from storage_state.json into persistent profiles...`);

    let migrated = 0;
    for (const profileDir of PROFILE_DIRS) {
        try {
            await fs.promises.mkdir(profileDir, { recursive: true });
            const context = await chromium.launchPersistentContext(profileDir, {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
            await context.addCookies(validCookies);
            await context.close();
            migrated++;
            console.log(`[MIGRATION] Injected cookies into ${path.basename(profileDir)}`);
        } catch (e) {
            console.error(`[MIGRATION] Failed for ${path.basename(profileDir)}: ${e.message}`);
        }
    }

    if (migrated > 0) {
        try {
            fs.unlinkSync(STORAGE_STATE_PATH);
            console.log('[MIGRATION] Deleted storage_state.json after successful migration.');
        } catch (e) {
            console.error(`[MIGRATION] Could not delete storage_state.json: ${e.message}`);
        }
    } else {
        console.error('[MIGRATION] No profiles were migrated — keeping storage_state.json for retry.');
    }
}

module.exports = { migrateStorageState };
