import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Faction Unit API', () => {
  let env: any

  const generateToken = async (id: string) => {
    return await sign({ id }, 'test-secret', 'HS256')
  }

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }

    await db.prepare(
      `INSERT INTO factions (id, name, leader_id, level, influence, funds, max_members, notice, hp_url) 
       VALUES (1, 'Test Faction', 'leader1', 1, 100, 50000, 30, 'Welcome', 'http://example.com')`
    ).run()

    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, faction_id, faction_role, faction_katagaki, faction_message, money) 
       VALUES 
       ('leader1', 'hash', 'Leader', 'Lead Chara', 1, 'leader', 'リーダー', 'よろしく', 10000),
       ('member1', 'hash', 'Member', 'Mem Chara', 1, 'member', '隊員', 'がんばります', 10000),
       ('outsider1', 'hash', 'Outsider', 'Out Chara', 0, 'member', '', '', 10000)`
    ).run()

    // 実データseed(911機)とIDが衝突しないよう、価格が既知のテスト専用ユニットを挿入する
    await db.prepare(`INSERT INTO units (id, name, price, hp, en, armor, mobility, max_weight) VALUES (90301, 'FUnit1000', 1000, 100, 100, 10, 10, 100)`).run()
    await db.prepare(`INSERT INTO units (id, name, price, hp, en, armor, mobility, max_weight) VALUES (90302, 'FUnit1200', 1200, 110, 100, 12, 10, 120)`).run()
    // アイテムデータは0001_baselineでシード済み
  })

  it('should list faction unit details (empty at first)', async () => {
    const token = await generateToken('leader1')
    const res = await app.request('/api/faction-unit', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.faction_unit).toBeNull() // Not purchased yet
    expect(json.faction_funds).toBe(50000)
  })

  it('should prevent non-leader from buying faction unit', async () => {
    const token = await generateToken('member1')
    const res = await app.request('/api/faction-unit/buy', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_id: 90301 })
    }, env)
    const json = (await res.json()) as any
    expect(res.status).toBe(403)
    expect(json.success).toBe(false)
  })

  it('should allow leader to buy a faction unit', async () => {
    const token = await generateToken('leader1')
    const res = await app.request('/api/faction-unit/buy', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_id: 90301 }) // ジム 1000
    }, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    // Verify funds (50000 - 1000 = 49000)
    const res2 = await app.request('/api/faction-unit', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    const json2 = (await res2.json()) as any
    expect(json2.faction_funds).toBe(49000)
    expect(json2.faction_unit.unit_id).toBe(90301)
  })

  it('should prevent customization without enough funds', async () => {
    const db = env.DB as D1Mock
    await db.prepare('UPDATE factions SET funds = 500 WHERE id = 1').run() // 資金不足にする

    const token = await generateToken('leader1')
    const res = await app.request('/api/faction-unit/customize', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ stat_type: 'hp' })
    }, env)
    const json = (await res.json()) as any
    expect(json.success).toBe(false) // cost = unit.price = 1000

    // 元に戻す
    await db.prepare('UPDATE factions SET funds = 49000 WHERE id = 1').run()
  })

  it('should customize unit successfully', async () => {
    const token = await generateToken('leader1')
    const res = await app.request('/api/faction-unit/customize', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ stat_type: 'hp' })
    }, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    const res2 = await app.request('/api/faction-unit', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    const json2 = (await res2.json()) as any
    expect(json2.faction_unit.custom_hp).toBe(20) // HP +20
    expect(json2.faction_funds).toBe(48000) // 49000 - 1000 = 48000
  })

  it('should rename the faction unit', async () => {
    const token = await generateToken('leader1')
    const res = await app.request('/api/faction-unit/rename', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_name: 'カスタムジム' })
    }, env)
    expect(res.status).toBe(200)

    const res2 = await app.request('/api/faction-unit', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    const json2 = (await res2.json()) as any
    expect(json2.faction_unit.custom_name).toBe('カスタムジム')
  })

  it('should change the image', async () => {
    const token = await generateToken('leader1')
    const res = await app.request('/api/faction-unit/image', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'gm_custom.png' })
    }, env)
    expect(res.status).toBe(200)

    const res2 = await app.request('/api/faction-unit', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    const json2 = (await res2.json()) as any
    expect(json2.faction_unit.image).toBe('gm_custom.png')
  })

  it('should equip a weapon and deduct funds', async () => {
    const token = await generateToken('leader1')
    const res = await app.request('/api/faction-unit/equip', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: 'weapon_id', item_id: 3 }) // ヒートサーベル (price: 2)
    }, env)
    expect(res.status).toBe(200)

    const res2 = await app.request('/api/faction-unit', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    const json2 = (await res2.json()) as any
    expect(json2.faction_unit.weapon_id).toBe(3)
    expect(json2.faction_funds).toBe(47998) // 48000 - 2
  })

  it('should prevent equipping weapon to item slot', async () => {
    const token = await generateToken('leader1')
    const res = await app.request('/api/faction-unit/equip', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: 'item1_id', item_id: 3 })
    }, env)
    const json = (await res.json()) as any
    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('should handle trade-in correctly when buying a new unit', async () => {
    // Current unit is ジム(1000). Trade-in value is 700.
    // New unit is FUnit1200(1200). Cost = 1200 - 700 = 500.
    // Current funds = 47600. New funds should be 47100.
    const token = await generateToken('leader1')
    const res = await app.request('/api/faction-unit/buy', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_id: 90302 })
    }, env)
    expect(res.status).toBe(200)

    const res2 = await app.request('/api/faction-unit', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    const json2 = (await res2.json()) as any
    expect(json2.faction_unit.unit_id).toBe(90302)
    expect(json2.faction_unit.custom_hp).toBe(0) // custom reset
    expect(json2.faction_unit.weapon_id).toBe(0) // equip reset
    expect(json2.faction_funds).toBe(47498)
  })
})
