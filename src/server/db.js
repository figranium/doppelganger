const { Pool } = require('pg');

let pool = null;
let initPromise = null;
let initError = null;

async function initDB() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const host = process.env.DB_POSTGRESDB_HOST;
        const port = process.env.DB_POSTGRESDB_PORT;
        const user = process.env.DB_POSTGRESDB_USER;
        const password = process.env.DB_POSTGRESDB_PASSWORD;
        const database = process.env.DB_POSTGRESDB_DATABASE || 'postgres';

        // Parse SSL safely as a string, checking for 'true' and '1'
        const sslEnv = String(process.env.DB_POSTGRESDB_SSL || '').toLowerCase();
        const sslEnabled = sslEnv === 'true' || sslEnv === '1';

        // Handle database type check
        const dbType = process.env.DB_TYPE;
        if (dbType && !['postgres', 'pg'].includes(dbType.toLowerCase())) {
            initError = new Error('Only postgres is supported as a cloud database.');
            throw initError;
        }

        const hasAnyVar = dbType || host || port || user || password;
        const hasAllVars = host && port && user && password;

        if (!hasAnyVar) {
            return null;
        }

        if (!hasAllVars) {
            initError = new Error('Missing PostgreSQL environment variables. DB_POSTGRESDB_HOST, DB_POSTGRESDB_PORT, DB_POSTGRESDB_USER, and DB_POSTGRESDB_PASSWORD are all required.');
            throw initError;
        }

        try {
            pool = new Pool({
                host,
                port: parseInt(port, 10),
                user,
                password,
                database,
                // Set rejectUnauthorized: false if active, otherwise set to false
                ssl: sslEnabled ? { rejectUnauthorized: false } : false
            });

            // Test connection and create tables
            const client = await pool.connect();
            try {
                await client.query(`
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        data JSONB NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS theme_config (
                        id INT PRIMARY KEY DEFAULT 1,
                        data JSONB NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS tasks (
                        id VARCHAR(255) PRIMARY KEY,
                        data JSONB NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS executions (
                        id VARCHAR(255) PRIMARY KEY,
                        data JSONB NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS api_key (
                        id INT PRIMARY KEY DEFAULT 1,
                        key TEXT NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS gemini_api_key (
                        id SERIAL PRIMARY KEY,
                        key TEXT NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS openai_api_key (
                        id SERIAL PRIMARY KEY,
                        key TEXT NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS claude_api_key (
                        id SERIAL PRIMARY KEY,
                        key TEXT NOT NULL
                    );
                `);

                // Migration: Ensure API key columns are TEXT to support longer keys
                await client.query('ALTER TABLE api_key ALTER COLUMN key TYPE TEXT');
                await client.query('ALTER TABLE gemini_api_key ALTER COLUMN key TYPE TEXT');
                await client.query('ALTER TABLE openai_api_key ALTER COLUMN key TYPE TEXT');
                await client.query('ALTER TABLE claude_api_key ALTER COLUMN key TYPE TEXT');

                // Define new tables for other storage types
                await client.query(`
                    CREATE TABLE IF NOT EXISTS ollama_api_key (
                        id SERIAL PRIMARY KEY,
                        key TEXT NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS credentials (
                        id SERIAL PRIMARY KEY,
                        data JSONB NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS ai_models (
                        id INT PRIMARY KEY DEFAULT 1,
                        data JSONB NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS proxies_config (
                        id INT PRIMARY KEY DEFAULT 1,
                        data JSONB NOT NULL
                    );
                `);
            } finally {
                client.release();
            }

            return pool;
        } catch (err) {
            pool = null;
            initError = err;
            initPromise = null; // Allow retry on failure
            throw err;
        }
    })();

    return initPromise;
}

function getPool() {
    return pool;
}

module.exports = {
    initDB,
    getPool
};
