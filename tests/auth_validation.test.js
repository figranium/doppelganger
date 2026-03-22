const http = require('http');

async function testRequest(path, method, body) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(body);
        const options = {
            hostname: 'localhost',
            port: 11345,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'http://localhost:11345',
                'Referer': 'http://localhost:11345/'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

async function runTests() {
    console.log('Starting Auth Validation Tests...');

    // 1. Test /api/auth/setup with invalid types
    console.log('\nTesting /api/auth/setup with invalid types...');
    const setupInvalidType = await testRequest('/api/auth/setup', 'POST', {
        name: 123,
        email: 'test@example.com',
        password: 'password123'
    });
    console.log('Status:', setupInvalidType.status, 'Data:', setupInvalidType.data);
    if (setupInvalidType.status !== 400 || setupInvalidType.data.error !== 'INVALID_INPUT_TYPE') {
        throw new Error('Setup invalid type test failed');
    }

    // 2. Test /api/auth/setup with long name
    console.log('\nTesting /api/auth/setup with long name...');
    const setupLongName = await testRequest('/api/auth/setup', 'POST', {
        name: 'a'.repeat(101),
        email: 'test@example.com',
        password: 'password123'
    });
    console.log('Status:', setupLongName.status, 'Data:', setupLongName.data);
    if (setupLongName.status !== 400 || setupLongName.data.error !== 'NAME_TOO_LONG') {
        throw new Error('Setup long name test failed');
    }

    // 3. Test /api/auth/setup with long password
    console.log('\nTesting /api/auth/setup with long password...');
    const setupLongPass = await testRequest('/api/auth/setup', 'POST', {
        name: 'Test User',
        email: 'test@example.com',
        password: 'a'.repeat(129)
    });
    console.log('Status:', setupLongPass.status, 'Data:', setupLongPass.data);
    if (setupLongPass.status !== 400 || setupLongPass.data.error !== 'PASSWORD_TOO_LONG') {
        throw new Error('Setup long password test failed');
    }

    // 4. Test /api/auth/login with invalid types
    console.log('\nTesting /api/auth/login with invalid types...');
    const loginInvalidType = await testRequest('/api/auth/login', 'POST', {
        email: { some: 'object' },
        password: 'password123'
    });
    console.log('Status:', loginInvalidType.status, 'Data:', loginInvalidType.data);
    if (loginInvalidType.status !== 400 || loginInvalidType.data.error !== 'INVALID_INPUT_TYPE') {
        throw new Error('Login invalid type test failed');
    }

    // 5. Test /api/auth/login with long email
    console.log('\nTesting /api/auth/login with long email...');
    const loginLongEmail = await testRequest('/api/auth/login', 'POST', {
        email: 'a'.repeat(256) + '@example.com',
        password: 'password123'
    });
    console.log('Status:', loginLongEmail.status, 'Data:', loginLongEmail.data);
    if (loginLongEmail.status !== 400 || loginLongEmail.data.error !== 'INPUT_TOO_LONG') {
        throw new Error('Login long email test failed');
    }

    // 6. Test /api/auth/login with long password
    console.log('\nTesting /api/auth/login with long password...');
    const loginLongPass = await testRequest('/api/auth/login', 'POST', {
        email: 'test@example.com',
        password: 'a'.repeat(129)
    });
    console.log('Status:', loginLongPass.status, 'Data:', loginLongPass.data);
    if (loginLongPass.status !== 400 || loginLongPass.data.error !== 'INPUT_TOO_LONG') {
        throw new Error('Login long password test failed');
    }

    console.log('\nAll Auth Validation Tests Passed!');
}

// Start the server briefly for testing
const { spawn } = require('child_process');
const server = spawn('node', ['server.js'], {
    env: { ...process.env, SESSION_SECRET: 'test-secret', PORT: '11345' }
});

let serverReady = false;
server.stdout.on('data', (data) => {
    console.log(`Server: ${data}`);
    if (data.toString().includes('Server running')) {
        serverReady = true;
        runTests().then(() => {
            server.kill();
            process.exit(0);
        }).catch(err => {
            console.error('Tests failed:', err);
            server.kill();
            process.exit(1);
        });
    }
});

server.stderr.on('data', (data) => {
    console.error(`Server Error: ${data}`);
});

setTimeout(() => {
    if (!serverReady) {
        console.error('Server timed out starting');
        server.kill();
        process.exit(1);
    }
}, 10000);
