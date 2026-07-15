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
type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

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

export type AppType = typeof routes
export default app

