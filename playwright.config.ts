import { defineConfig } from 'playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  projects: [
    { name: 'integration', testMatch: '**/*.integration.pw.ts' },
    { name: 'visual', testMatch: '**/*.visual.pw.ts' },
  ],
  snapshotPathTemplate: '{testDir}/snapshots/{platform}/{testFilePath}/{arg}{ext}',
  updateSnapshots: 'none',
  workers: process.env.CI ? 1 : undefined,
  use: {
    browserName: 'chromium',
    baseURL,
    locale: 'en-US',
    trace: 'retain-on-failure',
    viewport: { width: 1100, height: 900 },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: `${baseURL}/duofollow/`,
    env: { VITE_DUOFOLLOW_EXTENSION_ID: 'abcdefghijklmnopabcdefghijklmnop' },
    reuseExistingServer: false,
  },
});
