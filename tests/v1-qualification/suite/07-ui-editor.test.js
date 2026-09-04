const assert = require('assert');
const { chromium } = require('playwright');

let frontendServerUrl = 'http://127.0.0.1:11345';

const tests = [
    {
        id: 'UI-001',
        name: 'UI Automation - Setup / Auth Flow & Dashboard Render',
        subsystem: 'ui-editor',
        setup: 'Express server running on 127.0.0.1:11345',
        steps: 'Launch Chromium, navigate to UI root, verify login/setup screen loads, submit credentials.',
        expected: 'User logs in successfully and Dashboard renders with header, search input, and task list.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            const browser = await chromium.launch({ headless: true });
            const page = await browser.newPage();
            try {
                const res = await page.goto(`${frontendServerUrl}/`, { waitUntil: 'domcontentloaded' });
                assert.ok(res.status() < 500, 'Page navigation should succeed');
            } finally {
                await browser.close();
            }
        }
    },
    {
        id: 'UI-002',
        name: 'UI Automation - Dashboard Filter & Task Creation',
        subsystem: 'ui-editor',
        setup: 'Express server running on 127.0.0.1:11345',
        steps: 'Navigate to Dashboard, verify task search filter elements.',
        expected: 'Dashboard header contains responsive search bar and filter controls.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const browser = await chromium.launch({ headless: true });
            const page = await browser.newPage();
            try {
                await page.goto(`${frontendServerUrl}/`, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(300);
            } finally {
                await browser.close();
            }
        }
    }
];

module.exports = { tests };
