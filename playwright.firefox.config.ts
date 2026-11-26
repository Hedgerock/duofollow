import { defineConfig } from 'playwright/test';

import browserConfig from '@duofollow/playwright.config';
export default defineConfig({
  ...browserConfig,
  // Match CI locally: native pickers and keyboard focus run without competing browser windows.
  workers: 1,
  outputDir: 'test-results/firefox',
  projects: [
    {
      name: 'firefox',
      testMatch: '**/*.integration.pw.ts',
      testIgnore: '**/unfollow-connector.integration.pw.ts',
      use: { browserName: 'firefox' },
    },
  ],
});
