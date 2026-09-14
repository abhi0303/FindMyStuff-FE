import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

/**
 * GitHub Pages serves static files only, so a deep link like
 * /FindMyStuff-FE/places/123 404s before the SPA ever boots. Pages falls back to
 * 404.html for any unknown path, so shipping a copy of index.html under that name
 * lets the app load and lets React Router read the real URL from window.location.
 */
function githubPagesSpaFallback(): Plugin {
  let root = process.cwd();
  let outDir = 'dist';

  return {
    name: 'github-pages-spa-fallback',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    closeBundle() {
      const index = resolve(root, outDir, 'index.html');
      if (!existsSync(index)) return;
      copyFileSync(index, resolve(root, outDir, '404.html'));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.API_PROXY_TARGET || 'http://localhost:3000';

  /* Production builds are served from abhi0303.github.io/FindMyStuff-FE/, a
     project page under a sub-path. Everything that follows the base — asset URLs,
     the router's basename, the service worker's scope — moves with this one value.
     Dev stays at the root. On a custom domain, build with BASE_PATH=/ instead. */
  const base = env.BASE_PATH || (mode === 'production' ? '/FindMyStuff-FE/' : '/');

  return {
    base,
    plugins: [
      react(),
      githubPagesSpaFallback(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'FindMyStuff',
          short_name: 'FindMyStuff',
          description: 'Never lose track of your things again.',
          theme_color: '#2c2b30',
          background_color: '#1f1e22',
          display: 'standalone',
          orientation: 'portrait',
          // Relative, so the installed app opens and stays inside the base path.
          start_url: './',
          scope: './',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'Search', short_name: 'Search', url: './search' },
            { name: 'Scan a label', short_name: 'Scan', url: './scan' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
          // The API is authenticated and privacy-sensitive: never cache it in the
          // service worker. Freshness comes from React Query instead.
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-stylesheets' },
            },
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
      },
    },
  };
});
