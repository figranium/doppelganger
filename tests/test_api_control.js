const { chromium } = require('playwright');
const path = require('path');

async function run() {
    console.log('--- Starting Control Plane API & UI Integration Test ---');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        recordVideo: {
            dir: '/home/jules/verification/videos',
            size: { width: 1280, height: 720 }
        }
    });
    const page = await context.newPage();

    console.log('1. Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(1000);

    // 2. Check if setup is needed
    const createBtn = await page.locator('button:has-text("CREATE ACCOUNT")').count();
    if (createBtn > 0) {
        console.log('Admin account setup detected. Filling form...');
        await page.fill('input[placeholder="Full Name"]', 'Admin User');
        await page.waitForTimeout(500);
        await page.fill('input[placeholder="user@example.com"]', 'user@example.com');
        await page.waitForTimeout(500);

        const passwordInputs = page.locator('input[type="password"]');
        const pwdCount = await passwordInputs.count();
        if (pwdCount > 0) {
            await passwordInputs.nth(0).fill('PASSWORD');
            await page.waitForTimeout(500);
            if (pwdCount > 1) {
                await passwordInputs.nth(1).fill('PASSWORD');
                await page.waitForTimeout(500);
            }
        }
        console.log('Clicking CREATE ACCOUNT...');
        await page.click('button:has-text("CREATE ACCOUNT")');
        await page.waitForTimeout(2000);
    } else {
        console.log('Checking for login screen...');
        const hasEmail = await page.locator('input[type="email"]').count();
        if (hasEmail > 0) {
            await page.fill('input[type="email"]', 'user@example.com');
            await page.waitForTimeout(500);
            await page.fill('input[type="password"]', 'PASSWORD');
            await page.waitForTimeout(500);

            const submitBtn = page.locator('button:has-text("AUTHENTICATE"), button:has-text("LOG IN"), button[type="submit"]');
            await submitBtn.click();
            await page.waitForTimeout(2000);
        }
    }

    // Take a screenshot of the initial page state to assist debugging
    await page.screenshot({ path: '/home/jules/verification/screenshots/initial_state.png' });
    console.log('Initial page state screenshot captured at /home/jules/verification/screenshots/initial_state.png');

    // 3. Navigate to New Task
    console.log('2. Clicking NEW TASK...');
    const newTaskBtn = page.locator('button[aria-label="New Task"], button:has-text("New Task")');
    try {
        await newTaskBtn.waitFor({ state: 'visible', timeout: 5000 });
    } catch (e) {
        await page.screenshot({ path: '/home/jules/verification/screenshots/error_state.png' });
        console.error('Timeout waiting for New Task button. Screenshot captured at /home/jules/verification/screenshots/error_state.png');
        throw e;
    }
    await newTaskBtn.click();
    await page.waitForTimeout(1000);

    // 4. Fill in Task Details
    console.log('3. Filling Task Name & URL...');
    const nameInput = page.locator('input[placeholder="Task name"]');
    try {
        await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    } catch (e) {
        await page.screenshot({ path: '/home/jules/verification/screenshots/editor_failed_to_load.png' });
        console.error('Editor screen failed to load! Screenshot saved at /home/jules/verification/screenshots/editor_failed_to_load.png');
        throw e;
    }

    // Clear and fill the task name
    await nameInput.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await nameInput.fill('E2E Control Plane Task');
    await page.waitForTimeout(500);

    // Expand On Execution block to show URL input
    console.log('Expanding trigger settings...');
    await page.click('button[title="Expand"], button:has-text("On Execution")');
    await page.waitForTimeout(500);

    const urlInput = page.locator('div[aria-label="https://..."]');
    await urlInput.waitFor({ state: 'visible', timeout: 5000 });
    await urlInput.click();
    await page.keyboard.type('http://example.com');
    await page.waitForTimeout(1000);

    // 5. Trigger Task Run
    console.log('4. Clicking Run Task...');
    const runBtn = page.locator('button[title*="Run Task"]');
    await runBtn.waitFor({ state: 'visible', timeout: 5000 });
    await runBtn.click();
    await page.waitForTimeout(2000);

    // 6. Wait for Execution to complete and results to be loaded
    console.log('5. Waiting for results...');
    const resultsContainer = page.locator('text=Preview');
    await resultsContainer.waitFor({ state: 'visible', timeout: 30000 });
    console.log('Results loaded in pane!');

    await page.waitForTimeout(2000);

    // 7. Verify correct page details inside ResultsPane
    const finalUrlText = await page.locator('h2:has-text("example.com")').count();
    console.log(`URL match check count: ${finalUrlText}`);
    if (finalUrlText === 0) {
        throw new Error('E2E Test failed: results do not show example.com');
    }

    console.log('6. Taking screenshot of completed run...');
    await page.screenshot({ path: '/home/jules/verification/screenshots/api_control.png' });
    console.log('Screenshot captured.');

    await page.waitForTimeout(1000);
    await context.close();
    await browser.close();
    console.log('--- Control Plane API & UI Integration Test Successful! ---');
}

run().catch(err => {
    console.error('Integration test failed:', err);
    process.exit(1);
});
