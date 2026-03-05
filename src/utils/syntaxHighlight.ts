export type SyntaxLanguage = 'plain' | 'javascript' | 'json' | 'html';

const escapeHtml = (text: string) => {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const jsKeywords = new Set([
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
    'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new',
    'class', 'extends', 'super', 'import', 'from', 'export', 'default', 'await', 'async',
    'typeof', 'instanceof', 'in', 'of', 'this'
]);

const highlightVariables = (text: string, variables?: Record<string, any>) => {
    const regex = /\{\$(\w+)\}/g;
    let html = '';
    let lastIndex = 0;
    let match;

    const varExists = (name: string) => !!variables && ((name in variables) || name === 'now');
    const hasValue = (name: string) => {
        if (name === 'now') return true;
        const v = variables ? variables[name] : undefined;
        return v && (v.value !== '' && v.value !== undefined && v.value !== null);
    };

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            html += escapeHtml(text.substring(lastIndex, match.index));
        }
        const varName = match[1];
        const exists = varExists(varName);
        const isSet = hasValue(varName);

        const className = exists
            ? (isSet ? 'var-highlight-default' : 'var-highlight')
            : 'var-highlight-undefined';

        html += `<span class="${className}">${escapeHtml(match[0])}</span>`;
        lastIndex = regex.lastIndex;
    }
    html += escapeHtml(text.substring(lastIndex));
    return html;
};

const highlightJson = (text: string) => {
    const tokenRegex = /("(?:\\.|[^"\\])*")|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b/g;
    let html = '';
    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            html += escapeHtml(text.substring(lastIndex, match.index));
        }
        const token = match[0];
        if (match[1]) {
            let isKey = false;
            let j = match.index + token.length;
            while (j < text.length && /\s/.test(text[j])) j += 1;
            if (text[j] === ':') isKey = true;
            const cls = isKey ? 'code-token-key' : 'code-token-string';
            html += `<span class="${cls}">${escapeHtml(token)}</span>`;
        } else if (match[2]) {
            html += `<span class="code-token-number">${escapeHtml(token)}</span>`;
        } else {
            html += `<span class="code-token-boolean">${escapeHtml(token)}</span>`;
        }
        lastIndex = tokenRegex.lastIndex;
    }
    html += escapeHtml(text.substring(lastIndex));
    return html;
};

const highlightJavascript = (text: string, variables?: Record<string, any>) => {
    const tokenRegex = /(\{\$\w+\})|(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b|\bundefined\b)|(\b[A-Za-z_]\w*\b)/g;
    let html = '';
    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            html += escapeHtml(text.substring(lastIndex, match.index));
        }
        const token = match[0];
        if (match[1]) {
            html += highlightVariables(token, variables);
        } else if (match[2]) {
            html += `<span class="code-token-comment">${escapeHtml(token)}</span>`;
        } else if (match[3]) {
            html += `<span class="code-token-string">${escapeHtml(token)}</span>`;
        } else if (match[4]) {
            html += `<span class="code-token-number">${escapeHtml(token)}</span>`;
        } else if (match[5]) {
            html += `<span class="code-token-boolean">${escapeHtml(token)}</span>`;
        } else if (match[6]) {
            const cls = jsKeywords.has(token) ? 'code-token-keyword' : 'code-token-identifier';
            html += `<span class="${cls}">${escapeHtml(token)}</span>`;
        } else {
            html += escapeHtml(token);
        }
        lastIndex = tokenRegex.lastIndex;
    }
    html += escapeHtml(text.substring(lastIndex));
    return html;
};

const highlightHtml = (text: string) => {
    const tagRegex = /<\/?[^>]+>/g;
    let html = '';
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            html += escapeHtml(text.substring(lastIndex, match.index));
        }
        const rawTag = match[0];
        const m = rawTag.match(/^<(\/?[A-Za-z0-9-]+)([\s\S]*?)>$/);

        if (m) {
            const name = m[1];
            const attrs = m[2];
            let highlightedName = escapeHtml(name);
            if (highlightedName.startsWith('/')) {
                highlightedName = `/<span class="code-token-tag">${highlightedName.substring(1)}</span>`;
            } else {
                highlightedName = `<span class="code-token-tag">${highlightedName}</span>`;
            }

            let highlightedAttrs = escapeHtml(attrs);
            highlightedAttrs = highlightedAttrs.replace(/(\s)([A-Za-z0-9-:]+)(=)/g, '$1<span class="code-token-attr">$2</span>$3');
            highlightedAttrs = highlightedAttrs.replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="code-token-string">$1</span>');

            html += `<span class="code-token-punct">&lt;${highlightedName}${highlightedAttrs}&gt;</span>`;
        } else {
            html += `<span class="code-token-punct">${escapeHtml(rawTag)}</span>`;
        }
        lastIndex = tagRegex.lastIndex;
    }
    html += escapeHtml(text.substring(lastIndex));
    return html;
};

export const highlightCode = (text: string, language: SyntaxLanguage, variables?: Record<string, any>) => {
    if (language === 'javascript') return highlightJavascript(text, variables);
    if (language === 'json') return highlightJson(text);
    if (language === 'html') return highlightHtml(text);
    return highlightVariables(text, variables);
};
