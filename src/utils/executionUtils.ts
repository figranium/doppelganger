export const formatExecutionError = (rawMessage: string, mode?: string) => {
    const message = String(rawMessage || '').trim();
    if (!message) return 'Execution failed.';

    const lower = message.toLowerCase();
    if (mode === 'headful') {
        if (lower.includes('missing x server') || lower.includes('$display')) {
            return 'Headful browser could not start because no display server is available.';
        }
        if (lower.includes('failed to connect to the bus')) {
            return 'Headful browser could not start due to missing system services.';
        }
    }

    let cleaned = message;
    const flagsIndex = cleaned.indexOf('--disable-');
    if (flagsIndex > 0) {
        cleaned = cleaned.slice(0, flagsIndex).trim();
    }
    if (cleaned.length > 240) {
        cleaned = `${cleaned.slice(0, 240)}...`;
    }
    return cleaned || 'Execution failed.';
};

export const isDisplayUnavailable = (message: string) => {
    const lower = String(message || '').toLowerCase();
    return lower.includes('missing x server')
        || lower.includes('$display')
        || lower.includes('platform failed to initialize')
        || lower.includes('no display server')
        || lower.includes('target page, context or browser has been closed')
        || lower.includes('target closed')
        || lower.includes('x11 connection failed')
        || lower.includes('cannot open display');
};
