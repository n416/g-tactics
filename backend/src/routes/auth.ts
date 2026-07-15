import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import { calcMaxHp, calcMaxEn, applyEquipmentTokusyu } from '../utils/battleEngine'
import { parseTraits } from '../utils/traits'
import { charCost } from '../utils/cost'
import { calcMapl, calcTul } from '../utils/kaisyo'
import { customizeSafeThreshold } from '../utils/traitEffects'
import { tokusyuDisplayName } from '../utils/tokusyuEffects'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const registerSchema = z.object({
  id: z.string(),
  password: z.string(),
  handle_name: z.string(),
  email: z.string().optional(),
  chara_name: z.string(),
  status_intuition: z.number(),
  status_piloting: z.number(),
  status_short_range: z.number(),
  status_mid_range: z.number(),
  status_long_range: z.number(),
  unit_id: z.number().optional()
})

const loginSchema = z.object({
  id: z.string(),
  password: z.string()
})

export const authApp = new Hono<{ Bindings: Bindings }>()

authApp.post('/register', zValidator('json', registerSchema), async (c) => {
  try {
    const { id, password, handle_name, email, chara_name, status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range, unit_id } = c.req.valid('json')

    // 簡易バリデーション: ステータス合計のチェック (最大120)
    const totalPoints = status_intuition + status_piloting + status_short_range + status_mid_range + status_long_range
    if (totalPoints > 120) {
      return c.json({ success: false, message: 'ステータスポイントの合計が上限（120）を超えています' }, 400)
    }

    // パスワードのハッシュ化 (SHA-256: 実際の運用ではbcryptやソルト付きを推奨)
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)

    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const password_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    const initialMoney = 1000
    const initialUnitId = unit_id || 0

    // 提供された37種の特性リスト
    const allTraits = [
      "豪胆", "おおらか", "冷酷", "さわやか", "短気", "熱血", "中途半端", "凡庸", "沈着", "策士",
      "手が早い", "機転が利く", "冷静", "自惚れ屋", "一途", "暴走ぎみ", "しぶとい", "執念深い",
      "気前がいい", "倹約家", "ごうつくばり", "新しものずき", "おとぼけ", "頑丈", "ずうずうしい",
      "器用", "攻撃的", "逃げ腰", "イタズラ好き", "真面目", "けちんぼ", "ナルシスト", "人間嫌い",
      "運が悪い", "お笑い", "おっちょこちょい", "注意深い"
    ]
    const randomTrait = allTraits[Math.floor(Math.random() * allTraits.length)]
    const randomLv = Math.floor(Math.random() * 9) + 1; // 1~9のランダムなレベルを付与
    const traitsJson = JSON.stringify({ [randomTrait]: randomLv })
    // 初期スキル（空）も設定
    const skillsJson = JSON.stringify({})

    await c.env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, email, chara_name, status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range, unit_id, money, traits, skills)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, password_hash, handle_name, email || '', chara_name,
      status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range,
      initialUnitId, initialMoney, traitsJson, skillsJson
    ).run()

    await c.env.DB.prepare(
      `INSERT INTO hangars (user_id, unit_id) VALUES (?, ?)`
    ).bind(id, initialUnitId).run()

    return c.json({ success: true, message: 'キャラクターの作成が完了しました' })
  } catch (e: any) {
    if (e.message.includes('UNIQUE constraint failed')) {
      return c.json({ success: false, message: 'そのIDは既に使用されています' }, 400)
    }
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

authApp.post('/login', zValidator('json', loginSchema), async (c) => {
  try {
    const { id, password } = c.req.valid('json')

    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const password_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    const user: any = await c.env.DB.prepare('SELECT id, password_hash FROM characters WHERE id = ?').bind(id).first()

    if (!user || user.password_hash !== password_hash) {
      return c.json({ success: false, message: 'IDまたはパスワードが間違っています' }, 401)
    }

    const payload = {
      id: user.id,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    }
    const token = await sign(payload, c.env.JWT_SECRET)

    return c.json({ success: true, token })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

authApp.get('/me', async (c) => {
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

    const user: any = await c.env.DB.prepare(`
      SELECT c.id, c.handle_name, c.chara_name, c.status_intuition, c.status_piloting, c.status_short_range, c.status_mid_range, c.status_long_range, c.unit_id, c.money, c.fame, c.exp, c.level, c.created_at, c.current_hp, c.current_en, c.is_admin,
             c.unit_custom_hp, c.unit_custom_en, c.unit_custom_armor, c.unit_custom_mobility, c.unit_custom_sensor, c.unit_custom_lp, c.unit_custom_name,
             c.tactics, c.nt_level, c.awakening_suppressed, c.weapon_id, c.item1_id, c.item2_id, c.traits, c.skills, c.total_battles, c.win_battles,
             c.public_comment, c.katagaki, c.icon, c.team_notify, c.battle_comments,
             c.faction_id, c.faction_role, c.faction_katagaki,
             f.name as faction_name, f.color as faction_color, f.notice as faction_notice,
             u.name as unit_name, u.image as unit_image, u.description as unit_description, u.tokusyu as unit_tokusyu,
             c.unit_kaisyo,
             CASE WHEN c.unit_custom_weight >= 0 THEN c.unit_custom_weight ELSE u.max_weight END as max_weight,
             u.terrain_ground, u.terrain_water, u.terrain_space, u.terrain_air, u.unit_lv,
             w.name as weapon_name, w.power as weapon_power, w.en_cost as weapon_en_cost, w.weight as weapon_weight, w.tokusyu as weapon_tokusyu,
             i1.name as item1_name, i1.weight as item1_weight, i1.tokusyu as item1_tokusyu,
             i2.name as item2_name, i2.weight as item2_weight, i2.tokusyu as item2_tokusyu
      FROM characters c
      LEFT JOIN factions f ON c.faction_id = f.id
      LEFT JOIN units u ON c.unit_id = u.id
      LEFT JOIN items w ON c.weapon_id = w.id
      LEFT JOIN items i1 ON c.item1_id = i1.id
      LEFT JOIN items i2 ON c.item2_id = i2.id
      WHERE c.id = ?
    `).bind(payload.id).first()

    if (!user) {
      return c.json({ success: false, message: 'User not found' }, 404)
    }

    user.max_hp = calcMaxHp(user.unit_custom_hp, user.status_piloting);
    user.max_en = calcMaxEn(user.unit_custom_en, user.status_piloting);
    if (user.current_hp === -1) user.current_hp = user.max_hp;
    if (user.current_en === -1) user.current_en = user.max_en;

    user.max_weight = user.max_weight || 0;
    user.current_weight = (user.weapon_weight || 0) + (user.item1_weight || 0) + (user.item2_weight || 0);
    user.traits = parseTraits(user.traits);
    
    // Calculate cost, idou, kaisyo
    const fakeChar = { ...user };
    applyEquipmentTokusyu(fakeChar);
    const idouBonus = fakeChar.idouBonus || 0;
    user.movement = idouBonus + Math.floor((fakeChar.mobility || 0) / 6 + (user.status_piloting || 0) / 100 + 1);
    user.cost = charCost(user);
    user.max_kaisyo = calcMapl(user.unit_custom_lp, fakeChar.mobility);
    user.max_kaisyo_ex = calcTul(user.unit_lv, fakeChar.mobility);
    // 安全カスタム残回数（通常カスタム base=20）。投影層 customizeSafeThreshold に集約し、
    // フロントは表示するだけ（Anaheim.tsx が特性名 '運が悪い' を生読みしていたのを解消）。
    // 置き換えカスタム(base=25)は現フロントに表示が無いため現状維持で返さない。
    user.remaining_customs = Math.max(0, Math.floor(
      customizeSafeThreshold(user.traits, user.unit_lv || 0, 20) - (user.unit_custom_lp || 0)
    ));

    // 表示名は tokusyuEffects の displayName 面が唯一の正（発動特殊能力欄）。
    // 表示集合は現状維持＝displayName を持つコードのみ（正コードの戦闘中フラグ系は元々非表示）。
    const tokusyuList: string[] = [];
    if (fakeChar.unit_tokusyu) {
      const ids = String(fakeChar.unit_tokusyu).split('##').filter(s => s);
      for (const id of ids) {
        const name = tokusyuDisplayName(Number(id));
        if (name) {
          tokusyuList.push(name);
        } else if (parseInt(id) >= 100) {
          tokusyuList.push('脱出機構');
        } else {
          tokusyuList.push(`未知の能力(${id})`);
        }
      }
    }
    user.active_tokusyu_list = Array.from(new Set(tokusyuList)); // remove duplicates


        let parsedSkills: any = {};
        try {
          parsedSkills = JSON.parse(user.skills || '{}');
        } catch(e) {
        }
        // 生のスキルJSONを別フィールドで保持（Simulator の忘却UI等が {skill名:Lv} を必要とする）。
        // user.skills はこの後 表示用文字列配列に上書きするため、生データはここで退避する。
        user.skills_raw = JSON.stringify(parsedSkills)

        const skillNameMap: Record<string, string> = {
          ground: '地形(地上)', space: '地形(宇宙)', water: '地形(水中)', air: '地形(空中)',
          melee: '格闘', focus_fire: '集中射撃', snipe: '精密射撃', provoke: '挑発',
          focus: '集中', kamikaze: '特攻', recover: '回復', counter: '反撃'
        };

        const skillsArr: string[] = [];
        for (const [k, v] of Object.entries(parsedSkills)) {
          if (k === 'waza') {
            skillsArr.push(`[専用技] ${(v as any).name}`);
          } else {
            const jpName = skillNameMap[k] || k;
            skillsArr.push(`${jpName} LV${v}`);
          }
        }
        user.skills = skillsArr;

        const rankScore = (user.status_intuition || 0) + (user.status_piloting || 0) + (user.status_short_range || 0) + (user.status_mid_range || 0) + (user.status_long_range || 0) + (user.level || 1) * 25 + Math.abs(user.nt_level || 0) * 100;
        const kaiInd = Math.floor(rankScore / 250) - 1;
        const kaikyuList = ['Ｆ-','Ｆ','Ｆ+','Ｅ-','Ｅ','Ｅ+','Ｄ-','Ｄ','Ｄ+','Ｃ-','Ｃ','Ｃ+','Ｂ-','Ｂ','Ｂ+','Ａ-','Ａ','Ａ+','Ｓ-','Ｓ','Ｓ+','ＳＳ-','ＳＳ','ＳＳ+','ＳＳＳ'];
        user.rank = kaikyuList[Math.max(0, Math.min(kaikyuList.length - 1, kaiInd))] || 'ランク不明';
        
        // P47-B3: レベルアップ閾値は原作式 熟練度×500（msvs_ini:584。expは減算式）
        user.next_exp = (user.level || 1) * 500;

        const unreadCount: any = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM private_messages WHERE recipient_id = ? AND is_read = 0`).bind(payload.id).first()
        user.unread_messages = unreadCount?.count || 0

    return c.json({ success: true, user })
  } catch (e: any) {
    console.error('JWT/DB Error:', e)
    return c.json({ success: false, message: 'Unauthorized or Server Error: ' + e.message }, 401)
  }
})

authApp.get('/participants', async (c) => {
  try {
    const threshold = Math.floor(Date.now() / 1000) - 30 * 60; // 30 mins
    const participants: any = await c.env.DB.prepare(`
      SELECT c.id, c.handle_name, f.color as faction_color, u.name as unit_name
      FROM characters c
      LEFT JOIN factions f ON c.faction_id = f.id
      LEFT JOIN units u ON c.unit_id = u.id
      WHERE c.last_battle_at >= ?
      ORDER BY c.last_battle_at DESC
      LIMIT 50
    `).bind(threshold).all();
    return c.json({ success: true, participants: participants.results });
  } catch(e: any) {
    return c.json({ success: false, message: e.message }, 500);
  }
});






