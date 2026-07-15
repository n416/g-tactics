import { Hono } from 'hono'
import { verify } from 'hono/jwt'
import { parseTraits } from '../utils/traits'
import { applyCostDiscount, customizeFailBase, customizeFailRandMax, customizeSafeThreshold } from '../utils/traitEffects'
import { calcMaxHp, calcMaxEn, getFullCharacter } from '../utils/battleEngine'
import { calcTul } from '../utils/kaisyo'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const factoryApp = new Hono<{ Bindings: Bindings }>()

factoryApp.get('/units', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM units ORDER BY price ASC, id ASC').all()
    return c.json({ success: true, units: results })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

factoryApp.get('/items', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM items ORDER BY price ASC, id ASC').all()
    return c.json({ success: true, items: results })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

factoryApp.post('/buy_unit', async (c) => {
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

    const { unit_id } = await c.req.json()

    const user: any = await c.env.DB.prepare('SELECT money, unit_id, fame FROM characters WHERE id = ?').bind(payload.id).first()
    const unit: any = await c.env.DB.prepare('SELECT * FROM units WHERE id = ?').bind(unit_id).first()

    if (!user) return c.json({ success: false, message: 'User not found' }, 404)
    if (!unit) return c.json({ success: false, message: 'Unit not found' }, 404)

    // キャラクターリセット特殊処理
    if (unit.id === 9999) {
      await c.env.DB.prepare(`
        UPDATE characters 
        SET money = 0, 
            fame = 0,
            exp = 0,
            level = 1,
            nt_level = 0,
            unit_id = 0,
            weapon1_id = 0,
            weapon2_id = 0,
            weapon3_id = 0,
            item1_id = 0,
            item2_id = 0,
            item3_id = 0,
            skills = '{}',
            status_intuition = 0,
            status_piloting = 0,
            status_short_range = 0,
            status_mid_range = 0,
            status_long_range = 0,
            unit_custom_hp = 150,
            unit_custom_en = 16,
            unit_custom_armor = 30,
            unit_custom_mobility = 40,
            unit_custom_sensor = 175,
            unit_custom_lp = 0,
            unit_custom_weight = -1,
            unit_kaisyo = 0,
            current_hp = -1,
            current_en = -1
        WHERE id = ?
      `).bind(payload.id).run();

      await c.env.DB.prepare('DELETE FROM hangars WHERE user_id = ?').bind(payload.id).run();
      await c.env.DB.prepare('DELETE FROM wingmen WHERE owner_id = ?').bind(payload.id).run();

      return c.json({
        success: true,
        message: 'キャラクターデータを完全に初期化しました。（転生機能は未実装のため完全リセットされます）',
        new_money: 0,
        new_unit_id: 0
      });
    }

    if (user.money < unit.price) {
      return c.json({ success: false, message: '資金が足りません' }, 400)
    }

    if ((user.fame || 0) < (unit.req_fame || 0)) {
      return c.json({ success: false, message: `名声が足りません（必要名声: ${unit.req_fame || 0}）` }, 400)
    }

    const newMoney = user.money - unit.price
    const newFame = (user.fame || 0) - (unit.req_fame || 0)

    await c.env.DB.prepare(`
      UPDATE characters 
      SET money = ?, 
          fame = ?,
          unit_id = ?,
          unit_custom_hp = ?,
          unit_custom_en = ?,
          unit_custom_armor = ?,
          unit_custom_mobility = ?,
          unit_custom_sensor = ?,
          unit_custom_lp = 0,
          unit_custom_weight = -1,
          unit_kaisyo = 0,
          current_hp = -1,
          current_en = -1
      WHERE id = ?
    `).bind(
      newMoney,
      newFame,
      unit.id,
      unit.hp,
      unit.en,
      unit.armor,
      unit.mobility,
      unit.sensor,
      payload.id
    ).run()

    await c.env.DB.prepare(
      'INSERT INTO hangars (user_id, unit_id) VALUES (?, ?)'
    ).bind(payload.id, unit.id).run()

    return c.json({
      success: true,
      message: `${unit.name} を購入し、搭乗しました。`,
      new_money: newMoney,
      new_unit_id: unit.id
    })

  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

factoryApp.post('/buy_item', async (c) => {
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

    const { item_id } = await c.req.json()

    const user: any = await c.env.DB.prepare('SELECT money FROM characters WHERE id = ?').bind(payload.id).first()
    const item: any = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(item_id).first()

    if (!user) return c.json({ success: false, message: 'User not found' }, 404)
    if (!item) return c.json({ success: false, message: 'Item not found' }, 404)

    if (user.money < item.price) {
      return c.json({ success: false, message: '資金が足りません' }, 400)
    }

    const newMoney = user.money - item.price

    await c.env.DB.prepare(`UPDATE characters SET money = ? WHERE id = ?`).bind(newMoney, payload.id).run()

    await c.env.DB.prepare(`INSERT INTO item_inventory (user_id, item_id) VALUES (?, ?)`).bind(payload.id, item.id).run()

    return c.json({
      success: true,
      message: `${item.name} を購入し、アイテムボックスに送りました。`,
      new_money: newMoney,
      new_item_id: item.id
    })

  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

factoryApp.get('/hangar', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Unauthorized' }, 401)
    }
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    // Get all units in the user's hangar
    const { results } = await c.env.DB.prepare(
      `SELECT hangars.id as hangar_id, units.id as unit_id, units.name, units.hp, units.en, units.armor, units.mobility, units.sensor, units.image, units.description, units.price, units.unit_lv, units.max_weight, hangars.current_hp, hangars.current_en, hangars.kaisyo
       FROM hangars
       JOIN units ON hangars.unit_id = units.id
       WHERE hangars.user_id = ?
       ORDER BY hangars.created_at DESC`
    ).bind(payload.id).all()

    return c.json({ success: true, hangar: results })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

factoryApp.post('/hangar/equip', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Unauthorized' }, 401)
    }
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { unit_id, hangar_id, update_champion } = await c.req.json()

    let targetHangarId = hangar_id;
    if (!targetHangarId) {
      const ownCheck = await c.env.DB.prepare(
        `SELECT id FROM hangars WHERE user_id = ? AND unit_id = ? ORDER BY created_at DESC LIMIT 1`
      ).bind(payload.id, unit_id).first()
      if (!ownCheck) return c.json({ success: false, message: 'この機体は格納庫にありません' }, 400)
      targetHangarId = ownCheck.id;
    }

    const hangarUnit: any = await c.env.DB.prepare(
      `SELECT h.*, u.hp, u.en, u.armor, u.mobility, u.sensor, u.unit_lv FROM hangars h JOIN units u ON h.unit_id = u.id WHERE h.id = ? AND h.user_id = ?`
    ).bind(targetHangarId, payload.id).first()
    if (!hangarUnit) return c.json({ success: false, message: '指定された機体は格納庫にありません' }, 400)

    const user: any = await c.env.DB.prepare('SELECT * FROM characters WHERE id = ?').bind(payload.id).first()

    // Save current character stats to their old equipped unit in hangar (find the first one with matching unit_id)
    if (user.unit_id && user.unit_id !== 0) {
      const oldHangar: any = await c.env.DB.prepare(
        `SELECT id FROM hangars WHERE user_id = ? AND unit_id = ? AND id != ? ORDER BY created_at DESC LIMIT 1`
      ).bind(payload.id, user.unit_id, targetHangarId).first()
      
      if (oldHangar) {
        await c.env.DB.prepare(`
          UPDATE hangars SET 
            custom_hp = ?, custom_en = ?, custom_armor = ?, custom_mobility = ?, custom_sensor = ?,
            custom_weight = ?, custom_lp = ?, kaisyo = ?, current_hp = ?, current_en = ?
          WHERE id = ?
        `).bind(
          user.unit_custom_hp, user.unit_custom_en, user.unit_custom_armor, user.unit_custom_mobility, user.unit_custom_sensor,
          user.unit_custom_weight, user.unit_custom_lp, user.unit_kaisyo, user.current_hp, user.current_en,
          oldHangar.id
        ).run()
      }
    }

    const newCustomHp = hangarUnit.custom_hp > 0 ? hangarUnit.custom_hp : hangarUnit.hp;
    const newCustomEn = hangarUnit.custom_en > 0 ? hangarUnit.custom_en : hangarUnit.en;
    const newCustomArmor = hangarUnit.custom_hp > 0 ? hangarUnit.custom_armor : hangarUnit.armor;
    const newCustomMobility = hangarUnit.custom_hp > 0 ? hangarUnit.custom_mobility : hangarUnit.mobility;
    const newCustomSensor = hangarUnit.custom_hp > 0 ? hangarUnit.custom_sensor : hangarUnit.sensor;

    const tul = calcTul(hangarUnit.unit_lv, newCustomMobility);
    let newKaisyo = hangarUnit.kaisyo || 0;
    if (newKaisyo > tul) newKaisyo = tul;

    await c.env.DB.prepare(`
      UPDATE characters 
      SET unit_id = ?, 
          unit_custom_hp = ?,
          unit_custom_en = ?,
          unit_custom_armor = ?,
          unit_custom_mobility = ?,
          unit_custom_sensor = ?,
          unit_custom_lp = ?,
          unit_custom_weight = ?,
          unit_kaisyo = ?,
          current_hp = ?, 
          current_en = ? 
      WHERE id = ?
    `).bind(
      hangarUnit.unit_id, 
      newCustomHp, newCustomEn, newCustomArmor, newCustomMobility, newCustomSensor,
      hangarUnit.custom_lp, hangarUnit.custom_weight, newKaisyo,
      hangarUnit.current_hp, hangarUnit.current_en, 
      payload.id
    ).run()

    if (update_champion) {
      await updateChampionSnapshotFull(c.env.DB, payload.id as string);
    }

    return c.json({ success: true, message: '機体を乗り換えました', new_unit_id: hangarUnit.unit_id })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

factoryApp.post('/hangar/discard', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Unauthorized' }, 401)
    }
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { hangar_id } = await c.req.json()
    console.log('hangar_id:', hangar_id, 'payload.id:', payload.id)

    const user: any = await c.env.DB.prepare('SELECT id, unit_id FROM characters WHERE id = ?').bind(payload.id).first()
    if (!user) return c.json({ success: false, message: 'User not found' }, 404)

    const hangarItem: any = await c.env.DB.prepare(
      `SELECT h.id, h.unit_id, u.name 
       FROM hangars h 
       JOIN units u ON h.unit_id = u.id 
       WHERE h.id = ? AND h.user_id = ? LIMIT 1`
    ).bind(hangar_id, payload.id).first()

    if (!hangarItem) {
      return c.json({ success: false, message: '指定された機体は格納庫にありません' }, 400)
    }

    if (user.unit_id === hangarItem.unit_id) {
      return c.json({ success: false, message: '現在搭乗中の機体は廃棄できません' }, 400)
    }

    await c.env.DB.prepare('DELETE FROM hangars WHERE id = ?').bind(hangarItem.id).run();

    return c.json({ 
      success: true, 
      message: `${hangarItem.name} を廃棄しました。`
    });

  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

factoryApp.get('/hangar/transform_targets', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const user: any = await c.env.DB.prepare('SELECT unit_id FROM characters WHERE id = ?').bind(payload.id).first()
    if (!user || user.unit_id == null) return c.json({ success: false, message: '搭乗中の機体がありません。' }, 400)

    const { results } = await c.env.DB.prepare(`
      SELECT t.id as transform_id, t.cost, u.id as unit_id, u.name, u.hp, u.en, u.armor, u.mobility, u.sensor, u.image, u.description
      FROM unit_transformations t
      JOIN units u ON t.target_unit_id = u.id
      WHERE t.source_unit_id = ?
    `).bind(user.unit_id).all()

    return c.json({ success: true, targets: results })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

factoryApp.post('/hangar/transform', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { target_unit_id, update_champion } = await c.req.json()

    const user: any = await c.env.DB.prepare('SELECT * FROM characters WHERE id = ?').bind(payload.id).first()
    if (!user || user.unit_id == null) return c.json({ success: false, message: '搭乗中の機体がありません。' }, 400)

    const currentUnit: any = await c.env.DB.prepare('SELECT * FROM units WHERE id = ?').bind(user.unit_id).first()
    if (!currentUnit) {
      return c.json({ success: false, message: '現在の機体データが見つかりません。' }, 404)
    }

    const transformRoute: any = await c.env.DB.prepare(`
      SELECT * FROM unit_transformations 
      WHERE source_unit_id = ? AND target_unit_id = ?
    `).bind(currentUnit.id, target_unit_id).first()

    if (!transformRoute) {
      return c.json({ success: false, message: 'この機体への変形は不可能です。' }, 400)
    }

    const targetUnit: any = await c.env.DB.prepare('SELECT * FROM units WHERE id = ?').bind(target_unit_id).first()
    if (!targetUnit) {
      return c.json({ success: false, message: '変形先の機体データが見つかりません。' }, 404)
    }

    const fixedCost = 10;
    if (user.money < fixedCost) {
      return c.json({ success: false, message: `変形費用(${fixedCost}G)が足りません。` }, 400)
    }

    if ((user.fame || 0) < (transformRoute.req_fame || 0)) {
      return c.json({ success: false, message: `名声が足りません（必要名声: ${transformRoute.req_fame || 0}）` }, 400)
    }

    // 変形時のHP・EN割合引継ぎ、ステータス引継ぎ
    const hpRatio = user.current_hp === -1 ? 1.0 : user.current_hp / calcMaxHp(user.unit_custom_hp, user.status_piloting)
    const enRatio = user.current_en === -1 ? 1.0 : user.current_en / calcMaxEn(user.unit_custom_en, user.status_piloting)

    // （省略）既存のカスタム値引継ぎロジックは原作仕様だと「最大値が機体によって変わるが現在の加算分を維持するか」等複雑なので、ここでは単純にカスタム値はそのまま引き継ぐ
    const newCustomHp = user.unit_custom_hp
    const newCustomEn = user.unit_custom_en
    const newCustomArmor = user.unit_custom_armor
    const newCustomMobility = user.unit_custom_mobility
    const newCustomSensor = user.unit_custom_sensor
    const newCustomWeight = user.unit_custom_weight

    let newCurrentHp = Math.floor(calcMaxHp(newCustomHp, user.status_piloting) * hpRatio)
    let newCurrentEn = Math.floor(calcMaxEn(newCustomEn, user.status_piloting) * enRatio)
    
    if (newCurrentHp < 0) newCurrentHp = 0
    if (newCurrentEn < 0) newCurrentEn = 0

    // 更新処理
    await c.env.DB.prepare(`
      UPDATE characters 
      SET money = money - ?,
          fame = fame - ?,
          unit_id = ?,
          unit_custom_hp = ?,
          unit_custom_en = ?,
          unit_custom_armor = ?,
          unit_custom_mobility = ?,
          unit_custom_sensor = ?,
          unit_custom_weight = ?,
          current_hp = ?,
          current_en = ?
      WHERE id = ?
    `).bind(
      fixedCost,
      transformRoute.req_fame || 0,
      targetUnit.id,
      newCustomHp, newCustomEn, newCustomArmor, newCustomMobility, newCustomSensor,
      newCustomWeight,
      newCurrentHp, newCurrentEn,
      payload.id
    ).run()

    // 搭乗中の機体を格納庫でも更新する（同種の機体が複数ある場合は最新のものを1つ更新）
    await c.env.DB.prepare(`
      UPDATE hangars
      SET unit_id = ?
      WHERE id = (
        SELECT id FROM hangars WHERE user_id = ? AND unit_id = ? ORDER BY created_at DESC LIMIT 1
      )
    `).bind(targetUnit.id, payload.id, currentUnit.id).run()

    // 乗り換え（変形）で名称が変わるが、専用名が設定されている場合は一部引き継ぐ（ここでは一旦デフォルト名称に戻す、もしくはそのまま）
    // ※原作では「kunitname eq munit_name」ならデフォルト名にするなどの処理がある。
    // 今回は名称引き継ぎは単純化して行わないか、今後のアップデートで対応。

    if (update_champion) {
      await updateChampionSnapshotFull(c.env.DB, payload.id as string);
    }

    return c.json({
      success: true,
      message: `${targetUnit.name} に変形しました！`,
      new_money: user.money - fixedCost,
      new_unit_id: targetUnit.id
    })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

factoryApp.post('/seibi', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const body = await c.req.json().catch(() => ({}));
    const hangar_id = body.hangar_id;
    const update_champion = body.update_champion;

    let targetUnitHp, targetUnitEn, targetUnitLp, currentHp, currentEn;

    const user: any = await c.env.DB.prepare(`
      SELECT c.*, u.name as unit_name, c.unit_custom_hp as unit_base_hp, c.unit_custom_en as unit_base_en
      FROM characters c
      LEFT JOIN units u ON c.unit_id = u.id
      WHERE c.id = ?
    `).bind(payload.id).first()

    if (!user) return c.json({ success: false, message: 'User not found' }, 404)

    // 優勝戦反映: 優勝者本人が防衛耐久を満タンに戻す（原作 action.cgi sub seibi の win フラグ）
    // 費用は本体整備と同じ式・最低=キャラLv。時間制限は無し。
    if (update_champion) {
      // 優勝戦(champions)＋個別戦闘(defense_battles) の自分が防衛者の記録をまとめて全快
      const champs = await c.env.DB.prepare(
        `SELECT type, snapshot_data, def_hp, def_en FROM champions WHERE champion_id = ?`
      ).bind(payload.id).all()
      const gates = await c.env.DB.prepare(
        `SELECT id, snapshot_data, def_hp, def_en FROM defense_battles WHERE champion_id = ?`
      ).bind(payload.id).all()
      const champRows = (champs.results || []) as any[]
      const gateRows = (gates.results || []) as any[]
      if (champRows.length === 0 && gateRows.length === 0) {
        return c.json({ success: false, message: '優勝者または個別戦闘の防衛者ではありません。' }, 400)
      }

      const snapMax = (sd: any): [number, number] => {
        const snap = JSON.parse(sd)
        const s = Array.isArray(snap) ? snap[0] : snap
        return [Number(s.maxHp) || 0, Number(s.maxEn) || 0]
      }
      const rowNeeds = (r: any) => {
        if (!r.snapshot_data) return false
        const [mh, me] = snapMax(r.snapshot_data)
        return (Number(r.def_hp) || 0) < mh || (Number(r.def_en) || 0) < me
      }
      if (![...champRows, ...gateRows].some(rowNeeds)) {
        return c.json({ success: false, message: '防衛機体は既に全快です。' }, 400)
      }

      const totalStats = user.status_intuition + user.status_piloting + user.status_short_range + user.status_mid_range + user.status_long_range
      let kai_ind = Math.floor((totalStats + user.level * 25) / 250) - 1
      if (kai_ind < 0) kai_ind = 0
      let kind = kai_ind + 1
      if (kind > 11) kind = 11
      let kcost = Math.floor((kai_ind + (user.unit_custom_lp || 0) / 4) * (kind / 10))
      kcost = applyCostDiscount(parseTraits(user.traits), kcost)
      if (kcost < user.level) kcost = user.level

      if (user.money < kcost) {
        return c.json({ success: false, message: `資金（G）が足りません。必要: ${kcost}G` }, 400)
      }

      for (const ch of champRows) {
        if (!ch.snapshot_data) continue
        const [mh, me] = snapMax(ch.snapshot_data)
        await c.env.DB.prepare(
          `UPDATE champions SET def_hp = ?, def_en = ?, updated_at = CURRENT_TIMESTAMP WHERE champion_id = ? AND type = ?`
        ).bind(mh, me, payload.id, ch.type).run()
      }
      for (const g of gateRows) {
        if (!g.snapshot_data) continue
        const [mh, me] = snapMax(g.snapshot_data)
        await c.env.DB.prepare(
          `UPDATE defense_battles SET def_hp = ?, def_en = ? WHERE id = ?`
        ).bind(mh, me, g.id).run()
      }
      await c.env.DB.prepare(`UPDATE characters SET money = money - ? WHERE id = ?`).bind(kcost, payload.id).run()

      return c.json({ success: true, message: `${kcost}G を消費して防衛機体を整備しました！`, new_money: user.money - kcost })
    }

    if (hangar_id) {
      const hangarItem: any = await c.env.DB.prepare(
        `SELECT h.*, u.hp as base_hp, u.en as base_en FROM hangars h JOIN units u ON h.unit_id = u.id WHERE h.id = ? AND h.user_id = ? LIMIT 1`
      ).bind(hangar_id, payload.id).first()
      if (!hangarItem) return c.json({ success: false, message: '格納庫に対象の機体がありません' }, 400)
      
      targetUnitHp = hangarItem.custom_hp > 0 ? hangarItem.custom_hp : hangarItem.base_hp;
      targetUnitEn = hangarItem.custom_en > 0 ? hangarItem.custom_en : hangarItem.base_en;
      targetUnitLp = hangarItem.custom_lp;
      currentHp = hangarItem.current_hp;
      currentEn = hangarItem.current_en;
    } else {
      targetUnitHp = user.unit_base_hp;
      targetUnitEn = user.unit_base_en;
      targetUnitLp = user.unit_custom_lp;
      currentHp = user.current_hp;
      currentEn = user.current_en;
    }

    const maxHp = calcMaxHp(targetUnitHp, user.status_piloting);
    const maxEn = calcMaxEn(targetUnitEn, user.status_piloting);
    const curHp = currentHp === -1 ? maxHp : currentHp;
    const curEn = currentEn === -1 ? maxEn : currentEn;

    if (curHp >= maxHp && curEn >= maxEn) {
      return c.json({ success: false, message: '機体は既に全快です。整備の必要はありません。' }, 400);
    }

    // 原作の $kcost 計算ロジック
    const totalStats = user.status_intuition + user.status_piloting + user.status_short_range + user.status_mid_range + user.status_long_range;
    let kai_ind = Math.floor((totalStats + user.level * 25) / 250) - 1;
    if (kai_ind < 0) kai_ind = 0;

    let kind = kai_ind + 1;
    if (kind > 11) kind = 11;

    const kunit_lv = 0; // hangar units might have different lv, but original game uses 0 usually?
    const klp = targetUnitLp || 0;

    let kcost = Math.floor((kai_ind + kunit_lv + klp / 4) * (kind / 10));

    // -- P20: 整備コスト減（器用。割引はtraitEffectsに集約） --
    kcost = applyCostDiscount(parseTraits(user.traits), kcost);

    if (kcost < user.level) {
      kcost = user.level;
    }

    if (user.money < kcost) {
      return c.json({ success: false, message: `資金（G）が足りません。必要: ${kcost}G` }, 400);
    }

    if (hangar_id) {
      await c.env.DB.prepare(
        'UPDATE hangars SET current_hp = -1, current_en = -1 WHERE id = ?'
      ).bind(hangar_id).run()
      await c.env.DB.prepare(
        'UPDATE characters SET money = money - ? WHERE id = ?'
      ).bind(kcost, payload.id).run()
    } else {
      await c.env.DB.prepare(
        'UPDATE characters SET money = ?, current_hp = -1, current_en = -1 WHERE id = ?'
      ).bind(user.money - kcost, payload.id).run()
    }

    return c.json({
      success: true,
      message: `${kcost}G を消費して機体を整備しました！`,
      new_money: user.money - kcost,
      new_hp: maxHp,
      new_en: maxEn
    })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

factoryApp.post('/anaheim/customize', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { target_stat, update_champion } = await c.req.json() // 1:耐久, 2:EN, 3:装甲, 4:運動, 5:索敵
    if (![1, 2, 3, 4, 5].includes(target_stat)) {
      return c.json({ success: false, message: '不正なカスタマイズ項目です。' }, 400)
    }

    const user: any = await c.env.DB.prepare('SELECT * FROM characters WHERE id = ?').bind(payload.id).first()
    if (!user || user.unit_id === 0) return c.json({ success: false, message: 'カスタマイズ可能な機体がありません。' }, 400)

    const unit: any = await c.env.DB.prepare('SELECT price, unit_lv FROM units WHERE id = ?').bind(user.unit_id).first()
    if (!unit) return c.json({ success: false, message: 'Unit not found' }, 404)

    // 原作 custmaise:174-177 — 費用は機体価格（$unit_point）そのもの。失敗時も満額消費。
    if (user.money < (unit.price || 0)) {
      return c.json({ success: false, message: `資金が足りません。（必要: ${unit.price}G）` }, 400)
    }
    const cost = Math.abs(unit.price || 0);

    // アストナージのセリフ（原作 custmaise:136-145。0-3:成功 / 4-7:失敗）
    const framsg = [
      'ほい。できたぜ！',
      'どうだい。すごいだろう？　な？',
      'この調整。最高だよなぁ。',
      'いい感じに仕上がったぜ。',
      'わりぃわりぃ。やっちまった。',
      'ありゃ。うまくいくはずだったんだが。ま、いいよな？　な？',
      '部品の相性が悪かったか・・・。今度、文句いっとくわ。',
      'まぁ、運がなかったという事で丸く収めようや。',
    ];
    let msgrnd = Math.floor(Math.random() * 4);

    let lp = user.unit_custom_lp || 0;
    let koware = 1;
    let isSuccess = true;
    let message = '機体カスタマイズが終了しました。';

    // 失敗判定（原作 anahaim_act.cgi custmaise:169-171 準拠）
    // 「絶対に失敗しない安全カスタム回数」は機体レベルで決まり、それを超えると失敗リスクが発生。
    // 成功回数(lp)が増えるほど失敗確率が上がる（上限45%相当）。
    // 特性: 人間嫌い=失敗しにくくなる／運が悪い=安全回数が減る（式はtraitEffectsに集約）。
    const traitsObj = parseTraits(user.traits);
    const unitLv = unit.unit_lv || 1;

    // chkcstm: 失敗確率の基礎値（人間嫌いで低下）、上限45
    let chkcstm = customizeFailBase(traitsObj, lp);
    if (chkcstm >= 45) chkcstm = 45;
    // 安全カスタム回数の閾値。原作は小数のまま比較するため floor しない。
    const safeThreshold = customizeSafeThreshold(traitsObj, unitLv, 20);

    if (lp >= safeThreshold) {
      // rand の上限も原作は 60 + 人間嫌い/2 を小数のまま使う
      if (Math.floor(Math.random() * customizeFailRandMax(traitsObj)) < chkcstm) {
        koware = -1;
        isSuccess = false;
        msgrnd += 4;
        message = '機体カスタマイズに失敗しました。';
      }
    }

    // ステータス増減処理（原作 custmaise:179-212。対象ステのみクランプ）
    let hp = user.unit_custom_hp, en = user.unit_custom_en;
    let armor = user.unit_custom_armor, mobility = user.unit_custom_mobility, sensor = user.unit_custom_sensor;
    // 原作は耐久/ENカスタム時に現在値（$ktai/$ken）も最大値と同時に±10する。
    // current_hp/en の -1 は「全快」で最大値に追随するためそのままでよい。
    let newCurrentHp = user.current_hp;
    let newCurrentEn = user.current_en;
    if (target_stat === 1) {
      hp += 10 * koware;
      if (hp < 1) hp = 1;
      if (newCurrentHp !== -1) newCurrentHp = Math.max(1, newCurrentHp + 10 * koware);
    } else if (target_stat === 2) {
      en += 10 * koware;
      if (en < 1) en = 1;
      if (newCurrentEn !== -1) newCurrentEn = Math.max(1, newCurrentEn + 10 * koware);
    } else if (target_stat === 3) {
      armor += 2 * koware;
      if (armor < 0) armor = 0;
    } else if (target_stat === 4) {
      mobility += 5 * koware;
      if (mobility < 0) mobility = 0;
    } else if (target_stat === 5) {
      sensor += 5 * koware;
      if (sensor < 0) sensor = 0;
    }

    // lpは成功なら+1、失敗ならそのまま (厳密には原作ではlp++の後失敗時lp--されるため実質変動なし)
    let newLp = isSuccess ? lp + 1 : lp;

    await c.env.DB.prepare(`
      UPDATE characters
      SET money = money - ?,
          unit_custom_hp = ?,
          unit_custom_en = ?,
          unit_custom_armor = ?,
          unit_custom_mobility = ?,
          unit_custom_sensor = ?,
          current_hp = ?,
          current_en = ?,
          unit_custom_lp = ?
      WHERE id = ?
    `).bind(
      cost,
      hp, en, armor, mobility, sensor,
      newCurrentHp, newCurrentEn,
      newLp,
      payload.id
    ).run()

    if (update_champion) {
      await updateChampionSnapshotFull(c.env.DB, payload.id as string);
    }

    return c.json({
      success: true,
      isSuccess, // 改造に成功したかどうか
      message,
      astonaji: framsg[msgrnd],
      cost,
      new_money: user.money - cost,
      new_lp: newLp
    })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 機体カスタム２（原作 anahaim_act.cgi custmaise_2:270-436）
// 能力を1つ下げて別の能力を上げる振替カスタム。装備可能重量を増やせる唯一の手段。
factoryApp.post('/anaheim/customize_2', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    // 1:耐久, 2:EN, 3:装甲, 4:運動, 5:索敵, 6:装備可能重量
    const { noryoku_m, noryoku_s, update_champion } = await c.req.json()
    if (![1, 2, 3, 4, 5, 6].includes(noryoku_m) || ![1, 2, 3, 4, 5, 6].includes(noryoku_s)) {
      return c.json({ success: false, message: 'カスタマイズする項目を選択してください。' }, 400)
    }

    const user: any = await c.env.DB.prepare('SELECT * FROM characters WHERE id = ?').bind(payload.id).first()
    if (!user || user.unit_id === 0) return c.json({ success: false, message: 'カスタマイズ可能な機体がありません。' }, 400)

    const unit: any = await c.env.DB.prepare('SELECT price, unit_lv, max_weight FROM units WHERE id = ?').bind(user.unit_id).first()
    if (!unit) return c.json({ success: false, message: 'Unit not found' }, 404)

    // アストナージのセリフ（原作 custmaise_2:279-288。0-3:成功 / 4-7:失敗）
    const framsg = [
      'こんな感じが好きなのかい？',
      'ま、お茶の子さいさい。簡単だぜ。',
      'この調整。俺ならしないねぇ。',
      'いい感じになったじゃないか。',
      'わりぃわりぃ。しくじった。',
      'うーん。無理があったのかなぁ。',
      'あっ・・・。んー。サラダでも食うか・・・？　奢るよ。',
      'まぁ、運が悪いとこういうこともあるやね。',
    ];
    let msgrnd = Math.floor(Math.random() * 4);

    const traitsObj = parseTraits(user.traits);
    const unitLv = unit.unit_lv || 1;

    let lp = user.unit_custom_lp || 0;
    let koware = 1;
    let isSuccess = true;
    let message = '機体カスタマイズが終了しました。';

    // 失敗判定（原作 custmaise_2:311-315）
    // ※原作では chkcstm = lp - int(人間嫌い/2) が計算されるが未使用（デッドコード）。
    // 閾値超え → 必ず失敗。安全域でも 1/10 で無条件失敗。閾値式はtraitEffectsに集約。
    if (lp >= customizeSafeThreshold(traitsObj, unitLv, 25)) {
      koware = -1;
      isSuccess = false;
      msgrnd += 4;
      message = '機体カスタマイズに失敗しました。';
    } else if (Math.floor(Math.random() * 10) === 0) {
      koware = -1;
      isSuccess = false;
      msgrnd += 4;
      message = '機体カスタマイズに失敗しました。';
    }

    // 金額判定（原作 custmaise_2:317-318 — 費用は機体価格そのもの。失敗時も満額消費）
    if (user.money < (unit.price || 0)) {
      return c.json({ success: false, message: `資金が足りません。（必要: ${unit.price}G）` }, 400)
    }
    const cost = Math.abs(unit.price || 0);

    let hp = user.unit_custom_hp, en = user.unit_custom_en;
    let armor = user.unit_custom_armor, mobility = user.unit_custom_mobility, sensor = user.unit_custom_sensor;
    let weight = (user.unit_custom_weight ?? -1) >= 0 ? user.unit_custom_weight : (unit.max_weight || 0);
    let newCurrentHp = user.current_hp;
    let newCurrentEn = user.current_en;

    // 失敗時は振替なし。費用のみ消費し lp は実質変動なし（原作 custmaise_2:321-384）
    if (koware === 1) {
      // 元減算
      if (noryoku_m === 1) {
        if (hp < 5 + 1) return c.json({ success: false, message: '機体能力が足りません' }, 400)
        hp -= 5;
        if (hp < 1) hp = 1;
        if (newCurrentHp !== -1 && newCurrentHp > hp) newCurrentHp = hp;
      }
      if (noryoku_m === 2) {
        if (en < 5 + 1) return c.json({ success: false, message: '機体能力が足りません' }, 400)
        en -= 5;
        if (en < 1) en = 1;
        if (newCurrentEn !== -1 && newCurrentEn > en) newCurrentEn = en;
      }
      if (noryoku_m === 3) {
        if (armor < 2 + 1) return c.json({ success: false, message: '機体能力が足りません' }, 400)
        armor -= 2;
        if (armor < 0) armor = 0;
      }
      if (noryoku_m === 4) {
        if (mobility < 3 + 1) return c.json({ success: false, message: '機体能力が足りません' }, 400)
        mobility -= 3;
        if (mobility < 0) mobility = 0;
      }
      if (noryoku_m === 5) {
        if (sensor < 3 + 1) return c.json({ success: false, message: '機体能力が足りません' }, 400)
        sensor -= 3;
        if (sensor < 0) sensor = 0;
      }
      if (noryoku_m === 6) {
        if (weight < 1 + 1) return c.json({ success: false, message: '機体能力が足りません' }, 400)
        weight -= 1;
        if (weight < 0) weight = 0;
      }

      // 先増加（耐久/ENは現在値も同時に増える）
      if (noryoku_s === 1) { hp += 5; if (newCurrentHp !== -1) newCurrentHp += 5; }
      if (noryoku_s === 2) { en += 5; if (newCurrentEn !== -1) newCurrentEn += 5; }
      if (noryoku_s === 3) armor += 2;
      if (noryoku_s === 4) mobility += 3;
      if (noryoku_s === 5) sensor += 3;
      if (noryoku_s === 6) weight += 1;
    }

    const newLp = isSuccess ? lp + 1 : lp;
    // 重量に触れないカスタムでは未カスタム状態（-1 = units.max_weight 参照）を維持する
    const newCustomWeight = (noryoku_m === 6 || noryoku_s === 6) ? weight : (user.unit_custom_weight ?? -1);

    await c.env.DB.prepare(`
      UPDATE characters
      SET money = money - ?,
          unit_custom_hp = ?,
          unit_custom_en = ?,
          unit_custom_armor = ?,
          unit_custom_mobility = ?,
          unit_custom_sensor = ?,
          unit_custom_weight = ?,
          current_hp = ?,
          current_en = ?,
          unit_custom_lp = ?
      WHERE id = ?
    `).bind(
      cost,
      hp, en, armor, mobility, sensor,
      newCustomWeight,
      newCurrentHp, newCurrentEn,
      newLp,
      payload.id
    ).run()

    if (update_champion) {
      await updateChampionSnapshotFull(c.env.DB, payload.id as string);
    }

    return c.json({
      success: true,
      isSuccess,
      message,
      astonaji: framsg[msgrnd],
      cost,
      new_money: user.money - cost,
      new_lp: newLp
    })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

factoryApp.post('/anaheim/rename', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { template_id } = await c.req.json()
    if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].includes(template_id)) {
      return c.json({ success: false, message: '不正なテンプレート指定です。' }, 400)
    }

    const user: any = await c.env.DB.prepare(`
      SELECT c.*, u.name as base_unit_name 
      FROM characters c 
      LEFT JOIN units u ON c.unit_id = u.id 
      WHERE c.id = ?
    `).bind(payload.id).first()

    if (!user || user.unit_id === 0) return c.json({ success: false, message: '名称変更可能な機体がありません。' }, 400)

    if ((user.fame || 0) < 10) {
      return c.json({ success: false, message: '名声が足りません（10名声必要）' }, 400)
    }

    // 原作 anahaim_act.cgi senyou:65-73 準拠。マスター機体名に既に「専用」が含まれる場合
    // （例「ティターンズ専用ガンダム」）は最初の「専用」以降を基名として採用し、二重「専用」を避ける。
    // split(/専用/): 「専用」の後ろ(parts[1])があればそれを、無ければ parts[0] を使う。
    const nameParts = String(user.base_unit_name).split('専用')
    let unitName = (nameParts[1] && nameParts[1].length > 0) ? nameParts[1] : nameParts[0]
    const kname = user.chara_name; // キャラクター名

    // テンプレート生成
    let kunitname = '';
    if (template_id === 1) kunitname = `${kname}専用${unitName}`;
    else if (template_id === 2) kunitname = `${unitName}${kname}専用`;
    else if (template_id === 3) kunitname = `${kname}用${unitName}`;
    else if (template_id === 4) kunitname = `${unitName}${kname}カスタム`;
    else if (template_id === 5) kunitname = `${unitName}${kname}チューン`;
    else if (template_id === 6) kunitname = `${kname}仕様${unitName}`;
    else if (template_id === 7) kunitname = `${unitName}${kname}仕様`;
    else if (template_id === 8) kunitname = `${unitName}${kname}${user.level}`;
    else if (template_id === 9) kunitname = `${unitName}${kname}　ＳＰ`;
    else if (template_id === 10) kunitname = `${kname}${unitName}`;
    else if (template_id === 11) kunitname = `${unitName}${kname}`;

    await c.env.DB.prepare(`
      UPDATE characters 
      SET fame = fame - 10, unit_custom_name = ?
      WHERE id = ?
    `).bind(kunitname, payload.id).run()

    return c.json({
      success: true,
      message: '機体名称を変更しました。',
      new_fame: user.fame - 10,
      new_unit_name: kunitname
    })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})
factoryApp.post('/team_seibi', async (c) => { try { const authHeader = c.req.header('Authorization'); if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401); const token = authHeader.split(' ')[1]; const payload = await verify(token, c.env.JWT_SECRET, 'HS256'); if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401); const members = await c.env.DB.prepare('SELECT character_id FROM team_members WHERE owner_id = ?').bind(payload.id).all(); const ids = [payload.id, ...members.results.map((m: any) => m.character_id)]; const placeholders = ids.map(() => '?').join(','); const chars = await c.env.DB.prepare('SELECT c.*, u.name as unit_name, c.unit_custom_hp as unit_base_hp, c.unit_custom_en as unit_base_en FROM characters c LEFT JOIN units u ON c.unit_id = u.id WHERE c.id IN (' + placeholders + ')').bind(...ids).all(); let totalCost = 0; let ownerChar: any = null; for (const user of chars.results as any[]) { if (user.id === payload.id) ownerChar = user; const maxHp = calcMaxHp(user.unit_base_hp, user.status_piloting); const maxEn = calcMaxEn(user.unit_base_en, user.status_piloting); const curHp = user.current_hp === -1 ? maxHp : user.current_hp; const curEn = user.current_en === -1 ? maxEn : user.current_en; if (curHp >= maxHp && curEn >= maxEn) continue; const totalStats = user.status_intuition + user.status_piloting + user.status_short_range + user.status_mid_range + user.status_long_range; let kai_ind = Math.floor((totalStats + user.level * 25) / 250) - 1; if (kai_ind < 0) kai_ind = 0; let kind = kai_ind + 1; if (kind > 11) kind = 11; const klp = user.unit_custom_lp || 0; let kcost = Math.floor((kai_ind + klp / 4) * (kind / 10)); kcost = applyCostDiscount(parseTraits(user.traits), kcost); if (kcost < user.level) kcost = user.level; totalCost += kcost; } if (!ownerChar) return c.json({ success: false, message: 'User not found' }, 404); if (totalCost === 0) return c.json({ success: false, message: '全機体は既に全快です。' }, 400); if (ownerChar.money < totalCost) return c.json({ success: false, message: '資金が足りません。必要: ' + totalCost + 'G' }, 400); await c.env.DB.prepare('UPDATE characters SET money = money - ? WHERE id = ?').bind(totalCost, payload.id).run(); await c.env.DB.prepare('UPDATE characters SET current_hp = -1, current_en = -1 WHERE id IN (' + placeholders + ')').bind(...ids).run(); return c.json({ success: true, message: totalCost + 'G を消費してチームを整備しました！', new_money: ownerChar.money - totalCost }); } catch (e: any) { return c.json({ success: false, message: 'Server Error: ' + e.message }, 500); } });


// winchg(全再取得): 自分が防衛者の 優勝戦(champions)＋個別戦闘(defense_battles) の snapshot を本体から総入れ替え
async function updateChampionSnapshotFull(db: any, userId: string) {
  const champs = await db.prepare('SELECT type, def_hp, def_en FROM champions WHERE champion_id = ?').bind(userId).all();
  const gates = await db.prepare('SELECT id, def_hp, def_en FROM defense_battles WHERE champion_id = ?').bind(userId).all();
  const champRows = (champs.results || []) as any[];
  const gateRows = (gates.results || []) as any[];
  if (champRows.length === 0 && gateRows.length === 0) return;
  const charaFull = await getFullCharacter(db, userId);
  if (!charaFull) return;
  const newMaxHp = calcMaxHp(charaFull.unit_custom_hp, charaFull.status_piloting);
  const newMaxEn = calcMaxEn(charaFull.unit_custom_en, charaFull.status_piloting);
  const snapshotStr = JSON.stringify(charaFull);
  const clamp = (dh: any, de: any): [number, number] => [Math.min(Number(dh) || newMaxHp, newMaxHp), Math.min(Number(de) || newMaxEn, newMaxEn)];
  for (const champ of champRows) {
    const [nh, ne] = clamp(champ.def_hp, champ.def_en);
    await db.prepare('UPDATE champions SET snapshot_data = ?, def_hp = ?, def_en = ?, updated_at = CURRENT_TIMESTAMP WHERE champion_id = ? AND type = ?').bind(snapshotStr, nh, ne, userId, champ.type).run();
  }
  for (const g of gateRows) {
    const [nh, ne] = clamp(g.def_hp, g.def_en);
    await db.prepare('UPDATE defense_battles SET snapshot_data = ?, def_hp = ?, def_en = ? WHERE id = ?').bind(snapshotStr, nh, ne, g.id).run();
  }
}
