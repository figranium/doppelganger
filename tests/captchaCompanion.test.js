const assert = require('assert');
const { Readable } = require('stream');

process.env.CAPTCHA_COMPANION_TOKEN = 'companion-test-token';
process.env.SKIP_LOCAL_CAPTCHA_MODEL = 'true';
const { authorized, server } = require('../scripts/captcha-companion');

function dispatch({ method = 'GET', url = '/v1/health', authorization, body = '' } = {}) {
    const request = Readable.from(body ? [Buffer.from(body)] : []);
    request.method = method;
    request.url = url;
    request.headers = authorization ? { authorization } : {};
    return new Promise((resolve) => {
        const result = { status: null, headers: null, body: '' };
        const response = {
            writeHead(status, headers) { result.status = status; result.headers = headers; },
            end(payload) { result.body = String(payload || ''); resolve(result); }
        };
        server.emit('request', request, response);
    });
}

async function main() {
    assert.strictEqual(authorized({ headers: {} }), false);
    assert.strictEqual(authorized({ headers: { authorization: 'Bearer companion-test-token' } }), true);
    assert.strictEqual((await dispatch()).status, 401);
    const health = await dispatch({ authorization: 'Bearer companion-test-token' });
    assert.strictEqual(health.status, 200);
    assert.strictEqual(JSON.parse(health.body).version, 1);
    const invalid = await dispatch({
        method: 'POST', url: '/v1/detect', authorization: 'Bearer companion-test-token',
        body: JSON.stringify({ tier: 'invalid', label: 'bus', imageBase64: 'eA==' })
    });
    assert.strictEqual(invalid.status, 400);
    console.log('All CAPTCHA companion authentication tests passed!');
}

main().catch((error) => { console.error(error); process.exit(1); });
