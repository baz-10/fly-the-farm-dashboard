import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/locations', timeout: 60_000, expect: { timeout: 10_000 }, workers: 1, retries: 0,
  reporter: [['list']], use: { baseURL: 'http://127.0.0.1:4174', trace: 'off', screenshot: 'off', video: 'off' },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:4174', reuseExistingServer: true, timeout: 120_000,
    env: { BROWSER: 'none', PORT: '4174', REACT_APP_PERSISTENCE_MODE: 'remote' } },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
