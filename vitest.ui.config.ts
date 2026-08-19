import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * A second suite, for the few tests that need a component actually mounted.
 *
 * Kept apart from vitest.config.ts on purpose: pulling the Svelte plugin into
 * the main suite would put every unit test through a compiler it does not
 * need. Run with `npm run test:ui`.
 */
export default defineConfig({
  // `emitCss: false` keeps the component's <style> inside the compiled
  // module. The alternative path runs Vite's CSS pipeline, which the test
  // runner does not set up — and the failure looks like a compiler error.
  plugins: [svelte({ hot: false, emitCss: false, preprocess: [] })],
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'jsdom',
    include: ['tests-ui/**/*.test.ts'],
    setupFiles: ['tests-ui/setup.ts'],
    globals: true
  }
});
