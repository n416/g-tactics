import { Hono } from 'hono'
import { verify } from 'hono/jwt'

type Bindings = {
  DB: any
  JWT_SECRET: string
}

export const tacticsApp = new Hono<{ Bindings: Bindings }>()

tacticsApp.post('/', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Unauthorized' }, 401)
    }

    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const { tactics, update_champion } = await c.req.json()

    if (!tactics || typeof tactics !== 'string' || tactics.length !== 2) {
      return c.json({ success: false, message: '不正な戦術データです' }, 400)
    }

    await c.env.DB.prepare(
      `UPDATE characters SET tactics = ? WHERE id = ?`
    ).bind(tactics, payload.id).run()

    if (update_champion) {
      await updateChampionSnapshotTactics(c.env.DB, payload.id as string);
    }

    return c.json({ success: true, message: '作戦を更新しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// winchg(戦術のみ): 自分が防衛者の 優勝戦＋個別戦闘 の snapshot の戦術を更新
async function updateChampionSnapshotTactics(db: any, userId: string) {
  const champs = await db.prepare('SELECT type, snapshot_data FROM champions WHERE champion_id = ?').bind(userId).all();
  const gates = await db.prepare('SELECT id, snapshot_data FROM defense_battles WHERE champion_id = ?').bind(userId).all();
  const champRows = (champs.results || []) as any[];
  const gateRows = (gates.results || []) as any[];
  if (champRows.length === 0 && gateRows.length === 0) return;
  const user = await db.prepare('SELECT tactics FROM characters WHERE id = ?').bind(userId).first();
  for (const champ of champRows) {
    if (!champ.snapshot_data) continue;
    let snap = JSON.parse(champ.snapshot_data as string);
    snap.tactics = user.tactics;
    await db.prepare('UPDATE champions SET snapshot_data = ?, updated_at = CURRENT_TIMESTAMP WHERE champion_id = ? AND type = ?').bind(JSON.stringify(snap), userId, champ.type).run();
  }
  for (const g of gateRows) {
    if (!g.snapshot_data) continue;
    let snap = JSON.parse(g.snapshot_data as string);
    snap.tactics = user.tactics;
    await db.prepare('UPDATE defense_battles SET snapshot_data = ? WHERE id = ?').bind(JSON.stringify(snap), g.id).run();
  }
}
