const baserow = require('./baserow');
const { loadCredentials } = require('../storage');

const providers = { baserow };

/**
 * Runs the configured output push for a task after execution.
 *
 * @param {object} outputConfig  - task.output ({ provider, credentialId, tableId, onError })
 * @param {any}    data          - result.data from the agent/scrape execution
 * @param {string} executionId   - for logging
 */
async function pushOutput(outputConfig, data, executionId) {
    if (!outputConfig || !outputConfig.provider) return;

    const { provider, credentialId, onError = 'ignore' } = outputConfig;
    const handler = providers[provider];

    if (!handler) {
        console.error(`[OUTPUT] Unknown provider "${provider}" for execution ${executionId}`);
        return;
    }

    if (!data) {
        console.warn(`[OUTPUT] No data to push for execution ${executionId} — skipping`);
        return;
    }

    let credential;
    try {
        const credentials = await loadCredentials();
        credential = credentials.find(c => c.id === credentialId);
    } catch (err) {
        console.error(`[OUTPUT] Failed to load credentials for execution ${executionId}:`, err.message);
        return;
    }

    if (!credential) {
        const msg = `[OUTPUT] Credential "${credentialId}" not found for execution ${executionId}`;
        if (onError === 'fail') console.error(msg); else console.warn(msg);
        return;
    }

    try {
        await handler.push(credential, outputConfig, data);
        console.log(`[OUTPUT] Pushed data to ${provider} for execution ${executionId}`);
    } catch (err) {
        if (onError === 'fail') {
            console.error(`[OUTPUT] Push to ${provider} FAILED for execution ${executionId}:`, err.message);
        } else {
            console.warn(`[OUTPUT] Push to ${provider} failed (ignored) for execution ${executionId}:`, err.message);
        }
    }
}

module.exports = { pushOutput };
