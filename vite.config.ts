import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: 'src/client',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      srcDir: '.',
      filename: 'sw.ts',
      strategies: 'injectManifest',
      manifestFilename: 'manifest.json',
      injectManifest: {
        swSrc: 'src/client/sw.ts',
        swDest: 'dist/client/sw.js',
      },
      manifest: {
        name: 'ScanDoc',
        short_name: 'ScanDoc',
        description: 'Scan and send documents via email',
        theme_color: '#1976d2',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
        screenshots: [
          {
            src: '/screenshots/screenshot-mobile.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'ScanDoc – mobilní zobrazení',
          },
          {
            src: '/screenshots/screenshot-wide.png',
            sizes: '1280x800',
            type: 'image/png',
            form_factor: 'wide',
            label: 'ScanDoc – zobrazení na desktopu',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
