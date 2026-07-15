import { Hono } from 'hono'
import { jwt } from 'hono/jwt'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const messageApp = new Hono<{ Bindings: Bindings }>()

// Middleware for authentication
messageApp.use('*', async (c, next) => {
  const secret = c.env.JWT_SECRET
  const jwtMiddleware = jwt({ secret, alg: 'HS256' })
  return jwtMiddleware(c, next)
})

// === Chat Endpoints ===

messageApp.get('/chat', async (c) => {
  const payload = c.get('jwtPayload') as any
  const userId = payload.id

  try {
    // Get current user's faction to filter faction_only messages
    const userQuery = await c.env.DB.prepare('SELECT faction_id FROM characters WHERE id = ?').bind(userId).first()
    const factionId = userQuery?.faction_id || 0

    // allow passing a query parameter ?all=1 to see all faction messages
    const showAll = c.req.query('all') === '1'

    let query = `
      SELECT 
        cm.id, 
        cm.character_id, 
        c.chara_name, 
        cm.faction_id, 
        f.name as faction_name, 
        f.color as faction_color,
        cm.message, 
        cm.is_faction_only, 
        cm.created_at
      FROM chat_messages cm
      JOIN characters c ON cm.character_id = c.id
      LEFT JOIN factions f ON cm.faction_id = f.id
    `

    if (!showAll) {
      // Show public messages OR faction_only messages for my faction OR messages I sent myself
      query += ` WHERE cm.is_faction_only = 0 OR cm.faction_id = ? OR cm.character_id = ?`
    }

    query += ` ORDER BY cm.created_at DESC LIMIT 50`

    const stmt = showAll ? c.env.DB.prepare(query) : c.env.DB.prepare(query).bind(factionId, userId)
    const { results } = await stmt.all()

    return c.json({ success: true, messages: results })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

messageApp.post('/chat', async (c) => {
  const payload = c.get('jwtPayload') as any
  const userId = payload.id
  
  try {
    const { message, is_faction_only } = await c.req.json()

    if (!message || message.trim() === '') {
      return c.json({ success: false, message: 'メッセージを入力してください' }, 400)
    }

    const userQuery = await c.env.DB.prepare('SELECT faction_id FROM characters WHERE id = ?').bind(userId).first()
    const factionId = userQuery?.faction_id || 0

    await c.env.DB.prepare(
      'INSERT INTO chat_messages (character_id, faction_id, message, is_faction_only) VALUES (?, ?, ?, ?)'
    ).bind(userId, factionId, message.trim(), is_faction_only ? 1 : 0).run()

    return c.json({ success: true, message: '送信しました' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// === BBS Endpoints ===

messageApp.get('/bbs', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT 
        b.id, 
        b.character_id, 
        c.chara_name, 
        b.title, 
        b.message, 
        b.created_at
      FROM bbs_messages b
      JOIN characters c ON b.character_id = c.id
      ORDER BY b.created_at DESC LIMIT 100
    `).all()

    return c.json({ success: true, messages: results })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

messageApp.post('/bbs', async (c) => {
  const payload = c.get('jwtPayload') as any
  const userId = payload.id
  
  try {
    const { title, message } = await c.req.json()

    if (!message || message.trim() === '') {
      return c.json({ success: false, message: '本文を入力してください' }, 400)
    }

    await c.env.DB.prepare(
      'INSERT INTO bbs_messages (character_id, title, message) VALUES (?, ?, ?)'
    ).bind(userId, (title || '').trim(), message.trim()).run()

    return c.json({ success: true, message: '投稿しました' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// === Private Messages (MES) Endpoints ===

messageApp.get('/private', async (c) => {
  const payload = c.get('jwtPayload') as any
  const userId = payload.id

  try {
    // 伝言は最新10件まで
    const { results } = await c.env.DB.prepare(`
      SELECT 
        pm.id, 
        pm.sender_id, 
        c.chara_name as sender_name, 
        pm.message, 
        pm.is_read, 
        pm.created_at
      FROM private_messages pm
      LEFT JOIN characters c ON pm.sender_id = c.id
      WHERE pm.recipient_id = ?
      ORDER BY pm.created_at DESC LIMIT 10
    `).bind(userId).all()

    // mark as read
    const unreadIds = results.filter((r: any) => r.is_read === 0).map((r: any) => r.id)
    if (unreadIds.length > 0) {
      const placeholders = unreadIds.map(() => '?').join(',')
      await c.env.DB.prepare(`UPDATE private_messages SET is_read = 1 WHERE id IN (${placeholders})`).bind(...unreadIds).run()
    }

    return c.json({ success: true, messages: results })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// 伝言の既読化（本人が自分のステ詳細を開いた時。原作: 到着アラートをクリックして自ステ詳細を開くと確認できる）
// ※固定パスなので POST /private/:recipientId より前に定義すること
messageApp.post('/private/mark-read', async (c) => {
  const payload = c.get('jwtPayload') as any
  const userId = payload.id
  try {
    await c.env.DB.prepare(`UPDATE private_messages SET is_read = 1 WHERE recipient_id = ? AND is_read = 0`).bind(userId).run()
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

messageApp.get('/private/unread-count', async (c) => {
  const payload = c.get('jwtPayload') as any
  const userId = payload.id

  try {
    const result = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM private_messages WHERE recipient_id = ? AND is_read = 0
    `).bind(userId).first()

    return c.json({ success: true, count: result?.count || 0 })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

messageApp.post('/private/:recipientId', async (c) => {
  const payload = c.get('jwtPayload') as any
  const senderId = payload.id
  const recipientId = c.req.param('recipientId')
  
  try {
    const { message } = await c.req.json()

    if (!message || message.trim() === '') {
      return c.json({ success: false, message: 'メッセージを入力してください' }, 400)
    }

    if (senderId === recipientId) {
      return c.json({ success: false, message: '自分自身には送信できません' }, 400)
    }

    const recipient = await c.env.DB.prepare('SELECT id FROM characters WHERE id = ?').bind(recipientId).first()
    if (!recipient) {
      return c.json({ success: false, message: '宛先のキャラクターが見つかりません' }, 404)
    }

    await c.env.DB.prepare(
      'INSERT INTO private_messages (sender_id, recipient_id, message) VALUES (?, ?, ?)'
    ).bind(senderId, recipientId, message.trim()).run()

    // 伝言は10件までなので、古いものを消す処理を入れるか（仕様上不要ならそのまま）
    // とりあえず10件保存される仕様だが、INSERT時に10件超えたら消す処理
    await c.env.DB.prepare(`
      DELETE FROM private_messages 
      WHERE recipient_id = ? 
      AND id NOT IN (
        SELECT id FROM private_messages WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 10
      )
    `).bind(recipientId, recipientId).run()

    return c.json({ success: true, message: '伝言を送信しました' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})
