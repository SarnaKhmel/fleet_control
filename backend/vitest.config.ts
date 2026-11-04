import { defineConfig } from 'vitest/config';

// Keep Vitest's cache in the root node_modules, not in backend/node_modules.
export default defineConfig({
  cacheDir: '../node_modules/.vite/backend',
});
