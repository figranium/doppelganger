import { chromium } from 'playwright';

async function run(): Promise<void> {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        recordVideo: {
            dir: '/home/jules/verification/videos',
            size: { width: 1280, height: 720 },
        },
    });
    const page = await context.newPage();

    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(1000);

    const createBtn = await page.locator('button:has-text("CREATE ACCOUNT")').count();

    if (createBtn > 0) {
        console.log('Admin account setup detected. Filling form...');
        await page.fill('input[placeholder="Full Name"]', 'Admin User');
        await page.waitForTimeout(500);
        await page.fill('input[placeholder="user@example.com"]', 'user@example.com');
        await page.waitForTimeout(500);

        const passwordInputs = page.locator('input[type="password"]');
        const passwordCount = await passwordInputs.count();
        if (passwordCount > 0) {
            await passwordInputs.nth(0).fill('PASSWORD');
            await page.waitForTimeout(500);
            if (passwordCount > 1) {
                await passwordInputs.nth(1).fill('PASSWORD');
                await page.waitForTimeout(500);
            }
        }

        console.log('Clicking CREATE ACCOUNT...');
        await page.click('button:has-text("CREATE ACCOUNT")');
        await page.waitForTimeout(2000);
    } else {
        console.log('No setup screen, checking login screen...');
        const loginBtn = await page.locator('button:has-text("LOG IN")').count();
        if (loginBtn > 0) {
            await page.fill('input[type="email"]', 'user@example.com');
            await page.waitForTimeout(500);
            await page.fill('input[type="password"]', 'PASSWORD');
            await page.waitForTimeout(500);
            await page.click('button:has-text("LOG IN")');
            await page.waitForTimeout(2000);
        }
    }

    console.log('Navigating around dashboard...');
    await page.screenshot({ path: '/home/jules/verification/screenshots/verification.png' });
    console.log('Screenshot captured.');

    await page.waitForTimeout(1000);
    await context.close();
    await browser.close();
    console.log('Verification script completed.');
}

void run().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
