import { Hono } from 'hono'
import { verify } from 'hono/jwt'
import { getFullCharacter } from '../utils/battleEngine'
import { charCost } from '../utils/cost'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const squadApp = new Hono<{ Bindings: Bindings }>()

squadApp.get('/', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { results } = await c.env.DB.prepare(`
      SELECT id, character_id, snapshot_data, team_tactic, created_at
      FROM team_members
      WHERE owner_id = ?
      ORDER BY created_at ASC
    `).bind(payload.id).all()

    const squad = results.map((r: any) => {
      const charData = JSON.parse(r.snapshot_data)
      return {
        id: r.id,
        character_id: r.character_id,
        name: charData.chara_name || charData.handle_name,
        unit_name: charData.unit_name || '不明',
        unit_image: charData.unit_image || 'ms_c_0012.gif',
        level: charData.level || 1,
        hp: charData.unit_base_hp || 0,
        en: charData.unit_base_en || 0,
        team_tactic: r.team_tactic || 'NN',
        character: charData,
        created_at: r.created_at,
        cost: charCost(charData)
      }
    })

    const me: any = await c.env.DB.prepare(`SELECT team_tactic FROM characters WHERE id = ?`).bind(payload.id).first()

    return c.json({ success: true, squad, my_team_tactic: me?.team_tactic || 'NN' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

squadApp.get('/candidates', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    // 候補: 自分と同じ勢力または無所属のキャラクター（manual_team.htm 準拠）
    const { results } = await c.env.DB.prepare(`
      SELECT c.id, c.handle_name, c.chara_name, c.level, c.fame, c.traits, c.nt_level, c.unit_custom_lp,
             c.status_intuition, c.status_piloting, c.status_short_range, c.status_mid_range, c.status_long_range,
             u.name as unit_name, u.image as unit_image, u.unit_lv
      FROM characters c
      LEFT JOIN units u ON c.unit_id = u.id
      WHERE c.id != ? AND (c.faction_id IS NULL OR c.faction_id = 0 OR c.faction_id = (SELECT faction_id FROM characters WHERE id = ?))
      ORDER BY c.level DESC
      LIMIT 50
    `).bind(payload.id, payload.id).all()

    const cands = results.map((c: any) => {
      c.cost = charCost(c);
      return c;
    })
    return c.json({ success: true, candidates: cands })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

squadApp.post('/recruit', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { target_id } = await c.req.json()
    if (!target_id) return c.json({ success: false, message: '対象プレイヤーが指定されていません' }, 400)

    if (target_id === payload.id) {
      return c.json({ success: false, message: '自分自身をチームに加えることはできません' }, 400)
    }

    const user: any = await c.env.DB.prepare('SELECT faction_id FROM characters WHERE id = ?').bind(payload.id).first()
    if (!user.faction_id) {
      return c.json({ success: false, message: '勢力に所属していないため、チームを編成できません' }, 400)
    }

        const countRes: any = await c.env.DB.prepare('SELECT snapshot_data FROM team_members WHERE owner_id = ?').bind(payload.id).all()
    if (countRes.results.length >= 4) {
      return c.json({ success: false, message: 'チームメンバーは最大4人までです' }, 400)
    }

    // 同一相手の二重編成を防ぐ（DB側の UNIQUE(owner_id, character_id) が最終防御。ここはユーザー向けの明示メッセージ）
    const already: any = await c.env.DB.prepare('SELECT id FROM team_members WHERE owner_id = ? AND character_id = ?').bind(payload.id, target_id).first()
    if (already) {
      return c.json({ success: false, message: '既にチームメンバーです' }, 400)
    }

    const targetChar = await getFullCharacter(c.env.DB, target_id)
    if (!targetChar) {
      return c.json({ success: false, message: '対象プレイヤーが見つかりません' }, 404)
    }

    const selfChar = await getFullCharacter(c.env.DB, String(payload.id))
    let totalCost = charCost(selfChar);
    for(const r of countRes.results) {
      totalCost += charCost(JSON.parse(r.snapshot_data));
    }
    const targetCost = charCost(targetChar);
    if (totalCost + targetCost > 240) {
      return c.json({ success: false, message: '総コストが240を超えるため編成できません' }, 400)
    }

    if (targetChar.faction_id && targetChar.faction_id !== user.faction_id) {
      return c.json({ success: false, message: '同じ勢力または無所属のメンバーしか編成できません' }, 400)
    }

    const kaisyoCap = targetChar.status_piloting || 0;

    await c.env.DB.prepare(`
      INSERT INTO team_members (owner_id, character_id, snapshot_data, team_kaisyo, kaisyo_cap) VALUES (?, ?, ?, 0, ?)
    `).bind(payload.id, target_id, JSON.stringify(targetChar), kaisyoCap).run()

    return c.json({ success: true, message: 'チームメンバーとして編成しました！' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

squadApp.delete('/remove/:id', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const memberId = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM team_members WHERE id = ? AND owner_id = ?').bind(memberId, payload.id).run()

    return c.json({ success: true, message: 'チームから外しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// P38: チーム戦術（団体戦術）の設定。manual_tsenjyutu.htm 準拠
// tactic = 2文字: [対象 N/L/A/D/S][行動 N=特になし/A=攻撃/D=防禦/S=掩護]
squadApp.post('/tactic', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { member_id, tactic } = await c.req.json()
    const t = String(tactic || '').toUpperCase()
    if (t.length !== 2 || !'NLADS'.includes(t[0]) || !'NADS'.includes(t[1])) {
      return c.json({ success: false, message: '不正なチーム戦術です' }, 400)
    }

    if (member_id === 'self' || member_id == null) {
      await c.env.DB.prepare(`UPDATE characters SET team_tactic = ? WHERE id = ?`).bind(t, payload.id).run()
    } else {
      const res: any = await c.env.DB.prepare(`UPDATE team_members SET team_tactic = ? WHERE id = ? AND owner_id = ?`)
        .bind(t, member_id, payload.id).run()
      if (!res.meta || res.meta.changes === 0) {
        // D1Mock は meta.changes を返さない場合があるため存在確認で代替
        const row = await c.env.DB.prepare(`SELECT id FROM team_members WHERE id = ? AND owner_id = ?`).bind(member_id, payload.id).first()
        if (!row) return c.json({ success: false, message: 'メンバーが見つかりません' }, 404)
      }
    }

    return c.json({ success: true, message: 'チーム戦術を設定しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})







