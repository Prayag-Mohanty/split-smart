import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the production build in a real browser: real OCR on the sample
 * receipts in samples/, real service worker, phone-sized viewport.
 * Run with `npm run build && npm run test:e2e`.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4175/',
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'npx vite preview --port 4175 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4175/',
    reuseExistingServer: !process.env.CI,
  },
});
