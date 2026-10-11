import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build also loads from file:// (Electron / Capacitor shells).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 900 }, // the catalog JSON is bundled on purpose
  plugins: [react()],
  server: { host: true },
});
