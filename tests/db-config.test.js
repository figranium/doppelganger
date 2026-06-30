const Module = require('module');
const originalRequire = Module.prototype.require;

let capturedOptions = null;

// Mock pg module
Module.prototype.require = function (id) {
    if (id === 'pg') {
        return {
            Pool: function(options) {
                capturedOptions = options;
                return {
                    connect: async () => ({
                        query: async () => ({ rows: [] }),
                        release: () => {}
                    })
                };
            }
        };
    }
    return originalRequire.apply(this, arguments);
};

// Set required env vars for DB to be considered "configured"
process.env.DB_TYPE = 'postgres';
process.env.DB_POSTGRESDB_HOST = 'localhost';
process.env.DB_POSTGRESDB_PORT = '5432';
process.env.DB_POSTGRESDB_USER = 'user';
process.env.DB_POSTGRESDB_PASSWORD = 'pass';

const { initDB } = require('../src/server/db');

async function testSSL(val, expectedSSL) {
    // Reset state in db.js if possible, or just clear env and re-require?
    // Since db.js uses a global 'initialized' variable, we need to reset it.
    const dbModule = require('../src/server/db');
    // Forcing reset of initialized state for testing
    delete require.cache[require.resolve('../src/server/db')];
    const { initDB: freshInitDB } = require('../src/server/db');

    if (val === undefined) {
        delete process.env.DB_POSTGRESDB_SSL;
    } else {
        process.env.DB_POSTGRESDB_SSL = val;
    }

    capturedOptions = null;
    try {
        await freshInitDB();
    } catch (e) {
        // Ignore errors from table creation since we mocked the query
    }

    const actualSSL = capturedOptions ? capturedOptions.ssl : null;
    const pass = JSON.stringify(actualSSL) === JSON.stringify(expectedSSL);

    console.log(`Testing DB_POSTGRESDB_SSL="${val}": ${pass ? 'PASS' : 'FAIL'} (Expected ${JSON.stringify(expectedSSL)}, Got ${JSON.stringify(actualSSL)})`);
    return pass;
}

async function runTests() {
    console.log('--- Database SSL Config Tests ---');
    let allPassed = true;

    allPassed &= await testSSL('true', { rejectUnauthorized: false });
    allPassed &= await testSSL('TRUE', { rejectUnauthorized: false });
    allPassed &= await testSSL('1', { rejectUnauthorized: false });
    allPassed &= await testSSL('yes', false);
    allPassed &= await testSSL('false', false);
    allPassed &= await testSSL('0', false);
    allPassed &= await testSSL('', false);
    allPassed &= await testSSL(undefined, false);

    if (allPassed) {
        console.log('\nALL SSL CONFIG TESTS PASSED');
        process.exit(0);
    } else {
        console.error('\nSOME SSL CONFIG TESTS FAILED');
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
