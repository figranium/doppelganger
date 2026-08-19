#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');

if (process.env.FIGRANIUM_SKIP_PLAYWRIGHT_INSTALL === '1') {
  console.log('[postinstall] Skipping Playwright install (FIGRANIUM_SKIP_PLAYWRIGHT_INSTALL=1).');
  process.exit(0);
}

if (process.env.VERCEL === '1') {
  console.log('[postinstall] Skipping Playwright install (VERCEL=1).');
  process.exit(0);
}

if (process.env.CI === '1') {
  console.log('[postinstall] Skipping Playwright install (CI=1).');
  process.exit(0);
}

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1') {
  console.log('[postinstall] Skipping Playwright download (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1).');
  process.exit(0);
}

// CloakBrowser engine is opt-in; pre-fetch its stealth binary only when enabled.
if (process.env.USE_CLOAK_ENGINE === 'true') {
  const cloakResult = spawnSync('npx', ['cloakbrowser', 'install'], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  process.exit(cloakResult.status || 0);
}

const result = spawnSync('npx', ['playwright', 'install', '--with-deps'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

process.exit(result.status || 0);
