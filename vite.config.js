import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: 'index.html',
        // Never answer API routes from the cached SPA shell. OAuth navigations
        // (/api/auth/google, /api/auth/callback) must reach the Cloudflare
        // worker, not index.html — otherwise login silently breaks.
        navigateFallbackDenylist: [/^\/api\//],
        // Take over and drop stale precaches immediately on each new deploy,
        // so a previous service worker can't keep serving a dead index.html
        // (the cause of the blank page after a deploy).
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true
      }
    }
  }
})
