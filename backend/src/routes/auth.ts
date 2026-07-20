import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import { calcMaxHp, calcMaxEn, applyEquipmentTokusyu } from '../utils/battleEngine'
import { parseTraits } from '../utils/traits'
import { charCost } from '../utils/cost'
import { calcMapl, calcTul } from '../utils/kaisyo'
import { customizeSafeThreshold } from '../utils/traitEffects'
import { tokusyuDisplayName } from '../utils/tokusyuEffects'
import { recordUnitObtained } from '../utils/unitStats'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
  /** Google OAuth。CLIENT_ID は公開情報で wrangler.jsonc の vars、SECRET は wrangler secret */
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  /** ブラウザから見たこのアプリの origin。ローカルのみ .dev.vars で指定する（詳細は utils/googleAuth.ts） */
  PUBLIC_ORIGIN?: string
}

import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { rollStarterUnit, verifyRollToken, MAX_REROLLS, STARTER_UNIT_IDS } from '../utils/starterRoll'
import { hashPassword, verifyPassword } from '../utils/password'
import { buildAuthUrl, verifyState, exchangeCodeForSub, signSignupToken, verifySignupToken } from '../utils/googleAuth'

const MAX_TOTAL_POINTS = 120
const MAX_STAT_POINTS = 70

const registerSchema = z.object({
  id: z.string().min(4).max(32),
  // パスワードと Google 連携のどちらか一方があればよい（下の refine で担保）
  password: z.string().min(4).max(128).optional(),
  /** Google 認証後に発行される署名済みトークン。中に google_sub が入っている */
  google_token: z.string().optional(),
  handle_name: z.string().min(1).max(32),
  chara_name: z.string().min(1).max(32),
  status_intuition: z.number().int().min(0).max(MAX_STAT_POINTS),
  status_piloting: z.number().int().min(0).max(MAX_STAT_POINTS),
  status_short_range: z.number().int().min(0).max(MAX_STAT_POINTS),
  status_mid_range: z.number().int().min(0).max(MAX_STAT_POINTS),
  status_long_range: z.number().int().min(0).max(MAX_STAT_POINTS),
  // 初期機体はサーバーが抽選して署名したトークンでのみ受け付ける。
  // 以前は unit_id を無検証で受けていたため、任意の機体で登録できた。
  roll_token: z.string()
}).refine((d) => !!d.password || !!d.google_token, {
  message: 'パスワード、または Google アカウントのどちらかが必要です',
  path: ['password'],
})

const rollSchema = z.object({
  /** 直前の抽選トークン。未指定なら初回の抽選 */
  token: z.string().optional()
})

const loginSchema = z.object({
  id: z.string(),
  password: z.string()
})

export const authApp = new Hono<{ Bindings: Bindings }>()

/** 初期機体プールの一覧。ルーレットの「回転中」の絵を本物にするためにフロントへ渡す。
 *
 * プールの中身は秘密ではない（知られても抽選結果は選べない）ので公開してよい。
 * 抽選の正当性はサーバー署名が担保しており、この一覧には依存しない。 */
