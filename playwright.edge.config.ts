import { defineConfig } from 'playwright/test';

import browserConfig from '@duofollow/playwright.config';

export default defineConfig({
  ...browserConfig,
  projects: [
    {
      name: 'edge',
      testMatch: '**/*.integration.pw.ts',
      // Branded Edge does not support Playwright's extension sideloading flags.
      testIgnore: '**/unfollow-connector.integration.pw.ts',
      use: { channel: 'msedge' },
    },
  ],
});
