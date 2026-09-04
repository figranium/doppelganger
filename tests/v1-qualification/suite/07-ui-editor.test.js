const assert = require('assert');
const { chromium } = require('playwright');
const bcrypt = require('bcryptjs');
const storage = require('../../../src/server/storage');

const frontendServerUrl = 'http://127.0.0.1:11345';
let serverStarted = false;

async function ensureServerRunning() {
    if (serverStarted) return;
    require('../../../server');
    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch(`${frontendServerUrl}/api/health`);
            if (res.status === 200) {
                serverStarted = true;
                return;
            }
        } catch {
            await new Promise(r => setTimeout(r, 200));
        }
    }
    throw new Error('Figranium server did not become ready for UI qualification');
}

async function authenticateThroughUi(page) {
    const originalUsers = JSON.parse(JSON.stringify(await storage.loadUsers()));
    const password = 'QualificationUiPassword123!';
    let email = 'qualification-ui@example.com';

    if (originalUsers.length) {
        const users = JSON.parse(JSON.stringify(originalUsers));
        email = users[0].email;
        users[0].password = await bcrypt.hash(password, 12);
        await storage.saveUsers(users);
    }

    try {
        const response = await page.goto(frontendServerUrl, { waitUntil: 'domcontentloaded' });
        assert.ok(response && response.status() < 400, `UI root returned ${response?.status()}`);
        await page.waitForSelector('#auth-email', { timeout: 10000 });

        const isSetup = await page.locator('#auth-name').count() > 0;
        if (isSetup) {
            await page.fill('#auth-name', 'Qualification UI User');
            await page.fill('#auth-email', email);
            await page.fill('#auth-pass', password);
            await page.fill('#auth-pass-confirm', password);
        } else {
            await page.fill('#auth-email', email);
            await page.fill('#auth-pass', password);
        }

        await page.click('button[type="submit"]');
        await page.waitForSelector('h1:has-text("Overview")', { timeout: 15000 });
        await page.waitForSelector('input[aria-label="Search Tasks"]', { timeout: 10000 });
        return originalUsers;
    } catch (error) {
        await storage.saveUsers(originalUsers);
        throw error;
    }
}

async function closeAndRestore(browser, originalUsers) {
    try {
        if (browser) await browser.close();
    } finally {
        if (originalUsers) await storage.saveUsers(originalUsers);
    }
}

const tests = [
    {
        id: 'UI-001',
        name: 'UI E2E - Authentication Flow & Dashboard Render',
        subsystem: 'ui-editor',
        setup: 'Real Chromium against the local Figranium server with restorable user storage',
        steps: 'Open Figranium, complete setup or login through the actual form, and wait for the Overview dashboard and Task search control.',
        expected: 'Authentication completes in the browser and the authenticated dashboard renders its core controls.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureServerRunning();
            let browser;
            let originalUsers;
            try {
                browser = await chromium.launch({ headless: true });
                const page = await browser.newPage();
                originalUsers = await authenticateThroughUi(page);
                assert.strictEqual(await page.locator('h1:has-text("Overview")').count(), 1);
                assert.strictEqual(await page.locator('input[aria-label="Search Tasks"]').count(), 1);
                assert.ok(await page.locator('button[aria-label="Create new Task (Alt + N)"]').count() > 0);
            } finally {
                await closeAndRestore(browser, originalUsers);
            }
        }
    },
    {
        id: 'UI-002',
        name: 'UI E2E - Create Task, Autosave, Dashboard Search, and Cleanup',
        subsystem: 'ui-editor',
        setup: 'Authenticated Chromium session and restorable user storage',
        steps: 'Create a Task from the dashboard, name it in the editor, wait for autosave/ID assignment, return to Overview, search for the Task, then delete the test Task through the authenticated API.',
        expected: 'The Task is created by the UI, persisted by autosave, visible through dashboard search, and removable without leaving test data.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await ensureServerRunning();
            let browser;
            let originalUsers;
            let taskId = null;
            try {
                browser = await chromium.launch({ headless: true });
                const page = await browser.newPage();
                originalUsers = await authenticateThroughUi(page);

                await page.click('button[aria-label="Create new Task (Alt + N)"]');
                const nameInput = page.locator('input[placeholder="Task name"]');
                await nameInput.waitFor({ state: 'visible', timeout: 10000 });
                await nameInput.fill('V1 Qualification UI Task');
                await nameInput.blur();

                for (let i = 0; i < 30 && !taskId; i++) {
                    const match = page.url().match(/\/tasks\/([a-zA-Z0-9_-]+)/);
                    if (match && match[1] !== 'new') taskId = match[1];
                    if (!taskId) await page.waitForTimeout(250);
                }

                if (!taskId) {
                    const tasks = await page.evaluate(async () => {
                        const res = await fetch('/api/tasks');
                        if (!res.ok) throw new Error(`Task list failed with ${res.status}`);
                        return res.json();
                    });
                    taskId = tasks.find(t => t.name === 'V1 Qualification UI Task')?.id || null;
                }
                assert.ok(taskId, 'UI-created Task must be persisted with an ID');

                await page.click('button[aria-label="Dashboard (Alt + 1)"]');
                const search = page.locator('input[aria-label="Search Tasks"]');
                await search.waitFor({ state: 'visible', timeout: 10000 });
                await search.fill('V1 Qualification UI Task');
                await page.waitForTimeout(150);
                assert.ok(await page.getByText('V1 Qualification UI Task', { exact: true }).count() > 0, 'Created Task must appear in dashboard search results');

                const deleteStatus = await page.evaluate(async (id) => {
                    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
                    return res.status;
                }, taskId);
                assert.ok([200, 204].includes(deleteStatus), `Cleanup delete returned ${deleteStatus}`);
                taskId = null;
            } finally {
                if (browser && taskId) {
                    try {
                        const pages = browser.contexts()[0]?.pages() || [];
                        if (pages[0]) await pages[0].evaluate(async (id) => fetch(`/api/tasks/${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } }), taskId);
                    } catch { /* best effort cleanup before state restore */ }
                }
                await closeAndRestore(browser, originalUsers);
            }
        }
    }
];

module.exports = { tests };
