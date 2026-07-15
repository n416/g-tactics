import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { STARTER_UNIT_IDS, MAX_REROLLS } from '../src/utils/starterRoll'

/** 初期機体を1回抽選して、署名済みトークンと機体を返す */
async function roll(env: any, prevToken?: string) {
  const res = await app.request('/api/register/roll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prevToken ? { token: prevToken } : {})
  }, env)
  return { status: res.status, json: (await res.json()) as any }
}

/** 全ステ20。プールのどの機体でも搭乗条件（最大10）を満たせる */
const OK_STATS = {
  status_intuition: 20,
  status_piloting: 20,
  status_short_range: 20,
  status_mid_range: 20,
  status_long_range: 20
}

async function register(env: any, body: Record<string, unknown>) {
  const res = await app.request('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, env)
  return { status: res.status, json: (await res.json()) as any }
}

describe('Auth API', () => {
  let env: any

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }
  })

  it('should register a new user', async () => {
    // 初期機体はサーバーが抽選して署名する。登録はそのトークンを提示して行う。
    const { json: rolled } = await roll(env)
    expect(rolled.success).toBe(true)

    const { status, json } = await register(env, {
      id: 'testuser',
      password: 'password123',
      handle_name: 'Test Pilot',
      chara_name: 'Test Character',
      ...OK_STATS,
      roll_token: rolled.token
    })

    if (status !== 200) console.error(json)
    expect(status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.message).toContain('キャラクターの作成が完了しました')

    // 抽選された機体がそのまま保存されていること
    const row: any = await env.DB.prepare('SELECT unit_id FROM characters WHERE id = ?').bind('testuser').first()
    expect(row.unit_id).toBe(rolled.unit.id)
  })

  // 登録の時点で本人確認は済んでいる。ここでトークンを返さないと、フロントは
  // ログイン画面へ送り返すしかなくなり、今入力したばかりの認証をもう一度やらせることになる。
  it('登録するとそのままログイン済みになる（トークンが返る）', async () => {
    const { json: rolled } = await roll(env)
    const { json } = await register(env, {
      id: 'autologin',
      password: 'password123',
      handle_name: 'Auto',
      chara_name: 'Auto',
      ...OK_STATS,
      roll_token: rolled.token
    })

    expect(json.token).toBeTruthy()

    // 返ったトークンがそのまま使えること（＝再ログインが要らない）
    const me = await app.request('/api/me', { headers: { Authorization: `Bearer ${json.token}` } }, env)
    expect(me.status).toBe(200)
    const meJson = (await me.json()) as any
    expect(meJson.user.id).toBe('autologin')
  })

  it('should login an existing user', async () => {
    const res = await app.request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'testuser',
        password: 'password123'
      })
    }, env)

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.token).toBeDefined()
  })

  it('登録したパスワードはソルト付き PBKDF2 で保存される（無ソルトSHA-256ではない）', async () => {
    const row: any = await env.DB.prepare('SELECT password_hash FROM characters WHERE id = ?').bind('testuser').first()
    expect(row.password_hash.startsWith('pbkdf2$')).toBe(true)
    // 平文や無ソルトSHA-256(hex64)がそのまま入っていないこと
    expect(row.password_hash).not.toBe('password123')
    expect(row.password_hash).not.toMatch(/^[0-9a-f]{64}$/)
  })

  it('旧方式(無ソルトSHA-256)で保存された行もログインでき、その場で新方式へ移行される', async () => {
    // 移行前のデータを模して直接書き込む（sha256('legacypass') の hex）
    const enc = new TextEncoder()
    const buf = await crypto.subtle.digest('SHA-256', enc.encode('legacypass'))
    const legacyHex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')

    const { json: rolled } = await roll(env)
    await register(env, {
      id: 'legacyuser', password: 'temp1234', handle_name: 'L', chara_name: 'L',
      ...OK_STATS, roll_token: rolled.token
    })
    await env.DB.prepare('UPDATE characters SET password_hash = ? WHERE id = ?').bind(legacyHex, 'legacyuser').run()

    const before: any = await env.DB.prepare('SELECT password_hash FROM characters WHERE id = ?').bind('legacyuser').first()
    expect(before.password_hash).toBe(legacyHex)

    // 旧パスワードでログインできる
    const res = await app.request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'legacyuser', password: 'legacypass' })
    }, env)
    expect(res.status).toBe(200)
    expect(((await res.json()) as any).success).toBe(true)

    // ログイン成功を機に新方式へ書き換わっていること
    const after: any = await env.DB.prepare('SELECT password_hash FROM characters WHERE id = ?').bind('legacyuser').first()
    expect(after.password_hash.startsWith('pbkdf2$')).toBe(true)

    // 移行後も同じパスワードでログインできる
    const again = await app.request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'legacyuser', password: 'legacypass' })
    }, env)
    expect(again.status).toBe(200)
  })

  it('should reject login with wrong password', async () => {
    const res = await app.request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'testuser',
        password: 'wrongpassword'
      })
    }, env)

    const json = (await res.json()) as any
    expect(json.success).toBe(false)
  })

  it('should return raw terrain proficiency from units table via /me', async () => {
    // ユニットIDを設定
    await env.DB.prepare('UPDATE characters SET unit_id = 1 WHERE id = ?').bind('testuser').run()
    
    const loginRes = await app.request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'testuser', password: 'password123' })
    }, env)
    const { token } = await loginRes.json() as any

    const res = await app.request('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    const json = await res.json() as any
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)

    // 生の適性値が返ってくること（戦闘用スコアのように巨大な値ではないこと）
    expect(json.user.terrain_ground).toBeDefined()
    expect(json.user.terrain_ground).toBeLessThan(1000)
    
    // DBの生のunitsテーブルの値と一致することを確認
    const unit: any = await env.DB.prepare('SELECT terrain_ground, image FROM units WHERE id = 1').first()
    expect(json.user.terrain_ground).toBe(unit.terrain_ground)
    expect(json.user.unit_image).toBe(unit.image)
    
    // rank, next_exp のアサーション
    expect(json.user.rank).toBeDefined()
    expect(json.user.next_exp).toBeDefined()
    // P47-B3: レベルアップ閾値は原作式 熟練度×500（msvs_ini:584）
    expect(json.user.next_exp).toBe(json.user.level * 500)
  })

  it('Q7: /me は skills を表示用配列＋skills_raw(生JSON)で返す（忘却UIの契約）', async () => {
    await env.DB.prepare(`UPDATE characters SET skills = '{"melee":2,"ground":3}' WHERE id = ?`).bind('testuser').run()
    const loginRes = await app.request('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'testuser', password: 'password123' })
    }, env)
    const { token } = await loginRes.json() as any
    const res = await app.request('/api/me', { headers: { 'Authorization': `Bearer ${token}` } }, env)
    const json = await res.json() as any

    // 表示用は文字列配列（MyPage 用）
    expect(Array.isArray(json.user.skills)).toBe(true)
    expect(json.user.skills).toContain('格闘 LV2')
    // 生JSONは Simulator の忘却UIが parse できること
    expect(typeof json.user.skills_raw).toBe('string')
    const raw = JSON.parse(json.user.skills_raw)
    expect(raw.melee).toBe(2)
    expect(raw.ground).toBe(3)
  })
})

