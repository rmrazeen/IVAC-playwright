import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/booking',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 0, // Manual OTP and payment handoff have no overall deadline.
  reporter: 'list',
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});
