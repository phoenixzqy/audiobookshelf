import { defineConfig, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';

// Check if building for mobile (Capacitor)
const isMobileBuild = process.env.VITE_BUILD_TARGET === 'mobile';

// Read version from package.json
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const appVersion = pkg.version;

/**
 * Vite configuration for Audiobookshelf
 *
 * Supports two build targets:
 * - Web (default): PWA with service worker, deployed to GitHub Pages
 * - Mobile: Capacitor-compatible build without PWA plugin
 */
export default defineConfig((): UserConfig => {
  // Common plugins
  const plugins = [react()];

  // Mobile build configuration
  if (isMobileBuild) {
    console.log('[Vite] Building for mobile (Capacitor)...');

    return {
      plugins,
      // Relative paths for Capacitor
      base: './',
      define: {
        __BUILD_TARGET__: JSON.stringify('mobile'),
        __APP_VERSION__: JSON.stringify(appVersion),
      },
      build: {
        // Output to dist/ for Capacitor to copy
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom', 'react-router-dom'],
              capacitor: [
                '@capacitor/core',
                '@capacitor/app',
                '@capacitor/preferences',
                '@capacitor/status-bar',
                '@capacitor/splash-screen',
              ],
            },
          },
        },
      },
    };
  }

  // Web/PWA build configuration (default)
  console.log('[Vite] Building for web (PWA)...');

  return {
    plugins: [
      ...plugins,
      VitePWA({
        registerType: 'autoUpdate',
        // Scope service worker to /audiobookshelf/ only
        scope: '/audiobookshelf/',
        includeAssets: ['favicon.png', 'icons/*.png', 'icons/*.svg'],
        manifest: {
          name: 'Audiobook Player',
          short_name: 'Audiobooks',
          description:
            'Stream and manage your audiobook library. Listen anywhere with offline support.',
          theme_color: '#111827',
          background_color: '#111827',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone'],
          orientation: 'portrait-primary',
          // Scope limits what URLs the PWA controls - MUST match service worker scope
          scope: '/audiobookshelf/',
          start_url: '/audiobookshelf/',
          // Unique ID to distinguish from other PWAs on the same domain
          id: '/audiobookshelf/',
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
          // Only precache files under /audiobookshelf/
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          // Navigate fallback only for /audiobookshelf/ paths
          navigateFallback: '/audiobookshelf/index.html',
          // Don't handle navigation for other apps or API routes
          navigateFallbackDenylist: [
            /^\/api/,
            /^\/storage/,
            /^\/nonamekill/, // Don't interfere with other apps
            /^\/(?!audiobookshelf)/, // Only handle /audiobookshelf/* routes
          ],
          // Use unique cache names to avoid conflicts with other PWAs
          runtimeCaching: [
            {
              // API calls - network first with fallback (match any origin with /api/)
              urlPattern: /\/api\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'audiobookshelf-api-cache',
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
                cacheName: 'audiobookshelf-image-cache',
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
                cacheName: 'audiobookshelf-tunnel-api-cache',
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
    // Base path for GitHub Pages deployment
    base: '/audiobookshelf/',
    define: {
      __BUILD_TARGET__: JSON.stringify('web'),
      __APP_VERSION__: JSON.stringify(appVersion),
    },
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
  };
});
