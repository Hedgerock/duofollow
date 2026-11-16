import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const avatarOrigins: string[] = JSON.parse(
  readFileSync(new URL('./extension/src/duolingoAvatarOrigins.json', import.meta.url), 'utf8'),
);

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'duofollow-image-sources',
      transformIndexHtml: {
        order: 'pre',
        handler: () => [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: `img-src 'self' ${avatarOrigins.join(' ')}`,
            },
            injectTo: 'head-prepend',
          },
        ],
      },
    },
  ],
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
