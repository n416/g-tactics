import { Hono } from 'hono'
import { verify } from 'hono/jwt'
import { simulateBattleRound, calcMaxHp, calcMaxEn } from '../utils/battleEngine'
import { skillList, skillNameMap, tryLearnSkillAndNt, calcBattleExp, applyLevelUp } from '../utils/battleRewards'
import { checkBattleCooldown, touchBattleTime } from '../utils/cooldown'
import { npcEnemies } from '../data/enemies';
import { calcMapl, calcTul, gainKaisyo } from '../utils/kaisyo';

type Bindings = {
  DB: any
  JWT_SECRET: string
}

export const battleApp = new Hono<{ Bindings: Bindings }>()

battleApp.get('/targets', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'No token provided' }, 401)

    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch (err) {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const targets = await c.env.DB.prepare(
      `SELECT c.id, c.handle_name, u.name as unit_name 
       FROM characters c 
       LEFT JOIN units u ON c.unit_id = u.id 
       WHERE c.id != ? 
       ORDER BY c.handle_name ASC`
    ).bind(payload.id).all()

    return c.json({ success: true, targets: targets.results || [] })
  } catch (err) {
    console.error(err)
    return c.json({ success: false, message: '通信エラーが発生しました' }, 500)
  }
})


battleApp.post('/simulator', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'No token provided' }, 401)

    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch (err) {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const { target_user_id, terrain } = await c.req.json()

    // target_user_id は必須ではなく、無い場合はNPC戦とする
    if (target_user_id && payload.id === target_user_id) return c.json({ success: false, message: '自分自身とは戦えません' }, 400)

    // P32: 戦闘クールダウン（原作 msvs.cgi:100-109「○秒後闘えるようになります」）
    // ローカルで無効化したい場合は .dev.vars に BATTLE_COOLDOWN_SECONDS=0 を設定する
    const cdRemain = await checkBattleCooldown(c.env.DB, payload.id, c.env)
    if (cdRemain !== null) return c.json({ success: false, message: `${cdRemain}秒後闘えるようになります。` }, 400)

    const attacker: any = await c.env.DB.prepare(
      `SELECT c.*, u.name as unit_name, u.image as unit_image, c.unit_custom_hp as unit_base_hp, c.unit_custom_en as unit_base_en, c.unit_custom_armor as armor, c.unit_custom_mobility as mobility, c.unit_custom_sensor as sensor,
              u.terrain_ground, u.terrain_water, u.terrain_space, u.terrain_air,
              u.tokusyu as unit_tokusyu, u.unit_lv,
              CASE WHEN c.unit_custom_weight >= 0 THEN c.unit_custom_weight ELSE u.max_weight END as max_weight,
              u.req_nt_level,
              w.name as weapon_name, w.item_type as weapon_type, w.power as weapon_power, w.ammo as weapon_ammo, w.en_cost as weapon_en_cost,
              w.range_min as weapon_range_min, w.range_max as weapon_range_max,
              w.hit_count as weapon_hit_count, w.raw_syurui as weapon_raw_syurui, w.raw_hani as weapon_raw_hani,
              w.range_short as w_range_short, w.range_mid as w_range_mid, w.range_long as w_range_long,
              w.tokusyu as weapon_tokusyu, w.weight as weapon_weight,
              i1.name as item1_name, i1.item_type as item1_type, i1.special_flags as item1_flags,
              i1.tokusyu as item1_tokusyu, i1.weight as item1_weight, i1.raw_syurui as item1_raw_syurui, i1.raw_hani as item1_raw_hani,
              i2.name as item2_name, i2.item_type as item2_type, i2.special_flags as item2_flags,
              i2.tokusyu as item2_tokusyu, i2.weight as item2_weight, i2.raw_hani as item2_raw_hani
       FROM characters c 
       LEFT JOIN units u ON c.unit_id = u.id 
       LEFT JOIN items w ON c.weapon_id = w.id
       LEFT JOIN items i1 ON c.item1_id = i1.id
       LEFT JOIN items i2 ON c.item2_id = i2.id
       WHERE c.id = ?`
    ).bind(payload.id).first()

    if (!attacker) return c.json({ success: false, message: 'キャラクターが見つかりません' }, 404)

    let defender: any;
    
    if (target_user_id) {
      defender = await c.env.DB.prepare(
        `SELECT c.*, u.name as unit_name, u.image as unit_image, c.unit_custom_hp as unit_base_hp, c.unit_custom_en as unit_base_en, c.unit_custom_armor as armor, c.unit_custom_mobility as mobility, c.unit_custom_sensor as sensor,
                u.terrain_ground, u.terrain_water, u.terrain_space, u.terrain_air,
                u.tokusyu as unit_tokusyu, u.unit_lv,
                CASE WHEN c.unit_custom_weight >= 0 THEN c.unit_custom_weight ELSE u.max_weight END as max_weight,
                u.req_nt_level,
                w.name as weapon_name, w.item_type as weapon_type, w.power as weapon_power, w.ammo as weapon_ammo, w.en_cost as weapon_en_cost,
                w.range_min as weapon_range_min, w.range_max as weapon_range_max,
                w.hit_count as weapon_hit_count, w.raw_syurui as weapon_raw_syurui, w.raw_hani as weapon_raw_hani,
                w.range_short as w_range_short, w.range_mid as w_range_mid, w.range_long as w_range_long,
                w.tokusyu as weapon_tokusyu, w.weight as weapon_weight,
                i1.name as item1_name, i1.item_type as item1_type, i1.special_flags as item1_flags,
                i1.tokusyu as item1_tokusyu, i1.weight as item1_weight, i1.raw_syurui as item1_raw_syurui, i1.raw_hani as item1_raw_hani,
                i2.name as item2_name, i2.item_type as item2_type, i2.special_flags as item2_flags,
                i2.tokusyu as item2_tokusyu, i2.weight as item2_weight, i2.raw_hani as item2_raw_hani
         FROM characters c 
         LEFT JOIN units u ON c.unit_id = u.id 
         LEFT JOIN items w ON c.weapon_id = w.id
         LEFT JOIN items i1 ON c.item1_id = i1.id
         LEFT JOIN items i2 ON c.item2_id = i2.id
         WHERE c.id = ?`
      ).bind(target_user_id).first()
      
      if (!defender) return c.json({ success: false, message: '標的のキャラクターが見つかりません' }, 404)
    } else {
      // NPC生成ロジック（原作 enemy_ini.cgi のリストから選出。
      // 第2フィールドは武器IDではなく「機体ID」= unit_ini の id と全件一致することを照合済み）
      const randomEnemyDef: any = npcEnemies[Math.floor(Math.random() * npcEnemies.length)];

      const npcUnit = await c.env.DB.prepare(
        `SELECT * FROM units WHERE id = ? LIMIT 1`
      ).bind(randomEnemyDef.unitId).first() || await c.env.DB.prepare(
        `SELECT * FROM units WHERE name = ? LIMIT 1`
      ).bind(randomEnemyDef.unitName).first() || await c.env.DB.prepare(
        `SELECT * FROM units ORDER BY RANDOM() LIMIT 1`
      ).first();

      const npcWeapon = await c.env.DB.prepare(
        `SELECT * FROM items WHERE item_type BETWEEN 1 AND 5 ORDER BY RANDOM() LIMIT 1`
      ).first() || { name: 'ビーム・ライフル', item_type: 3, power: 30, ammo: 10, en_cost: 10, range_short: 1, range_mid: 1, range_long: 0, tokusyu: '', weight: 10 };

      const baseLevel = Math.max(1, attacker.level + Math.floor(Math.random() * 5) - 2); 
      const statusBase = baseLevel * 5;

      defender = {
        id: 'npc_sim_' + Math.random().toString(36).substring(7),
        handle_name: 'NPC',
        chara_name: randomEnemyDef.pilotName || '一般兵',
        level: baseLevel,
        exp: 0,
        money: 0,
        fame: 0,
        skills: '{}',
        nt_level: npcUnit.req_nt_level || 0,
        status_intuition: statusBase + Math.floor(Math.random() * 10),
        status_piloting: statusBase + Math.floor(Math.random() * 10),
        status_short_range: statusBase + Math.floor(Math.random() * 10),
        status_mid_range: statusBase + Math.floor(Math.random() * 10),
        status_long_range: statusBase + Math.floor(Math.random() * 10),
        tactics: '00', // 戦術なし（P31形式=2桁文字列）
        traits: '{}',
        item2_id: 0,
        quotes: randomEnemyDef.quotes || [],
        unit_name: randomEnemyDef.unitName || npcUnit.name,
        unit_image: npcUnit.image,
        unit_base_hp: randomEnemyDef.hp || npcUnit.hp,
        unit_base_en: randomEnemyDef.en || npcUnit.en,
        unit_base_armor: randomEnemyDef.armor || npcUnit.armor,
        unit_base_mobility: randomEnemyDef.mobility || npcUnit.mobility,
        sensor: npcUnit.sensor,
        terrain_ground: npcUnit.terrain_ground,
        terrain_water: npcUnit.terrain_water,
        terrain_space: npcUnit.terrain_space,
        terrain_air: npcUnit.terrain_air,
        unit_tokusyu: npcUnit.tokusyu,
        max_weight: npcUnit.max_weight,
        req_nt_level: npcUnit.req_nt_level,
        weapon_id: npcWeapon.id || 1,
        weapon_name: npcWeapon.name,
        weapon_type: npcWeapon.item_type,
        weapon_power: npcWeapon.power,
        weapon_ammo: npcWeapon.ammo,
        weapon_en_cost: npcWeapon.en_cost,
        weapon_range_min: npcWeapon.range_min,
        weapon_range_max: npcWeapon.range_max,
        weapon_hit_count: npcWeapon.hit_count,
        weapon_raw_syurui: npcWeapon.raw_syurui,
        w_range_short: npcWeapon.range_short,
        w_range_mid: npcWeapon.range_mid,
        w_range_long: npcWeapon.range_long,
        unit_lv: npcUnit.unit_lv || 1,
        weapon_tokusyu: npcWeapon.tokusyu,
        weapon_weight: npcWeapon.weight,
        item1_name: null, item1_type: null, item1_flags: null, item1_tokusyu: null, item1_weight: 0,
        item2_name: null, item2_type: null, item2_flags: null, item2_tokusyu: null, item2_weight: 0,
        current_hp: -1,
        current_en: -1
      };
    }

    const attachItemObjects = (char: any) => {
      char.item1 = { name: char.item1_name, item_type: char.item1_type, special_flags: char.item1_flags };
      char.item2 = { name: char.item2_name, item_type: char.item2_type, special_flags: char.item2_flags };
    };
    attachItemObjects(attacker);
    attachItemObjects(defender);

    attacker.maxHp = calcMaxHp(attacker.unit_base_hp, attacker.status_piloting);
    attacker.hp = (attacker.current_hp === -1 || attacker.current_hp == null) ? attacker.maxHp : attacker.current_hp;
    attacker.en = (attacker.current_en === -1 || attacker.current_en == null) ? calcMaxEn(attacker.unit_base_en, attacker.status_piloting) : attacker.current_en;

    defender.maxHp = calcMaxHp(defender.unit_base_hp, defender.status_piloting);
    defender.hp = (defender.current_hp === -1 || defender.current_hp == null) ? defender.maxHp : defender.current_hp;
    defender.en = (defender.current_en === -1 || defender.current_en == null) ? calcMaxEn(defender.unit_base_en, defender.status_piloting) : defender.current_en;

    if (attacker.hp <= 0) return c.json({ success: false, message: '機体が大破しています。整備を行ってください。' }, 400);
    if (attacker.en < 15) return c.json({ success: false, message: 'ENが不足しています。整備を行ってください。' }, 400);
    if (defender.hp <= 0) return c.json({ success: false, message: '標的の機体は既に大破しています。' }, 400);

    let initialLogs: string[] = [];
    initialLogs.push(`=== 模擬戦開始 ===`);
    initialLogs.push(`[${attacker.handle_name}] ${attacker.unit_name || '無人機'} VS [${defender.handle_name}] ${defender.unit_name || '無人機'}`);
    initialLogs.push(`---------------------------------`);

    // P31: 戦術は characters.tactics（事前設定）を simulateBattleRound 内部で参照する。
    // 従来ここで tactics を round 引数の位置に渡していた誤配線を修正
    const result = simulateBattleRound(attacker, defender, 1, 0, undefined, undefined, terrain || 1);
    
    const logs = [...initialLogs, ...result.logs];
    const events = result.events;
    attacker.hp = result.attackerHp;
    defender.hp = result.defenderHp;

    // P47: 勝敗はエンジンの原作判定（撃墜 or 30T満了時HP比較。battlelib:1262-1280）
    const isSuccess = result.win;

    const isNpc = defender.id.startsWith('npc_') || defender.id.startsWith('NPC');
    // 原作の戦闘種別: 対人シミュレーター(vschar)=2 / NPC模擬戦(simulator)=3
    const syurui = isNpc ? 3 : 2;

    // P47-B3: 経験値は原作式（battlelib:1317-1400。対人シミュも原作どおり経験値あり。
    // NPC勝利式は原作欠落のため syurui=2 式を流用【仮定・台帳§15】）
    const rewardMoney = 0;  // 模擬戦に賞金なし（gold処理は battle.cgi 固有＝優勝戦/個別戦闘のみ）
    const rewardExp = calcBattleExp(isSuccess, syurui, attacker.level,
      { level: defender.level, unit_lv: defender.unit_lv, lp: defender.unit_custom_lp }, 0);

    logs.push(`---------------------------------`);
    logs.push(`【勝敗】 ${attacker.handle_name} の${isSuccess ? '勝利！' : '敗北...'}`);
    logs.push(`【戦果】 ${rewardExp}EXP を獲得。(模擬戦のため賞金・名声は増えません)`);

    // レベルアップ（battlelib:1456-1485。武器/装備の成長ボーナス込み）
    const weaponHani = parseInt(attacker.weapon_raw_hani, 10) || 0;
    const itemHani = parseInt(attacker.item1_raw_hani, 10) || parseInt(attacker.item2_raw_hani, 10) || 0;
    const lvRes = applyLevelUp(attacker, rewardExp, syurui, weaponHani, itemHani, logs);
    const newExp = lvRes.exp;
    const newLevel = lvRes.level;
    const newMoney = attacker.money;
    for (const [col, amount] of Object.entries(lvRes.statGains)) {
      await c.env.DB.prepare(`UPDATE characters SET ${col} = ${col} + ? WHERE id = ?`).bind(amount, attacker.id).run();
    }

    // スキル取得・NT覚醒（battlelib:1333-1358/1403-1427。確率は 1/(50×種別) 等）
    const learnResult = tryLearnSkillAndNt(attacker.skills, isSuccess, attacker.nt_level, logs, syurui, false);
    const newSkillsJson = learnResult.newSkillsJson;
    const newNtLevel = learnResult.newNtLevel;
    const requiresSkillForget = learnResult.requiresSkillForget;

    // 機熟増加（battlelib.pl:1538-1542。シミュ系= rand(キャラLv)<10 で+1）
    const newUnitKaisyo = gainKaisyo(
      attacker.unit_kaisyo || 0,
      calcMapl(attacker.unit_custom_lp, attacker.mobility),
      calcTul(attacker.unit_lv || 1, attacker.mobility),
      false,
      newLevel
    );

    await c.env.DB.prepare(`UPDATE characters SET exp = ?, level = ?, current_hp = ?, current_en = ?, skills = ?, nt_level = ?, unit_kaisyo = ? WHERE id = ?`)
      .bind(newExp, newLevel, attacker.current_hp, Math.max(0, attacker.en - 15), newSkillsJson, newNtLevel, newUnitKaisyo, attacker.id).run()

    await c.env.DB.prepare(`INSERT INTO battle_logs (attacker_id, defender_id, is_attacker_win, log_text, battle_type) VALUES (?, ?, ?, ?, ?)`)
      .bind(attacker.id, defender.id, isSuccess ? 1 : 0, logs.join('\n'), isNpc ? 'simulator' : 'vschar').run()

    await touchBattleTime(c.env.DB, attacker.id)

    return c.json({
      success: true, result: isSuccess, message: logs.join('\n'), events: events,
      requiresSkillForget,
      meta: { attackerName: attacker.chara_name || attacker.handle_name, defenderName: defender.chara_name || defender.handle_name, attackerUnit: attacker.unit_name || '無人機', defenderUnit: defender.unit_name || '無人機', attackerImage: attacker.unit_image || null, defenderImage: defender.unit_image || null, rewardMoney, rewardExp, isSuccess },
      new_money: newMoney, new_exp: newExp, new_level: newLevel, level_up: newLevel > attacker.level
    })

  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

battleApp.post('/forget-skill', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'No token provided' }, 401)
    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch (err) {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const { skill_name } = await c.req.json()
    if (!skillList.includes(skill_name)) {
      return c.json({ success: false, message: '無効なスキルです。' }, 400)
    }

    const user: any = await c.env.DB.prepare(`SELECT skills FROM characters WHERE id = ?`).bind(payload.id).first()
    if (!user) return c.json({ success: false, message: 'User not found' }, 404)

    let skillsObj: any = {}
    try {
      skillsObj = JSON.parse(user.skills || '{}')
    } catch (e) {
      skillsObj = {}
    }

    if (!skillsObj[skill_name] || skillsObj[skill_name] <= 0) {
      return c.json({ success: false, message: 'そのスキルは持っていません。' }, 400)
    }

    skillsObj[skill_name] -= 1;
    if (skillsObj[skill_name] <= 0) {
      delete skillsObj[skill_name];
    }

    const newSkillsJson = JSON.stringify(skillsObj)
    
    await c.env.DB.prepare(`UPDATE characters SET skills = ? WHERE id = ?`).bind(newSkillsJson, payload.id).run()

    return c.json({ success: true, message: `${skillNameMap[skill_name]} を1つ忘れました。` })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})


