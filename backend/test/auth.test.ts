import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'

describe('Auth API', () => {
  let env: any

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }
  })

  it('should register a new user', async () => {
    const res = await app.request('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'testuser',
        password: 'password123',
        handle_name: 'Test Pilot',
        chara_name: 'Test Character',
        status_intuition: 20,
        status_piloting: 20,
        status_short_range: 20,
        status_mid_range: 20,
        status_long_range: 20
      })
    }, env)

    const json = (await res.json()) as any
    if (res.status !== 200) console.error(json)
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.message).toContain('キャラクターの作成が完了しました')
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

