const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/unit',
  testMatch: /.*\.spec\.(js|ts)$/,
  timeout: 120000,
  expect: {
    timeout: 15000
  },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    headless: process.env.PW_HEADLESS !== '0',
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  }
});
