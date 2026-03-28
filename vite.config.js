import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-core':  ['react', 'react-dom', 'react-router-dom'],
          'db':          ['dexie', 'dexie-react-hooks'],
          'ai':          ['./src/ai/fluxEngine.js', './src/ai/voiceEngine.js', './src/ai/speechAnalysis.js', './src/ai/weeklyReport.js'],
          'pages-core':  ['./src/pages/Home.jsx', './src/pages/Onboarding.jsx', './src/pages/Auth.jsx', './src/pages/Splash.jsx'],
          'pages-speech':['./src/pages/SpeakLab.jsx', './src/pages/Breathe.jsx', './src/pages/BraveMissions.jsx', './src/pages/SpeechAnalysis.jsx'],
          'pages-new':   ['./src/pages/ACTModule.jsx', './src/pages/DAFMode.jsx', './src/pages/BraveWall.jsx', './src/pages/WeeklyReport.jsx'],
          'pages-misc':  ['./src/pages/Adventure.jsx', './src/pages/TalkTales.jsx', './src/pages/Journal.jsx', './src/pages/FamilyMode.jsx', './src/pages/CommAcademy.jsx', './src/pages/Progress.jsx', './src/pages/Settings.jsx', './src/pages/FluxChat.jsx'],
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo.svg'],
      manifest: {
        name: 'YoSpeech — Find Your Flow',
        short_name: 'YoSpeech',
        description: 'Speech confidence and communication mastery for everyone who stutters',
        theme_color: '#05080f',
        background_color: '#05080f',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ],
        shortcuts: [
          {
            name: 'Breathe & Flow',
            short_name: 'Breathe',
            description: 'Start a breathing session',
            url: '/breathe',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'Talk to Flux',
            short_name: 'Flux Chat',
            description: 'Voice chat with your AI companion',
            url: '/flux-chat',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }]
          },
          {
            name: "Today's SpeakLab",
            short_name: 'SpeakLab',
            description: 'Daily speech exercises',
            url: '/speaklab',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,mp3,json}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.anthropic\.com/,
            handler: 'NetworkFirst',
            options: { cacheName: 'ai-cache', networkTimeoutSeconds: 5 }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxAgeSeconds: 60*60*24*365 } }
          }
        ]
      }
    })
  ],
  resolve: { alias: { '@': '/src' } }
})
