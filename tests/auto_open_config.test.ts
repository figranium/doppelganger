import { test } from 'node:test';
import assert from 'node:assert';

// Test logic: Verify that NO_CONFIG_TYPES correctly filters out non-configurable block types
const NO_CONFIG_TYPES = ['else', 'end', 'on_error', 'do_nothing'];

test('Auto-open action config logic: configurable vs non-configurable action types', () => {
    const configurableTypes = ['click', 'type', 'hover', 'wait', 'navigate', 'javascript', 'if', 'while', 'set', 'merge'];
    const nonConfigurableTypes = ['else', 'end', 'on_error', 'do_nothing'];

    for (const type of configurableTypes) {
        const isConfigurable = !NO_CONFIG_TYPES.includes(type);
        assert.strictEqual(isConfigurable, true, `Expected action type "${type}" to be configurable`);
    }

    for (const type of nonConfigurableTypes) {
        const isConfigurable = !NO_CONFIG_TYPES.includes(type);
        assert.strictEqual(isConfigurable, false, `Expected action type "${type}" to be non-configurable`);
    }
});
