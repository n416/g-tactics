import { Hono } from 'hono'
import { verify } from 'hono/jwt'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const adminApp = new Hono<{ Bindings: Bindings }>()

adminApp.get('/users', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const adminCheck: any = await c.env.DB.prepare('SELECT is_admin FROM characters WHERE id = ?').bind(payload.id).first();
    if (!adminCheck || !adminCheck.is_admin) {
      return c.json({ success: false, message: 'Forbidden' }, 403);
    }

    const { results } = await c.env.DB.prepare(`
      SELECT c.id, c.handle_name, c.chara_name, c.money, c.fame, c.exp, c.level, c.created_at, u.name as unit_name
      FROM characters c
      LEFT JOIN units u ON c.unit_id = u.id
      ORDER BY c.created_at DESC
    `).all();

    return c.json({ success: true, users: results });
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

adminApp.post('/users/:id/grant', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const adminCheck: any = await c.env.DB.prepare('SELECT is_admin FROM characters WHERE id = ?').bind(payload.id).first();
    if (!adminCheck || !adminCheck.is_admin) {
      return c.json({ success: false, message: 'Forbidden' }, 403);
    }

    const targetId = c.req.param('id');
    const { money_add, fame_add, exp_add, level_add } = await c.req.json();

    const m = Number(money_add) || 0;
    const f = Number(fame_add) || 0;
    const e = Number(exp_add) || 0;
    const l = Number(level_add) || 0;

    await c.env.DB.prepare(`
      UPDATE characters
      SET money = money + ?, fame = coalesce(fame, 0) + ?, exp = exp + ?, level = level + ?
      WHERE id = ?
    `).bind(m, f, e, l, targetId).run();

    return c.json({ success: true, message: '付与しました。' });
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

adminApp.post('/users/:id/heal', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const adminCheck: any = await c.env.DB.prepare('SELECT is_admin FROM characters WHERE id = ?').bind(payload.id).first();
    if (!adminCheck || !adminCheck.is_admin) {
      return c.json({ success: false, message: 'Forbidden' }, 403);
    }

    const targetId = c.req.param('id');
    
    // Heal main unit
    await c.env.DB.prepare(`
      UPDATE characters SET current_hp = -1, current_en = -1 WHERE id = ?
    `).bind(targetId).run();

    // Heal wingmen
    await c.env.DB.prepare(`
      UPDATE wingmen SET current_hp = -1, current_en = -1 WHERE owner_id = ?
    `).bind(targetId).run();

    return c.json({ success: true, message: '機体を全回復しました。' });
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

adminApp.post('/users/:id/reset_nt', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const adminCheck: any = await c.env.DB.prepare('SELECT is_admin FROM characters WHERE id = ?').bind(payload.id).first();
    if (!adminCheck || !adminCheck.is_admin) {
      return c.json({ success: false, message: 'Forbidden' }, 403);
    }

    const targetId = c.req.param('id');
    
    await c.env.DB.prepare(`
      UPDATE characters SET nt_level = 0 WHERE id = ?
    `).bind(targetId).run();

    return c.json({ success: true, message: 'ニュータイプ/強化人間の状態をリセット（一般人に戻る）しました。' });
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})
