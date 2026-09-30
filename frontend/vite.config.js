import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite configuration.
 *
 * The proxy means the React code can call "/api/..." with no host name.
 * During development Vite forwards those calls to the Express server on
 * port 5000, which also avoids CORS problems in the browser.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
