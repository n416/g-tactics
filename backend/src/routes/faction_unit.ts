import { Hono } from 'hono'
import { verify } from 'hono/jwt'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const factionUnitApp = new Hono<{ Bindings: Bindings }>()

// 認証＆ユーザー情報取得ヘルパー
async function getAuthUser(c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.split(' ')[1]
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return null
    const user = await c.env.DB.prepare(`SELECT * FROM characters WHERE id = ?`).bind(payload.id).first()
    return user
  } catch {
    return null
  }
}

// 勢力機体情報の取得
factionUnitApp.get('/', async (c) => {
  try {
    const user: any = await getAuthUser(c)
    if (!user) return c.json({ success: false, message: 'Unauthorized' }, 401)
    if (user.faction_id === 0) return c.json({ success: false, message: '勢力に所属していません' }, 400)

    const factionUnit: any = await c.env.DB.prepare(`
      SELECT fu.*, 
             u.name as base_name, u.image as base_image, u.hp as base_hp, u.en as base_en, 
             u.armor as base_armor, u.mobility as base_mobility, u.sensor as base_sensor, 
             u.max_weight, u.price as unit_price,
             w.name as weapon_name, w.weight as weapon_weight,
             i1.name as item1_name, i1.weight as item1_weight,
             i2.name as item2_name, i2.weight as item2_weight
      FROM faction_units fu
      JOIN units u ON fu.unit_id = u.id
      LEFT JOIN items w ON fu.weapon_id = w.id
      LEFT JOIN items i1 ON fu.item1_id = i1.id
      LEFT JOIN items i2 ON fu.item2_id = i2.id
      WHERE fu.faction_id = ?
    `).bind(user.faction_id).first()

    const faction: any = await c.env.DB.prepare(`SELECT funds FROM factions WHERE id = ?`).bind(user.faction_id).first()

    return c.json({ success: true, faction_unit: factionUnit, faction_funds: faction ? faction.funds : 0 })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 機体購入／乗換
factionUnitApp.post('/buy', async (c) => {
  try {
    const user: any = await getAuthUser(c)
    if (!user) return c.json({ success: false, message: 'Unauthorized' }, 401)
    if (user.faction_id === 0) return c.json({ success: false, message: '勢力に所属していません' }, 400)
    if (user.faction_role !== 'leader') return c.json({ success: false, message: '勢力機体の操作はリーダーのみ可能です' }, 403)

    const { unit_id } = await c.req.json()
    if (!unit_id) return c.json({ success: false, message: '機体が指定されていません' }, 400)

    const targetUnit: any = await c.env.DB.prepare(`SELECT * FROM units WHERE id = ?`).bind(unit_id).first()
    if (!targetUnit) return c.json({ success: false, message: '指定された機体が存在しません' }, 404)

    const faction: any = await c.env.DB.prepare(`SELECT * FROM factions WHERE id = ?`).bind(user.faction_id).first()
    if (!faction) return c.json({ success: false, message: '勢力が見つかりません' }, 404)

    const currentUnit: any = await c.env.DB.prepare(`
      SELECT fu.*, u.price as base_price 
      FROM faction_units fu 
      JOIN units u ON fu.unit_id = u.id 
      WHERE fu.faction_id = ?
    `).bind(user.faction_id).first()

    let cost = targetUnit.price
    let refund = 0
    if (currentUnit) {
      refund = Math.floor(currentUnit.base_price * 0.7)
      cost = cost - refund
    }

    if (faction.funds < cost) {
      return c.json({ success: false, message: '勢力ポイント(資金)が足りません' }, 400)
    }

    const newFunds = faction.funds - cost
    await c.env.DB.prepare(`UPDATE factions SET funds = ? WHERE id = ?`).bind(newFunds, user.faction_id).run()

    if (currentUnit) {
      await c.env.DB.prepare(`
        UPDATE faction_units 
        SET unit_id = ?, custom_name = ?, image = ?, custom_hp = 0, custom_en = 0, custom_armor = 0, custom_mobility = 0, custom_sensor = 0, custom_lp = 0, weapon_id = 0, item1_id = 0, item2_id = 0
        WHERE faction_id = ?
      `).bind(targetUnit.id, targetUnit.name, targetUnit.image, user.faction_id).run()
    } else {
      await c.env.DB.prepare(`
        INSERT INTO faction_units (faction_id, unit_id, custom_name, image)
        VALUES (?, ?, ?, ?)
      `).bind(user.faction_id, targetUnit.id, targetUnit.name, targetUnit.image).run()
    }

    return c.json({ success: true, message: '勢力機体を購入・乗り換えました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// カスタマイズ
factionUnitApp.post('/customize', async (c) => {
  try {
    const user: any = await getAuthUser(c)
    if (!user) return c.json({ success: false, message: 'Unauthorized' }, 401)
    if (user.faction_id === 0) return c.json({ success: false, message: '勢力に所属していません' }, 400)
    if (user.faction_role !== 'leader') return c.json({ success: false, message: '勢力機体の操作はリーダーのみ可能です' }, 403)

    const { stat_type } = await c.req.json()
    
    const validStats = ['hp', 'en', 'armor', 'mobility', 'sensor']
    if (!validStats.includes(stat_type)) return c.json({ success: false, message: '不正なステータス指定です' }, 400)

    const faction: any = await c.env.DB.prepare(`SELECT * FROM factions WHERE id = ?`).bind(user.faction_id).first()
    const factionUnit: any = await c.env.DB.prepare(`
      SELECT fu.*, u.price as base_price 
      FROM faction_units fu 
      JOIN units u ON fu.unit_id = u.id 
      WHERE fu.faction_id = ?
    `).bind(user.faction_id).first()

    if (!factionUnit) return c.json({ success: false, message: '勢力機体を保有していません' }, 400)

    const cost = factionUnit.base_price
    if (faction.funds < cost) {
      return c.json({ success: false, message: '勢力ポイント(資金)が足りません' }, 400)
    }

    let koware = 1
    let isFailed = false
    let chkcstm = factionUnit.custom_lp
    if (chkcstm >= 150) chkcstm = 150
    if (factionUnit.custom_lp >= 100) {
      if (Math.floor(Math.random() * 250) < chkcstm) {
        koware = -1
        isFailed = true
      }
    }

    const newFunds = faction.funds - cost
    const newLp = isFailed ? factionUnit.custom_lp - 1 : factionUnit.custom_lp + 1

    let upHp = 0, upEn = 0, upArmor = 0, upMobility = 0, upSensor = 0
    if (stat_type === 'hp') upHp = 20 * koware
    if (stat_type === 'en') upEn = 20 * koware
    if (stat_type === 'armor') upArmor = 1 * koware
    if (stat_type === 'mobility') upMobility = 2 * koware
    if (stat_type === 'sensor') upSensor = 2 * koware

    await c.env.DB.prepare(`UPDATE factions SET funds = ? WHERE id = ?`).bind(newFunds, user.faction_id).run()
    await c.env.DB.prepare(`
      UPDATE faction_units
      SET custom_hp = custom_hp + ?,
          custom_en = custom_en + ?,
          custom_armor = custom_armor + ?,
          custom_mobility = custom_mobility + ?,
          custom_sensor = custom_sensor + ?,
          custom_lp = ?
      WHERE faction_id = ?
    `).bind(upHp, upEn, upArmor, upMobility, upSensor, newLp, user.faction_id).run()

    const message = isFailed ? '機体カスタマイズに失敗しました。（能力が低下しました）' : '機体カスタマイズが終了しました。'

    return c.json({ success: true, message, is_failed: isFailed })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 名称変更
factionUnitApp.post('/rename', async (c) => {
  try {
    const user: any = await getAuthUser(c)
    if (!user) return c.json({ success: false, message: 'Unauthorized' }, 401)
    if (user.faction_id === 0) return c.json({ success: false, message: '勢力に所属していません' }, 400)
    if (user.faction_role !== 'leader') return c.json({ success: false, message: '勢力機体の操作はリーダーのみ可能です' }, 403)

    const { custom_name } = await c.req.json()
    if (!custom_name) return c.json({ success: false, message: '名称が指定されていません' }, 400)

    const res = await c.env.DB.prepare(`UPDATE faction_units SET custom_name = ? WHERE faction_id = ?`).bind(custom_name, user.faction_id).run()
    if (res.meta.changes === 0) return c.json({ success: false, message: '勢力機体を保有していません' }, 400)

    return c.json({ success: true, message: '機体名称を変更しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 画像変更
factionUnitApp.post('/image', async (c) => {
  try {
    const user: any = await getAuthUser(c)
    if (!user) return c.json({ success: false, message: 'Unauthorized' }, 401)
    if (user.faction_id === 0) return c.json({ success: false, message: '勢力に所属していません' }, 400)
    if (user.faction_role !== 'leader') return c.json({ success: false, message: '勢力機体の操作はリーダーのみ可能です' }, 403)

    const { image } = await c.req.json()
    if (!image) return c.json({ success: false, message: '画像が指定されていません' }, 400)

    const res = await c.env.DB.prepare(`UPDATE faction_units SET image = ? WHERE faction_id = ?`).bind(image, user.faction_id).run()
    if (res.meta.changes === 0) return c.json({ success: false, message: '勢力機体を保有していません' }, 400)

    return c.json({ success: true, message: '機体画像を変更しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 装備変更
factionUnitApp.post('/equip', async (c) => {
  try {
    const user: any = await getAuthUser(c)
    if (!user) return c.json({ success: false, message: 'Unauthorized' }, 401)
    if (user.faction_id === 0) return c.json({ success: false, message: '勢力に所属していません' }, 400)
    if (user.faction_role !== 'leader') return c.json({ success: false, message: '勢力機体の操作はリーダーのみ可能です' }, 403)

    const { slot, item_id } = await c.req.json()
    if (!['weapon_id', 'item1_id', 'item2_id'].includes(slot)) {
      return c.json({ success: false, message: '不正な装備スロットです' }, 400)
    }

    const faction: any = await c.env.DB.prepare(`SELECT funds FROM factions WHERE id = ?`).bind(user.faction_id).first()
    const factionUnit: any = await c.env.DB.prepare(`
      SELECT fu.*, u.max_weight,
             w.weight as w_weight, i1.weight as i1_weight, i2.weight as i2_weight
      FROM faction_units fu
      JOIN units u ON fu.unit_id = u.id
      LEFT JOIN items w ON fu.weapon_id = w.id
      LEFT JOIN items i1 ON fu.item1_id = i1.id
      LEFT JOIN items i2 ON fu.item2_id = i2.id
      WHERE fu.faction_id = ?
    `).bind(user.faction_id).first()

    if (!factionUnit) return c.json({ success: false, message: '勢力機体を保有していません' }, 400)

    // 外す場合
    if (!item_id || item_id === 0) {
      await c.env.DB.prepare(`UPDATE faction_units SET ${slot} = 0 WHERE faction_id = ?`).bind(user.faction_id).run()
      return c.json({ success: true, message: '装備を外しました' })
    }

    // 装備する場合
    const targetItem: any = await c.env.DB.prepare(`SELECT * FROM items WHERE id = ?`).bind(item_id).first()
    if (!targetItem) return c.json({ success: false, message: 'アイテムが存在しません' }, 404)

    const isWeapon = targetItem.item_type >= 1 && targetItem.item_type <= 5
    if (slot === 'weapon_id' && !isWeapon) return c.json({ success: false, message: '武器スロットには武器しか装備できません' }, 400)
    if ((slot === 'item1_id' || slot === 'item2_id') && isWeapon) return c.json({ success: false, message: '装備スロットに武器は装備できません' }, 400)

    const currentWWeight = slot === 'weapon_id' ? 0 : (factionUnit.w_weight || 0)
    const currentI1Weight = slot === 'item1_id' ? 0 : (factionUnit.i1_weight || 0)
    const currentI2Weight = slot === 'item2_id' ? 0 : (factionUnit.i2_weight || 0)
    const newTotalWeight = currentWWeight + currentI1Weight + currentI2Weight + (targetItem.weight || 0)

    if (newTotalWeight > factionUnit.max_weight) {
      return c.json({ success: false, message: '機体の最大積載量（重量）を超過するため装備できません' }, 400)
    }

    if (faction.funds < targetItem.price) {
      return c.json({ success: false, message: '勢力ポイント(資金)が足りません' }, 400)
    }

    const newFunds = faction.funds - targetItem.price
    await c.env.DB.prepare(`UPDATE factions SET funds = ? WHERE id = ?`).bind(newFunds, user.faction_id).run()
    await c.env.DB.prepare(`UPDATE faction_units SET ${slot} = ? WHERE faction_id = ?`).bind(targetItem.id, user.faction_id).run()

    return c.json({ success: true, message: `${targetItem.name} を購入・装備しました` })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})
