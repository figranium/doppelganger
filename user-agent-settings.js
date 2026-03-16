const fs = require('fs');
const path = require('path');

const USER_AGENT_FILE = path.join(__dirname, 'data', 'user_agent.json');
const DEFAULT_SELECTION = 'system';
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
];

let cached = { mtimeMs: 0, config: { selection: DEFAULT_SELECTION } };

const normalizeSelection = (selection) => {
    if (selection === DEFAULT_SELECTION) return DEFAULT_SELECTION;
    if (userAgents.includes(selection)) return selection;
    return DEFAULT_SELECTION;
};

const loadUserAgentConfig = async () => {
    try {
        let stat;
        try {
            stat = await fs.promises.stat(USER_AGENT_FILE);
        } catch {
            cached = { mtimeMs: 0, config: { selection: DEFAULT_SELECTION } };
            return cached.config;
        }

        const mtimeMs = stat.mtimeMs || 0;
        if (cached.mtimeMs === mtimeMs) return cached.config;
        const raw = await fs.promises.readFile(USER_AGENT_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        const selection = normalizeSelection(parsed?.selection);
        cached = { mtimeMs, config: { selection } };
        return cached.config;
    } catch {
        cached = { mtimeMs: 0, config: { selection: DEFAULT_SELECTION } };
        return cached.config;
    }
};

const saveUserAgentConfig = async (selection) => {
    const payload = { selection: normalizeSelection(selection) };
    await fs.promises.writeFile(USER_AGENT_FILE, JSON.stringify(payload, null, 2));
    try {
        const stat = await fs.promises.stat(USER_AGENT_FILE);
        cached = { mtimeMs: stat.mtimeMs || 0, config: payload };
    } catch {
        cached = { mtimeMs: 0, config: payload };
    }
    return payload;
};

const getUserAgentConfig = async () => {
    const config = await loadUserAgentConfig();
    return { selection: config.selection, userAgents };
};

const setUserAgentSelection = async (selection) => await saveUserAgentConfig(selection);

const selectUserAgent = async (rotateUserAgents) => {
    if (rotateUserAgents) {
        return userAgents[Math.floor(Math.random() * userAgents.length)];
    }
    const config = await loadUserAgentConfig();
    if (config.selection === DEFAULT_SELECTION) return userAgents[0];
    return config.selection;
};

module.exports = {
    userAgents,
    getUserAgentConfig,
    setUserAgentSelection,
    selectUserAgent
};
