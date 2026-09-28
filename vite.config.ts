import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { localBackend } from './server/local';

// Tauri expects a fixed dev port (1420). For the web preview we bind 0.0.0.0.
const host = '0.0.0.0';
const port = 1420;

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'demo' || mode === 'test' ? [] : [localBackend()])],
  base: './',
  clearScreen: false,
  server: {
    host,
    port,
    strictPort: false,
    // The GUI also runs as a plain browser demo (no Tauri), so the dev
    // server must accept the sandboxed preview host it is proxied under.
    allowedHosts: true,
    watch: {
      // Do not watch the Rust sources; they are handled by tauri/cargo.
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: 'es2021',
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    css: false,
  },
}));
