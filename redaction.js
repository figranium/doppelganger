// Redaction of sensitive variable values from logs, results, and stored history.
//
// Variables marked `secret: true` still need their real value at execution time
// (they get typed into forms, sent as headers, etc.), so the value itself is
// never transformed. Instead every outbound surface — log lines, API responses,
// execution history, webhooks, output providers — is passed through a redactor
// built from the run's secret values.

const MASK = '[REDACTED]';

// Values shorter than this are ignored: a one or two character secret would
// match nearly every log line and destroy the output it is meant to protect.
const MIN_SECRET_LENGTH = 4;

// Cycles are handled by the WeakSet; this is a backstop against pathological
// nesting. Deep enough that real extraction payloads are never truncated.
const MAX_DEPTH = 64;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stringifySecret = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
};

/**
 * Build a redactor over a set of secret values.
 *
 * @param {Array<any>} values Raw secret values (strings, numbers, or objects).
 * @param {object} [opts]
 * @param {(msg: string) => void} [opts.onSkip] Called once per value that is too short to redact safely.
 * @returns {{ redact: Function, redactString: Function, addSecret: Function, hasSecrets: Function, size: number }}
 */
const createRedactor = (values = [], opts = {}) => {
    const secrets = new Set();
    let pattern = null;
    const onSkip = typeof opts.onSkip === 'function' ? opts.onSkip : null;
    const skipped = new Set();

    const rebuild = () => {
        if (secrets.size === 0) {
            pattern = null;
            return;
        }
        // Longest first so an overlapping shorter secret can't mask part of a
        // longer one and leave the remainder exposed.
        const sorted = Array.from(secrets).sort((a, b) => b.length - a.length);
        pattern = new RegExp(sorted.map(escapeRegExp).join('|'), 'g');
    };

    const addSecret = (value) => {
        const text = stringifySecret(value);
        if (text === null) return false;
        if (text.trim().length < MIN_SECRET_LENGTH) {
            if (onSkip && text.trim() && !skipped.has(text)) {
                skipped.add(text);
                onSkip(`Secret value ignored for redaction: values shorter than ${MIN_SECRET_LENGTH} characters are too short to redact safely.`);
            }
            return false;
        }
        if (secrets.has(text)) return false;
        secrets.add(text);
        rebuild();
        return true;
    };

    (Array.isArray(values) ? values : [values]).forEach(addSecret);

    const redactString = (input) => {
        if (!pattern || typeof input !== 'string' || input.length === 0) return input;
        pattern.lastIndex = 0;
        return input.replace(pattern, MASK);
    };

    const redact = (input, depth = 0, seen = null) => {
        if (!pattern) return input;
        if (typeof input === 'string') return redactString(input);
        if (input === null || typeof input !== 'object') return input;
        if (depth >= MAX_DEPTH) return input;

        const visited = seen || new WeakSet();
        if (visited.has(input)) return input;
        visited.add(input);

        if (Array.isArray(input)) {
            return input.map((item) => redact(item, depth + 1, visited));
        }

        // Leave exotic objects (Date, Buffer, Map, class instances) untouched —
        // rebuilding them as plain objects would corrupt the payload.
        const proto = Object.getPrototypeOf(input);
        if (proto !== Object.prototype && proto !== null) return input;

        const out = {};
        for (const [key, value] of Object.entries(input)) {
            out[redactString(key)] = redact(value, depth + 1, visited);
        }
        return out;
    };

    return {
        redact,
        redactString,
        addSecret,
        hasSecrets: () => secrets.size > 0,
        get size() { return secrets.size; }
    };
};

/**
 * Pull the values of secret variables out of a task's variable map.
 *
 * Accepts both the editor shape (`{ name: { type, value, secret } }`) and the
 * flattened runtime shape (`{ name: value }`) paired with an explicit list of
 * secret variable names.
 *
 * @param {object} variables
 * @param {string[]} [secretVarNames] Names to treat as secret in the flattened shape.
 * @returns {any[]}
 */
const collectSecretValues = (variables, secretVarNames = []) => {
    const values = [];
    if (!variables || typeof variables !== 'object') return values;
    const names = new Set(Array.isArray(secretVarNames) ? secretVarNames.map(String) : []);

    for (const [name, entry] of Object.entries(variables)) {
        // Editor shape is { type, value, secret? }. Requiring `type` or `secret`
        // alongside `value` avoids mistaking a plain object variable that merely
        // happens to have a `value` key for a variable definition.
        const isDefinition = entry
            && typeof entry === 'object'
            && !Array.isArray(entry)
            && 'value' in entry
            && ('type' in entry || 'secret' in entry);
        if (isDefinition) {
            if (entry.secret === true || names.has(name)) values.push(entry.value);
            continue;
        }
        if (names.has(name)) values.push(entry);
    }
    return values;
};

/**
 * List the names of variables flagged secret in the editor shape.
 * @param {object} variables
 * @returns {string[]}
 */
const collectSecretVarNames = (variables) => {
    if (!variables || typeof variables !== 'object') return [];
    return Object.entries(variables)
        .filter(([, entry]) => entry && typeof entry === 'object' && entry.secret === true)
        .map(([name]) => name);
};

/**
 * Replace the values of secret variables with the mask, preserving structure.
 * Used before writing a taskSnapshot into execution history.
 * @param {object} variables
 * @returns {object}
 */
const maskSecretVariables = (variables) => {
    if (!variables || typeof variables !== 'object') return variables;
    const out = {};
    for (const [name, entry] of Object.entries(variables)) {
        if (entry && typeof entry === 'object' && !Array.isArray(entry) && entry.secret === true) {
            out[name] = { ...entry, value: entry.value === '' || entry.value === undefined || entry.value === null ? entry.value : MASK };
        } else {
            out[name] = entry;
        }
    }
    return out;
};

/**
 * Create an array whose `push` redacts every entry as it is written.
 *
 * Used for the agent's log buffer so that all existing (and future) `logs.push`
 * call sites are covered without each having to remember to redact.
 *
 * @param {{ redact: Function }} redactor
 * @returns {string[]}
 */
const createRedactingLog = (redactor) => {
    const logs = [];
    if (!redactor || !redactor.hasSecrets) return logs;
    const originalPush = logs.push.bind(logs);
    Object.defineProperty(logs, 'push', {
        value: (...entries) => originalPush(...entries.map((entry) => redactor.redact(entry))),
        writable: true,
        configurable: true,
        enumerable: false
    });
    return logs;
};

module.exports = {
    MASK,
    MIN_SECRET_LENGTH,
    createRedactor,
    createRedactingLog,
    collectSecretValues,
    collectSecretVarNames,
    maskSecretVariables
};
