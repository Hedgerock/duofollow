import { defineConfig } from 'playwright/test';

const baseURL = 'http://127.0.0.1:4173';
const requestedWorkers = process.env.DUOFOLLOW_TEST_WORKERS?.trim();
const workers = requestedWorkers ? Number(requestedWorkers) : process.env.CI ? 1 : 2;
if ((requestedWorkers && !/^[1-9]\d*$/.test(requestedWorkers)) || !Number.isSafeInteger(workers)) {
  throw new Error('DUOFOLLOW_TEST_WORKERS must be a positive integer');
}
const preview = 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort';

export default defineConfig({
  testDir: './e2e',
  projects: [
    { name: 'integration', testMatch: '**/*.integration.pw.ts', fullyParallel: true },
    { name: 'visual', testMatch: '**/*.visual.pw.ts', workers: 1 },
  ],
  snapshotPathTemplate: '{testDir}/snapshots/{platform}/{testFilePath}/{arg}{ext}',
  updateSnapshots: 'none',
  workers,
  use: {
    browserName: 'chromium',
    baseURL,
    locale: 'en-US',
    trace: 'retain-on-failure',
    viewport: { width: 1100, height: 900 },
  },
  webServer: {
    command: process.env.DUOFOLLOW_TEST_PREBUILT === '1' ? preview : `npm run build && ${preview}`,
    url: `${baseURL}/duofollow/`,
    env: {
      VITE_DUOFOLLOW_EXTENSION_ID: 'abcdefghijklmnopabcdefghijklmnop',
      VITE_DUOFOLLOW_EDGE_EXTENSION_ID: 'ponmlkjihgfedcbaponmlkjihgfedcba',
    },
    reuseExistingServer: false,
  },
});
