import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/duofollow/',
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
