import { defineConfig, devices } from '@playwright/test';

// Tests the built site (out/) served as plain files, as Netlify serves it.
// Run `npm run build` first; `npm run check` does.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const port = Number(process.env.STATIC_PORT ?? 3200);

export default defineConfig({
  testDir: './e2e-static',
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}` },
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
    command: `node scripts/serve-static.mjs out ${port}`,
    // Wait for the port, not a page, so a broken build fails in the tests with a clear reason.
    port,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
