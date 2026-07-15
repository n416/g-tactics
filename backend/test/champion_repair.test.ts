import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

// P53: 優勝者の防衛耐久の回復（整備＋優勝戦反映）
// 原作 action.cgi sub seibi の win フラグ = $wtai=$wmaxtai。費用条件・時間制限なし。
describe('Champion repair via seibi (P53)', () => {
  let env: any
  let champToken: string
  let nonChampToken: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }

    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id)
       VALUES ('90201', 'hash', 'King', '王者', 5, 1000, 10, 1)`
    ).run()
    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id)
       VALUES ('90202', 'hash', 'Nobody', '一般兵', 5, 1000, 10, 2)`
    ).run()

    // 90201 を優勝者に。防衛耐久は削れた状態（def_hp=300/1000, def_en=50/200）
    const snap = JSON.stringify({ chara_name: '王者', maxHp: 1000, maxEn: 200 })
    await db.prepare(
      `INSERT INTO champions (type, champion_id, win_count, terrain, terrain_counter, snapshot_data, def_hp, def_en)
       VALUES ('individual', '90201', 3, 1, 10, ?, 300, 50)`
    ).bind(snap).run()

    champToken = await sign({ id: '90201' }, env.JWT_SECRET)
    nonChampToken = await sign({ id: '90202' }, env.JWT_SECRET)
  })

  const seibi = (token: string, body: any) =>
    app.request('/api/seibi', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, env)

  const readDef = async () => {
    const c: any = await env.DB.prepare(`SELECT def_hp, def_en FROM champions WHERE type = 'individual'`).first()
    return { hp: c.def_hp, en: c.def_en }
  }

  it('優勝者が update_champion=true で整備すると防衛耐久が満タンに戻り費用を払う', async () => {
    const before: any = await env.DB.prepare(`SELECT money FROM characters WHERE id = '90201'`).first()
    const res = await seibi(champToken, { update_champion: true })
    expect(res.status).toBe(200)
    const def = await readDef()
    expect(def.hp).toBe(1000)
    expect(def.en).toBe(200)
    const after: any = await env.DB.prepare(`SELECT money FROM characters WHERE id = '90201'`).first()
    expect(after.money).toBeLessThan(before.money) // 費用を消費
  })

  it('既に満タンなら整備不要でエラー', async () => {
    const res = await seibi(champToken, { update_champion: true })
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.message).toContain('全快')
  })

  it('非優勝者が update_champion=true でも整備できない', async () => {
    const res = await seibi(nonChampToken, { update_champion: true })
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.message).toContain('優勝者')
  })
})
