const net = require('net');
const { MAX_TASK_VERSIONS, NOVNC_PORT, WEBSOCKIFY_PATH } = require('./constants');

class Mutex {
    constructor() {
        this._locked = false;
        this._queue = [];
    }
    lock() {
        return new Promise((resolve) => {
            if (this._locked) {
                this._queue.push(resolve);
            } else {
                this._locked = true;
                resolve();
            }
        });
    }
    unlock() {
        if (this._queue.length > 0) {
            const next = this._queue.shift();
            next();
        } else {
            this._locked = false;
        }
    }
}

function cloneTaskForVersion(task) {
    // ⚡ Bolt: Use object destructuring to exclude 'versions' BEFORE serialization
    // This avoids O(N) overhead of cloning a nested array of up to 30 full task snapshots
    if (!task) return {};
    const { versions, ...rest } = task;
    return JSON.parse(JSON.stringify(rest));
}

function appendTaskVersion(task) {
    if (!task) return;
    if (!task.versions) task.versions = [];
    const version = {
        id: 'ver_' + Date.now(),
        timestamp: Date.now(),
        snapshot: cloneTaskForVersion(task)
    };
    task.versions.unshift(version);
    if (task.versions.length > MAX_TASK_VERSIONS) {
        task.versions = task.versions.slice(0, MAX_TASK_VERSIONS);
    }
}

const tryBind = (host, port) => new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.unref();
    tester.once('error', (err) => {
        tester.close(() => reject(err));
    });
    tester.once('listening', () => {
        tester.close(() => resolve(true));
    });
    tester.listen({ port, host });
});

const isPortAvailable = async (port) => {
    try {
        await tryBind('127.0.0.1', port);
    } catch (err) {
        if (err && err.code === 'EADDRINUSE') return false;
        throw err;
    }
    try {
        await tryBind('::1', port);
    } catch (err) {
        if (err && err.code === 'EADDRINUSE') return false;
        if (err && (err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT')) return true;
        throw err;
    }
    return true;
};

const findAvailablePort = (startPort, maxAttempts = 20) => new Promise((resolve, reject) => {
    let currentPort = startPort;
    const tryPort = async () => {
        try {
            const available = await isPortAvailable(currentPort);
            if (available) return resolve(currentPort);
        } catch (err) {
            return reject(err);
        }
        if (currentPort < startPort + maxAttempts) {
            currentPort += 1;
            return tryPort();
        }
        return reject(new Error('No available port found'));
    };
    tryPort();
});

const proxyWebsockify = (req, socket, head) => {
    if (!req || !req.url) return false;
    if (!req.url.startsWith(WEBSOCKIFY_PATH)) return false;
    const target = net.connect(NOVNC_PORT, '127.0.0.1');
    const cleanup = () => {
        try {
            socket.destroy();
        } catch {
            // ignore
        }
        try {
            target.destroy();
        } catch {
            // ignore
        }
    };
    target.on('error', cleanup);
    socket.on('error', cleanup);
    target.on('connect', () => {
        try {
            target.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
            for (let i = 0; i < req.rawHeaders.length; i += 2) {
                const name = req.rawHeaders[i];
                const value = req.rawHeaders[i + 1];
                if (name && value !== undefined) {
                    target.write(`${name}: ${value}\r\n`);
                }
            }
            target.write('\r\n');
            if (head && head.length) {
                target.write(head);
            }
            socket.pipe(target).pipe(socket);
        } catch {
            cleanup();
        }
    });
    return true;
};

const normalizeIp = (raw) => {
    if (!raw) return '';
    let ip = String(raw).split(',')[0].trim();
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
    if (ip.includes('%')) ip = ip.split('%')[0];
    return ip;
};

const parseIpList = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) return input.map(String);
    if (typeof input === 'string') {
        return input.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
    return [];
};

/**
 * Executes multiple AI provider requests in parallel and returns the first successful one.
 * Uses AbortController to cancel remaining requests once one succeeds.
 * @param {Array<Function>} tasks Array of functions that return a Promise and accept an AbortSignal.
 * @returns {Promise<any>} The result of the first successful task.
 */
async function tryAiProviders(tasks) {
    if (!tasks || tasks.length === 0) {
        throw new Error('No AI providers configured.');
    }

    const controller = new AbortController();
    const promises = tasks.map(async (task) => {
        try {
            const result = await task(controller.signal);
            if (result) {
                controller.abort();
                return result;
            }
            throw new Error('Provider returned empty result.');
        } catch (err) {
            // If the error is an AbortError, it means another task already succeeded.
            // We don't want to log this as a "failure" of this provider.
            if (err.name === 'AbortError') throw err;
            throw err;
        }
    });

    try {
        return await Promise.any(promises);
    } catch (aggregateError) {
        // If all providers fail, aggregateError.errors contains all reasons
        const messages = aggregateError.errors
            .filter(e => e.name !== 'AbortError')
            .map(e => e.message);
        throw new Error(messages.join(' | ') || 'All AI providers failed.');
    }
}

module.exports = {
    Mutex,
    cloneTaskForVersion,
    appendTaskVersion,
    isPortAvailable,
    findAvailablePort,
    proxyWebsockify,
    normalizeIp,
    parseIpList,
    tryAiProviders
};
