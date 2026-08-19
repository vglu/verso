import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],

  // Tauri expects a fixed port and fails if it is not available.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] }
  },

  // Produce assets the webview can serve without a network.
  build: {
    target: 'esnext',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Whatever Vite ships with, rather than a named minifier: Vite 8 bundles
    // with Rolldown and minifies with Oxc, and naming esbuild here now means
    // installing it separately for no gain.
    minify: !process.env.TAURI_ENV_DEBUG
  }
});
