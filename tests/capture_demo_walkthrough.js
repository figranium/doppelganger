const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function run() {
    console.log('Starting Figranium Demo GIF walkthrough capture...');

    // Clear previous sessions or run directories
    const videosDir = '/home/jules/verification/videos';
    const screenshotsDir = '/home/jules/verification/screenshots';
    fs.mkdirSync(videosDir, { recursive: true });
    fs.mkdirSync(screenshotsDir, { recursive: true });

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });

    // Create context and record video
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: {
            dir: videosDir,
            size: { width: 1280, height: 720 }
        }
    });

    const page = await context.newPage();

    try {
        // Step 1: Landing on login screen
        console.log('1. Navigating to Figranium...');
        await page.goto('http://localhost:11345');
        await page.waitForTimeout(1000);

        // Check if admin setup is needed
        await page.waitForSelector('input[id="auth-email"]', { timeout: 5000 });
        const isSetup = await page.locator('input[id="auth-name"]').count() > 0;

        if (isSetup) {
            console.log('Admin account setup detected. Filling setup form...');
            await page.fill('input[id="auth-name"]', 'Admin User');
            await page.waitForTimeout(400);
            await page.fill('input[id="auth-email"]', 'user@example.com');
            await page.waitForTimeout(400);
            await page.fill('input[id="auth-pass"]', 'PASSWORD');
            await page.waitForTimeout(400);
            await page.fill('input[id="auth-pass-confirm"]', 'PASSWORD');
            await page.waitForTimeout(600);

            console.log('Clicking Create Account...');
            await page.click('button[type="submit"]');
        } else {
            console.log('Login screen detected. Filling login form...');
            await page.fill('input[id="auth-email"]', 'user@example.com');
            await page.waitForTimeout(400);
            await page.fill('input[id="auth-pass"]', 'PASSWORD');
            await page.waitForTimeout(600);

            console.log('Clicking Authenticate...');
            await page.click('button[type="submit"]');
        }
        await page.waitForTimeout(1500);

        // Capture Dashboard
        console.log('2. Arrived on Dashboard...');
        await page.waitForSelector('text=Dashboard', { timeout: 10000 });
        await page.screenshot({ path: path.join(screenshotsDir, 'dashboard_init.png') });
        await page.waitForTimeout(800);

        // Navigate to Settings
        console.log('3. Navigating to Settings...');
        await page.click('button[aria-label="Settings (Alt + 2)"]');
        await page.waitForTimeout(1000);
        await page.waitForSelector('text=API Keys', { timeout: 5000 });
        await page.screenshot({ path: path.join(screenshotsDir, 'settings_panel.png') });
        await page.waitForTimeout(800);

        // Retrieve/Regenerate API Key
        const apiData = await page.evaluate(async () => {
            const res = await fetch('/api/settings/api-key');
            return res.json();
        });

        let apiKey = apiData.apiKey;
        if (!apiKey) {
            console.log('Generating fresh API Key...');
            await page.click('button:has-text("Regenerate")');
            await page.waitForTimeout(1000);
            const freshApiData = await page.evaluate(async () => {
                const res = await fetch('/api/settings/api-key');
                return res.json();
            });
            apiKey = freshApiData.apiKey;
        }
        console.log('Retrieved Tasks API Key.');

        // Navigate back to Dashboard to create a task
        console.log('4. Navigating back to Dashboard...');
        await page.click('button[aria-label="Dashboard (Alt + 1)"]');
        await page.waitForTimeout(1000);

        // Click New Task
        console.log('Clicking New Task button...');
        const createFirstTaskBtn = await page.locator('button[title="Create first task"]').count();
        if (createFirstTaskBtn > 0) {
            await page.click('button[title="Create first task"]');
        } else {
            await page.click('button[title="Create new task (Alt + N)"]');
        }
        await page.waitForTimeout(1500);

        // Name task and hit Enter
        console.log('Editing Task Name...');
        const nameInput = page.locator('input[placeholder="Task name"]');
        await nameInput.fill('Demo Autoscraper Task');
        await page.waitForTimeout(800);
        await nameInput.blur();
        await page.waitForTimeout(1500);

        // URL parsing for taskId
        let taskId = null;
        for (let i = 0; i < 15; i++) {
            const currentUrl = page.url();
            const match = currentUrl.match(/\/tasks\/([a-zA-Z0-9_-]+)/);
            if (match && match[1] !== 'new') {
                taskId = match[1];
                break;
            }
            await page.waitForTimeout(200);
        }

        if (!taskId) {
            const tasksList = await page.evaluate(async () => {
                const res = await fetch('/api/tasks');
                return res.json();
            });
            const createdTask = tasksList.find(t => t.name === 'Demo Autoscraper Task');
            if (createdTask) taskId = createdTask.id;
        }
        console.log(`Working in Editor on task ID: ${taskId}`);

        // Add blocks in Editor
        // Let's add a GOTO block first
        console.log('Adding Goto Block...');
        // Let's type http://example.com into the Target URL input
        const urlInput = page.locator('input[placeholder="https://example.com"]');
        if (await urlInput.count() > 0) {
            await urlInput.fill('https://httpbin.org/html');
            await page.waitForTimeout(800);
            await urlInput.blur();
            await page.waitForTimeout(1000);
        }

        // Click "Add Action" button
        console.log('Clicking Add Action...');
        const addActionBtn = page.locator('button:has-text("Add Action"), button:has-text("Add Block")');
        if (await addActionBtn.count() > 0) {
            await addActionBtn.first().click();
            await page.waitForTimeout(800);
        }

        // Choose "Screenshot" or "Wait" action from dropdown or list
        console.log('Selecting Wait action...');
        await page.click('text=Wait');
        await page.waitForTimeout(800);

        // Let's capture the Editor State
        await page.screenshot({ path: path.join(screenshotsDir, 'task_editor_flow.png') });
        await page.waitForTimeout(1000);

        // Let's execute the task via the button in the UI (Run or Execute)
        console.log('Clicking Run Task inside UI...');
        const runBtn = page.locator('button[title="Run task"], button:has-text("Run"), button:has-text("Execute")');
        if (await runBtn.count() > 0) {
            await runBtn.first().click();
            await page.waitForTimeout(3000); // wait for execution to start and finish
        } else {
            // Trigger via API fallback
            console.log('Executing via API trigger...');
            await page.evaluate(async ({ taskId, apiKey }) => {
                await fetch(`/api/tasks/${taskId}/api`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }
                });
            }, { taskId, apiKey });
            await page.waitForTimeout(3000);
        }

        // Navigate to Executions tab
        console.log('5. Navigating to Executions screen...');
        await page.click('button[aria-label="Executions (Alt + 3)"]');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(screenshotsDir, 'executions_list.png') });

        // Go back to Dashboard
        console.log('6. Returning to Dashboard...');
        await page.click('button[aria-label="Dashboard (Alt + 1)"]');
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(screenshotsDir, 'dashboard_final.png') });

        console.log('Workflow walk completed.');
    } catch (err) {
        console.error('Walkthrough error:', err);
        await page.screenshot({ path: path.join(screenshotsDir, 'walkthrough_error.png') });
    } finally {
        await context.close();
        await browser.close();
        console.log('Walkthrough browser session closed.');
    }
}

run();
