import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // The browser talks to one origin in development; Vite forwards API and realtime traffic.
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/socket.io': { target: apiTarget, changeOrigin: false, ws: true },
    },
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
  },
});
