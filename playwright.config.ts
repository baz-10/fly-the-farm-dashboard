import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const remote = !/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(baseURL);

export default defineConfig({
  testDir: './e2e/acceptance',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: remote ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'test-results/playwright-report', open: 'never' }]],
  outputDir: 'test-results/playwright-artifacts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'environment', testMatch: /environment\.spec\.ts/ },
    {
      name: 'auth',
      testMatch: /auth\.setup\.ts/,
      use: { trace: 'off', screenshot: 'off', video: 'off' },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'test-results/.auth/organisation.json' },
      dependencies: ['auth'],
      testIgnore: [/environment\.spec\.ts/, /auth\.setup\.ts/],
    },
  ],
});
