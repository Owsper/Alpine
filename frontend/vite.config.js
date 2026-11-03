import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Two pages: the landing (plain HTML) and the app (React), sharing one design system.
    rollupOptions: { input: { landing: resolve(import.meta.dirname, 'index.html'), app: resolve(import.meta.dirname, 'app.html') } },
  },
  server: {
    // One backend serves research, sessions, grading and the voice models. API_PORT points a second
    // copy of the app at another backend (the demo recording uses 8101).
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.API_PORT ?? 8100}`, changeOrigin: true } },
  },
})
