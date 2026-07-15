import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Tournament Mask (P49-A)', () => {
  let env: any

  const generateToken = async (id: string) => {
    return await sign({ id }, 'test-secret', 'HS256')
  }

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }

    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, is_admin, money) 
       VALUES 
       ('host1', 'hash', 'Host', 'Host Chara', 0, 10000),
       ('user1', 'hash', 'User1', 'User Chara 1', 0, 10000),
       ('user2', 'hash', 'User2', 'User Chara 2', 0, 10000),
       ('user3', 'hash', 'User3', 'User Chara 3', 0, 10000)`
    ).run()

    const createTourney = async (name: string, mask: number, format: number = 0) => {
      await env.DB.prepare(`
        INSERT INTO tournaments (name, prize_money, entry_fee, participant_limit, host_id, status, participant_mask, format)
        VALUES (?, 1000, 100, 16, 'host1', 0, ?, ?)
      `).bind(name, mask, format).run()
      const t = await env.DB.prepare(`SELECT id FROM tournaments WHERE name = ?`).bind(name).first()
      return t.id
    }

    const t0 = await createTourney('Mask0', 0)
    const t1 = await createTourney('Mask1', 1)
    const t2 = await createTourney('Mask2', 2)
    const t3 = await createTourney('Mask2_Team', 2, 3)

    const enroll = async (tid: number, cid: string, side: number = 0) => {
      await env.DB.prepare(`INSERT INTO tournament_participants (tournament_id, character_id, side) VALUES (?, ?, ?)`).bind(tid, cid, side).run()
    }

    await enroll(t0, 'user1'); await enroll(t0, 'user2');
    await enroll(t1, 'user1'); await enroll(t1, 'user2');
    await enroll(t2, 'user1'); await enroll(t2, 'user2');
    await enroll(t3, 'user1', 1); await enroll(t3, 'user2', 2);
  })

  it('mask=0: 全員にフル表示', async () => {
    const token = await generateToken('user3')
    const res = await app.request('/api/tournaments/1', { headers: { 'Authorization': `Bearer ${token}` } }, env)
    const data = await res.json() as any
    expect(data.participants.length).toBe(2)
    expect(data.participants[0].handle_name).toBe('User1')
    expect(data.isMasked).toBeFalsy()
  })

  it('mask=1: 第三者は内容非表示、人数はわかる', async () => {
    const token = await generateToken('user3')
    const res = await app.request('/api/tournaments/2', { headers: { 'Authorization': `Bearer ${token}` } }, env)
    const data = await res.json() as any
    expect(data.participants.length).toBe(2)
    expect(data.participants[0].handle_name).toBe('？？？？')
  })

  it('mask=1: 本人行はフル表示', async () => {
    const token = await generateToken('user1')
    const res = await app.request('/api/tournaments/2', { headers: { 'Authorization': `Bearer ${token}` } }, env)
    const data = await res.json() as any
    const p1 = data.participants.find((p: any) => p.character_id === 'user1')
    const p2 = data.participants.find((p: any) => p.character_id === 'user2')
    expect(p1.handle_name).toBe('User1')
    expect(p2.handle_name).toBe('？？？？')
  })

  it('mask=1: 設置者はフル表示', async () => {
    const token = await generateToken('host1')
    const res = await app.request('/api/tournaments/2', { headers: { 'Authorization': `Bearer ${token}` } }, env)
    const data = await res.json() as any
    expect(data.participants[0].handle_name).toBe('User1')
  })

  it('mask=2: 第三者はリスト取得不可、本人行のみ取得可能', async () => {
    const token = await generateToken('user1')
    const res = await app.request('/api/tournaments/3', { headers: { 'Authorization': `Bearer ${token}` } }, env)
    const data = await res.json() as any
    expect(data.isMasked).toBe(true)
    expect(data.participants.length).toBe(1)
    expect(data.participants[0].character_id).toBe('user1')
  })

  it('mask=2: 設置者はフル表示', async () => {
    const token = await generateToken('host1')
    const res = await app.request('/api/tournaments/3', { headers: { 'Authorization': `Bearer ${token}` } }, env)
    const data = await res.json() as any
    expect(data.participants.length).toBe(2)
    expect(data.participants[0].handle_name).toBe('User1')
  })
})
