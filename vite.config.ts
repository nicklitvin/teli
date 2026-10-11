import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build also loads from file:// (Electron / Capacitor shells).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
});
