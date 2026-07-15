import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Equip API', () => {
  let env: any
  let token: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }

    // ユーザー作成
    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, money, unit_id) 
       VALUES ('testuser', 'hash', 'Test Pilot', 'Test Character', 5000, 90010)`
    ).run()

    // ユニット作成 (max_weight: 30)
    await db.prepare(
      `INSERT INTO units (id, name, max_weight) VALUES (90010, 'Test Unit', 30)`
    ).run()

    // アイテム作成
    await db.prepare(
      `INSERT INTO items (id, name, item_type, weight) VALUES (901, 'Weapon (Weight 10)', 1, 10)`
    ).run()
    await db.prepare(
      `INSERT INTO items (id, name, item_type, weight) VALUES (902, 'Item 1 (Weight 20)', 6, 20)`
    ).run()
    await db.prepare(
      `INSERT INTO items (id, name, item_type, weight) VALUES (903, 'Item 2 (Weight 25)', 6, 25)`
    ).run()

    // インベントリ追加
    await db.prepare(`INSERT INTO item_inventory (id, user_id, item_id) VALUES (101, 'testuser', 901)`).run()
    await db.prepare(`INSERT INTO item_inventory (id, user_id, item_id) VALUES (102, 'testuser', 902)`).run()
    await db.prepare(`INSERT INTO item_inventory (id, user_id, item_id) VALUES (103, 'testuser', 903)`).run()

    token = await sign({ id: 'testuser' }, env.JWT_SECRET)
  })

  it('should get correct current_weight and max_weight from /api/me', async () => {
    const res = await app.request('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.user.max_weight).toBe(30)
    expect(json.user.current_weight).toBe(0)
  })

  it('should equip a weapon successfully within max_weight', async () => {
    const res = await app.request('/api/equip', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ inventory_id: 101, slot: 'weapon_id' })
    }, env)

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    // 重量確認
    const resMe = await app.request('/api/me', { headers: { 'Authorization': `Bearer ${token}` } }, env)
    const jsonMe = (await resMe.json()) as any
    expect(jsonMe.user.current_weight).toBe(10)
  })

  it('should equip an item successfully within max_weight', async () => {
    const res = await app.request('/api/equip', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ inventory_id: 102, slot: 'item1_id' })
    }, env)

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    // 重量確認 (Weapon 10 + Item 20 = 30)
    const resMe = await app.request('/api/me', { headers: { 'Authorization': `Bearer ${token}` } }, env)
    const jsonMe = (await resMe.json()) as any
    expect(jsonMe.user.current_weight).toBe(30)
  })

  it('should fail to equip an item if it exceeds max_weight', async () => {
    const res = await app.request('/api/equip', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ inventory_id: 103, slot: 'item2_id' }) // Weight 25
    }, env)

    const json = (await res.json()) as any
    expect(json.success).toBe(false)
    expect(json.message).toContain('積載量（重量）を超過するため装備できません')

    // 重量確認 (変化なし)
    const resMe = await app.request('/api/me', { headers: { 'Authorization': `Bearer ${token}` } }, env)
    const jsonMe = (await resMe.json()) as any
    expect(jsonMe.user.current_weight).toBe(30)
  })

  it('should successfully unequip an item and decrease current_weight', async () => {
    const res = await app.request('/api/equip', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ inventory_id: null, slot: 'item1_id' })
    }, env)

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.message).toBe('装備を外しました')

    // 重量確認 (Weapon 10 のみ)
    const resMe = await app.request('/api/me', { headers: { 'Authorization': `Bearer ${token}` } }, env)
    const jsonMe = (await resMe.json()) as any
    expect(jsonMe.user.current_weight).toBe(10)
  })
})
