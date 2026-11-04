import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Dev server proxies WebSocket traffic to the backend simulator (see backend/src/server.ts).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  cacheDir: '../node_modules/.vite/frontend',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', '../shared/**/*.test.ts'],
  },
});
