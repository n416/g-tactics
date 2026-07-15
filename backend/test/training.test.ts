import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Training API', () => {
  let env: any
  let token: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }

    // モックデータの挿入
    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, money, fame, level, status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range) 
       VALUES ('testuser', 'hash', 'Test Pilot', 'Test Character', 5000, 100, 10, 20, 20, 20, 20, 20)`
    ).run()

    token = await sign({ id: 'testuser' }, env.JWT_SECRET)
  })

  it('should baimei successfully with sufficient funds', async () => {
    const res = await app.request('/api/training/baimei', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, env)

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.cost).toBe(1000)
    
    // 資金は確定で1000減る。名声はP48で原作式 int(rand(5+ずうずうしい/5)) に是正され
    // 1回あたり0〜4の獲得（0もあり得る）＝加算は非確定なので範囲で検証する
    const user = await env.DB.prepare(`SELECT money, fame FROM characters WHERE id = 'testuser'`).first()
    expect(user.money).toBe(4000) // 5000 - 1000
    expect(user.fame).toBeGreaterThanOrEqual(100)
    expect(user.fame).toBeLessThanOrEqual(104)
  })

  it('should fail baimei with insufficient funds', async () => {
    // 資金を減らす
    await env.DB.prepare(`UPDATE characters SET money = 0 WHERE id = 'testuser'`).run()

    const res = await app.request('/api/training/baimei', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, env)

    const json = (await res.json()) as any
    expect(json.success).toBe(false)
    expect(json.message).toContain('資金が足りません')
  })

  it('should meiseiuri successfully with sufficient fame', async () => {
    // 資金と名声をリセット
    await env.DB.prepare(`UPDATE characters SET money = 1000, fame = 100 WHERE id = 'testuser'`).run()

    const res = await app.request('/api/training/meiseiuri', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, env)

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    
    // 名声が減り、資金が増えているか確認
    const user = await env.DB.prepare(`SELECT money, fame FROM characters WHERE id = 'testuser'`).first()
    expect(user.fame).toBe(50) // 100 - 50 = 50
    expect(user.money).toBeGreaterThan(1000) // 元が1000で増えているはず
  })

  it('should fail meiseiuri with insufficient fame', async () => {
    // 名声を減らす
    await env.DB.prepare(`UPDATE characters SET fame = 10 WHERE id = 'testuser'`).run()

    const res = await app.request('/api/training/meiseiuri', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, env)

    const json = (await res.json()) as any
    expect(json.success).toBe(false)
    expect(json.message).toContain('名声が足りません')
  })

  describe('P43 B5: 特性開発室・能力低減', () => {
    it('特性開発で費用（金・名声）を消費し traits に反映される', async () => {
      await env.DB.prepare(`UPDATE characters SET level = 30, money = 10000, fame = 100, traits = '{}' WHERE id = 'testuser'`).run()
      const res = await app.request('/api/training/develop_trait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ trait_name: '人間嫌い', add_lv: 2 })
      }, env)
      expect(res.status).toBe(200)
      const user = await env.DB.prepare(`SELECT money, fame, traits FROM characters WHERE id = 'testuser'`).first()
      expect(user.money).toBe(8000)  // 10000 - 1000×2
      expect(user.fame).toBe(80)     // 100 - 10×2
      expect(JSON.parse(user.traits)['人間嫌い']).toBe(2)
    })

    it('総特性Lv上限（キャラLv/2）を超える開発は拒否される', async () => {
      // level30 → 上限15。既にLv2保有＋追加14 = 16 > 15 → 拒否
      const res = await app.request('/api/training/develop_trait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ trait_name: '運が悪い', add_lv: 14 })
      }, env)
      expect(res.status).toBe(400)
      const json = (await res.json()) as any
      expect(json.message).toContain('上限')
    })

    it('能力低減訓練で能力が1下がる（返金なし）', async () => {
      const before: any = await env.DB.prepare(`SELECT status_intuition, money FROM characters WHERE id = 'testuser'`).first()
      const res = await app.request('/api/training/reduce_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status_type: 'intuition' })
      }, env)
      expect(res.status).toBe(200)
      const after: any = await env.DB.prepare(`SELECT status_intuition, money FROM characters WHERE id = 'testuser'`).first()
      expect(after.status_intuition).toBe(before.status_intuition - 1)
      expect(after.money).toBe(before.money) // 返金なし
    })

    it('特性全削除は熟練度30以上が必要', async () => {
      await env.DB.prepare(`UPDATE characters SET level = 10 WHERE id = 'testuser'`).run()
      const resNg = await app.request('/api/training/reset_traits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      }, env)
      expect(resNg.status).toBe(400)

      await env.DB.prepare(`UPDATE characters SET level = 30 WHERE id = 'testuser'`).run()
      const resOk = await app.request('/api/training/reset_traits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      }, env)
      expect(resOk.status).toBe(200)
      const user = await env.DB.prepare(`SELECT traits FROM characters WHERE id = 'testuser'`).first()
      expect(JSON.parse(user.traits)).toEqual({})
    })
  })
})
