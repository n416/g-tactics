import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // .env / .env.local から読む（開発用。未設定なら 8787）
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = env.VITE_DEV_API_PORT || '8787'
  return {
    plugins: [react()],
    server: {
      // 開発時のみ: 相対 /api をローカルの wrangler dev へプロキシ。
      // 接続先ポートは .env.local の VITE_DEV_API_PORT で変更できる。
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
  }
})
