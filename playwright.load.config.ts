import { defineConfig } from 'playwright/test';
import browserConfig from './playwright.config';

export default defineConfig({
  ...browserConfig,
  projects: [{ name: 'load', testMatch: '**/*.load.pw.ts' }],
  workers: 1,
});
