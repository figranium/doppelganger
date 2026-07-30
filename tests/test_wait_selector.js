
const http = require('http');
const { chromium } = require('playwright');
const { executeAction } = require('../src/agent/figranite/action-handler');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
        <html>
            <body>
                <h1>Wait Selector Test</h1>
                <script>
                    setTimeout(() => {
                        const div = document.createElement('div');
                        div.id = 'target';
                        div.textContent = 'I appeared!';
                        document.body.appendChild(div);
                    }, 2000);
                </script>
            </body>
        </html>
    `);
});

async function runTest() {
    let browser;
    try {
        await new Promise(resolve => server.listen(PORT, resolve));
        console.log(`Server started on ${BASE_URL}`);

        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(BASE_URL);

        const logs = [];
        const mockContext = {
            page,
            logs,
            runtimeVars: {},
            resolveTemplate: (str) => str,
            options: {},
            baseDelay: () => 0
        };

        // Test 1: Wait for existing/future element
        console.log('Test 1: Waiting for #target...');
        const startTime = Date.now();
        await executeAction({
            type: 'wait_selector',
            selector: '#target',
            value: '5' // 5 seconds timeout
        }, mockContext);
        const duration = Date.now() - startTime;

        console.log(`Test 1 completed in ${duration}ms`);
        if (duration < 2000) {
            throw new Error('Test 1 failed: Waited less than 2 seconds, meaning it didn\'t wait for the element.');
        }

        // Test 2: Timeout
        console.log('Test 2: Waiting for non-existent element (should fail)...');
        try {
            await executeAction({
                type: 'wait_selector',
                selector: '#nonexistent',
                value: '1' // 1 second timeout
            }, mockContext);
            throw new Error('Test 2 failed: Did not throw on timeout.');
        } catch (e) {
            if (e.message.includes('Timeout') || e.name === 'TimeoutError') {
                console.log('Test 2 passed: Caught expected timeout.');
            } else {
                throw e;
            }
        }

        console.log('All tests passed!');
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    } finally {
        if (browser) await browser.close();
        server.close();
    }
}

runTest();
