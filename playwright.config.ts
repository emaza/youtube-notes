import { defineConfig } from '@playwright/test';

// Port 3000 (ng serve default) is often taken by other local projects, so the e2e front uses its own port.
const PORT = 4300;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome', // system Google Chrome, no browser download
    headless: true,
    trace: 'retain-on-failure'
  },
  // Only the front is started: every /api call is mocked from the tests.
  webServer: {
    command: `npm run dev:web -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000
  }
});
