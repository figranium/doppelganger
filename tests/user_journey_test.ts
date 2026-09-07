import { chromium } from 'playwright';

interface ApiKeyResponse {
    apiKey?: string;
}

interface TaskSummary {
    id: string;
    name: string;
}

interface ApiTriggerResponse {
    status: number;
    body: unknown;
}

async function run(): Promise<void> {
    console.log('Starting Figranium E2E User Journey Test...');

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
            await page.waitForTimeout(500);
            await page.fill('input[id="auth-email"]', 'user@example.com');
            await page.waitForTimeout(500);
            await page.fill('input[id="auth-pass"]', 'PASSWORD');
            await page.waitForTimeout(500);
            await page.fill('input[id="auth-pass-confirm"]', 'PASSWORD');
            await page.waitForTimeout(500);

            console.log('Clicking Create Account...');
            await page.click('button[type="submit"]');
            await page.waitForTimeout(2000);
        } else {
            console.log('Login screen detected. Filling login form...');
            await page.fill('input[id="auth-email"]', 'user@example.com');
            await page.waitForTimeout(500);
            await page.fill('input[id="auth-pass"]', 'PASSWORD');
            await page.waitForTimeout(500);

            console.log('Clicking Authenticate...');
            await page.click('button[type="submit"]');
            await page.waitForTimeout(2000);
        }

        console.log('2. Verifying Dashboard screen...');
        await page.waitForSelector('text=Dashboard', { timeout: 10000 });

        const skipBtn = page.locator('button:has-text("Skip")');
        if (await skipBtn.count() > 0) {
            console.log('Theme intro modal detected, clicking Skip...');
            await skipBtn.click();
            await page.waitForTimeout(1000);
        }

        await page.screenshot({ path: '/home/jules/verification/screenshots/dashboard.png' });
        console.log('Captured dashboard screenshot.');
        await page.waitForTimeout(1000);

        console.log('3. Navigating to Settings...');
        await page.click('button[aria-label="Settings (Alt + 2)"]');
        await page.waitForTimeout(1000);
        await page.waitForSelector('text=API Keys', { timeout: 5000 });
        await page.screenshot({ path: '/home/jules/verification/screenshots/settings.png' });
        console.log('Captured settings screenshot.');

        console.log('Retrieving Tasks API Key...');
        const apiData = await page.evaluate<ApiKeyResponse>(async () => {
            const response = await fetch('/api/settings/api-key');
            return response.json() as Promise<ApiKeyResponse>;
        });

        let apiKey = apiData.apiKey;
        if (!apiKey) {
            console.log('API key not set yet. Regenerating one...');
            await page.click('button:has-text("Regenerate")');
            await page.waitForTimeout(1000);
            const freshApiData = await page.evaluate<ApiKeyResponse>(async () => {
                const response = await fetch('/api/settings/api-key');
                return response.json() as Promise<ApiKeyResponse>;
            });
            apiKey = freshApiData.apiKey;
        }

        if (!apiKey) {
            throw new Error('Failed to retrieve Tasks API Key.');
        }

        console.log(`Successfully retrieved Tasks API Key: ${apiKey.slice(0, 8)}...`);
        await page.waitForTimeout(1000);

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
        console.log('Setting task name to E2E User Journey Task...');
        const nameInput = page.locator('input[placeholder="Task name"]');
        await nameInput.fill('E2E User Journey Task');
        await page.waitForTimeout(500);

        console.log('Blurring the input to save and redirect...');
        await nameInput.blur();
        await page.waitForTimeout(2000);

        console.log('Waiting for URL redirection to get task ID...');
        let taskId: string | null = null;
        for (let index = 0; index < 20; index += 1) {
            const currentUrl = page.url();
            const match = currentUrl.match(/\/tasks\/([a-zA-Z0-9_-]+)/);
            if (match?.[1] && match[1] !== 'new') {
                taskId = match[1];
                break;
            }
            await page.waitForTimeout(500);
        }

        if (!taskId) {
            const finalUrl = page.url();
            console.log(`URL did not redirect in time. Current URL: ${finalUrl}`);
            console.log('Attempting to fetch the newly created task ID from API...');
            const tasksList = await page.evaluate<TaskSummary[]>(async () => {
                const response = await fetch('/api/tasks');
                return response.json() as Promise<TaskSummary[]>;
            });
            const createdTask = tasksList.find((task) => task.name === 'E2E User Journey Task');
            if (createdTask) {
                taskId = createdTask.id;
            } else {
                throw new Error('Failed to find or save the created task.');
            }
        }

        console.log(`Successfully created task with ID: ${taskId}`);
        await page.screenshot({ path: '/home/jules/verification/screenshots/task_editor.png' });

        console.log(`5. Triggering task ${taskId} via API...`);
        const apiResponse = await page.evaluate<ApiTriggerResponse, { taskId: string; apiKey: string }>(
            async ({ taskId: id, apiKey: key }) => {
                const response = await fetch(`/api/tasks/${id}/api`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': key,
                    },
                    body: JSON.stringify({
                        variables: {
                            testVar: 'Verified by E2E',
                        },
                    }),
                });
                return { status: response.status, body: await response.json() as unknown };
            },
            { taskId, apiKey },
        );

        console.log('API Response Status:', apiResponse.status);
        console.log('API Response Body:', JSON.stringify(apiResponse.body));

        if (apiResponse.status !== 200) {
            throw new Error(`API trigger failed with status ${apiResponse.status}`);
        }

        await page.waitForTimeout(2000);

        console.log('6. Navigating to Executions screen...');
        await page.click('button[aria-label="Executions (Alt + 3)"]');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: '/home/jules/verification/screenshots/executions.png' });
        console.log('Captured executions screenshot.');

        console.log('7. Navigating to Captures screen...');
        await page.click('button[aria-label="Captures (Alt + 4)"]');
        await page.waitForTimeout(1000);
        await page.screenshot({ path: '/home/jules/verification/screenshots/captures.png' });
        console.log('Captured captures screenshot.');

        console.log('8. Logging out...');
        await page.click('button[aria-label="Logout (Alt + L)"]');
        await page.waitForTimeout(1500);

        console.log('Checking for confirm dialog on logout...');
        const confirmBtn = page.locator('button:has-text("OK"), button:has-text("CONFIRM")');
        if (await confirmBtn.count() > 0) {
            await confirmBtn.click();
            await page.waitForTimeout(1000);
        }

        await page.screenshot({ path: '/home/jules/verification/screenshots/logged_out.png' });
        console.log('Logged out successfully.');
    } catch (error: unknown) {
        console.error('Test failed with error:', error);
        await page.screenshot({ path: '/home/jules/verification/screenshots/failure.png' });
        process.exitCode = 1;
    } finally {
        await context.close();
        await browser.close();
        console.log('E2E User Journey Test finished.');
    }
}

void run().catch((error: unknown) => {
    console.error('Fatal error running E2E test:', error);
    process.exitCode = 1;
});
