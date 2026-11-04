import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      // The backend is /api/v1-only now and the app calls relative
      // /api/v1 paths, so a single proxy entry covers everything.
      // ws: true is required for the carrier media WebSocket stream.
      // SPA routes are NOT proxied — React Router owns them.
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
