import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

// 個別戦闘（defense_battles）の耐久持ち越し。優勝戦(P53)と同型。
// 原作 battle.cgi:349 $wtai=$vtai は w_knm 付き（個別戦闘）にも適用される。
describe('Defense snapshot / 耐久持ち越し (個別戦闘)', () => {
  let env: any
  let battleId: number
  let t1: string, t2: string, t3: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret', BATTLE_COOLDOWN_SECONDS: 0 }

    // 90301: 個別戦闘の防衛者（強力）
    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id, unit_custom_hp)
       VALUES ('90301', 'h', 'Def', '防衛者', 5, 1000, 10, 1, 50000)`
    ).run()
    // 挑戦者2人（弱い）
    await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id) VALUES ('90302','h','C1','挑戦1',5,1000,10,2)`).run()
    await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id) VALUES ('90303','h','C2','挑戦2',5,1000,10,2)`).run()

    // 個別戦闘を設置（条件なし・snapshot無し）
    await db.prepare(
      `INSERT INTO defense_battles (owner_id, title, is_team, terrain, req_unit_type, req_max_hp, req_rank, champion_id, win_count)
       VALUES ('90301', 'テスト個別戦闘', 0, 1, '', 0, 0, '90301', 1)`
    ).run()
    const b: any = await db.prepare(`SELECT id FROM defense_battles WHERE owner_id='90301'`).first()
    battleId = b.id

    t1 = await sign({ id: '90301' }, env.JWT_SECRET)
    t2 = await sign({ id: '90302' }, env.JWT_SECRET)
    t3 = await sign({ id: '90303' }, env.JWT_SECRET)
  })

  const challenge = (token: string) =>
    app.request(`/api/defense/challenge/${battleId}`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}'
    }, env)

  it('連続挑戦で防衛者の耐久が逓減して持ち越す・本体は無傷', async () => {
    // 1回目: 90302 が挑戦、90301 が防衛成功
    const r2 = await challenge(t2)
    const j2 = (await r2.json()) as any
    expect(j2.meta.isSuccess).toBe(false)

    const b1: any = await env.DB.prepare(`SELECT def_hp, snapshot_data FROM defense_battles WHERE id=?`).bind(battleId).first()
    expect(b1.snapshot_data).not.toBeNull()
    expect(b1.def_hp).toBeGreaterThan(0)
    expect(b1.def_hp).toBeLessThan(50000) // 削れている

    // 防衛者の本体 current_hp は減っていない
    const def: any = await env.DB.prepare(`SELECT current_hp FROM characters WHERE id='90301'`).first()
    expect(def.current_hp === -1 || def.current_hp === null || def.current_hp >= 50000).toBe(true)

    // 2回目: 90303 が挑戦、持ち越し耐久からさらに削れる
    const r3 = await challenge(t3)
    const j3 = (await r3.json()) as any
    expect(j3.meta.isSuccess).toBe(false)

    const b2: any = await env.DB.prepare(`SELECT def_hp FROM defense_battles WHERE id=?`).bind(battleId).first()
    expect(b2.def_hp).toBeLessThan(b1.def_hp) // 前回値からさらに逓減＝持ち越し
  })
})
