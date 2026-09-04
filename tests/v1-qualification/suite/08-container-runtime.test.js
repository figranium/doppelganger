const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tests = [
    {
        id: 'CONTAINER-001',
        name: 'Container Runtime - Static Public Captures Symlink Verification',
        subsystem: 'container-runtime',
        setup: 'Repository root directory structure',
        steps: 'Verify public/captures or src/public/captures directory structure exists and is accessible.',
        expected: 'Captures path resolves cleanly to allow task screenshot and recording persistence.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const publicCaptures = path.join(__dirname, '../../../public/captures');
            const srcPublicCaptures = path.join(__dirname, '../../../src/public/captures');
            const exists = fs.existsSync(publicCaptures) || fs.existsSync(srcPublicCaptures);
            assert.ok(exists, 'Captures directory structure must exist');
        }
    },
    {
        id: 'CONTAINER-002',
        name: 'Container Runtime - Rate Limiter Proxy Header Configuration',
        subsystem: 'container-runtime',
        setup: 'Inspect server middleware rate limiters',
        steps: 'Verify authRateLimiter and dataRateLimiter in middleware.js disable strict xForwardedForHeader validation to prevent proxy crashes.',
        expected: 'Rate limiters operate safely behind reverse proxies like Caddy, Nginx, or Render.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            const middlewarePath = path.join(__dirname, '../../../src/server/middleware.js');
            const content = fs.readFileSync(middlewarePath, 'utf8');
            assert.ok(content.includes('xForwardedForHeader: false'), 'Middleware rate limiter must disable strict xForwardedForHeader validation');
        }
    }
];

module.exports = { tests };
