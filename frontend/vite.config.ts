import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev server proxies /api to the NestJS backend (default :3000, overridable
// with VITE_PROXY_TARGET when the backend runs on another port).
const apiTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors so the app shell isn't one monolithic chunk.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query', '@tanstack/react-table'],
          charts: ['recharts'],
          motion: ['gsap', '@gsap/react'],
        },
      },
    },
  },
});
