const { parseValue } = require('../../../common-utils');
const vm = require('vm');

const normalizeVarRef = (raw) => {
    if (!raw) return '';
    const trimmed = String(raw).trim();
    const match = trimmed.match(/^\{\$([\w.]+)\}$/);
    return match ? match[1] : trimmed;
};

const coerceBoolean = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const parsed = parseValue(value);
        if (typeof parsed === 'boolean') return parsed;
    }
    return Boolean(value);
};

const toNumber = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = parseValue(value);
        if (typeof parsed === 'number') return parsed;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : NaN;
};

const toString = (value) => {
    if (value === undefined || value === null) return '';
    return String(value);
};

const evalStructuredCondition = async (act, page, runtimeVars, resolveTemplate) => {
    const getValueFromVarOrLiteral = (raw) => {
        const name = normalizeVarRef(raw);
        if (name && Object.prototype.hasOwnProperty.call(runtimeVars, name)) return runtimeVars[name];
        if (typeof raw === 'string') return resolveTemplate(raw);
        return raw;
    };

    const varType = act.conditionVarType || 'string';
    const op = act.conditionOp || (varType === 'boolean' ? 'is_true' : 'equals');

    if (varType === 'selector') {
        const selector = resolveTemplate(String(act.selector || ''));
        if (!selector.trim()) return false;
        const found = await page.evaluate((sel) => !!document.querySelector(sel), selector);
        return op === 'not_exists' ? !found : found;
    }

    const leftRaw = getValueFromVarOrLiteral(act.conditionVar || '');
    const rightRaw = act.conditionValue ?? '';
    const rightResolved = resolveTemplate(String(rightRaw));

    if (varType === 'boolean') {
        const leftBool = coerceBoolean(leftRaw);
        return op === 'is_false' ? !leftBool : !!leftBool;
    }

    if (varType === 'number') {
        const leftNum = toNumber(leftRaw);
        const rightNum = toNumber(rightResolved);
        if (!Number.isFinite(leftNum) || !Number.isFinite(rightNum)) return false;
        if (op === 'not_equals') return leftNum !== rightNum;
        if (op === 'gt') return leftNum > rightNum;
        if (op === 'gte') return leftNum >= rightNum;
        if (op === 'lt') return leftNum < rightNum;
        if (op === 'lte') return leftNum <= rightNum;
        return leftNum === rightNum;
    }

    const leftText = toString(leftRaw);
    const rightText = rightResolved;
    if (op === 'not_equals') return leftText !== rightText;
    if (op === 'contains') return leftText.includes(rightText);
    if (op === 'starts_with') return leftText.startsWith(rightText);
    if (op === 'ends_with') return leftText.endsWith(rightText);
    if (op === 'matches') {
        try {
            // Use vm to execute regex with timeout (100ms) to prevent ReDoS
            const code = `new RegExp(${JSON.stringify(rightText)}).test(${JSON.stringify(leftText)})`;
            const script = new vm.Script(code);
            const context = vm.createContext(Object.create(null));
            return script.runInContext(context, { timeout: 100 });
        } catch {
            return false;
        }
    }
    return leftText === rightText;
};

const evalCondition = async (expr, page, runtimeVars, lastBlockOutput, resolveTemplate) => {
    const resolved = resolveTemplate(expr || '');
    if (!resolved.trim()) return false;

    // ⚡ Bolt: Only fetch full outerHTML if the expression actually references 'html'
    const needsHtml = /\bhtml\b/.test(resolved);

    return page.evaluate(({ expression, vars, blockOutput, needsHtml }) => {
        const exists = (selector) => {
            if (!selector) return false;
            return !!document.querySelector(selector);
        };
        const text = (selector) => {
            if (!selector) return '';
            const el = document.querySelector(selector);
            return el ? (el.textContent || '').trim() : '';
        };
        const url = () => window.location.href;
        const html = needsHtml ? document.documentElement.outerHTML : '';
        const block = { output: blockOutput };
        // eslint-disable-next-line no-new-func
        const fn = new Function('vars', 'block', 'exists', 'text', 'url', 'html', `return !!(${expression});`);
        return fn(vars || {}, block, exists, text, url, html);
    }, { expression: resolved, vars: runtimeVars, blockOutput: lastBlockOutput, needsHtml });
};

module.exports = {
    evalStructuredCondition,
    evalCondition
};
