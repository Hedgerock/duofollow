import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: '/duofollow/',
  resolve: {
    alias: { '@duofollow': dirname(fileURLToPath(import.meta.url)) },
  },
  build: {
    rollupOptions: {
      input: [
        'index.html',
        'privacy/index.html',
        'privacy/ru/index.html',
        'privacy/uk/index.html',
        'access/index.html',
        'settings/index.html',
      ],
    },
  },
});
