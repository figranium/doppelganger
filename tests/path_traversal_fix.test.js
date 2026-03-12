const path = require('path');
const assert = require('assert');
const { sanitizeRunId } = require('../common-utils');

function getScreenshotPath(capturesDir, captureRunId) {
    const screenshotName = `${captureRunId}_agent_${Date.now()}.png`;
    return path.join(capturesDir, screenshotName);
}

const capturesDir = path.join(__dirname, '../public/captures');
const maliciousRunId = '../../evil';

const captureRunId = sanitizeRunId(maliciousRunId);
const screenshotPath = getScreenshotPath(capturesDir, captureRunId);

console.log('Captures Dir:', capturesDir);
console.log('Malicious RunId:', maliciousRunId);
console.log('Sanitized Capture RunId:', captureRunId);
console.log('Resulting Screenshot Path:', screenshotPath);

const isOutside = !screenshotPath.startsWith(capturesDir);
console.log('Is outside captures directory:', isOutside);

try {
    assert.strictEqual(isOutside, false, 'Should NOT be able to traverse outside the captures directory after sanitization');
    assert.strictEqual(captureRunId, 'evil', 'Malicious dots and slashes should be stripped');
    console.log('fix verification SUCCESS: Path traversal blocked by sanitizeRunId utility.');
} catch (e) {
    console.error('fix verification FAILED:', e.message);
    process.exit(1);
}
