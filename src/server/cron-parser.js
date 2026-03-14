/**
 * Zero-dependency cron expression parser, builder, and scheduler utility.
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week
 * Plus presets: @yearly, @monthly, @weekly, @daily, @hourly
 */

const PRESETS = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *',
};

const FIELD_RANGES = [
    { name: 'minute', min: 0, max: 59 },
    { name: 'hour', min: 0, max: 23 },
    { name: 'dayOfMonth', min: 1, max: 31 },
    { name: 'month', min: 1, max: 12 },
    { name: 'dayOfWeek', min: 0, max: 7 }, // 0 and 7 both represent Sunday
];

/**
 * Parse a single cron field into a Set of valid integer values.
 */
function parseField(field, min, max) {
    const values = new Set();

    for (const part of field.split(',')) {
        const stepMatch = part.match(/^(.+)\/(\d+)$/);
        let base = stepMatch ? stepMatch[1] : part;
        const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;

        if (step < 1) throw new Error(`Invalid step: ${part}`);

        let rangeStart = min;
        let rangeEnd = max;

        if (base === '*') {
            // full range
        } else {
            const rangeMatch = base.match(/^(\d+)-(\d+)$/);
            if (rangeMatch) {
                rangeStart = parseInt(rangeMatch[1], 10);
                rangeEnd = parseInt(rangeMatch[2], 10);
            } else {
                const val = parseInt(base, 10);
                if (isNaN(val)) throw new Error(`Invalid cron field value: ${base}`);
                if (!stepMatch) {
                    // single value, clamp dayOfWeek 7 → 0
                    values.add(val === 7 && max === 7 ? 0 : val);
                    continue;
                }
                rangeStart = val;
            }
        }

        for (let i = rangeStart; i <= rangeEnd; i += step) {
            values.add(i === 7 && max === 7 ? 0 : i);
        }
    }

    return values;
}

/**
 * Parse a full cron expression into an object with Sets for each field.
 * @param {string} expression
 * @returns {{ minute: Set<number>, hour: Set<number>, dayOfMonth: Set<number>, month: Set<number>, dayOfWeek: Set<number> }}
 */
function parseCron(expression) {
    if (!expression || typeof expression !== 'string') {
        throw new Error('Invalid cron expression');
    }

    const expr = expression.trim().toLowerCase();
    const resolved = PRESETS[expr] || expr;
    const parts = resolved.split(/\s+/);

    if (parts.length !== 5) {
        throw new Error(`Cron expression must have 5 fields, got ${parts.length}: "${expression}"`);
    }

    const result = {};
    for (let i = 0; i < 5; i++) {
        const { name, min, max } = FIELD_RANGES[i];
        result[name] = parseField(parts[i], min, max);
    }
    return result;
}

/**
 * Check if a cron expression is valid.
 * @param {string} expression
 * @returns {boolean}
 */
