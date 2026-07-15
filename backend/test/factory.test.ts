import { describe, it, expect, beforeAll, vi } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Factory API', () => {
  let env: any
  let token: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }

    // モックデータの挿入
    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, money, unit_id) 
       VALUES ('testuser', 'hash', 'Test Pilot', 'Test Character', 5000, 0)`
    ).run()

    await db.prepare(
      `INSERT INTO units (id, name, price, hp, en, armor, mobility, req_fame) VALUES (90099, 'Test Unit', 1000, 100, 100, 10, 10, 0)`
    ).run()

    await db.prepare(
      `INSERT INTO units (id, name, price, hp, en, armor, mobility, req_fame) VALUES (90100, 'High Fame Unit', 2000, 200, 200, 20, 20, 100)`
    ).run()

    await db.prepare(
      `INSERT INTO unit_transformations (source_unit_id, target_unit_id, cost, req_fame) VALUES (90099, 90100, 500, 50)`
    ).run()

    token = await sign({ id: 'testuser' }, env.JWT_SECRET)
  })

  it('should list units', async () => {
    const res = await app.request('/api/units', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.units).toBeInstanceOf(Array)
    expect(json.units.length).toBeGreaterThan(0)
  })

  it('should purchase a unit successfully', async () => {
    const res = await app.request('/api/buy_unit', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ unit_id: 90099 })
    }, env)

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
  })

  it('should fail to purchase with insufficient funds', async () => {
    // まず所持金を減らす
    await env.DB.prepare(`UPDATE characters SET money = 0 WHERE id = 'testuser'`).run()

    const res = await app.request('/api/buy_unit', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ unit_id: 90099 })
    }, env)

    const json = (await res.json()) as any
    expect(json.success).toBe(false)
    expect(json.message).toContain('資金が足りません')
  })

  it('should fail to purchase with insufficient fame', async () => {
    // 資金は足りているが名声が足りない状態にする
    await env.DB.prepare(`UPDATE characters SET money = 5000, fame = 10 WHERE id = 'testuser'`).run()

    const res = await app.request('/api/buy_unit', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ unit_id: 90100 }) // req_fame: 100
    }, env)

    const json = (await res.json()) as any
    expect(json.success).toBe(false)
    expect(json.message).toContain('名声が足りません')
  })

  it('should fail to transform with insufficient fame', async () => {
    // 搭乗機をセットし、資金はあるが名声が足りない状態にする
    await env.DB.prepare(`UPDATE characters SET money = 5000, fame = 10, unit_id = 90099 WHERE id = 'testuser'`).run()

    const res = await app.request('/api/hangar/transform', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ target_unit_id: 90100 }) // req_fame: 50
    }, env)

    const json = (await res.json()) as any
    expect(json.success).toBe(false)
    expect(json.message).toContain('名声が足りません')
  })

  it('should transform a unit successfully with sufficient fame', async () => {
    // 搭乗機をセットし、資金と名声が足りている状態にする
    await env.DB.prepare(`UPDATE characters SET money = 5000, fame = 100, unit_id = 90099 WHERE id = 'testuser'`).run()

    const res = await app.request('/api/hangar/transform', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ target_unit_id: 90100 })
    }, env)

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    // 名声が消費されたか確認
    const user = await env.DB.prepare(`SELECT fame FROM characters WHERE id = 'testuser'`).first()
    expect(user.fame).toBe(50) // 100 - 50 = 50
  })

  it('カスタマイズ: 安全カスタム回数の閾値未満なら必ず成功する (原作 custmaise 準拠)', async () => {
    // 機体Lv40 → 安全閾値 = 20 - int((40-40)/6) = 20。lp=10 から数回改造しても閾値未満なので必ず成功。
    await env.DB.prepare(`INSERT INTO units (id, name, price, unit_lv) VALUES (90201, 'Lv40 Unit', 1000, 40)`).run()
    await env.DB.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, money, unit_id, level, unit_custom_lp, unit_custom_hp, unit_custom_en, unit_custom_armor, unit_custom_mobility, unit_custom_sensor) VALUES ('cust_safe','h','S','S', 100000, 90201, 1, 10, 100, 100, 10, 10, 10)`).run()
    const t = await sign({ id: 'cust_safe' }, env.JWT_SECRET)

    for (let i = 0; i < 8; i++) {
      const res = await app.request('/api/anaheim/customize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
        body: JSON.stringify({ target_stat: 3 })
      }, env)
      const json = (await res.json()) as any
      if (!json.success) console.log(json);
    expect(json.success).toBe(true)
      expect(json.isSuccess).toBe(true) // 閾値未満は絶対に失敗しない
    }
  })

  it('カスタマイズ: 特性「運が悪い」は安全カスタム回数を減らし失敗しやすくなる', async () => {
    await env.DB.prepare(`INSERT INTO units (id, name, price, unit_lv) VALUES (90202, 'Lv40 Unit2', 1000, 40)`).run()
    // 運が悪いLv10 → 閾値 = 20 - int(10/2) = 15。lp=16 は閾値超え → リスク発生。
    await env.DB.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, money, unit_id, level, traits, unit_custom_lp, unit_custom_hp, unit_custom_en, unit_custom_armor, unit_custom_mobility, unit_custom_sensor) VALUES ('cust_unlucky','h','U','U', 100000, 90202, 10, '{"運が悪い": 10}', 16, 100, 100, 10, 10, 10)`).run()
    // 特性なしの通常キャラ → 閾値 20。lp=16 は閾値未満 → 安全。
    await env.DB.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, money, unit_id, level, unit_custom_lp, unit_custom_hp, unit_custom_en, unit_custom_armor, unit_custom_mobility, unit_custom_sensor) VALUES ('cust_normal','h','N','N', 100000, 90202, 10, 16, 100, 100, 10, 10, 10)`).run()

    const spy = vi.spyOn(Math, 'random').mockReturnValue(0) // rand=0 → 閾値超えなら必ず失敗する
    try {
      const tokU = await sign({ id: 'cust_unlucky' }, env.JWT_SECRET)
      const resU = await app.request('/api/anaheim/customize', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokU}` }, body: JSON.stringify({ target_stat: 3 })
      }, env)
      const jsonU = (await resU.json()) as any;
      if (!jsonU.success) console.log(jsonU);
      expect(jsonU.isSuccess).toBe(false) // 閾値15超え(lp16) → 失敗

      const tokN = await sign({ id: 'cust_normal' }, env.JWT_SECRET)
      const resN = await app.request('/api/anaheim/customize', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokN}` }, body: JSON.stringify({ target_stat: 3 })
      }, env)
      expect(((await resN.json()) as any).isSuccess).toBe(true) // 閾値20未満(lp16) → 安全（同条件でも特性差で結果が変わる）
    } finally {
      spy.mockRestore()
    }
  })

  it('カスタマイズ: 費用は機体価格の満額・成功時は現在HPも+10される (原作 custmaise:174-186 準拠)', async () => {
    await env.DB.prepare(`INSERT INTO units (id, name, price, unit_lv) VALUES (90203, 'Cost Unit', 1000, 40)`).run()
    // ダメージを負った状態（current_hp=50）で耐久カスタム
    await env.DB.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, money, unit_id, unit_custom_lp, unit_custom_hp, unit_custom_en, current_hp) VALUES ('cust_cost','h','C','C', 5000, 90203, 0, 100, 100, 50)`).run()
    const t = await sign({ id: 'cust_cost' }, env.JWT_SECRET)

    const res = await app.request('/api/anaheim/customize', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` }, body: JSON.stringify({ target_stat: 1 })
    }, env)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.isSuccess).toBe(true)
    expect(json.cost).toBe(1000) // 機体価格そのもの（半額ではない）
    expect(typeof json.astonaji).toBe('string') // アストナージのセリフを返す

    const u = await env.DB.prepare(`SELECT money, unit_custom_hp, current_hp FROM characters WHERE id = 'cust_cost'`).first()
    expect(u.money).toBe(4000)         // 5000 - 1000
    expect(u.unit_custom_hp).toBe(110) // 最大値 +10
    expect(u.current_hp).toBe(60)      // 現在値も +10（原作 $ktai += 10）
  })

  it('カスタム２: 能力振替が成功する (原作 custmaise_2:321-384 準拠)', async () => {
    await env.DB.prepare(`INSERT INTO units (id, name, price, unit_lv, max_weight) VALUES (90204, 'Swap Unit', 1000, 40, 20)`).run()
    await env.DB.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, money, unit_id, unit_custom_lp, unit_custom_hp, unit_custom_en, unit_custom_armor, unit_custom_mobility, unit_custom_sensor) VALUES ('cust_swap','h','W','W', 5000, 90204, 0, 100, 100, 10, 10, 10)`).run()
    const t = await sign({ id: 'cust_swap' }, env.JWT_SECRET)

    // 1/10の無条件失敗を回避するため rand を 0.5 に固定（floor(0.5*10)=5 ≠ 0 → 成功）
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      // 耐久-5 → 装備可能重量+1
      const res = await app.request('/api/anaheim/customize_2', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` }, body: JSON.stringify({ noryoku_m: 1, noryoku_s: 6 })
      }, env)
      const json = (await res.json()) as any
    expect(json.success).toBe(true)
      expect(json.isSuccess).toBe(true)
      expect(json.cost).toBe(1000) // 費用は機体価格満額

      const u = await env.DB.prepare(`SELECT money, unit_custom_hp, unit_custom_weight, unit_custom_lp FROM characters WHERE id = 'cust_swap'`).first()
      expect(u.money).toBe(4000)
      expect(u.unit_custom_hp).toBe(95)      // 100 - 5
      expect(u.unit_custom_weight).toBe(21)  // max_weight 20 + 1（-1から実体化）
      expect(u.unit_custom_lp).toBe(1)       // 成功で改造度 +1
    } finally {
      spy.mockRestore()
    }
  })

  it('カスタム２: 閾値超えは必ず失敗し費用だけ消費・安全域でも1/10で失敗する (原作 custmaise_2:311-315 準拠)', async () => {
    await env.DB.prepare(`INSERT INTO units (id, name, price, unit_lv) VALUES (90205, 'Swap Fail Unit', 1000, 40)`).run()
    // 機体Lv40 → 閾値 = 25。lp=25 は閾値以上 → 乱数に関係なく必ず失敗。
    await env.DB.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, money, unit_id, unit_custom_lp, unit_custom_hp, unit_custom_en, unit_custom_armor, unit_custom_mobility, unit_custom_sensor) VALUES ('cust_swap_f','h','F','F', 5000, 90205, 25, 100, 100, 10, 10, 10)`).run()
    const t = await sign({ id: 'cust_swap_f' }, env.JWT_SECRET)

    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      const res = await app.request('/api/anaheim/customize_2', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` }, body: JSON.stringify({ noryoku_m: 1, noryoku_s: 3 })
      }, env)
      const json = (await res.json()) as any
    expect(json.success).toBe(true)
      expect(json.isSuccess).toBe(false)

      const u = await env.DB.prepare(`SELECT money, unit_custom_hp, unit_custom_armor, unit_custom_lp FROM characters WHERE id = 'cust_swap_f'`).first()
      expect(u.money).toBe(4000)          // 失敗しても費用は満額消費
      expect(u.unit_custom_hp).toBe(100)  // 振替は行われない
      expect(u.unit_custom_armor).toBe(10)
      expect(u.unit_custom_lp).toBe(25)   // lpは実質変動なし
    } finally {
      spy.mockRestore()
    }

    // 安全域（lp=0 < 25）でも rand=0 → int(rand(10))=0 → 1/10の無条件失敗
    await env.DB.prepare(`UPDATE characters SET unit_custom_lp = 0, money = 5000 WHERE id = 'cust_swap_f'`).run()
    const spy2 = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const res = await app.request('/api/anaheim/customize_2', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` }, body: JSON.stringify({ noryoku_m: 1, noryoku_s: 3 })
      }, env)
      const json = (await res.json()) as any
      expect(json.isSuccess).toBe(false)
    } finally {
      spy2.mockRestore()
    }
  })

  it('カスタム２: 下げる能力が不足しているとエラーになり費用も消費されない (原作「機体能力が足りません」)', async () => {
    await env.DB.prepare(`INSERT INTO units (id, name, price, unit_lv) VALUES (90206, 'Poor Unit', 1000, 40)`).run()
    // 装甲2 < 3 → 装甲を下げるカスタムは不可
    await env.DB.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, money, unit_id, unit_custom_lp, unit_custom_hp, unit_custom_en, unit_custom_armor) VALUES ('cust_poor','h','P','P', 5000, 90206, 0, 100, 100, 2)`).run()
    const t = await sign({ id: 'cust_poor' }, env.JWT_SECRET)

    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      const res = await app.request('/api/anaheim/customize_2', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` }, body: JSON.stringify({ noryoku_m: 3, noryoku_s: 1 })
      }, env)
      const json = (await res.json()) as any
      expect(json.success).toBe(false)
      expect(json.message).toContain('機体能力が足りません')

      const u = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'cust_poor'`).first()
      expect(u.money).toBe(5000) // エラー時は課金されない
    } finally {
      spy.mockRestore()
    }
  })

  it('Hangar equip with custom stats swap and champion update', async () => {
    // 1. Prepare unit and hangar unit
    await env.DB.prepare(`INSERT INTO units (id, name, hp, en, armor, mobility, sensor) VALUES (90301, 'BaseUnit', 100, 100, 10, 10, 10)`).run()
    await env.DB.prepare(`INSERT INTO units (id, name, hp, en, armor, mobility, sensor) VALUES (90302, 'HangarUnit', 200, 200, 20, 20, 20)`).run()

    // 2. Prepare user with BaseUnit and custom stats
    await env.DB.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, unit_id, unit_custom_hp, unit_custom_en, unit_custom_armor) VALUES ('swap_test', 'h', 'H', 'C', 90301, 150, 150, 15)`).run()
    await env.DB.prepare(`INSERT INTO champions (type, champion_id, win_count) VALUES ('individual', 'swap_test', 1)`).run()

    // 3. Prepare hangar entry for HangarUnit with its own custom stats
    const res1 = await env.DB.prepare(`INSERT INTO hangars (user_id, unit_id, custom_hp, custom_en) VALUES ('swap_test', 90302, 250, 250)`).run()
    const lastInsertRowid1 = res1.meta.last_row_id;
    await env.DB.prepare(`INSERT INTO hangars (user_id, unit_id) VALUES ('swap_test', 90301)`).run()

    const t = await sign({ id: 'swap_test' }, env.JWT_SECRET)
    
    // 4. Call equip
    const res = await app.request('/api/hangar/equip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
      body: JSON.stringify({ unit_id: 90302, hangar_id: lastInsertRowid1, update_champion: true })
    }, env)
    
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    // 5. Verify user stats are updated to HangarUnit's custom stats
    const u = await env.DB.prepare(`SELECT unit_id, unit_custom_hp, unit_custom_en, unit_custom_armor FROM characters WHERE id = 'swap_test'`).first()
    expect(u.unit_id).toBe(90302)
    expect(u.unit_custom_hp).toBe(250) // From hangar custom stats
    expect(u.unit_custom_en).toBe(250) // From hangar custom stats
    expect(u.unit_custom_armor).toBe(0) // Base armor of 90302, as custom_armor was 0

    // 6. Verify old equipped unit is now in hangar with correct custom stats
    const h = await env.DB.prepare(`SELECT unit_id, custom_hp, custom_en, custom_armor FROM hangars WHERE user_id = 'swap_test' AND unit_id = 90301 ORDER BY id DESC LIMIT 1`).first()
    expect(h.unit_id).toBe(90301)
    expect(h.custom_hp).toBe(150) // preserved
    expect(h.custom_en).toBe(150) // preserved
    expect(h.custom_armor).toBe(15) // preserved
  })

  it('Hangar discard', async () => {
    await env.DB.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, money) VALUES ('discard_test', 'h', 'H', 'C', 1000)`).run()
    await env.DB.prepare(`INSERT INTO units (id, name) VALUES (90303, 'DiscardUnit')`).run()
    await env.DB.prepare(`INSERT INTO hangars (user_id, unit_id) VALUES ('discard_test', 90303)`).run()
    const dh = await env.DB.prepare(`SELECT id FROM hangars WHERE user_id = 'discard_test'`).first()
    const lastInsertRowid2 = dh.id;

    const t = await sign({ id: 'discard_test' }, env.JWT_SECRET)
    const res = await app.request('/api/hangar/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
      body: JSON.stringify({ hangar_id: lastInsertRowid2 })
    }, env)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    const h = await env.DB.prepare(`SELECT * FROM hangars WHERE id = ?`).bind(lastInsertRowid2).first()
    expect(h).toBeNull()
  })

})

