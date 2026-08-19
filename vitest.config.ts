import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts: the unit suite covers pure TS logic and
// does not need the Svelte plugin, which also avoids Vite version skew
// between the app build and the test runner.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    globals: true
  }
});
