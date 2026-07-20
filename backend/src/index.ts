import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { battleApp } from './routes/battle'
import { authApp } from './routes/auth'
import { profileApp } from './routes/profile'
import { factoryApp } from './routes/factory'
import { adminApp } from './routes/admin'
import { squadApp } from './routes/squad'
import { tacticsApp } from './routes/tactics'
import { trainingApp } from './routes/training'
import { databaseApp } from './routes/database'
import { tournamentApp } from './routes/tournament'
import { factionApp } from './routes/faction'
import { messageApp } from './routes/message'
import { tradeApp } from './routes/trade'
import { factionUnitApp } from './routes/faction_unit'
import { championApp } from './routes/champion'
import { defenseApp } from './routes/defense'
import { homeApp } from './routes/home'
import { baseApp } from './routes/base'
import { museumApp } from './routes/museum'
import { replayApp } from './routes/replay'
import { guestbookApp } from './routes/guestbook'
type Bindings = {
  DB: D1Database
  // 機体画像を格納する R2。画像はリポジトリに含めず、デプロイとは独立して更新する
  ASSETS_BUCKET: R2Bucket
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

// 機体画像を R2 から配信する。
// 画像はビルド成果物に含めない（デプロイのたびに消えない／CI からのデプロイでも維持される）ため、
// 静的アセットではなくこのルートで返す。wrangler.jsonc の run_worker_first で
// /images/units/* を Worker 側に振り分けている。
app.get('/images/units/:file', async (c) => {
  const file = c.req.param('file')
  const obj = await c.env.ASSETS_BUCKET.get(`units/${file}`)
  if (!obj) return c.notFound()   // 画像が無いユニットはフロント側でプレースホルダに落ちる

  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  // 機体画像は不変（更新時はファイル名が変わる運用）なので長期キャッシュ
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  return new Response(obj.body, { headers })
})

app.onError((err, c) => {
  console.error('[Hono Error]', err)
  return c.json({ success: false, message: err.message, stack: err.stack }, 500)
})

app.get('/api/hello', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT 1 as ready').all()
    return c.json({
      success: true,
      message: 'Hello from Hono & D1!',
      db: results[0]
    })
  } catch (e: any) {
    return c.json({
      success: false,
      message: 'D1 Error: ' + e.message
    }, 500)
  }
})

const routes = app
  .route('/api', authApp)
  .route('/api', profileApp)
  .route('/api', factoryApp)
  .route('/api/admin', adminApp)
  .route('/api/squad', squadApp)
  .route('/api/battle', battleApp)
  .route('/api/tactics', tacticsApp)
  .route('/api/training', trainingApp)
  .route('/api/database', databaseApp)
  .route('/api/tournaments', tournamentApp)
  .route('/api/factions', factionApp)
  .route('/api/messages', messageApp)
  .route('/api/trade', tradeApp)
  .route('/api/faction-unit', factionUnitApp)
  .route('/api/champion', championApp)
  .route('/api/defense', defenseApp)
  .route('/api/home', homeApp)
  .route('/api/base', baseApp)
  .route('/api/museum', museumApp)
  .route('/api/replay', replayApp)
  .route('/api/guestbook', guestbookApp)

export type AppType = typeof routes
export default app

