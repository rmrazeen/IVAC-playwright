import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/offline',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { channel: 'msedge', headless: true, trace: 'off' },
});
