import { Hono } from 'hono'
import { verify } from 'hono/jwt'
import { postNews } from '../utils/news'

type Bindings = {
  DB: any
  JWT_SECRET: string
}

export const factionApp = new Hono<{ Bindings: Bindings }>()

// 派閥（部隊）一覧の取得
factionApp.get('/', async (c) => {
  try {
    const factions = await c.env.DB.prepare(
      `SELECT f.*, 
        (SELECT COUNT(*) FROM characters c WHERE c.faction_id = f.id AND c.faction_role != 'applicant') as member_count,
        c_leader.handle_name as leader_name
       FROM factions f
       LEFT JOIN characters c_leader ON f.leader_id = c_leader.id
       ORDER BY f.created_at DESC`
    ).all()
    
    return c.json({ success: true, factions: factions.results })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 派閥ランキングの取得
factionApp.get('/ranking', async (c) => {
  try {
    const factions = await c.env.DB.prepare(
      `SELECT f.id, f.name, f.influence, f.created_at,
        (SELECT COUNT(*) FROM characters c WHERE c.faction_id = f.id AND c.faction_role != 'applicant') as member_count,
        c_leader.handle_name as leader_name
       FROM factions f
       LEFT JOIN characters c_leader ON f.leader_id = c_leader.id
       ORDER BY f.influence DESC, f.created_at ASC`
    ).all()
    
    return c.json({ success: true, ranking: factions.results })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 派閥の詳細と所属メンバーの取得
factionApp.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const faction = await c.env.DB.prepare(
      `SELECT f.*, c_leader.handle_name as leader_name 
       FROM factions f
       LEFT JOIN characters c_leader ON f.leader_id = c_leader.id
       WHERE f.id = ?`
    ).bind(id).first()

    if (!faction) return c.json({ success: false, message: '派閥が見つかりません' }, 404)

    const members = await c.env.DB.prepare(
      `SELECT c.id, c.handle_name, c.chara_name, c.level, c.faction_role, c.faction_katagaki, c.faction_message, u.name as unit_name
       FROM characters c
       LEFT JOIN units u ON c.unit_id = u.id
       WHERE c.faction_id = ?
       ORDER BY c.faction_role DESC, c.level DESC` // leaderが上に来るように簡易ソート
    ).bind(id).all()

    return c.json({ 
      success: true, 
      faction, 
      members: members.results 
    })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 派閥の設立
factionApp.post('/', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401)

    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const { name, description, color } = await c.req.json()
    const charaId = payload.id

    if (!name) return c.json({ success: false, message: '派閥名を入力してください' }, 400)

    const chara = await c.env.DB.prepare(`SELECT * FROM characters WHERE id = ?`).bind(charaId).first()
    if (chara.faction_id && chara.faction_id > 0) {
      return c.json({ success: false, message: '既に他の派閥に所属（または申請）しています。設立するにはまず脱退（申請取消）してください。' }, 400)
    }

    const establishFee = 10000;
    if (chara.money < establishFee) {
      return c.json({ success: false, message: `設立費用が不足しています（${establishFee}G 必要です）` }, 400)
    }

    // 資金消費と派閥登録
    await c.env.DB.prepare(`UPDATE characters SET money = money - ? WHERE id = ?`).bind(establishFee, charaId).run()
    
    const result = await c.env.DB.prepare(
      `INSERT INTO factions (name, leader_id, description, color, max_members) VALUES (?, ?, ?, ?, 30) RETURNING id`
    ).bind(name, charaId, description || '', color || '#ffffff').first()

    // P37: 近況ニュース（原作 groupwork.cgi:989「「勢力名」が結成されました。」）
    await postNews(c.env.DB, `「${name}」が結成されました。`, color || '')

    const newFactionId = result.id;

    // 自分をリーダーとして登録
    await c.env.DB.prepare(`UPDATE characters SET faction_id = ?, faction_role = 'leader', faction_katagaki = 'リーダー', faction_message = '' WHERE id = ?`).bind(newFactionId, charaId).run()

    return c.json({ success: true, message: '新しい派閥（部隊）を設立しました！', faction_id: newFactionId })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 派閥設定の更新（リーダーのみ）
factionApp.put('/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401)

    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const id = c.req.param('id')
    const charaId = payload.id
    const { name, description, color, max_members, notice, hp_url } = await c.req.json()

    if (!name) return c.json({ success: false, message: '派閥名を入力してください' }, 400)

    const faction = await c.env.DB.prepare(`SELECT * FROM factions WHERE id = ?`).bind(id).first()
    if (!faction) return c.json({ success: false, message: '派閥が見つかりません' }, 404)
    if (faction.leader_id !== charaId) return c.json({ success: false, message: '設定を変更できるのはリーダーのみです' }, 403)

    await c.env.DB.prepare(
      `UPDATE factions SET name = ?, description = ?, color = ?, max_members = ?, notice = ?, hp_url = ? WHERE id = ?`
    ).bind(name, description || '', color || '#ffffff', max_members || 30, notice || '', hp_url || '', id).run()

    return c.json({ success: true, message: '派閥の設定を更新しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 派閥への所属申請
factionApp.post('/:id/join', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401)

    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const id = c.req.param('id')
    const charaId = payload.id
    const body = await c.req.json().catch(() => ({}))
    const factionMessage = body.message || ''

    const faction = await c.env.DB.prepare(`SELECT * FROM factions WHERE id = ?`).bind(id).first()
    if (!faction) return c.json({ success: false, message: '派閥が見つかりません' }, 404)

    const chara = await c.env.DB.prepare(`SELECT * FROM characters WHERE id = ?`).bind(charaId).first()
    if (chara.faction_id && chara.faction_id > 0) {
      return c.json({ success: false, message: '既に他の派閥に所属（または申請）しています' }, 400)
    }

    const currentMembers = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM characters WHERE faction_id = ? AND faction_role != 'applicant'`).bind(id).first()
    if (currentMembers.count >= faction.max_members) {
      return c.json({ success: false, message: '所属最大人数を超えているため申請できません' }, 400)
    }

    await c.env.DB.prepare(`UPDATE characters SET faction_id = ?, faction_role = 'applicant', faction_message = ?, faction_katagaki = '【所属希望】' WHERE id = ?`).bind(id, factionMessage, charaId).run()

    return c.json({ success: true, message: `${faction.name} に所属申請しました。リーダーの承認をお待ちください。` })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 派閥からの脱退
factionApp.post('/:id/leave', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401)

    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const id = c.req.param('id')
    const charaId = payload.id

    const chara = await c.env.DB.prepare(`SELECT * FROM characters WHERE id = ?`).bind(charaId).first()
    if (chara.faction_id != id) {
      return c.json({ success: false, message: 'この派閥には所属していません' }, 400)
    }

    if (chara.faction_role === 'leader') {
      const otherMembers = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM characters WHERE faction_id = ? AND id != ?`).bind(id, charaId).first()
      if (otherMembers.count > 0) {
        return c.json({ success: false, message: '他にメンバー（または申請者）がいる状態では脱退・解散できません。先にリーダーを移譲するか、メンバーを整理してください。' }, 400)
      }
      
      // 勢力解散
      const factionRow: any = await c.env.DB.prepare(`SELECT name FROM factions WHERE id = ?`).bind(id).first()
      await c.env.DB.prepare(`UPDATE characters SET faction_id = 0, faction_role = 'member', faction_katagaki = '', faction_message = '' WHERE faction_id = ?`).bind(id).run()
      await c.env.DB.prepare(`DELETE FROM factions WHERE id = ?`).bind(id).run()
      await c.env.DB.prepare(`INSERT INTO events (type, message) VALUES ('faction_disband', ?)`).bind(`勢力「${factionRow?.name || id}」は解散しました。`).run()
      return c.json({ success: true, message: 'メンバーがいなくなったため、勢力は解散しました。' })
    }

    await c.env.DB.prepare(`UPDATE characters SET faction_id = 0, faction_role = 'member', faction_katagaki = '', faction_message = '' WHERE id = ?`).bind(charaId).run()

    return c.json({ success: true, message: '派閥から脱退（または申請取消）しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 派閥資金への寄付
factionApp.post('/:id/donate', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401)

    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const id = c.req.param('id')
    const charaId = payload.id
    const { amount } = await c.req.json()

    if (!amount || amount <= 0) return c.json({ success: false, message: '寄付額が正しくありません' }, 400)

    const chara = await c.env.DB.prepare(`SELECT * FROM characters WHERE id = ?`).bind(charaId).first()
    if (chara.faction_id != id) {
      return c.json({ success: false, message: 'この派閥には所属していません' }, 400)
    }

    if (chara.money < amount) {
      return c.json({ success: false, message: '資金が不足しています' }, 400)
    }

    await c.env.DB.prepare(`UPDATE characters SET money = money - ? WHERE id = ?`).bind(amount, charaId).run()
    await c.env.DB.prepare(`UPDATE factions SET funds = funds + ? WHERE id = ?`).bind(amount, id).run()

    return c.json({ success: true, message: `${amount}G を部隊資金に寄付しました！` })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// メンバーからの連絡コメント更新
factionApp.post('/:id/message', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401)

    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const id = c.req.param('id')
    const charaId = payload.id
    const { message } = await c.req.json()

    const chara = await c.env.DB.prepare(`SELECT * FROM characters WHERE id = ?`).bind(charaId).first()
    if (chara.faction_id != id) {
      return c.json({ success: false, message: 'この派閥には所属していません' }, 400)
    }

    await c.env.DB.prepare(`UPDATE characters SET faction_message = ? WHERE id = ?`).bind(message || '', charaId).run()
    return c.json({ success: true, message: '連絡コメントを更新しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 以下、リーダー専用のアクション

// 所属申請の承認
factionApp.post('/:id/approve/:target_id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401)

    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const id = c.req.param('id')
    const charaId = payload.id
    const targetId = c.req.param('target_id')

    const faction = await c.env.DB.prepare(`SELECT * FROM factions WHERE id = ?`).bind(id).first()
    if (!faction || faction.leader_id !== charaId) return c.json({ success: false, message: '権限がありません' }, 403)

    const target = await c.env.DB.prepare(`SELECT * FROM characters WHERE id = ? AND faction_id = ? AND faction_role = 'applicant'`).bind(targetId, id).first()
    if (!target) return c.json({ success: false, message: '対象キャラクターが申請中ではありません' }, 400)

    const currentMembers = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM characters WHERE faction_id = ? AND faction_role != 'applicant'`).bind(id).first()
    if (currentMembers.count >= faction.max_members) {
      return c.json({ success: false, message: '所属最大人数を超えているため承認できません' }, 400)
    }

    await c.env.DB.prepare(`UPDATE characters SET faction_role = 'member', faction_katagaki = '隊員' WHERE id = ?`).bind(targetId).run()
    return c.json({ success: true, message: '所属を承認しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 所属申請の却下
factionApp.post('/:id/reject/:target_id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401)

    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const id = c.req.param('id')
    const charaId = payload.id
    const targetId = c.req.param('target_id')

    const faction = await c.env.DB.prepare(`SELECT * FROM factions WHERE id = ?`).bind(id).first()
    if (!faction || faction.leader_id !== charaId) return c.json({ success: false, message: '権限がありません' }, 403)

    const target = await c.env.DB.prepare(`SELECT * FROM characters WHERE id = ? AND faction_id = ? AND faction_role = 'applicant'`).bind(targetId, id).first()
    if (!target) return c.json({ success: false, message: '対象キャラクターが申請中ではありません' }, 400)

    await c.env.DB.prepare(`UPDATE characters SET faction_id = 0, faction_role = 'member', faction_katagaki = '', faction_message = '' WHERE id = ?`).bind(targetId).run()
    return c.json({ success: true, message: '所属申請を却下しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 強制脱退（キック）
factionApp.post('/:id/kick/:target_id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401)

    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const id = c.req.param('id')
    const charaId = payload.id
    const targetId = c.req.param('target_id')

    const faction = await c.env.DB.prepare(`SELECT * FROM factions WHERE id = ?`).bind(id).first()
    if (!faction || faction.leader_id !== charaId) return c.json({ success: false, message: '権限がありません' }, 403)

    if (charaId === targetId) return c.json({ success: false, message: '自分自身をキックすることはできません' }, 400)

    const target = await c.env.DB.prepare(`SELECT * FROM characters WHERE id = ? AND faction_id = ?`).bind(targetId, id).first()
    if (!target) return c.json({ success: false, message: '対象キャラクターが部隊に所属していません' }, 400)

    await c.env.DB.prepare(`UPDATE characters SET faction_id = 0, faction_role = 'member', faction_katagaki = '', faction_message = '' WHERE id = ?`).bind(targetId).run()
    return c.json({ success: true, message: '強制脱退させました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 呼称変更（katagaki）
factionApp.post('/:id/katagaki/:target_id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401)

    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const id = c.req.param('id')
    const charaId = payload.id
    const targetId = c.req.param('target_id')
    const { katagaki } = await c.req.json()

    const faction = await c.env.DB.prepare(`SELECT * FROM factions WHERE id = ?`).bind(id).first()
    if (!faction || faction.leader_id !== charaId) return c.json({ success: false, message: '権限がありません' }, 403)

    const target = await c.env.DB.prepare(`SELECT * FROM characters WHERE id = ? AND faction_id = ? AND faction_role != 'applicant'`).bind(targetId, id).first()
    if (!target) return c.json({ success: false, message: '対象キャラクターが部隊の正規メンバーではありません' }, 400)

    await c.env.DB.prepare(`UPDATE characters SET faction_katagaki = ? WHERE id = ?`).bind(katagaki || '', targetId).run()
    return c.json({ success: true, message: '呼称を変更しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// リーダー移譲
factionApp.post('/:id/delegate/:target_id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401)

    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const id = c.req.param('id')
    const charaId = payload.id
    const targetId = c.req.param('target_id')

    const faction = await c.env.DB.prepare(`SELECT * FROM factions WHERE id = ?`).bind(id).first()
    if (!faction || faction.leader_id !== charaId) return c.json({ success: false, message: '権限がありません' }, 403)

    if (charaId === targetId) return c.json({ success: false, message: '既にあなたがリーダーです' }, 400)

    const target = await c.env.DB.prepare(`SELECT * FROM characters WHERE id = ? AND faction_id = ? AND faction_role = 'member'`).bind(targetId, id).first()
    if (!target) return c.json({ success: false, message: '対象キャラクターが部隊の正規メンバーではありません' }, 400)

    // 新リーダーを設定
    await c.env.DB.prepare(`UPDATE characters SET faction_role = 'leader', faction_katagaki = 'リーダー' WHERE id = ?`).bind(targetId).run()
    // 旧リーダーをメンバーに降格
    await c.env.DB.prepare(`UPDATE characters SET faction_role = 'member', faction_katagaki = '隊員' WHERE id = ?`).bind(charaId).run()
    // factions テーブルの leader_id を更新
    await c.env.DB.prepare(`UPDATE factions SET leader_id = ? WHERE id = ?`).bind(targetId, id).run()

    return c.json({ success: true, message: 'リーダーを移譲しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})


