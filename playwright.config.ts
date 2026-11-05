import { defineConfig, devices } from '@playwright/test';

// PLAYWRIGHT_CHROMIUM_PATH lets a machine point at an already-installed Chromium.
// Without it, Playwright uses its own browser (install once with `npx playwright install chromium`).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'ipad-landscape',
      use: {
        ...devices['iPad Pro 11 landscape'],
        browserName: 'chromium',
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  webServer: {
    command: `npx next dev --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
