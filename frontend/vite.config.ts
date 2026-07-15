import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 開発時のみ: 相対 /api をローカルの wrangler dev (8787) へプロキシ
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
