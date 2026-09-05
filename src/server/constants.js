const path = require('path');

const DEFAULT_PORT = 11345;
const DIST_DIR = path.join(__dirname, '../../dist');
const DATA_DIR = path.join(__dirname, '../../data');
const CABINETS_DIR = path.join(DATA_DIR, 'cabinets');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ALLOWED_IPS_FILE = path.join(DATA_DIR, 'allowed_ips.json');
const SESSION_SECRET_FILE = path.join(DATA_DIR, 'session_secret.txt');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const VNC_PASSWORD_FILE = path.join(DATA_DIR, 'vnc_password.txt');
const API_KEY_FILE = path.join(DATA_DIR, 'api_key.json');
const GEMINI_API_KEY_FILE = path.join(DATA_DIR, 'gemini_api_key.json');
const OPENAI_API_KEY_FILE = path.join(DATA_DIR, 'openai_api_key.json');
const CLAUDE_API_KEY_FILE = path.join(DATA_DIR, 'claude_api_key.json');
const OLLAMA_API_KEY_FILE = path.join(DATA_DIR, 'ollama_api_key.json');
const AI_MODELS_FILE = path.join(DATA_DIR, 'ai_models.json');
const DEFAULT_AI_MODELS = { gemini: 'gemini-3-flash-preview', openai: 'gpt-5-nano', claude: 'claude-haiku-4-6', ollama: 'llama3.2' };
const THEME_FILE = path.join(DATA_DIR, 'theme.json');
const DEFAULT_THEME_ID = 'dark';
const CAPTCHA_SETTINGS_FILE = path.join(DATA_DIR, 'captcha_settings.json');
const STORAGE_STATE_PATH = path.join(__dirname, '../../storage_state.json');
const EXECUTIONS_FILE = path.join(DATA_DIR, 'executions.json');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');
const MAX_TASK_VERSIONS = 30;
const MAX_EXECUTIONS = 500;
const REQUEST_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 10);
const DATA_RATE_LIMIT_MAX = Number(process.env.DATA_RATE_LIMIT_MAX || 100);
const ALLOWED_IPS_TTL_MS = 5000;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const NOVNC_PORT = Number(process.env.NOVNC_PORT) || 54311;
const WEBSOCKIFY_PATH = '/websockify';

const ALLOW_PRIVATE_NETWORKS = ['1', 'true', 'yes'].includes(String(process.env.ALLOW_PRIVATE_NETWORKS || '').toLowerCase());

module.exports = {
    DEFAULT_PORT,
    DIST_DIR,
    DATA_DIR,
    CABINETS_DIR,
    SESSIONS_DIR,
    USERS_FILE,
    ALLOWED_IPS_FILE,
    SESSION_SECRET_FILE,
    TASKS_FILE,
    VNC_PASSWORD_FILE,
    API_KEY_FILE,
    GEMINI_API_KEY_FILE,
    OPENAI_API_KEY_FILE,
    CLAUDE_API_KEY_FILE,
    OLLAMA_API_KEY_FILE,
    AI_MODELS_FILE,
    DEFAULT_AI_MODELS,
    THEME_FILE,
    DEFAULT_THEME_ID,
    CAPTCHA_SETTINGS_FILE,
    STORAGE_STATE_PATH,
    EXECUTIONS_FILE,
    CREDENTIALS_FILE,
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
