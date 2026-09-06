import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'JerryRead',
      short_name: 'JerryRead',
      description: '阅读与听书保持同一进度',
      theme_color: '#25231f',
      background_color: '#f4efe6',
      display: 'standalone',
      start_url: '/books',
      icons: [
        { src: '/logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png}'] },
  })],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
