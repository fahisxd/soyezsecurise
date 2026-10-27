import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/api-browser', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4175/archive/', viewport: { width: 1280, height: 900 },
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] } },
  webServer: { command: 'npm run dev -- --port 4175 --strictPort', url: 'http://127.0.0.1:4175/archive/',
    env: { VITE_ARCHIVE_API_URL: 'http://127.0.0.1:4175/api/archive/flashes' } },
});
