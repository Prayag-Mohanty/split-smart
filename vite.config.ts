/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base so the same build works on GitHub Pages (sub-path), Netlify and Vercel.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'SplitSmart',
        short_name: 'SplitSmart',
        description: 'Scan a receipt, assign items and settle up with the fewest payments.',
        theme_color: '#0f766e',
        background_color: '#f6f7f9',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // App shell is precached; the heavy ML runtime (ONNX wasm, classifier worker) is cached
        // on first use instead, so installing the PWA never forces a 20 MB download.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/classifier.worker-*.js', '**/*.wasm', 'ocr/**'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/(assets|ocr)\/.*\.(wasm|js|mjs|gz)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'app-lazy-assets', expiration: { maxEntries: 40 } },
          },
          {
            // Tesseract worker/core/language data and ONNX runtime wasm come from jsDelivr / unpkg.
            urlPattern: /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|tessdata\.projectnaptha\.com)\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ml-runtime',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Transformers.js model weights from the Hugging Face hub (and its CDN redirects).
            urlPattern: /^https:\/\/(huggingface\.co|cdn-lfs.*\.hf\.co|.*\.huggingface\.co|cas-bridge\.xethub\.hf\.co)\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ml-models',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
