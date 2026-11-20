import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    // The landing-only preview is published as a single page, so keep everything in one script.
    rollupOptions:
      process.env.VITE_LANDING_PREVIEW === '1' ? { output: { inlineDynamicImports: true } } : undefined,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
