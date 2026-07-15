import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

// 機体画像は R2 から配信するため、ビルド成果物には含めない。
// public/images/units/ は「ローカル開発で Vite dev server が配信するためだけ」に置いてあり、
// リポジトリにも含まれない（.gitignore）。CI はそもそも画像を持たないので、
// この plugin により「手元でビルドしても CI でビルドしても dist の中身が同じ」になる。
function excludeUnitImagesFromBuild(): Plugin {
  return {
    name: 'exclude-unit-images-from-build',
    apply: 'build',
    async closeBundle() {
      await rm(resolve(__dirname, 'dist/images/units'), { recursive: true, force: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // .env / .env.local から読む（開発用。未設定なら 8787）
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = env.VITE_DEV_API_PORT || '8787'
  return {
    plugins: [react(), excludeUnitImagesFromBuild()],
    server: {
      // 開発時のみ: 相対 /api をローカルの wrangler dev へプロキシ。
      // 接続先ポートは .env.local の VITE_DEV_API_PORT で変更できる。
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
  }
})