authApp.get('/register/pool', async (c) => {
  try {
    const placeholders = STARTER_UNIT_IDS.map(() => '?').join(',')
    const units = await c.env.DB.prepare(
      `SELECT id, name, image FROM units WHERE id IN (${placeholders})`
    ).bind(...STARTER_UNIT_IDS).all()
    return c.json({ success: true, units: units.results })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

/** 初期機体の抽選（ルーレット）。結果はサーバーが署名して返す。 */
authApp.post('/register/roll', zValidator('json', rollSchema), async (c) => {
  try {
    const { token } = c.req.valid('json')
    const result = await rollStarterUnit(c.env.JWT_SECRET, token)

    if (!result) {
      return c.json(
        { success: false, message: `引き直せるのは${MAX_REROLLS}回までです` },
        429
      )
    }

    // 表示に必要な機体情報を添えて返す（フロントが units を持たないため）
    const unit: any = await c.env.DB.prepare(
      `SELECT id, name, description, image, hp, en, armor, mobility, sensor,
              req_intuition, req_piloting, req_short_range, req_mid_range, req_long_range
       FROM units WHERE id = ?`
    ).bind(result.unit_id).first()

    if (!unit) {
      return c.json({ success: false, message: '機体データが見つかりません' }, 500)
    }

    return c.json({
      success: true,
      unit,
      rerolls_left: result.rerolls_left,
      token: result.token
    })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

authApp.post('/register', zValidator('json', registerSchema), async (c) => {
  try {
    const { id, password, google_token, handle_name, chara_name, status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range, roll_token } = c.req.valid('json')

    // 簡易バリデーション: ステータス合計のチェック (最大120)
    const totalPoints = status_intuition + status_piloting + status_short_range + status_mid_range + status_long_range
    if (totalPoints > MAX_TOTAL_POINTS) {
      return c.json({ success: false, message: `ステータスポイントの合計が上限（${MAX_TOTAL_POINTS}）を超えています` }, 400)
    }

    // 初期機体はサーバーが署名した抽選結果からのみ決まる。クライアントの申告は受け付けない。
    const initialUnitId = await verifyRollToken(c.env.JWT_SECRET, roll_token)
    if (initialUnitId === null) {
      return c.json({ success: false, message: '機体の抽選結果が無効です。引き直してください' }, 400)
    }

    // 引いた機体の搭乗条件を満たしているか。フロント側でも自動充足するが、
    // ここが最後の砦（フロントを通さない直接POSTを防ぐ）。
    const unit: any = await c.env.DB.prepare(
      `SELECT name, req_intuition, req_piloting, req_short_range, req_mid_range, req_long_range
       FROM units WHERE id = ?`
    ).bind(initialUnitId).first()

    if (!unit) {
      return c.json({ success: false, message: '機体データが見つかりません' }, 500)
    }

    const shortfall = [
      ['直感', unit.req_intuition, status_intuition],
      ['操縦', unit.req_piloting, status_piloting],
      ['近距離', unit.req_short_range, status_short_range],
      ['中距離', unit.req_mid_range, status_mid_range],
      ['遠距離', unit.req_long_range, status_long_range],
    ].find(([, req, got]) => (got as number) < (req as number))

    if (shortfall) {
      const [label, req] = shortfall
      return c.json(
        { success: false, message: `${unit.name} の搭乗には【${label}${req}】が必要です` },
        400
      )
    }

    // Google で登録する場合はパスワードを持たない。
    // password_hash には '' を入れる（NOT NULL 制約のため）。verifyPassword('') は必ず false を
    // 返すので、この行はパスワードでのログインが構造的に不可能になる。
    let google_sub: string | null = null
    if (google_token) {
      google_sub = await verifySignupToken(c.env.JWT_SECRET, google_token)
      if (!google_sub) {
        return c.json({ success: false, message: 'Google 認証の有効期限が切れました。やり直してください' }, 400)
      }
      const taken: any = await c.env.DB.prepare('SELECT id FROM characters WHERE google_sub = ?').bind(google_sub).first()
      if (taken) {
        return c.json({ success: false, message: 'この Google アカウントは既に別のキャラクターで使われています' }, 400)
      }
    }
    const password_hash = password ? await hashPassword(password) : ''

    const initialMoney = 1000

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

    // email は登録時に収集していたが、どこからも読まれない書き込み専用の死にカラムだった。
    // 収集をやめる。列自体は破壊的変更を避けるため残してある（NULL になる）。
    await c.env.DB.prepare(
      `INSERT INTO characters (id, password_hash, google_sub, handle_name, chara_name, status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range, unit_id, money, traits, skills)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, password_hash, google_sub, handle_name, chara_name,
      status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range,
      initialUnitId, initialMoney, traitsJson, skillsJson
    ).run()

    await c.env.DB.prepare(
      `INSERT INTO hangars (user_id, unit_id) VALUES (?, ?)`
    ).bind(id, initialUnitId).run()

    await recordUnitObtained(c.env.DB, id, initialUnitId)

    // 登録した時点でログイン済みにする。
    // 以前はここでトークンを返さず、フロントがログイン画面へ送り返していた。
    // パスワード経路なら「今打ったパスワードをもう一度打たせる」ことになり、
    // Google 経路に至っては「今認証したばかりの Google をもう一往復させる」ことになる。
    // 本人確認はこの時点で済んでいるので、そのまま入れてよい。
    const token = await sign(
      { id, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
      c.env.JWT_SECRET
    )

    return c.json({ success: true, message: 'キャラクターの作成が完了しました', token })
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

    const user: any = await c.env.DB.prepare('SELECT id, password_hash FROM characters WHERE id = ?').bind(id).first()

    if (!user) {
      return c.json({ success: false, message: 'IDまたはパスワードが間違っています' }, 401)
    }

    const { ok, needsUpgrade } = await verifyPassword(user.password_hash, password)
    if (!ok) {
      return c.json({ success: false, message: 'IDまたはパスワードが間違っています' }, 401)
    }

    // 旧方式（ソルト無し SHA-256）で保存されていた行を、認証に成功したこの瞬間だけ
    // 新方式へ書き換える。平文が手元にあるのはここだけなので、ここでしか移行できない。
    // 失敗してもログイン自体は通す（次回のログインでまた試行される）。
    if (needsUpgrade) {
      try {
        const upgraded = await hashPassword(password)
        await c.env.DB.prepare('UPDATE characters SET password_hash = ? WHERE id = ?')
          .bind(upgraded, user.id).run()
      } catch (e) {
        console.error('password rehash failed:', e)
      }
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

        // Google 連携の有無だけを返す。sub 自体は識別子なのでフロントには渡さない。
        // has_password が false なら Google のみ、google_linked が false ならパスワードのみ。
        const auth: any = await c.env.DB.prepare(
          `SELECT google_sub, password_hash FROM characters WHERE id = ?`
        ).bind(payload.id).first()
        user.google_linked = !!auth?.google_sub
        user.has_password = !!auth?.password_hash

    return c.json({ success: true, user })
  } catch (e: any) {
    console.error('JWT/DB Error:', e)
    return c.json({ success: false, message: 'Unauthorized or Server Error: ' + e.message }, 401)
  }
})

/* ============================================================
 * Google アカウント連携
 *
 * ブラウザへの応答は全て /auth/google へのリダイレクトで、結果はURLのハッシュに載せる。
 * ハッシュはサーバーにも Referer にも送られないため、トークンをクエリ文字列に
 * 載せるより漏れにくい（このアプリは JWT を localStorage + Bearer で扱っており、
 * Cookie 方式への移行は全ページに波及するので今回は踏襲する）。
 * ============================================================ */

/** ハッシュに結果を載せてフロントの /auth/google へ返す */
const backToApp = (c: any, hash: string) => {
  const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin
  return c.redirect(`${origin.replace(/\/$/, '')}/auth/google#${hash}`, 302)
}

/** 同意画面へ送る（新規登録・ログイン共通） */
authApp.get('/auth/google/start', async (c) => {
  try {
    const url = await buildAuthUrl(c.env, c.req.url, 'login')
    return c.redirect(url, 302)
  } catch (e: any) {
    console.error('google start failed:', e)
    return backToApp(c, 'error=start_failed')
  }
})

/** 既存キャラに Google を紐づける導線の開始。
 * リダイレクトでは Authorization ヘッダを運べないので、
 * 先に認証済みのこのAPIでURLを作り、フロントが window.location で飛ぶ。
 * 紐づけ先のキャラIDは署名済み state の中に入れて往復させる（改竄不可）。 */
authApp.post('/auth/google/link-start', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Unauthorized' }, 401)
    }
    const payload = await verify(authHeader.split(' ')[1], c.env.JWT_SECRET, 'HS256')
    if (!payload?.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const url = await buildAuthUrl(c.env, c.req.url, 'link', String(payload.id))
    return c.json({ success: true, url })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

/** Google 連携の解除。
 *
 * 【最後のログイン手段は外せない】
 * Google だけで登録した人は password_hash が '' なので、ここで解除を許すと
 * ログイン手段がゼロになり、本人が自分のアカウントに二度と入れなくなる。
 * パスワードを持っている場合だけ解除できる。
 *
 * パスワードを持たない人は、先にプロフィール変更でパスワードを設定してもらう
 * （/edit は password_hash が '' の場合に限り current_password 無しで設定を許す）。 */
authApp.post('/auth/google/unlink', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Unauthorized' }, 401)
    }
    const payload = await verify(authHeader.split(' ')[1], c.env.JWT_SECRET, 'HS256')
    if (!payload?.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const user: any = await c.env.DB.prepare(
      'SELECT google_sub, password_hash FROM characters WHERE id = ?'
    ).bind(payload.id).first()

    if (!user) return c.json({ success: false, message: 'User not found' }, 404)
    if (!user.google_sub) {
      return c.json({ success: false, message: 'Google アカウントは連携されていません' }, 400)
    }
    if (!user.password_hash) {
      return c.json(
        {
          success: false,
          message: '解除すると、ログインする手段が無くなります。先にパスワードを設定してください。',
        },
        400
      )
    }

    await c.env.DB.prepare('UPDATE characters SET google_sub = NULL WHERE id = ?').bind(payload.id).run()
    return c.json({ success: true, message: 'Google アカウントの連携を解除しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

/** 同意画面からの戻り。Google に登録した「承認済みのリダイレクト URI」がここを指す。 */
authApp.get('/auth/google/callback', async (c) => {
  try {
    const code = c.req.query('code')
    const state = c.req.query('state')

    // ユーザーが同意画面で「キャンセル」を押した場合もここに来る
    if (c.req.query('error') || !code || !state) {
      return backToApp(c, 'error=cancelled')
    }

    // state は自分が発行した署名済みトークン。CSRF 対策の要。
    const st = await verifyState(c.env.JWT_SECRET, state)
    if (!st) return backToApp(c, 'error=bad_state')

    const sub = await exchangeCodeForSub(c.env, c.req.url, code)
    if (!sub) return backToApp(c, 'error=exchange_failed')

    const existing: any = await c.env.DB.prepare('SELECT id FROM characters WHERE google_sub = ?').bind(sub).first()

    if (st.mode === 'link') {
      if (!st.link_to) return backToApp(c, 'error=bad_state')
      // 1つの Google アカウントは1キャラまで（DB側の部分索引でも担保している）
      if (existing && existing.id !== st.link_to) {
        return backToApp(c, 'error=already_linked')
      }
      await c.env.DB.prepare('UPDATE characters SET google_sub = ? WHERE id = ?').bind(sub, st.link_to).run()
      return backToApp(c, 'linked=1')
    }

    // 連携済みならそのままログイン
    if (existing) {
      const token = await sign(
        { id: existing.id, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
        c.env.JWT_SECRET
      )
      return backToApp(c, `token=${encodeURIComponent(token)}`)
    }

    // 未登録。ここでキャラを勝手に作らず、登録画面へ引き継ぐ。
    // ID・ハンドル名・キャラ名・初期機体の抽選は通常の登録と同じ手順を踏ませる。
    const signup = await signSignupToken(c.env.JWT_SECRET, sub)
    return backToApp(c, `signup=${encodeURIComponent(signup)}`)
  } catch (e: any) {
    console.error('google callback failed:', e)
    return backToApp(c, 'error=server_error')
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






