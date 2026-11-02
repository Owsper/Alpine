import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // One backend serves research, sessions, grading and the voice models.
    proxy: { '/api': { target: 'http://127.0.0.1:8100', changeOrigin: true } },
  },
})
