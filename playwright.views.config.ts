import { defineConfig } from '@playwright/test';

// `npm run views`: screenshots of the 3D view at fixed camera views, for looking at by eye
// (views/capture.spec.ts, docs/DEVELOPMENT.md). Not part of `npm run check`.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const port = Number(process.env.VIEWS_PORT ?? 3200);

export default defineConfig({
  testDir: './views',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: 'chromium',
    // One fixed size, so the pictures always compare.
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    trace: 'off',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: `npx next dev --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
