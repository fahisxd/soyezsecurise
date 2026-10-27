import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173/archive/', viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] },
    trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173/archive/', reuseExistingServer: !process.env.CI },
});