function isValidCron(expression) {
    try {
        parseCron(expression);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get the next run time after `from` that matches the cron expression.
 * @param {string} expression
 * @param {Date} [from]
 * @returns {Date}
 */
function getNextRun(expression, from) {
    const fields = parseCron(expression);
    const d = from ? new Date(from) : new Date();
    // Start from the next minute
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1);

    // Safety: limit iterations to avoid infinite loop (covers ~4 years)
    const maxIterations = 366 * 24 * 60;
    for (let i = 0; i < maxIterations; i++) {
        if (
            fields.month.has(d.getMonth() + 1) &&
            fields.dayOfMonth.has(d.getDate()) &&
            fields.dayOfWeek.has(d.getDay()) &&
            fields.hour.has(d.getHours()) &&
            fields.minute.has(d.getMinutes())
        ) {
            return d;
        }
        d.setMinutes(d.getMinutes() + 1);
    }

    throw new Error(`Could not find next run for expression: ${expression}`);
}

/**
 * Convert a no-code schedule config object into a cron expression.
 * @param {object} config
 * @param {string} config.frequency - 'interval' | 'hourly' | 'daily' | 'weekly' | 'monthly'
 * @param {number} [config.intervalMinutes] - for 'interval' frequency
 * @param {number} [config.hour] - hour (0-23)
 * @param {number} [config.minute] - minute (0-59)
 * @param {number[]} [config.daysOfWeek] - for 'weekly' (0=Sun..6=Sat)
 * @param {number} [config.dayOfMonth] - for 'monthly' (1-31)
 * @returns {string}
 */
function scheduleToCron(config) {
    if (!config || !config.frequency) {
        throw new Error('Schedule config must include a frequency');
    }

    const min = config.minute ?? 0;
    const hr = config.hour ?? 0;

    switch (config.frequency) {
        case 'interval': {
            const interval = config.intervalMinutes || 5;
            if (interval <= 0 || interval > 1440) throw new Error('Interval must be 1-1440 minutes');
            
            if (interval <= 60) {
                if (60 % interval === 0) {
                    return `*/${interval} * * * *`;
                }
                const minutes = [];
                for (let m = 0; m < 60; m += interval) {
                    minutes.push(m);
                }
                return `${minutes.join(',')} * * * *`;
            } else {
                // For intervals > 60m, use hours/minutes
                const hrs = Math.floor(interval / 60);
                const mins = interval % 60;
                if (hrs < 24 && 24 % hrs === 0 && mins === 0) {
                    return `0 */${hrs} * * *`;
                }
                // Fallback to daily if too complex, or just return hourly with 0 min
                return `0 */${Math.max(1, hrs)} * * *`;
            }
        }
        case 'hourly':
            return `${min} * * * *`;
        case 'daily':
            return `${min} ${hr} * * *`;
        case 'weekly': {
            const days = Array.isArray(config.daysOfWeek) && config.daysOfWeek.length > 0
                ? config.daysOfWeek.sort().join(',')
                : '*';
            return `${min} ${hr} * * ${days}`;
        }
        case 'monthly': {
            const dom = config.dayOfMonth || 1;
            return `${min} ${hr} ${dom} * *`;
        }
        default:
            throw new Error(`Unknown frequency: ${config.frequency}`);
    }
}

/**
 * Produce a human-readable description of a cron expression.
 * @param {string} expression
 * @returns {string}
 */
function describeCron(expression) {
    if (!expression || typeof expression !== 'string') return '';

    const expr = expression.trim().toLowerCase();
    if (PRESETS[expr]) {
        const labels = {
            '@yearly': 'Every year on January 1st at midnight',
            '@annually': 'Every year on January 1st at midnight',
            '@monthly': 'First day of every month at midnight',
            '@weekly': 'Every Sunday at midnight',
            '@daily': 'Every day at midnight',
            '@midnight': 'Every day at midnight',
            '@hourly': 'Every hour',
        };
        return labels[expr] || expr;
    }

    try {
        const parts = expr.split(/\s+/);
        if (parts.length !== 5) return expression;

        const [minPart, hrPart, domPart, monPart, dowPart] = parts;

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        const formatTime = (h, m) => {
            const hour = parseInt(h, 10);
            const minute = parseInt(m, 10);
            if (isNaN(hour) || isNaN(minute)) return '';
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
            return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
        };

        // Every N minutes
        const stepMatch = minPart.match(/^\*\/(\d+)$/);
        if (stepMatch && hrPart === '*' && domPart === '*' && monPart === '*' && dowPart === '*') {
            const n = parseInt(stepMatch[1], 10);
            if (n === 1) return 'Every minute';
            return `Every ${n} minutes`;
        }

        // Every minute
        if (minPart === '*' && hrPart === '*' && domPart === '*' && monPart === '*' && dowPart === '*') {
            return 'Every minute';
        }

        // Comma separated minutes (common for non-divisible intervals)
        if (hrPart === '*' && domPart === '*' && monPart === '*' && dowPart === '*' && minPart.includes(',')) {
            const mins = minPart.split(',');
            if (mins.every(m => /^\d+$/.test(m))) {
                const diffs = [];
                for (let i = 1; i < mins.length; i++) diffs.push(parseInt(mins[i]) - parseInt(mins[i-1]));
                const uniqueDiffs = new Set(diffs);
                if (uniqueDiffs.size === 1) {
                    return `Every ${uniqueDiffs.values().next().value} minutes`;
                }
            }
        }

        // Specific minute, every hour
        if (/^\d+$/.test(minPart) && hrPart === '*' && domPart === '*' && monPart === '*' && dowPart === '*') {
            const m = parseInt(minPart, 10);
            return `Every hour at :${String(m).padStart(2, '0')}`;
        }

        // Daily at specific time
        if (/^\d+$/.test(minPart) && /^\d+$/.test(hrPart) && domPart === '*' && monPart === '*' && dowPart === '*') {
            return `Every day at ${formatTime(hrPart, minPart)}`;
        }

        // Weekly
        if (/^\d+$/.test(minPart) && /^\d+$/.test(hrPart) && domPart === '*' && monPart === '*' && dowPart !== '*') {
            const dows = dowPart.split(',').map(d => {
                const n = parseInt(d, 10);
                return dayNames[n === 7 ? 0 : n] || d;
            });
            if (dows.length === 5 && !dows.includes('Saturday') && !dows.includes('Sunday')) {
                return `Every weekday at ${formatTime(hrPart, minPart)}`;
            }
            if (dows.length === 2 && dows.includes('Saturday') && dows.includes('Sunday')) {
                return `Every weekend at ${formatTime(hrPart, minPart)}`;
            }
            return `Every ${dows.join(', ')} at ${formatTime(hrPart, minPart)}`;
        }

        // Monthly
        if (/^\d+$/.test(minPart) && /^\d+$/.test(hrPart) && /^\d+$/.test(domPart) && monPart === '*' && dowPart === '*') {
            const dom = parseInt(domPart, 10);
            const suffix = dom === 1 ? 'st' : dom === 2 ? 'nd' : dom === 3 ? 'rd' : 'th';
            return `Monthly on the ${dom}${suffix} at ${formatTime(hrPart, minPart)}`;
        }

        // Fallback: return a structured description
        return expression;
    } catch {
        return expression;
    }
}

module.exports = {
    parseCron,
    isValidCron,
    getNextRun,
    scheduleToCron,
    describeCron,
    PRESETS,
};
