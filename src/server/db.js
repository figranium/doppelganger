const { Pool } = require('pg');

let pool = null;
let initialized = false;
let initError = null;

async function initDB() {
    if (initialized) return pool;
    initialized = true;

    const dbType = process.env.DB_TYPE;
    const host = process.env.DB_POSTGRESDB_HOST;
    const port = process.env.DB_POSTGRESDB_PORT;
    const user = process.env.DB_POSTGRESDB_USER;
    const password = process.env.DB_POSTGRESDB_PASSWORD;
    const database = process.env.DB_POSTGRESDB_DATABASE || 'postgres';

    if (dbType && dbType.toLowerCase() !== 'postgres' && dbType.toLowerCase() !== 'pg') {
        initError = new Error('Only postgres is supported as a cloud database.');
        throw initError;
    }

    const hasAnyVar = dbType || host || port || user || password;
    const hasAllVars = dbType && host && port && user && password;

    if (!hasAnyVar) {
        return null;
    }

    if (!hasAllVars) {
        initError = new Error('Missing PostgreSQL environment variables. DB_TYPE, DB_POSTGRESDB_HOST, DB_POSTGRESDB_PORT, DB_POSTGRESDB_USER, and DB_POSTGRESDB_PASSWORD are all required.');
        throw initError;
    }

    try {
        pool = new Pool({
            host,
            port: parseInt(port, 10),
            user,
            password,
            database
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
                    key VARCHAR(255) NOT NULL
                );
            `);
            await client.query(`
                CREATE TABLE IF NOT EXISTS gemini_api_key (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(255) NOT NULL
                );
            `);
            await client.query(`
                CREATE TABLE IF NOT EXISTS openai_api_key (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(255) NOT NULL
                );
            `);
            await client.query(`
                CREATE TABLE IF NOT EXISTS claude_api_key (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(255) NOT NULL
                );
            `);
        } finally {
            client.release();
        }

        return pool;
    } catch (err) {
        pool = null;
        initError = err;
        throw err;
    }
}

function getPool() {
    return pool;
}

module.exports = {
    initDB,
    getPool
};
