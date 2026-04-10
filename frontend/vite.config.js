// build: 2026-04-01
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  define: {
    __BUILD_DATE__: JSON.stringify('2026-04-01'),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // Muda para 'prompt' para permitir controle manual do update
      manifest: {
        name: 'CTG.Engenharia',
        short_name: 'Engenharia',
        description: 'Plataforma de gestão de projetos de engenharia — CTG Brasil',
        theme_color: '#001F5B',
        background_color: '#001F5B',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'logo.svg', sizes: 'any', type: 'image/svg+xml' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true, // Limpa caches antigos automaticamente
        skipWaiting: false, // Espera pelo reload do usuário
        clientsClaim: false, // Não reclama imediatamente
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/(auth\/me|settings)$/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-auth-cache', networkTimeoutSeconds: 5, expiration: { maxEntries: 10, maxAgeSeconds: 3600 } }
          },
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', networkTimeoutSeconds: 10, expiration: { maxEntries: 50, maxAgeSeconds: 300 } }
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 31536000 } }
          }
        ]
      },
      // Configuração para verificação periódica de updates
      devOptions: {
        enabled: false, // Desabilita PWA em desenvolvimento
        type: 'module',
        navigateFallback: '/',
      },
    })
  ],
  server: {
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } }
  }
});
