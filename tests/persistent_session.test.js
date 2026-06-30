const { runFigranite: runAgent } = require('../src/agent/figranite/index');
const fs = require('fs');
const path = require('path');
const { SESSIONS_DIR } = require('../src/server/constants');

async function test() {
    console.log('Testing Persistent Context Storage (sessionId)...');

    const testUrl = 'http://example.com';
    const sessionId = 'test-session-' + Date.now();
    const sessionPath = path.join(SESSIONS_DIR, sessionId + '.json');

    // Clean up if exists
    if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
    }

    console.log('1. Running first agent task to set a cookie...');
    const task1 = {
        url: testUrl,
        sessionId: sessionId,
        actions: [
            {
                id: 'act_1',
                type: 'javascript',
                value: 'document.cookie = "fig=ranium; path=/; max-age=3600"; return "ok";'
            }
        ]
    };

    await runAgent(task1, { headless: true });
    
    // Check if session was saved
    if (!fs.existsSync(sessionPath)) {
        throw new Error('Session file was not created: ' + sessionPath);
    }
    const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    console.log('Session file created. Cookies count:', state.cookies.length);
    
    const figCookie = state.cookies.find(c => c.name === 'fig');
    if (!figCookie || figCookie.value !== 'ranium') {
        throw new Error('Cookie "fig" not found in session state');
    }
    console.log('Cookie confirmed in session file.');

    console.log('2. Running second agent task to verify persistence...');
    const task2 = {
        url: testUrl,
        sessionId: sessionId,
        actions: [
            {
                id: 'act_2',
                type: 'javascript',
                value: 'return document.cookie;'
            },
            {
                id: 'act_check',
                type: 'if',
                value: 'block.output.includes("fig=ranium")'
            }
        ]
    };

    const result2 = await runAgent(task2, { headless: true });
    const checkLog = result2.logs.find(l => l.includes('If condition: true'));
    if (!checkLog) {
        console.log('Logs 2:', result2.logs);
        throw new Error('Cookie did NOT persist in second run (If condition failed)');
    }

    console.log('All persistent session tests passed!');

    // Cleanup
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
}

test().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
