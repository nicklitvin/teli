import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build also loads from file:// (Electron / Capacitor shells).
export default defineConfig({
  base: './',
  // The catalog JSON is bundled on purpose; shipping it as a JSON.parse string parses faster.
  build: { chunkSizeWarningLimit: 6000 },
  json: { stringify: true },
  plugins: [react()],
  server: { host: true },
});
