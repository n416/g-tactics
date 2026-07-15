import { Hono } from 'hono'
import { verify } from 'hono/jwt'
import { parseTraits } from '../utils/traits'
import { baimeiFameRandMax } from '../utils/traitEffects'

type Bindings = {
  DB: any
  JWT_SECRET: string
}

export const trainingApp = new Hono<{ Bindings: Bindings }>()

trainingApp.post('/awaken', async (c) => {
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

    const { awaken_type } = await c.req.json() // 'nt' or 'cyber'

    const user: any = await c.env.DB.prepare(
      `SELECT money, level, status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range, nt_level 
       FROM characters WHERE id = ?`
    ).bind(payload.id).first()

    if (!user) return c.json({ success: false, message: 'User not found' }, 404)

    if (user.level < 10) return c.json({ success: false, message: '熟練度（レベル）が足りません' }, 400)
    if (user.status_intuition < 20 || user.status_piloting < 20 || user.status_short_range < 20 || user.status_mid_range < 20 || user.status_long_range < 20) {
      return c.json({ success: false, message: 'ステータスが覚醒条件（全20以上）を満たしていません' }, 400)
    }

    const nyu_kin = 5000 + Math.abs(user.nt_level) * 1000

    if (user.money < nyu_kin) {
      return c.json({ success: false, message: `資金が足りません（必要: ${nyu_kin}G）` }, 400)
    }

    let new_nt_level = user.nt_level
    if (awaken_type === 'nt') {
      if (user.nt_level < 0) return c.json({ success: false, message: '強化人間はニュータイプに覚醒できません' }, 400)
      if (user.nt_level >= 5) return c.json({ success: false, message: 'これ以上ＮＴとしての能力を上げる事はできないようだ' }, 400)
      new_nt_level += 1
    } else if (awaken_type === 'cyber') {
      if (user.nt_level > 0) return c.json({ success: false, message: 'ニュータイプは強化人間になれません' }, 400)
      if (user.nt_level <= -7) return c.json({ success: false, message: 'これ以上強化人間としての能力を上げる事はできないようだ' }, 400)
      new_nt_level -= 1
    } else {
      return c.json({ success: false, message: '不正な覚醒タイプです' }, 400)
    }

    await c.env.DB.prepare(
      `UPDATE characters SET nt_level = ?, money = money - ?, awakening_suppressed = 0 WHERE id = ?`
    ).bind(new_nt_level, nyu_kin, payload.id).run()

    return c.json({ success: true, message: '覚醒・強化が完了しました', new_nt_level, cost: nyu_kin })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

trainingApp.post('/suppress', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const user: any = await c.env.DB.prepare(
      `SELECT money, nt_level, awakening_suppressed FROM characters WHERE id = ?`
    ).bind(payload.id).first()
    if (!user) return c.json({ success: false, message: 'User not found' }, 404)

    if (user.awakening_suppressed !== 0) {
      return c.json({ success: false, message: '既に覚醒を抑止しています' }, 400)
    }

    const cost = 5000 + Math.abs(user.nt_level) * 1000
    if (user.money < cost) {
      return c.json({ success: false, message: `資金が足りません（必要: ${cost}G）` }, 400)
    }

    await c.env.DB.prepare(
      `UPDATE characters SET money = money - ?, nt_level = 0, awakening_suppressed = 1 WHERE id = ?`
    ).bind(cost, payload.id).run()

    return c.json({ success: true, message: '覚醒を抑止しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

trainingApp.post('/baimei', async (c) => {
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

    const { kaisu: rawKaisu } = await c.req.json().catch(() => ({}))
    const kaisu = typeof rawKaisu === 'number' ? rawKaisu : 1;
    if (kaisu < 1 || kaisu > 5) {
      return c.json({ success: false, message: '不正な回数指定です' }, 400)
    }

    const user: any = await c.env.DB.prepare(
      `SELECT money, fame, traits FROM characters WHERE id = ?`
    ).bind(payload.id).first()

    if (!user) return c.json({ success: false, message: 'User not found' }, 404)

    const cost = 1000
    if (user.money < cost * kaisu) {
      return c.json({ success: false, message: `資金が足りません` }, 400)
    }

    const maxRand = baimeiFameRandMax(parseTraits(user.traits))
    let totalGained = 0
    for (let i = 0; i < kaisu; i++) {
      totalGained += Math.trunc(Math.random() * maxRand)
    }
    const newFame = (user.fame || 0) + totalGained

    await c.env.DB.prepare(
      `UPDATE characters SET fame = ?, money = money - ? WHERE id = ?`
    ).bind(newFame, cost * kaisu, payload.id).run()

    return c.json({ success: true, message: `名声が ${totalGained} 上がりました`, new_fame: newFame, cost: cost * kaisu })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

trainingApp.post('/meiseiuri', async (c) => {
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

    const user: any = await c.env.DB.prepare(
      `SELECT money, fame FROM characters WHERE id = ?`
    ).bind(payload.id).first()

    if (!user) return c.json({ success: false, message: 'User not found' }, 404)

    const fameCost = 50
    if ((user.fame || 0) < fameCost) {
      return c.json({ success: false, message: `名声が足りません（必要名声: ${fameCost}）` }, 400)
    }

    // 獲得金（例: 500〜2500）
    const gainedMoney = Math.floor(Math.random() * 2001) + 500
    const newMoney = (user.money || 0) + gainedMoney

    await c.env.DB.prepare(
      `UPDATE characters SET fame = fame - ?, money = ? WHERE id = ?`
    ).bind(fameCost, newMoney, payload.id).run()

    return c.json({ success: true, message: `名声を ${fameCost} 使い、${gainedMoney}G 獲得しました。`, new_money: newMoney, fameCost })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

trainingApp.post('/wazaget', async (c) => {
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

    const { type, name } = await c.req.json()

    if (typeof type !== 'number' || type < 0 || type > 5) {
      return c.json({ success: false, message: '不正な技タイプです' }, 400)
    }
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return c.json({ success: false, message: '技名を入力してください' }, 400)
    }

    const user: any = await c.env.DB.prepare(
      `SELECT awakening_suppressed, money, skills FROM characters WHERE id = ?`
    ).bind(payload.id).first()

    if (!user) return c.json({ success: false, message: 'User not found' }, 404)

    if (user.awakening_suppressed !== 1) {
      return c.json({ success: false, message: 'オールドタイプ専用の機能です' }, 400)
    }

    const cost = 5000
    if (user.money < cost) {
      return c.json({ success: false, message: `資金が足りません（必要: ${cost}G）` }, 400)
    }

    let skillsObj: any = {}
    try {
      skillsObj = JSON.parse(user.skills || '{}')
    } catch (e) {
      skillsObj = {}
    }

    skillsObj.waza = { type, name: name.trim() }
    const newSkillsJson = JSON.stringify(skillsObj)

    await c.env.DB.prepare(
      `UPDATE characters SET money = money - ?, skills = ? WHERE id = ?`
    ).bind(cost, newSkillsJson, payload.id).run()

    return c.json({ success: true, message: `新しい技術「${name.trim()}」を習得しました！`, cost })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

trainingApp.post('/develop_trait', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    
    const { trait_name, add_lv } = await c.req.json()
    const user: any = await c.env.DB.prepare(`SELECT money, fame, level, traits FROM characters WHERE id = ?`).bind(payload.id).first()
    if (!user) return c.json({ success: false, message: 'User not found' }, 404)
    
    let traits: any = {}
    try { traits = JSON.parse(user.traits || '{}') } catch(e) {}
    
    const currentTotal = Object.values(traits).reduce((a:any, b:any) => a + b, 0) as number
    const limit = Math.floor(user.level / 2)
    if (currentTotal + add_lv > limit) return c.json({ success: false, message: `特性Lvの合計上限（${limit}）を超えます` }, 400)
    
    const costMoney = 1000 * add_lv
    const costFame = 10 * add_lv
    if (user.money < costMoney || user.fame < costFame) return c.json({ success: false, message: `費用が足りません。お金:${costMoney} 名声:${costFame} 必要` }, 400)
    
    traits[trait_name] = (traits[trait_name] || 0) + add_lv
    
    await c.env.DB.prepare(`UPDATE characters SET traits = ?, money = money - ?, fame = fame - ? WHERE id = ?`)
      .bind(JSON.stringify(traits), costMoney, costFame, payload.id).run()
      
    return c.json({ success: true, message: `特性「${trait_name}」をLv${add_lv}開発しました` })
  } catch(e:any) {
    return c.json({ success: false, message: e.message }, 500)
  }
})

trainingApp.post('/reset_traits', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    
    const user: any = await c.env.DB.prepare(`SELECT level FROM characters WHERE id = ?`).bind(payload.id).first()
    if (user.level < 30) return c.json({ success: false, message: '特性の全削除は熟練度30以上が必要です' }, 400)
    await c.env.DB.prepare(`UPDATE characters SET traits = '{}' WHERE id = ?`).bind(payload.id).run()
    return c.json({ success: true, message: '特性をすべて削除しました' })
  } catch(e:any) {
    return c.json({ success: false, message: e.message }, 500)
  }
})

trainingApp.post('/reduce_status', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    
    const { status_type } = await c.req.json()
    const validTypes = ['intuition', 'piloting', 'short_range', 'mid_range', 'long_range']
    if (!validTypes.includes(status_type)) return c.json({ success: false, message: '不正なステータスです' }, 400)
    
    const user: any = await c.env.DB.prepare(`SELECT status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range FROM characters WHERE id = ?`).bind(payload.id).first()
    const col = `status_${status_type}`
    if (user[col] <= 0) return c.json({ success: false, message: 'これ以上下げられません' }, 400)
    
    await c.env.DB.prepare(`UPDATE characters SET ${col} = ${col} - 1 WHERE id = ?`).bind(payload.id).run()
    return c.json({ success: true, message: '能力を下げました。返金はありません。' })
  } catch(e:any) {
    return c.json({ success: false, message: e.message }, 500)
  }
})

