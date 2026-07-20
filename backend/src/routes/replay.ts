import { Hono } from 'hono'
import { verify } from 'hono/jwt'

type Bindings = {
  DB: any
  JWT_SECRET: string
}

export const replayApp = new Hono<{ Bindings: Bindings, Variables: { user: any } }>()

replayApp.use('*', async (c, next) => {
  const token = c.req.header('Authorization')?.split(' ')[1]
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    c.set('user', payload)
    await next()
  } catch (e) {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

replayApp.get('/:battleLogId', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const battleLogId = c.req.param('battleLogId')

  const log: any = await db.prepare(`
    SELECT b.*, a.handle_name as attacker_name, d.handle_name as defender_name 
    FROM battle_logs b
    LEFT JOIN characters a ON b.attacker_id = a.id
    LEFT JOIN characters d ON b.defender_id = d.id
    WHERE b.id = ?
  `).bind(battleLogId).first()

  if (!log) {
    return c.json({ success: false, message: 'リプレイデータがありません' }, 404)
  }

  // 認可: attacker_id または defender_id が自分の場合のみ
  if (log.attacker_id !== user.id && log.defender_id !== user.id) {
    return c.json({ success: false, message: 'リプレイの閲覧権限がありません' }, 403)
  }

  if (!log.events_json) {
    return c.json({ success: false, message: 'リプレイデータがありません' }, 404)
  }

  let events = [];
  let meta = null;
  try {
    events = JSON.parse(log.events_json);
    meta = log.meta_json ? JSON.parse(log.meta_json) : null;
  } catch(e) {
    return c.json({ success: false, message: 'データ形式が不正です' }, 500)
  }

  return c.json({
    success: true,
    events,
    meta,
    log_text: log.log_text,
    attacker_name: log.attacker_name,
    defender_name: log.defender_name,
    created_at: log.created_at,
    battle_type: log.battle_type
  })
})
