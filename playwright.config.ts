import { defineConfig, devices } from '@playwright/test';

/**
 * Read-only e2e smoke tests (see e2e/). They browse public pages against
 * the dev server and never write data — no bookings, no OTP requests, no
 * form submissions that reach the backend. Dev-server first-compiles are
 * slow, hence the generous navigation/test timeouts.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:3000',
    navigationTimeout: 60_000,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Locally the dev server keeps iteration fast; CI exercises the real
    // production build. Neither needs secrets — lib/env.ts defaults every
    // var and the app boots in sample-data mode.
    command: process.env.CI ? 'pnpm build && pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000/en',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 300_000 : 120_000,
  },
});
