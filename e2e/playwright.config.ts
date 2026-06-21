import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  // Tests assert on real-time-driven physics state (speed/position deltas
  // over a fixed waitForTimeout window) — running multiple spec files'
  // headless Chromium instances concurrently in this resource-constrained
  // sandbox starves their event loops enough to make those timing
  // assumptions flaky (confirmed: every test here passes reliably alone,
  // but cross-file parallelism introduced intermittent failures once a
  // second spec file existed). One worker keeps the whole suite serial.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], browserName: 'chromium' },
    },
  ],
});