// Q6: 専用機化（senyou → anahaim_act.cgi:33-122）＝機体名称変更。名声10消費・11テンプレ・ステ不変。
describe('Anaheim 機体名称変更 (senyou/Q6)', () => {
  let env: any
  const tokenFor = async (id: string) => await sign({ id }, 'test-secret')

  const setup = async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }
    // 専用を含むマスター名の機体（原作の split(/専用/) 除去対象）と、含まない機体
    await db.prepare(`INSERT INTO units (id, name) VALUES (95001, 'ティターンズ専用ガンダム')`).run()
    await db.prepare(`INSERT INTO units (id, name) VALUES (95002, 'ガンダム')`).run()
    await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, fame, unit_id) VALUES ('rn1','h','H1','アムロ', 30, 95001)`).run()
    await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, fame, unit_id) VALUES ('rn2','h','H2','シャア', 5, 95002)`).run()
  }

  const rename = async (id: string, template_id: number) =>
    app.request('/api/anaheim/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await tokenFor(id)}` },
      body: JSON.stringify({ template_id })
    }, env)

  it('名声10消費・テンプレ1で「{キャラ名}専用{機体名}」に改名し unit_custom_name に保存', async () => {
    await setup()
    // マスター名が「ティターンズ専用ガンダム」→ 原作は「専用」以降(=ガンダム)を基名に採用し二重「専用」を避ける
    const res = await rename('rn1', 1)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.new_unit_name).toBe('アムロ専用ガンダム') // ×「アムロ専用ティターンズ専用ガンダム」
    const ch: any = await env.DB.prepare(`SELECT fame, unit_custom_name FROM characters WHERE id='rn1'`).first()
    expect(ch.fame).toBe(20) // 30 - 10
    expect(ch.unit_custom_name).toBe('アムロ専用ガンダム')
  })

  it('名声10未満は拒否（原作 $kmesei < 10）', async () => {
    await setup()
    const res = await rename('rn2', 1) // fame=5
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.message).toContain('名声')
    const ch: any = await env.DB.prepare(`SELECT fame, unit_custom_name FROM characters WHERE id='rn2'`).first()
    expect(ch.fame).toBe(5) // 消費されない
    expect(ch.unit_custom_name || '').toBe('')
  })

  it('専用を含まないマスター名はそのまま基名（テンプレ4=カスタム）', async () => {
    await setup()
    await env.DB.prepare(`UPDATE characters SET fame = 30 WHERE id='rn2'`).run() // rn2 の機体=「ガンダム」（専用なし）
    const ok = await rename('rn2', 4)
    const json = (await ok.json()) as any
    expect(json.new_unit_name).toBe('ガンダムシャアカスタム')
  })

  it('D2: 優勝者表示は unit_custom_name を優先（原作 winchg 相当・live 反映）', async () => {
    await setup()
    // rn1 を優勝者にし、専用機化してから GET /api/champion で機体名を確認
    await rename('rn1', 1) // → unit_custom_name = 'アムロ専用ガンダム'
    await env.DB.prepare(`INSERT INTO champions (type, champion_id, win_count, def_hp, def_en) VALUES ('individual','rn1',3,100,100)`).run()
    const res = await app.request('/api/champion', { headers: { 'Authorization': `Bearer ${await tokenFor('rn1')}` } }, env)
    const json = (await res.json()) as any
    expect(json.individual).toBeTruthy()
    expect(json.individual.unit_name).toBe('アムロ専用ガンダム') // マスター名「ティターンズ専用ガンダム」ではない
  })
})







