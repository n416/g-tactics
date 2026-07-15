import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

// P36: キャラクター削除（原作 action.cgi sakujyo / profile.cgi profsakujyo）
describe('キャラクター削除 (P36)', () => {
  let env: any
  let token: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }
    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, money, unit_id)
       VALUES ('del1', 'hash', 'DelUser', '削除される人', 1000, 1)`
    ).run()
    await db.prepare(`INSERT INTO hangars (user_id, unit_id) VALUES ('del1', 2)`).run()
    token = await sign({ id: 'del1' }, env.JWT_SECRET)
  })

  it('キャラクター名が一致しないと拒否される', async () => {
    const res = await app.request('/api/delete-character', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ confirm_name: '違う名前' })
    }, env)
    expect(res.status).toBe(400)
    const still = await env.DB.prepare(`SELECT id FROM characters WHERE id = 'del1'`).first()
    expect(still).toBeTruthy()
  })

  it('キャラクター名が一致すると本体と依存データが削除される', async () => {
    const res = await app.request('/api/delete-character', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ confirm_name: '削除される人' })
    }, env)
    expect(res.status).toBe(200)

    const gone = await env.DB.prepare(`SELECT id FROM characters WHERE id = 'del1'`).first()
    expect(gone).toBeFalsy()
    const hangar = await env.DB.prepare(`SELECT * FROM hangars WHERE user_id = 'del1'`).first()
    expect(hangar).toBeFalsy()
  })
})
