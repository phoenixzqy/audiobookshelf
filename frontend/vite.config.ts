import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Base path for GitHub Pages deployment
  base: '/audiobookshelf/',

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.png',
        'icons/*.png',
        'icons/*.svg',
      ],
      manifest: {
        name: 'Audiobook Player',
        short_name: 'Audiobooks',
        description: 'Stream and manage your audiobook library. Listen anywhere with offline support.',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'portrait-primary',
        scope: '/audiobookshelf/',
        start_url: '/audiobookshelf/',
        id: 'audiobook-player',
        categories: ['entertainment', 'books', 'music'],
        lang: 'en',
        dir: 'ltr',
        icons: [
          {
            src: '/audiobookshelf/icons/icon-72.png',
            sizes: '72x72',
            type: 'image/png',
          },
          {
            src: '/audiobookshelf/icons/icon-96.png',
            sizes: '96x96',
            type: 'image/png',
          },
          {
            src: '/audiobookshelf/icons/icon-128.png',
            sizes: '128x128',
            type: 'image/png',
          },
          {
            src: '/audiobookshelf/icons/icon-144.png',
            sizes: '144x144',
            type: 'image/png',
          },
          {
            src: '/audiobookshelf/icons/icon-152.png',
            sizes: '152x152',
            type: 'image/png',
          },
          {
            src: '/audiobookshelf/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/audiobookshelf/icons/icon-384.png',
            sizes: '384x384',
            type: 'image/png',
          },
          {
            src: '/audiobookshelf/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/audiobookshelf/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: '/audiobookshelf/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Audiobook Player Home',
          },
        ],
        shortcuts: [
          {
            name: 'Library',
            short_name: 'Library',
            description: 'Browse your audiobook library',
            url: '/audiobookshelf/',
            icons: [{ src: '/audiobookshelf/icons/icon-96.png', sizes: '96x96' }],
          },
          {
            name: 'History',
            short_name: 'History',
            description: 'View listening history',
            url: '/audiobookshelf/history',
            icons: [{ src: '/audiobookshelf/icons/icon-96.png', sizes: '96x96' }],
          },
        ],
        related_applications: [],
        prefer_related_applications: false,
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Don't cache audio files - they're streamed
        navigateFallback: '/audiobookshelf/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/storage/],
        runtimeCaching: [
          {
            // API calls - network first with fallback (match any origin with /api/)
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Book cover images - cache first (match any origin with /storage/)
            urlPattern: /\/storage\/.*\.(jpg|jpeg|png|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Audio files - network only (streaming)
            urlPattern: /\/storage\/.*\.(mp3|m4a|m4b|ogg|wav)$/i,
            handler: 'NetworkOnly',
          },
          {
            // Azure blob storage - network only
            urlPattern: /^https:\/\/.*\.blob\.core\.windows\.net\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Cloudflare tunnel API calls - network first
            urlPattern: /^https:\/\/.*\.trycloudflare\.com\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tunnel-api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/storage': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Output to GitHub Pages directory
    outDir: '../github-pages/audiobookshelf',
    emptyOutDir: false, // IMPORTANT: Preserve config.js!
    // Generate sourcemaps for debugging
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
