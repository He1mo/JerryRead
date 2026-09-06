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
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      ],
    },
    workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg}'] },
  })],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
