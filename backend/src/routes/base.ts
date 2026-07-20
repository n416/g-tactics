import { Hono } from 'hono'
import { verify } from 'hono/jwt'
import {
  getFacilityUpgradeCost,
  POWER_PLANT_RATES,
  calcPendingIncome,
  getTurretIntercept
} from '../utils/baseFacilities'
import { simulateBattleRound, getFullCharacter, calcMaxHp, calcMaxEn } from '../utils/battleEngine'
import { checkBattleCooldown, touchBattleTime } from '../utils/cooldown'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const baseApp = new Hono<{ Bindings: Bindings }>()

// Helper to check authentication
async function getUserId(c: any): Promise<string | null> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.split(' ')[1]
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    return payload?.id as string || null
  } catch {
    return null
  }
}

baseApp.get('/', async (c) => {
  try {
    const userId = await getUserId(c)
    if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401)

    const base: any = await c.env.DB.prepare('SELECT * FROM user_bases WHERE user_id = ?').bind(userId).first()
    if (!base) {
      return c.json({ success: true, exists: false })
    }

    const facilitiesObj: any = await c.env.DB.prepare('SELECT facility, level FROM user_facilities WHERE user_id = ?').bind(userId).all()
    
    // Default facility levels are 0
    const facilities: Record<string, number> = {
      power: 0,
      dock: 0,
      turret: 0,
      museum: 0,
      factory: 0
    }
    for (const f of facilitiesObj.results) {
      facilities[f.facility] = f.level
    }

    const now = Math.floor(Date.now() / 1000)
    const powerLevel = facilities['power']
    const rate = POWER_PLANT_RATES[powerLevel] || 0
    const pendingIncome = calcPendingIncome(base.power_last_collected_at, now, powerLevel)

    // 防衛サマリの集計
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    const logsRes: any = await c.env.DB.prepare(`
      SELECT id, is_attacker_win, events_json, battle_type, meta_json
      FROM battle_logs 
      WHERE defender_id = ? AND battle_type IN ('gate', 'base') AND created_at >= ?
      ORDER BY id DESC
    `).bind(userId, oneDayAgo).all();

    let baseWinCount = 0;
    let baseLoseCount = 0;
    let baseLatestLogId = null;
    let baseLootLoss = 0;

    let winCount = 0;
    let loseCount = 0;
    let latestLogId = null;
    let latestHasReplay = false;

    if (logsRes && logsRes.results && logsRes.results.length > 0) {
      for (const lg of logsRes.results) {
        if (lg.battle_type === 'gate') {
          if (lg.is_attacker_win) {
            loseCount++;
          } else {
            winCount++;
          }
          if (latestLogId === null) {
            latestLogId = lg.id as number;
            latestHasReplay = lg.events_json != null;
          }
        } else if (lg.battle_type === 'base') {
          if (lg.is_attacker_win) {
            baseLoseCount++;
            try {
              if (lg.meta_json) {
                const meta = JSON.parse(lg.meta_json);
                if (meta.lootPt) baseLootLoss += meta.lootPt;
              }
            } catch (e) {}
          } else {
            baseWinCount++;
          }
          if (baseLatestLogId === null) {
            baseLatestLogId = lg.id as number;
          }
        }
      }
    }

    const defenseBattle: any = await c.env.DB.prepare('SELECT id FROM defense_battles WHERE champion_id = ?').bind(userId).first();
    const hasDefenseBattle = !!defenseBattle;

    const defenseSummary = {
      recentCount: winCount + loseCount,
      winCount,
      loseCount,
      latestLogId,
      latestHasReplay,
      hasDefenseBattle
    };

    let shieldRemainingSec = 0;
    if (base.shield_until > now) {
      shieldRemainingSec = base.shield_until - now;
    }
    const baseBattleSummary = {
      recentCount: baseWinCount + baseLoseCount,
      winCount: baseWinCount,
      loseCount: baseLoseCount,
      lootLoss: baseLootLoss,
      shieldRemainingSec
    };

    return c.json({
      success: true,
      exists: true,
      base: {
        name: base.name,
        terrain: base.terrain,
        power_last_collected_at: base.power_last_collected_at
      },
      facilities,
      pendingIncome,
      rate,
      defenseSummary,
      baseBattleSummary
    })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

baseApp.post('/create', async (c) => {
  try {
    const userId = await getUserId(c)
    if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401)

    const { name, terrain } = await c.req.json()
    if (!name || typeof terrain !== 'number' || !Number.isInteger(terrain) || terrain < 1 || terrain > 5) {
      return c.json({ success: false, message: 'Invalid arguments' }, 400)
    }

    const existing: any = await c.env.DB.prepare('SELECT user_id FROM user_bases WHERE user_id = ?').bind(userId).first()
    if (existing) {
      return c.json({ success: false, message: '既に基地を作成済みです' }, 400)
    }

    const now = Math.floor(Date.now() / 1000)
    await c.env.DB.prepare('INSERT INTO user_bases (user_id, name, terrain, power_last_collected_at) VALUES (?, ?, ?, ?)')
      .bind(userId, name, terrain, now).run()

    return c.json({ success: true, message: '基地を作成しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

baseApp.post('/rename', async (c) => {
  try {
    const userId = await getUserId(c)
    if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401)

    const { name } = await c.req.json()
    if (!name) return c.json({ success: false, message: 'Invalid arguments' }, 400)

    const result = await c.env.DB.prepare('UPDATE user_bases SET name = ? WHERE user_id = ?').bind(name, userId).run()
    if (result.meta.changes === 0) {
      return c.json({ success: false, message: '基地が見つかりません' }, 400)
    }

    return c.json({ success: true, message: '基地名を変更しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

baseApp.post('/terrain', async (c) => {
  try {
    const userId = await getUserId(c)
    if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401)

    const { terrain } = await c.req.json()
    if (typeof terrain !== 'number' || !Number.isInteger(terrain) || terrain < 1 || terrain > 5) {
      return c.json({ success: false, message: 'Invalid arguments' }, 400)
    }

    const existing: any = await c.env.DB.prepare('SELECT user_id FROM user_bases WHERE user_id = ?').bind(userId).first()
    if (!existing) {
      return c.json({ success: false, message: '基地が見つかりません' }, 400)
    }

    const cost = 5000
    const user: any = await c.env.DB.prepare('SELECT money FROM characters WHERE id = ?').bind(userId).first()
    if (!user || user.money < cost) {
      return c.json({ success: false, message: `資金が足りません（必要: ${cost} pt）` }, 400)
    }

    await c.env.DB.prepare('UPDATE characters SET money = money - ? WHERE id = ?').bind(cost, userId).run()
    await c.env.DB.prepare('UPDATE user_bases SET terrain = ? WHERE user_id = ?').bind(terrain, userId).run()

    return c.json({ success: true, message: '基地の地形を変更しました', new_money: user.money - cost })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

baseApp.post('/collect', async (c) => {
  try {
    const userId = await getUserId(c)
    if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401)

    const base: any = await c.env.DB.prepare('SELECT power_last_collected_at FROM user_bases WHERE user_id = ?').bind(userId).first()
    if (!base) return c.json({ success: false, message: '基地が見つかりません' }, 400)

    const facilitiesObj: any = await c.env.DB.prepare('SELECT level FROM user_facilities WHERE user_id = ? AND facility = ?').bind(userId, 'power').first()
    const powerLevel = facilitiesObj ? facilitiesObj.level : 0
    const rate = POWER_PLANT_RATES[powerLevel] || 0
    
    if (rate === 0) {
       return c.json({ success: false, message: '発電所が未建設です' }, 400)
    }

    const now = Math.floor(Date.now() / 1000)
    const pendingIncome = calcPendingIncome(base.power_last_collected_at, now, powerLevel)

    if (pendingIncome <= 0) {
      return c.json({ success: false, message: '回収できる収益がありません' }, 400)
    }

    await c.env.DB.prepare('UPDATE characters SET money = money + ? WHERE id = ?').bind(pendingIncome, userId).run()
    await c.env.DB.prepare('UPDATE user_bases SET power_last_collected_at = ? WHERE user_id = ?').bind(now, userId).run()

    const user: any = await c.env.DB.prepare('SELECT money FROM characters WHERE id = ?').bind(userId).first()

    return c.json({ success: true, message: `${pendingIncome} pt の収益を回収しました`, new_money: user.money })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

baseApp.post('/facility/build', async (c) => {
  try {
    const userId = await getUserId(c)
    if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401)

    const { facility } = await c.req.json()
    if (!['power', 'dock', 'turret', 'museum', 'factory'].includes(facility)) {
      return c.json({ success: false, message: '不正な施設名です' }, 400)
    }

    const existing: any = await c.env.DB.prepare('SELECT level FROM user_facilities WHERE user_id = ? AND facility = ?').bind(userId, facility).first()
    if (existing) {
      return c.json({ success: false, message: '既に建設済みです' }, 400)
    }

    const cost = getFacilityUpgradeCost(facility, 1)
    
    const user: any = await c.env.DB.prepare('SELECT money FROM characters WHERE id = ?').bind(userId).first()
    if (!user || user.money < cost) {
      return c.json({ success: false, message: `資金が足りません（必要: ${cost} pt）` }, 400)
    }

    await c.env.DB.prepare('UPDATE characters SET money = money - ? WHERE id = ?').bind(cost, userId).run()
    await c.env.DB.prepare('INSERT INTO user_facilities (user_id, facility, level) VALUES (?, ?, 1)').bind(userId, facility).run()

    return c.json({ success: true, message: '施設を建設しました', new_money: user.money - cost, new_level: 1 })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

baseApp.post('/facility/upgrade', async (c) => {
  try {
    const userId = await getUserId(c)
    if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401)

    const { facility } = await c.req.json()
    if (!['power', 'dock', 'turret', 'museum', 'factory'].includes(facility)) {
      return c.json({ success: false, message: '不正な施設名です' }, 400)
    }

    const existing: any = await c.env.DB.prepare('SELECT level FROM user_facilities WHERE user_id = ? AND facility = ?').bind(userId, facility).first()
    if (!existing) {
      return c.json({ success: false, message: '未建設です' }, 400)
    }

    const nextLevel = existing.level + 1
    if (nextLevel > 5) {
      return c.json({ success: false, message: '既に最大レベルです' }, 400)
    }

    const cost = getFacilityUpgradeCost(facility, nextLevel)
    
    const user: any = await c.env.DB.prepare('SELECT money FROM characters WHERE id = ?').bind(userId).first()
    if (!user || user.money < cost) {
      return c.json({ success: false, message: `資金が足りません（必要: ${cost} pt）` }, 400)
    }

    await c.env.DB.prepare('UPDATE characters SET money = money - ? WHERE id = ?').bind(cost, userId).run()
    await c.env.DB.prepare('UPDATE user_facilities SET level = ? WHERE user_id = ? AND facility = ?').bind(nextLevel, userId, facility).run()

    return c.json({ success: true, message: '施設を強化しました', new_money: user.money - cost, new_level: nextLevel })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

baseApp.get('/user/:userId', async (c) => {
  try {
    const userId = await getUserId(c)
    if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const targetId = c.req.param('userId')
    
    const target: any = await c.env.DB.prepare('SELECT chara_name FROM characters WHERE id = ?').bind(targetId).first()
    if (!target) return c.json({ success: false, message: 'キャラクターが見つかりません' }, 404)

    const base: any = await c.env.DB.prepare('SELECT name, terrain, shield_until FROM user_bases WHERE user_id = ?').bind(targetId).first()
    if (!base) return c.json({ success: false, message: '相手は基地を設立していません' }, 404)

    const facilitiesObj: any = await c.env.DB.prepare('SELECT facility, level FROM user_facilities WHERE user_id = ?').bind(targetId).all()
    const facilities: Record<string, number> = { power: 0, dock: 0, turret: 0, museum: 0, factory: 0 }
    for (const f of facilitiesObj.results) facilities[f.facility] = f.level

    const now = Math.floor(Date.now() / 1000)
    let canAttack = true
    let reason = ''
    let shieldRemainingSec = 0

    if (userId === targetId) {
      canAttack = false
      reason = '自身の基地は襲撃できません'
    } else if (base.shield_until > now) {
      canAttack = false
      reason = '対象はシールドで保護されています'
      shieldRemainingSec = base.shield_until - now
    } else {
      // 24時間以内の同一対象再襲撃チェック
      const oneDayAgoStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19)
      const recentAttack: any = await c.env.DB.prepare(`
        SELECT id FROM battle_logs
        WHERE attacker_id = ? AND defender_id = ? AND battle_type = 'base' AND created_at >= ?
      `).bind(userId, targetId, oneDayAgoStr).first()
      if (recentAttack) {
        canAttack = false
        reason = '同一基地への襲撃は24時間に1回までです'
      }
    }

    return c.json({
      success: true,
      chara_name: target.chara_name,
      base: {
        name: base.name,
        terrain: base.terrain
      },
      facilities,
      canAttack,
      reason,
      shieldRemainingSec
    })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

baseApp.post('/attack/:userId', async (c) => {
  try {
    const userId = await getUserId(c)
    if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const targetId = c.req.param('userId')

    if (userId === targetId) return c.json({ success: false, message: '自身の基地は襲撃できません' }, 400)

    const base: any = await c.env.DB.prepare('SELECT name, terrain, power_last_collected_at, shield_until FROM user_bases WHERE user_id = ?').bind(targetId).first()
    if (!base) return c.json({ success: false, message: '相手は基地を設立していません' }, 400)

    const now = Math.floor(Date.now() / 1000)
    if (base.shield_until > now) return c.json({ success: false, message: '対象はシールドで保護されています' }, 400)

    const oneDayAgoStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19)
    const recentAttack: any = await c.env.DB.prepare(`
      SELECT id FROM battle_logs
      WHERE attacker_id = ? AND defender_id = ? AND battle_type = 'base' AND created_at >= ?
    `).bind(userId, targetId, oneDayAgoStr).first()
    if (recentAttack) return c.json({ success: false, message: '同一基地への襲撃は24時間に1回までです' }, 400)

    const cdRemain = await checkBattleCooldown(c.env.DB, userId, c.env)
    if (cdRemain !== null) return c.json({ success: false, message: `${cdRemain}秒後闘えるようになります。` }, 400)

    const attacker = await getFullCharacter(c.env.DB, userId)
    const defender = await getFullCharacter(c.env.DB, targetId)
    if (!attacker || !defender) return c.json({ success: false, message: 'キャラクターが見つかりません' }, 400)

    attacker.hp = attacker.hp ?? calcMaxHp(attacker.unit_base_hp, attacker.status_piloting)
    attacker.en = attacker.en ?? calcMaxEn(attacker.unit_base_en, attacker.status_piloting)
    defender.hp = defender.hp ?? calcMaxHp(defender.unit_base_hp, defender.status_piloting)
    defender.en = defender.en ?? calcMaxEn(defender.unit_base_en, defender.status_piloting)

    if (attacker.hp !== null && attacker.hp <= 0) return c.json({ success: false, message: '機体が大破しています。整備を行ってください。' }, 400)

    const facilitiesObj: any = await c.env.DB.prepare('SELECT facility, level FROM user_facilities WHERE user_id = ?').bind(targetId).all()
    const facilities: Record<string, number> = { power: 0, dock: 0, turret: 0, museum: 0, factory: 0 }
    for (const f of facilitiesObj.results) facilities[f.facility] = f.level

    const turretIntercept = getTurretIntercept(facilities.turret)
    const turretDamage = turretIntercept.shots * turretIntercept.damage

    let interceptLogs: string[] = []
    let interceptEvents: any[] = []
    
    if (turretDamage > 0) {
      const actualDamage = Math.min(attacker.hp - 1, turretDamage)
      if (actualDamage > 0) {
        attacker.hp -= actualDamage
        const dmgMsg = `【Turn 0】基地防衛システムの迎撃射撃！ ${attacker.chara_name} に ${actualDamage} のダメージ！`
        interceptLogs.push(dmgMsg)
        interceptEvents.push({
          turn: 0,
          kyori: 0,
          hani: 2,
          messages: [dmgMsg],
          attackerName: '防衛システム',
          defenderName: attacker.chara_name,
          attackerUnit: '基地砲台',
          defenderUnit: attacker.unit_custom_name || attacker.unit_name || '無人機',
          attacker: {
            hp: 100, maxHp: 100, en: 100, maxEn: 100, ammo: 0,
            dmgDealt: actualDamage, hit: true, hitCount: turretIntercept.shots
          },
          defender: {
            hp: attacker.hp, maxHp: calcMaxHp(attacker.unit_base_hp, attacker.status_piloting), en: attacker.en || 10, maxEn: calcMaxEn(attacker.unit_base_en, attacker.status_piloting), ammo: 0,
            dmgDealt: 0, hit: false, hitCount: 0
          }
        })
      }
    }

    const res = simulateBattleRound(attacker, defender, 1, 0, undefined, undefined, base.terrain)
    const win = res.win
    const logs = [...interceptLogs, ...res.logs]
    const events = [...interceptEvents, ...res.events]
    const meta = {
      isSuccess: win,
      attacker: { name: attacker.chara_name, image: attacker.unit_image || 'ms_c_0012.gif', maxHp: calcMaxHp(attacker.unit_base_hp, attacker.status_piloting), maxEn: calcMaxEn(attacker.unit_base_en, attacker.status_piloting) },
      defender: { name: defender.chara_name, image: defender.unit_image || 'ms_c_0012.gif', maxHp: calcMaxHp(defender.unit_base_hp, defender.status_piloting), maxEn: calcMaxEn(defender.unit_base_en, defender.status_piloting) },
      terrain: base.terrain,
      battleType: 'base'
    }

    await touchBattleTime(c.env.DB, userId)

    const powerLevel = facilities.power
    const pendingIncome = calcPendingIncome(base.power_last_collected_at, now, powerLevel)
    let lootPt = 0
    let defensePt = 0
    let resultMessage = ''

    if (win) {
      if (pendingIncome === 0) {
        lootPt = 20
        await c.env.DB.prepare('UPDATE characters SET money = money + ? WHERE id = ?').bind(lootPt, userId).run()
      } else {
        lootPt = Math.floor(pendingIncome * 0.30)
        defensePt = pendingIncome - lootPt
        await c.env.DB.prepare('UPDATE characters SET money = money + ? WHERE id = ?').bind(lootPt, userId).run()
        await c.env.DB.prepare('UPDATE characters SET money = money + ? WHERE id = ?').bind(defensePt, targetId).run()
      }
      await c.env.DB.prepare('UPDATE user_bases SET power_last_collected_at = ? WHERE user_id = ?').bind(now, targetId).run()
      resultMessage = `基地の制圧に成功しました！ ${lootPt} pt の資金を略奪しました。`
    } else {
      await c.env.DB.prepare('UPDATE characters SET money = money + 10, fame = fame + 1 WHERE id = ?').bind(targetId).run()
      resultMessage = `基地の制圧に失敗しました…。`
    }

    const newShieldUntil = now + 8 * 3600
    await c.env.DB.prepare('UPDATE user_bases SET shield_until = ? WHERE user_id = ?').bind(newShieldUntil, targetId).run()

    await c.env.DB.prepare('UPDATE characters SET current_hp = ?, current_en = ? WHERE id = ?').bind(attacker.hp, attacker.en, userId).run()
    await c.env.DB.prepare('UPDATE characters SET current_hp = ?, current_en = ? WHERE id = ?').bind(defender.hp, defender.en, targetId).run()

    const metaExt = { ...meta, lootPt, defensePt }
    const metaStr = JSON.stringify(metaExt)
    const eventsStr = JSON.stringify(events)
    const insertResult: any = await c.env.DB.prepare(`
      INSERT INTO battle_logs (attacker_id, defender_id, is_attacker_win, log_text, events_json, meta_json, battle_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'base', CURRENT_TIMESTAMP)
    `).bind(userId, targetId, win ? 1 : 0, logs.join('\n'), eventsStr, metaStr).run()
    const battleLogId = insertResult.meta.last_row_id

    const privateMsg = win
      ? `【基地襲撃】あなたの基地が ${attacker.chara_name} に襲撃され制圧されました。${pendingIncome === 0 ? '（強制精算は行われませんでした）' : `未回収資金が強制精算され、${lootPt} pt を略奪されました（残り ${defensePt} pt はあなたの資金に加算されました）。`}基地は8時間シールドで保護されます。`
      : `【基地防衛成功】あなたの基地が ${attacker.chara_name} の襲撃を撃退しました！防衛報酬として 10 pt と名声を獲得しました。基地は8時間シールドで保護されます。`;
    await c.env.DB.prepare(`INSERT INTO private_messages (sender_id, recipient_id, message) VALUES (?, ?, ?)`).bind(userId, targetId, privateMsg).run()

    return c.json({ success: true, message: resultMessage + '\n(詳細は伝言ボックスをご確認ください)', battleLogId })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})
