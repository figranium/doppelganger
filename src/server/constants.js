const path = require('path');

const DEFAULT_PORT = 11345;
const DIST_DIR = path.join(__dirname, '../../dist');
const DATA_DIR = path.join(__dirname, '../../data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ALLOWED_IPS_FILE = path.join(DATA_DIR, 'allowed_ips.json');
const SESSION_SECRET_FILE = path.join(DATA_DIR, 'session_secret.txt');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const API_KEY_FILE = path.join(DATA_DIR, 'api_key.json');
const GEMINI_API_KEY_FILE = path.join(DATA_DIR, 'gemini_api_key.json');
const OPENAI_API_KEY_FILE = path.join(DATA_DIR, 'openai_api_key.json');
const CLAUDE_API_KEY_FILE = path.join(DATA_DIR, 'claude_api_key.json');
const STORAGE_STATE_PATH = path.join(__dirname, '../../storage_state.json');
const EXECUTIONS_FILE = path.join(DATA_DIR, 'executions.json');
const MAX_TASK_VERSIONS = 30;
const MAX_EXECUTIONS = 500;
const REQUEST_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 10);
const DATA_RATE_LIMIT_MAX = Number(process.env.DATA_RATE_LIMIT_MAX || 100);
const ALLOWED_IPS_TTL_MS = 5000;
const SESSION_TTL_SECONDS = 10 * 365 * 24 * 60 * 60; // 10 years
const NOVNC_PORT = Number(process.env.NOVNC_PORT) || 54311;
const WEBSOCKIFY_PATH = '/websockify';

const ALLOW_PRIVATE_NETWORKS = !['0', 'false', 'no'].includes(String(process.env.ALLOW_PRIVATE_NETWORKS || '').toLowerCase());

module.exports = {
    DEFAULT_PORT,
    DIST_DIR,
    DATA_DIR,
    SESSIONS_DIR,
    USERS_FILE,
    ALLOWED_IPS_FILE,
    SESSION_SECRET_FILE,
    TASKS_FILE,
    API_KEY_FILE,
    GEMINI_API_KEY_FILE,
    OPENAI_API_KEY_FILE,
    CLAUDE_API_KEY_FILE,
    STORAGE_STATE_PATH,
    EXECUTIONS_FILE,
    MAX_TASK_VERSIONS,
    MAX_EXECUTIONS,
    REQUEST_LIMIT_WINDOW_MS,
    AUTH_RATE_LIMIT_MAX,
    DATA_RATE_LIMIT_MAX,
    ALLOWED_IPS_TTL_MS,
    SESSION_TTL_SECONDS,
    NOVNC_PORT,
    WEBSOCKIFY_PATH,
    ALLOW_PRIVATE_NETWORKS
};