battleApp.post('/debug', async (c) => {
  try {
    const { attacker, defender, attackerWeapon, defenderWeapon, terrain } = await c.req.json()

    if (!attacker || !defender) {
      return c.json({ success: false, message: 'Attacker and Defender data required' }, 400)
    }

    attacker.maxHp = calcMaxHp(attacker.unit_base_hp || 100, attacker.status_piloting || 10);
    attacker.hp = attacker.maxHp;
    attacker.en = calcMaxEn(attacker.unit_base_en || 100, attacker.status_piloting || 10);

    defender.maxHp = calcMaxHp(defender.unit_base_hp || 100, defender.status_piloting || 10);
    defender.hp = defender.maxHp;
    defender.en = calcMaxEn(defender.unit_base_en || 100, defender.status_piloting || 10);

    let initialLogs: string[] = [];
    initialLogs.push(`=== 模擬戦開始 (デバッグ) ===`);
    initialLogs.push(`[${attacker.handle_name}] ${attacker.unit_name} VS [${defender.handle_name}] ${defender.unit_name}`);
    initialLogs.push(`---------------------------------`);

    const result = simulateBattleRound(attacker, defender, 1, 0, attackerWeapon, defenderWeapon, terrain || 1);
    
    const logs = [...initialLogs, ...result.logs];
    const events = result.events;
    
    const isSuccess = result.attackerHp > result.defenderHp;

    return c.json({
      success: true,
      result: isSuccess,
      message: logs.join('\n'),
      events: events,
      meta: { 
        attackerName: attacker.handle_name, 
        defenderName: defender.handle_name, 
        attackerUnit: attacker.unit_name, 
        defenderUnit: defender.unit_name, 
        rewardMoney: 0, 
        rewardExp: 0, 
        isSuccess 
      }
    });

  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

battleApp.get('/logs', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { results } = await c.env.DB.prepare(
      `SELECT b.id, b.is_attacker_win, b.created_at, b.log_text, c.handle_name as attacker_name 
       FROM battle_logs b
       JOIN characters c ON b.attacker_id = c.id
       WHERE b.defender_id = ?
       ORDER BY b.created_at DESC
       LIMIT 20`
    ).bind(payload.id).all()

    return c.json({ success: true, logs: results })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})
