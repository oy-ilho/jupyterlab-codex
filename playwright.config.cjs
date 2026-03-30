const { defineConfig } = require('@playwright/test');

const baseURL =
  process.env.JUPYTERLAB_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  'http://127.0.0.1:8888/lab';
const channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined;
const video = process.env.PLAYWRIGHT_VIDEO || 'retain-on-failure';

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,
  expect: {
    timeout: 15000
  },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    ...(channel ? { channel } : {}),
    headless: process.env.PW_HEADLESS !== '0',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video
  }
});
