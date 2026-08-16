const http = require('http');

async function testTelemetry() {
    console.log('Starting Telemetry Webhook Test...');

    // 1. Start the webhook server locally
    const { spawn } = require('child_process');
    const webhookProcess = spawn('node', ['server.js'], {
        cwd: './telemetry-webhook',
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let webhookStarted = false;
    webhookProcess.stdout.on('data', (data) => {
        const msg = data.toString();
        // console.log(`[Webhook] ${msg.trim()}`);
        if (msg.includes('listening on port')) {
            webhookStarted = true;
        }
    });

    // wait for webhook to start
    for (let i = 0; i < 20; i++) {
        if (webhookStarted) break;
        await new Promise(r => setTimeout(r, 100));
    }

    if (!webhookStarted) {
        console.error('Webhook server failed to start within 2 seconds.');
        webhookProcess.kill();
        process.exit(1);
    }

    console.log('Webhook server is running. Sending test POST request...');

    // 2. Send test payload mimicking auth.js setup route
    const payload = JSON.stringify({
        name: 'Test Setup User',
        email: 'test@example.com',
        timestamp: new Date().toISOString()
    });

    const options = {
        hostname: 'localhost',
        port: 5000,
        path: '/collect-signup',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-telemetry-secret': 'figranium-telemetry-v1',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const req = http.request(options, (res) => {
        let responseBody = '';

        res.on('data', (chunk) => {
            responseBody += chunk;
        });

        res.on('end', () => {
            console.log(`Response Status: ${res.statusCode}`);
            console.log(`Response Body: ${responseBody}`);

            if (res.statusCode === 200) {
                console.log('✅ Test PASSED: Webhook processed the request successfully.');
            } else {
                console.error('❌ Test FAILED: Webhook rejected the request.');
                process.exitCode = 1;
            }

            // Cleanup
            webhookProcess.kill();
        });
    });

    req.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
        webhookProcess.kill();
        process.exitCode = 1;
    });

    // Write data to request body
    req.write(payload);
    req.end();
}

testTelemetry();
