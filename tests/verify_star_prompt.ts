import { chromium } from 'playwright';

async function run(): Promise<void> {
    console.log('Starting Figranium Frontend Star Prompt Verification...');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: {
            dir: '/home/jules/verification/videos',
            size: { width: 1280, height: 720 },
        },
    });

    const page = await context.newPage();

    try {
        console.log('1. Navigating to http://localhost:11345...');
        await page.goto('http://localhost:11345');
        await page.waitForTimeout(1000);

        console.log('Waiting for authentication input field...');
        await page.waitForSelector('input[id="auth-email"]', { timeout: 5000 });

        const isSetup = await page.locator('input[id="auth-name"]').count() > 0;

        if (isSetup) {
            console.log('Admin account setup detected. Filling setup form...');
            await page.fill('input[id="auth-name"]', 'Admin User');
            await page.fill('input[id="auth-email"]', 'user@example.com');
            await page.fill('input[id="auth-pass"]', 'PASSWORD');
            await page.fill('input[id="auth-pass-confirm"]', 'PASSWORD');
            await page.click('button[type="submit"]');
        } else {
            console.log('Login screen detected. Filling login form...');
            await page.fill('input[id="auth-email"]', 'user@example.com');
            await page.fill('input[id="auth-pass"]', 'PASSWORD');
            await page.click('button[type="submit"]');
        }

        await page.waitForSelector('text=Dashboard', { timeout: 10000 });
        console.log('2. Dashboard loaded.');

        const skipBtn = page.locator('button:has-text("Skip")');
        if (await skipBtn.count() > 0) {
            console.log('Theme intro modal detected, clicking Skip...');
            await skipBtn.click();
            await page.waitForTimeout(500);
        }

        await page.screenshot({ path: '/home/jules/verification/screenshots/dashboard_star_pill.png' });
        console.log('Captured dashboard screenshot.');

        console.log('3. Navigating to Settings...');
        await page.click('button[aria-label="Settings (Alt + 2)"]');
        await page.waitForTimeout(1000);
        await page.waitForSelector('text=API Keys', { timeout: 5000 });
        await page.screenshot({ path: '/home/jules/verification/screenshots/settings_star_pill.png' });
        console.log('Captured settings screenshot.');

        console.log('4. Navigating back to Dashboard...');
        await page.click('[data-testid="sidebar-dashboard"]');
        await page.waitForTimeout(1000);

        console.log('Clicking Create First Task or New Task...');
        const createFirstTaskBtn = await page.locator('button[title="Create first task"]').count();
        if (createFirstTaskBtn > 0) {
            await page.click('button[title="Create first task"]');
        } else {
            await page.click('button[title="Create new task (Alt + N)"]');
        }

        await page.waitForTimeout(1500);
        console.log('Setting task name to Star Verification Task...');
        const nameInput = page.locator('input[placeholder="Task name"]');
        await nameInput.fill('Star Verification Task');
        await nameInput.blur();
        await page.waitForTimeout(2500);

        const taskId = page.url().split('/').pop();
        if (!taskId || taskId === 'new') {
            throw new Error(`Could not determine task ID from URL: ${page.url()}`);
        }
        console.log('Navigated to editor URL for task ID:', taskId);

        console.log('Setting task URL to https://example.com...');
        await page.evaluate(async (id: string) => {
            await fetch(`/api/tasks/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: 'https://example.com' }),
            });
        }, taskId);

        await page.reload();
        await page.waitForTimeout(2000);

        console.log('Clicking the RUN button to trigger execution...');
        const runBtn = page.locator('button[title="Run Task (Alt + R)"], button:has-text("Run"), button[aria-label="Run"]');
        if (await runBtn.count() > 0) {
            await runBtn.first().click();
        } else {
            console.log('Looking for Run button in bottom actions bar...');
            await page.click('button:has-text("Run")');
        }

        console.log('Waiting for execution to complete...');
        await page.waitForSelector('text=Finished', { timeout: 30000 });
        await page.waitForTimeout(2000);

        console.log('5. Star prompt should be visible now on success!');
        await page.screenshot({ path: '/home/jules/verification/screenshots/star_prompt_success.png' });
        console.log('Captured star prompt screenshot.');
    } catch (error: unknown) {
        console.error('Frontend Verification failed with error:', error);
        await page.screenshot({ path: '/home/jules/verification/screenshots/failure_verification.png' });
        process.exitCode = 1;
    } finally {
        await context.close();
        await browser.close();
        console.log('Frontend Verification finished.');
    }
}

void run().catch((error: unknown) => {
    console.error('Fatal error running verification:', error);
    process.exitCode = 1;
});
