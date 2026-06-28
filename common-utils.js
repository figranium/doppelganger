const parseBooleanFlag = (value) => {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === null) return false;
    const normalized = String(value).toLowerCase();
    return normalized === 'true' || normalized === '1';
};

const sanitizeRunId = (runId) => {
    if (!runId) return null;
    return String(runId).replace(/[^a-zA-Z0-9_-]/g, '');
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
    if (value === undefined || value === null || value === '') return '';
    const text = String(value);
    // ⚡ Bolt: Fast-path for simple values that don't need escaping
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

    // ⚡ Bolt: Use a Set for unique key collection to reduce complexity from O(N * K^2) to O(N * K)
    const allKeysSet = new Set();
    rows.forEach((row) => {
        if (row && typeof row === 'object' && !Array.isArray(row)) {
            Object.keys(row).forEach((key) => {
                allKeysSet.add(key);
            });
        }
    });
    const allKeys = Array.from(allKeysSet);

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



module.exports = {
    parseBooleanFlag,
    sanitizeRunId,
    parseCoords,
    parseValue,
    parseCsv,
    csvEscape,
    toCsvString
};
