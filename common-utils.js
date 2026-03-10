const parseBooleanFlag = (value) => {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === null) return false;
    const normalized = String(value).toLowerCase();
    return normalized === 'true' || normalized === '1';
};

const parseValue = (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
            return JSON.parse(trimmed);
        } catch {
            return value;
        }
    }
    return value;
};

const parseCsv = (input) => {
    const text = typeof input === 'string' ? input : String(input || '');
    const len = text.length;
    const rows = [];
    let row = [];
    let current = '';
    let inQuotes = false;
    const specialChar = /[",\n\r]/g;

    let i = 0;
    while (i < len) {
        if (inQuotes) {
            const nextQuote = text.indexOf('"', i);
            if (nextQuote === -1) {
                current += text.slice(i);
                i = len;
                break;
            }
            current += text.slice(i, nextQuote);
            i = nextQuote;
            if (i + 1 < len && text[i + 1] === '"') {
                current += '"';
                i += 2;
            } else {
                inQuotes = false;
                i += 1;
            }
        } else {
            specialChar.lastIndex = i;
            const match = specialChar.exec(text);
            if (!match) {
                current += text.slice(i);
                i = len;
                break;
            }
            const idx = match.index;
            const char = match[0];
            current += text.slice(i, idx);
            i = idx;
            if (char === '"') {
                inQuotes = true;
                i += 1;
            } else if (char === ',') {
                row.push(current);
                current = '';
                i += 1;
            } else if (char === '\n') {
                row.push(current);
                rows.push(row);
                row = [];
                current = '';
                i += 1;
            } else if (char === '\r') {
                i += 1;
            }
        }
    }
    row.push(current);
    if (row.length > 1 || row[0] !== '' || rows.length > 0) rows.push(row);

    if (rows.length === 0) return [];
    const header = rows[0].map((cell, idx) => {
        const trimmed = String(cell || '').trim();
        return trimmed || `column_${idx + 1}`;
    });
    const dataRows = rows.slice(1);
    return dataRows.map((cells) => {
        const obj = {};
        header.forEach((key, idx) => {
            obj[key] = cells[idx] ?? '';
        });
        return obj;
    });
};

const csvEscape = (value) => {
    const text = value === undefined || value === null ? '' : String(value);
    if (/[",\n\r]/.test(text) || /^\s|\s$/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
};

const toCsvString = (raw) => {
    if (raw === undefined || raw === null) return '';
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                return toCsvString(JSON.parse(trimmed));
            } catch {
                return raw;
            }
        }
        return raw;
    }
    const rows = Array.isArray(raw) ? raw : [raw];
    if (rows.length === 0) return '';

    const allKeys = [];
    rows.forEach((row) => {
        if (row && typeof row === 'object' && !Array.isArray(row)) {
            Object.keys(row).forEach((key) => {
                if (!allKeys.includes(key)) allKeys.push(key);
            });
        }
    });

    if (allKeys.length === 0) {
        const lines = rows.map((row) => {
            if (Array.isArray(row)) return row.map(csvEscape).join(',');
            return csvEscape(row);
        });
        return lines.join('\n');
    }

    const headerLine = allKeys.map(csvEscape).join(',');
    const lines = rows.map((row) => {
        const obj = row && typeof row === 'object' ? row : {};
        return allKeys.map((key) => csvEscape(obj[key])).join(',');
    });
    return [headerLine, ...lines].join('\n');
};

const parseCoords = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (/^\d+(\.\d+)?,\s*\d+(\.\d+)?$/.test(trimmed)) {
        const [x, y] = trimmed.split(',').map((s) => parseFloat(s.trim()));
        return { x, y };
    }
    return null;
};

const cookieMatches = (cookie, requestUrl) => {
    try {
        const url = new URL(requestUrl);
        const host = url.hostname.toLowerCase();
        const path = url.pathname || '/';

        // Domain matching (RFC 6265)
        let cookieDomain = (cookie.domain || '').toLowerCase();
        if (cookieDomain.startsWith('.')) {
            cookieDomain = cookieDomain.slice(1);
        }

        const domainMatches = host === cookieDomain || host.endsWith('.' + cookieDomain);
        if (!domainMatches) return false;

        // Path matching
        const cookiePath = cookie.path || '/';
        const pathMatches = path === cookiePath ||
            (path.startsWith(cookiePath) && (cookiePath.endsWith('/') || path[cookiePath.length] === '/'));

        if (!pathMatches) return false;

        // Secure matching
        if (cookie.secure && url.protocol !== 'https:') return false;

        // Expiry matching
        if (cookie.expires && cookie.expires < Date.now() / 1000) return false;

        return true;
    } catch (e) {
        return false;
    }
};

module.exports = {
    parseBooleanFlag,
    parseCoords,
    parseValue,
    parseCsv,
    csvEscape,
    toCsvString,
    cookieMatches
};
