const buildBlockMap = (list) => {
    const blockStarts = new Set(['if', 'while', 'repeat', 'foreach', 'on_error']);
    const startToEnd = {};
    const startToElse = {};
    const elseToEnd = {};
    const endToStart = {};
    const stack = [];

    list.forEach((action, idx) => {
        if (blockStarts.has(action.type)) {
            stack.push({ type: action.type, idx });
            return;
        }
        if (action.type === 'else') {
            for (let i = stack.length - 1; i >= 0; i -= 1) {
                const entry = stack[i];
                if (entry.type === 'if' && startToElse[entry.idx] === undefined) {
                    startToElse[entry.idx] = idx;
                    break;
                }
            }
            return;
        }
        if (action.type === 'end') {
            const entry = stack.pop();
            if (!entry) return;
            startToEnd[entry.idx] = idx;
            endToStart[idx] = entry.idx;
            if (startToElse[entry.idx] !== undefined) {
                elseToEnd[startToElse[entry.idx]] = idx;
            }
        }
    });

    return { startToEnd, startToElse, elseToEnd, endToStart };
};

const randomBetween = (min, max) => min + Math.random() * (max - min);

const getForeachItems = async (act, page, runtimeVars, needsHtml = true) => {
    const resolve = (input) => {
        if (typeof input !== 'string' || !input.includes('{$')) return input;
        return input.replace(/\{\$([\w.]+)\}/g, (_match, name) => {
            if (name === 'now') return new Date().toISOString();
            const value = runtimeVars[name];
            if (value === undefined || value === null) return '';
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                return String(value);
            }
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        });
    };

    const selector = resolve(act.selector);
    const varName = resolve(act.varName);

    if (selector) {
        // ⚡ Bolt: Only fetch innerHTML if sub-actions reference 'loop.html' to reduce serialization overhead
        return page.$$eval(String(selector), (elements, needsHtml) => elements.map((el) => {
            const item = {
                text: (el.textContent || '').trim()
            };
            if (needsHtml) {
                item.html = el.innerHTML || '';
            }
            return item;
        }), needsHtml);
    }
    if (varName && runtimeVars[String(varName)]) {
        const source = runtimeVars[String(varName)];
        if (Array.isArray(source)) return source;
        if (typeof source === 'string') {
            try {
                const parsed = JSON.parse(source);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
    }
    return [];
};

module.exports = {
    buildBlockMap,
    randomBetween,
    getForeachItems
};
