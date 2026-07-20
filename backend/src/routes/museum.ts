import { Hono } from 'hono';
import { verify } from 'hono/jwt';
import { getMuseumSlots } from '../utils/baseFacilities';

export const museumApp = new Hono<{ Bindings: any }>();

async function getUserId(c: any): Promise<string | null> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    return payload?.id as string || null;
  } catch {
    return null;
  }
}

async function getMuseumData(db: any, userId: string, includeOwnedUnits: boolean) {
  const baseFacility: any = await db.prepare('SELECT level FROM user_facilities WHERE user_id = ? AND facility = ?').bind(userId, 'museum').first();
  const museumLevel = baseFacility ? baseFacility.level : 0;
  const slots = getMuseumSlots(museumLevel);

  const collectedRes: any = await db.prepare('SELECT COUNT(*) as count FROM user_unit_stats WHERE user_id = ? AND obtained_count > 0').bind(userId).first();
  const totalRes: any = await db.prepare('SELECT COUNT(*) as count FROM units').first();
  const progress = {
    collected: collectedRes ? collectedRes.count : 0,
    total: totalRes ? totalRes.count : 0,
  };

  const { results: hangars } = await db.prepare('SELECT unit_id FROM hangars WHERE user_id = ?').bind(userId).all();
  const char: any = await db.prepare('SELECT unit_id FROM characters WHERE id = ?').bind(userId).first();
  
  const ownedUnitIds = new Set<number>();
  for (const h of hangars) ownedUnitIds.add((h as any).unit_id);
  if (char && char.unit_id > 0) ownedUnitIds.add(char.unit_id);

  const { results: exhibitsRaw } = await db.prepare(`
    SELECT e.slot_index, e.unit_id,
           u.name, u.image,
           s.obtained_count, s.first_obtained_at, s.total_kills, s.max_win_streak
    FROM museum_exhibits e
    JOIN units u ON e.unit_id = u.id
    JOIN user_unit_stats s ON e.user_id = s.user_id AND e.unit_id = s.unit_id
    WHERE e.user_id = ?
  `).bind(userId).all();

  const exhibits = exhibitsRaw.map((e: any) => {
    if (e.slot_index < 1 || e.slot_index > slots || !ownedUnitIds.has(e.unit_id)) {
      return { slot_index: e.slot_index, unit: null }; 
    }
    return {
      slot_index: e.slot_index,
      unit: {
        id: e.unit_id,
        name: e.name,
        image: e.image,
        obtained_count: e.obtained_count,
        first_obtained_at: e.first_obtained_at,
        total_kills: e.total_kills,
        max_win_streak: e.max_win_streak
      }
    };
  });

  const settings: any = await db.prepare('SELECT featured_unit_id, curator_comment FROM museum_settings WHERE user_id = ?').bind(userId).first();
  let featured = null;
  if (settings && settings.featured_unit_id > 0 && ownedUnitIds.has(settings.featured_unit_id)) {
    const fUnit: any = await db.prepare(`
      SELECT u.id, u.name, u.image, s.obtained_count, s.first_obtained_at, s.total_kills, s.max_win_streak
      FROM units u
      JOIN user_unit_stats s ON u.id = s.unit_id
      WHERE s.user_id = ? AND u.id = ?
    `).bind(userId, settings.featured_unit_id).first();
    
    if (fUnit) {
      featured = {
        unit: fUnit,
        comment: settings.curator_comment || ''
      };
    }
  }

  let ownedUnits: any[] | undefined = undefined;
  if (includeOwnedUnits) {
    const { results: ownedUnitsRaw } = await db.prepare(`
      SELECT u.id, u.name, u.image, s.obtained_count, s.first_obtained_at, s.total_kills, s.max_win_streak
      FROM user_unit_stats s
      JOIN units u ON s.unit_id = u.id
      WHERE s.user_id = ? AND s.obtained_count > 0
    `).bind(userId).all();
    ownedUnits = ownedUnitsRaw.filter((u: any) => ownedUnitIds.has(u.id));
  }

  return {
    progress,
    museumLevel,
    slots,
    exhibits,
    featured,
    ownedUnits
  };
}

