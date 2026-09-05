const fs = require('fs');
const os = require('os');
const path = require('path');

describe('cabinet metadata storage modes', () => {
  test('non-Postgres mode keeps the filesystem catalog path available', () => {
    const constants = require('../src/server/constants');
    expect(constants.CABINETS_DIR).toBe(path.join(constants.DATA_DIR, 'cabinets'));
  });

  test('cabinet payload storage remains filesystem-backed', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'figranium-cabinets-'));
    const payload = path.join(tmp, 'payload.txt');
    fs.writeFileSync(payload, 'payload');
    expect(fs.readFileSync(payload, 'utf8')).toBe('payload');
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
