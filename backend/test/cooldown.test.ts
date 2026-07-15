import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

// P32: 戦闘クールダウン（原作 battle.cgi:58-62 ほか「○秒後闘えるようになります」）
describe('戦闘クールダウン (P32)', () => {
  let env: any
  let token1: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret', BATTLE_COOLDOWN_SECONDS: 60 }

    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id)
       VALUES ('cd1', 'hash', 'CD1', 'クールダウン太郎', 5, 1000, 10, 1)`
    ).run()
    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id)
       VALUES ('cd2', 'hash', 'CD2', '標的', 5, 1000, 10, 2)`
    ).run()

    token1 = await sign({ id: 'cd1' }, env.JWT_SECRET)
  })

  it('直前に戦闘していると「○秒後闘えるようになります」で拒否される', async () => {
    const now = Math.floor(Date.now() / 1000)
    await env.DB.prepare(`UPDATE characters SET last_battle_at = ? WHERE id = 'cd1'`).bind(now).run()

    const res = await app.request('/api/battle/simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
      body: JSON.stringify({})
    }, env)
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.message).toContain('秒後闘えるようになります')
  })

  it('間隔経過後は戦闘でき、last_battle_at が更新される', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600
    await env.DB.prepare(`UPDATE characters SET last_battle_at = ? WHERE id = 'cd1'`).bind(past).run()

    const res = await app.request('/api/battle/simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
      body: JSON.stringify({})
    }, env)
    expect(res.status).toBe(200)

    const row: any = await env.DB.prepare(`SELECT last_battle_at FROM characters WHERE id = 'cd1'`).first()
    expect(Number(row.last_battle_at)).toBeGreaterThan(past)
  })

  it('クールダウン0（無効化）なら連戦できる', async () => {
    const env0 = { ...env, BATTLE_COOLDOWN_SECONDS: 0 }
    await env.DB.prepare(`UPDATE characters SET last_battle_at = ?, current_hp = -1, current_en = -1 WHERE id = 'cd1'`)
      .bind(Math.floor(Date.now() / 1000)).run()
    const res = await app.request('/api/battle/simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
      body: JSON.stringify({})
    }, env0)
    expect(res.status).toBe(200)
  })
})