museumApp.get('/', async (c) => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);
  const db = c.env.DB;

  try {
    const data = await getMuseumData(db, userId, true);
    return c.json({
      success: true,
      ...data
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

museumApp.get('/user/:userId', async (c) => {
  const currentUserId = await getUserId(c);
  if (!currentUserId) return c.json({ success: false, message: 'Unauthorized' }, 401);

  const targetUserId = c.req.param('userId');
  const db = c.env.DB;

  try {
    const owner: any = await db.prepare('SELECT id, handle_name, chara_name FROM characters WHERE id = ?').bind(targetUserId).first();
    if (!owner) {
      return c.json({ success: false, message: 'ユーザーが見つかりません' }, 404);
    }

    const base: any = await db.prepare('SELECT name, terrain FROM user_bases WHERE user_id = ?').bind(targetUserId).first();
    
    const data = await getMuseumData(db, targetUserId, false);

    return c.json({
      success: true,
      owner,
      base: base || null,
      ...data
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

museumApp.get('/collection', async (c) => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);
  const db = c.env.DB;

  try {
    // TODO: 911件を一括で返す想定。重い場合は仮想スクロールやページネーションの導入を検討
    const { results } = await db.prepare(`
      SELECT u.id as unit_id, u.name, u.image, u.unit_lv,
             s.obtained_count, s.first_obtained_at, s.total_kills, s.max_win_streak,
             CASE WHEN s.obtained_count > 0 THEN 1 ELSE 0 END as is_collected
      FROM units u
      LEFT JOIN user_unit_stats s ON u.id = s.unit_id AND s.user_id = ?
      ORDER BY u.id ASC
    `).bind(userId).all();

    const collection = results.map((r: any) => ({
      unit_id: r.unit_id,
      name: r.is_collected ? r.name : '？？？',
      image: r.is_collected ? r.image : null,
      unit_lv: r.unit_lv,
      obtained_count: r.obtained_count || 0,
      first_obtained_at: r.first_obtained_at,
      total_kills: r.total_kills || 0,
      max_win_streak: r.max_win_streak || 0,
      is_collected: !!r.is_collected
    }));

    return c.json({ success: true, collection });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

museumApp.post('/exhibit', async (c) => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);
  const db = c.env.DB;

  try {
    const { slot_index, unit_id } = await c.req.json();

    const baseFacility: any = await db.prepare('SELECT level FROM user_facilities WHERE user_id = ? AND facility = ?').bind(userId, 'museum').first();
    const museumLevel = baseFacility ? baseFacility.level : 0;
    const slots = getMuseumSlots(museumLevel);

    if (slot_index < 1 || slot_index > slots) {
      return c.json({ success: false, message: '無効な展示枠です' }, 400);
    }

    if (!unit_id || unit_id === 0) {
      await db.prepare('DELETE FROM museum_exhibits WHERE user_id = ? AND slot_index = ?').bind(userId, slot_index).run();
      return c.json({ success: true, message: '展示を外しました' });
    }

    const { results: hangars } = await db.prepare('SELECT unit_id FROM hangars WHERE user_id = ? AND unit_id = ?').bind(userId, unit_id).all();
    const char: any = await db.prepare('SELECT unit_id FROM characters WHERE id = ? AND unit_id = ?').bind(userId, unit_id).first();
    
    if (hangars.length === 0 && !char) {
      return c.json({ success: false, message: '所持していない機体は展示できません' }, 400);
    }

    const stat: any = await db.prepare('SELECT obtained_count FROM user_unit_stats WHERE user_id = ? AND unit_id = ?').bind(userId, unit_id).first();
    if (!stat || stat.obtained_count === 0) {
      return c.json({ success: false, message: '未収蔵の機体は展示できません' }, 400);
    }

    // 他の枠に同じ機体が展示されている場合は削除
    await db.prepare('DELETE FROM museum_exhibits WHERE user_id = ? AND unit_id = ?').bind(userId, unit_id).run();

    await db.prepare(`
      INSERT INTO museum_exhibits (user_id, slot_index, unit_id, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, slot_index) DO UPDATE SET
        unit_id = excluded.unit_id,
        updated_at = excluded.updated_at
    `).bind(userId, slot_index, unit_id).run();

    return c.json({ success: true, message: '展示を更新しました' });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

export function validateCuratorComment(comment: string): boolean {
  return (comment || '').length <= 100;
}

museumApp.post('/featured', async (c) => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);
  const db = c.env.DB;

  try {
    const { unit_id, comment } = await c.req.json();

    if (!validateCuratorComment(comment)) {
      return c.json({ success: false, message: 'コメントは100文字以内で入力してください' }, 400);
    }

    if (unit_id && unit_id > 0) {
      const { results: hangars } = await db.prepare('SELECT unit_id FROM hangars WHERE user_id = ? AND unit_id = ?').bind(userId, unit_id).all();
      const char: any = await db.prepare('SELECT unit_id FROM characters WHERE id = ? AND unit_id = ?').bind(userId, unit_id).first();
      
      if (hangars.length === 0 && !char) {
        return c.json({ success: false, message: '所持していない機体は殿堂に設定できません' }, 400);
      }
      
      const stat: any = await db.prepare('SELECT obtained_count FROM user_unit_stats WHERE user_id = ? AND unit_id = ?').bind(userId, unit_id).first();
      if (!stat || stat.obtained_count === 0) {
        return c.json({ success: false, message: '未収蔵の機体は殿堂に設定できません' }, 400);
      }
    }

    await db.prepare(`
      INSERT INTO museum_settings (user_id, featured_unit_id, curator_comment, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        featured_unit_id = excluded.featured_unit_id,
        curator_comment = excluded.curator_comment,
        updated_at = excluded.updated_at
    `).bind(userId, unit_id || 0, comment || '').run();

    return c.json({ success: true, message: '殿堂展示を更新しました' });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});