describe('初期機体の抽選（ルーレット）', () => {
  let env: any

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }
  })

  it('抽選結果は必ず初期機体プールの中から出る', async () => {
    // 乱数なので複数回まわして、プール外が混じらないことを確かめる
    for (let i = 0; i < 25; i++) {
      const { json } = await roll(env)
      expect(json.success).toBe(true)
      expect(STARTER_UNIT_IDS).toContain(json.unit.id)
    }
  })

  it(`引き直しは${MAX_REROLLS}回まで。超えたら 429`, async () => {
    let { json } = await roll(env)
    expect(json.rerolls_left).toBe(MAX_REROLLS)

    for (let i = MAX_REROLLS - 1; i >= 0; i--) {
      const r = await roll(env, json.token)
      expect(r.status).toBe(200)
      json = r.json
      expect(json.rerolls_left).toBe(i)
    }

    const over = await roll(env, json.token)
    expect(over.status).toBe(429)
    expect(over.json.success).toBe(false)
  })

  it('引き直すと直前とは違う機体になる', async () => {
    const first = await roll(env)
    const second = await roll(env, first.json.token)
    expect(second.json.unit.id).not.toBe(first.json.unit.id)
  })

  // ここから下は、以前 /register が unit_id を無検証で受けていた穴の回帰テスト。
  // 当時は任意の機体（終盤機体を含む）で登録できた。
  it('unit_id を直接指定しても無視され、roll_token 無しでは登録できない', async () => {
    const { status, json } = await register(env, {
      id: 'attacker1',
      password: 'password123',
      handle_name: 'H',
      chara_name: 'C',
      ...OK_STATS,
      unit_id: 700 // 終盤機体を狙った指定
    })
    expect(status).toBe(400)
    expect(json.success).toBe(false)

    const row: any = await env.DB.prepare('SELECT id FROM characters WHERE id = ?').bind('attacker1').first()
    expect(row).toBeNull()
  })

  it('roll_token を偽造しても登録できない', async () => {
    const { status, json } = await register(env, {
      id: 'attacker2',
      password: 'password123',
      handle_name: 'H',
      chara_name: 'C',
      ...OK_STATS,
      roll_token: 'not.a.real.token'
    })
    expect(status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('別の JWT_SECRET で署名した roll_token は拒否される', async () => {
    const { json: rolled } = await roll({ ...env, JWT_SECRET: 'attacker-secret' })
    // 攻撃者の秘密鍵で作ったトークンを、本物の env に持ち込む
    const { status } = await register(env, {
      id: 'attacker3',
      password: 'password123',
      handle_name: 'H',
      chara_name: 'C',
      ...OK_STATS,
      roll_token: rolled.token
    })
    expect(status).toBe(400)
  })

  it('引いた機体の搭乗条件を満たさないステータスでは登録できない', async () => {
    // 搭乗条件が必ず存在する機体を引くまで回す（ガンガルは要求ゼロなので除外）
    let rolled: any
    for (let i = 0; i < 40; i++) {
      const r = await roll(env)
      const reqSum = r.json.unit.req_intuition + r.json.unit.req_piloting +
        r.json.unit.req_short_range + r.json.unit.req_mid_range + r.json.unit.req_long_range
      if (reqSum > 0) { rolled = r.json; break }
    }
    expect(rolled).toBeDefined()

    const { status, json } = await register(env, {
      id: 'attacker4',
      password: 'password123',
      handle_name: 'H',
      chara_name: 'C',
      status_intuition: 0,
      status_piloting: 0,
      status_short_range: 0,
      status_mid_range: 0,
      status_long_range: 0,
      roll_token: rolled.token
    })
    expect(status).toBe(400)
    expect(json.message).toContain('搭乗には')
  })

  it('ステータス合計が120を超えたら登録できない', async () => {
    const { json: rolled } = await roll(env)
    const { status } = await register(env, {
      id: 'attacker5',
      password: 'password123',
      handle_name: 'H',
      chara_name: 'C',
      status_intuition: 70,
      status_piloting: 70,
      status_short_range: 70,
      status_mid_range: 0,
      status_long_range: 0,
      roll_token: rolled.token
    })
    expect(status).toBe(400)
  })

  it('プール一覧は初期機体プールと一致する', async () => {
    const res = await app.request('/api/register/pool', {}, env)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.units.map((u: any) => u.id).sort((a: number, b: number) => a - b))
      .toEqual([...STARTER_UNIT_IDS].sort((a, b) => a - b))
  })
})

