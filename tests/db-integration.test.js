const Module = require('module');
const originalRequire = Module.prototype.require;
const path = require('path');

// Mock for db.js
const mockDB = {
    data: {},
    queryCount: 0,
    async query(text, values) {
        this.queryCount++;
        // console.log('DB QUERY:', text, values);
        if (text.includes('CREATE TABLE') || text.includes('ALTER TABLE') || text.includes('BEGIN') || text.includes('COMMIT') || text.includes('TRUNCATE')) {
            return { rows: [] };
        }
        if (text.includes('SELECT key FROM ollama_api_key')) {
            return { rows: (this.data.ollama || []).map(k => ({ key: k })) };
        }
        if (text.includes('INSERT INTO ollama_api_key')) {
            this.data.ollama = this.data.ollama || [];
            this.data.ollama.push(values[1]);
            return { rows: [] };
        }
        if (text.includes('SELECT data FROM credentials')) {
            return { rows: (this.data.credentials || []).map(d => ({ data: d })) };
        }
        if (text.includes('INSERT INTO credentials')) {
            this.data.credentials = this.data.credentials || [];
            this.data.credentials.push(values[1]);
            return { rows: [] };
        }
        if (text.includes('SELECT data FROM ai_models')) {
            return { rows: this.data.ai_models ? [{ data: this.data.ai_models }] : [] };
        }
        if (text.includes('INSERT INTO ai_models')) {
            this.data.ai_models = values[0];
            return { rows: [] };
        }
        if (text.includes('SELECT data FROM proxies_config')) {
            return { rows: this.data.proxies_config ? [{ data: this.data.proxies_config }] : [] };
        }
        if (text.includes('INSERT INTO proxies_config')) {
            this.data.proxies_config = values[0];
            return { rows: [] };
        }
        return { rows: [] };
    },
    async connect() {
        return {
            query: this.query.bind(this),
            release: () => {}
        };
    }
};

Module.prototype.require = function (id) {
    if (id === 'pg') {
        return { Pool: function() { return mockDB; } };
    }
    if (id.endsWith('src/server/db') || id.endsWith('./src/server/db') || id === './db') {
        return {
            initDB: async () => mockDB,
            getPool: () => mockDB
        };
    }
    return originalRequire.apply(this, arguments);
};

process.env.DB_TYPE = 'postgres';
process.env.DB_POSTGRESDB_HOST = 'localhost';
process.env.DB_POSTGRESDB_PORT = '5432';
process.env.DB_POSTGRESDB_USER = 'user';
process.env.DB_POSTGRESDB_PASSWORD = 'pass';

const {
    loadOllamaApiKey, saveOllamaApiKey,
    loadCredentials, saveCredentials,
    loadAiModels, saveAiModels
} = require('../src/server/storage');
const ProxyRotation = require('../proxy-rotation');

async function runTests() {
    console.log('--- Database Storage Integration Test ---');

    // Test Ollama
    await saveOllamaApiKey(['http://ollama:11434']);
    const ollama = await loadOllamaApiKey();
    if (ollama[0] === 'http://ollama:11434') {
        console.log('SUCCESS: Ollama API key saved and loaded from DB.');
    } else {
        console.error('FAIL: Ollama API key mismatch:', ollama);
    }

    // Test Credentials
    await saveCredentials([{ label: 'test', value: 'secret' }]);
    const creds = await loadCredentials();
    if (creds[0].label === 'test') {
        console.log('SUCCESS: Credentials saved and loaded from DB.');
    } else {
        console.error('FAIL: Credentials mismatch:', creds);
    }

    // Test AI Models
    await saveAiModels({ gemini: 'model-v1' });
    const models = await loadAiModels();
    if (models.gemini === 'model-v1') {
        console.log('SUCCESS: AI models saved and loaded from DB.');
    } else {
        console.error('FAIL: AI models mismatch:', models);
    }

    // Test Proxies
    await ProxyRotation.ensureDB(); // Initialize DB for proxies
    await ProxyRotation.setRotationMode('random');
    const proxies = await ProxyRotation.loadProxyConfigAsync();
    if (proxies.rotationMode === 'random') {
        console.log('SUCCESS: Proxy config saved and loaded from DB.');
    } else {
        console.error('FAIL: Proxy config mismatch:', proxies);
    }

    console.log('Total DB Queries:', mockDB.queryCount);
}

runTests().catch(console.error);
