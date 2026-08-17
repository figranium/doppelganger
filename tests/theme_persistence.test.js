const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadThemeConfig, saveThemeConfig } = require('../src/server/storage');
const { THEME_FILE } = require('../src/server/constants');

async function runTests() {
    console.log('Testing theme persistence storage and endpoints...');

    // Clean up test theme file if exists
    if (fs.existsSync(THEME_FILE)) {
        fs.unlinkSync(THEME_FILE);
    }

    // Test 1: Initial theme config is null or default
    let initialTheme = await loadThemeConfig();
    console.log('Initial theme config:', initialTheme);
    assert.strictEqual(initialTheme, null);

    // Test 2: Save theme config to file / DB
    const savedTheme = await saveThemeConfig('solarized-dark');
    assert.strictEqual(savedTheme, 'solarized-dark');

    const loadedTheme = await loadThemeConfig();
    console.log('Loaded theme after save:', loadedTheme);
    assert.strictEqual(loadedTheme, 'solarized-dark');

    // Test 3: Save another theme
    await saveThemeConfig('light');
    const reloadedTheme = await loadThemeConfig();
    console.log('Loaded theme after second save:', reloadedTheme);
    assert.strictEqual(reloadedTheme, 'light');

    console.log('All theme persistence unit tests passed!');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
