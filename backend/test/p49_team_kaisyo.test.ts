import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Team Kaisyo & Snare (P49-C)', () => {
  let env: any

  const generateToken = async (id: string) => {
    return await sign({ id }, 'test-secret', 'HS256')
  }

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }

    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, faction_id, money, status_piloting) 
       VALUES 
       ('owner1', 'hash', 'O1', 'Owner 1', 1, 10000, 15),
       ('mem1', 'hash', 'M1', 'Member 1', 1, 10000, 20),
       ('owner2', 'hash', 'O2', 'Owner 2', 2, 10000, 10),
       ('mem2', 'hash', 'M2', 'Member 2', 2, 10000, 30)`
    ).run()

    const token1 = await generateToken('owner1')
    await app.request('/api/squad/recruit', { method: 'POST', headers: { 'Authorization': `Bearer ${token1}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ target_id: 'mem1' }) }, env)
    const token2 = await generateToken('owner2')
    await app.request('/api/squad/recruit', { method: 'POST', headers: { 'Authorization': `Bearer ${token2}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ target_id: 'mem2' }) }, env)
  })

  it('recruit: kaisyo_cap=加入時piloting, team_kaisyo=0 になる', async () => {
    const m1 = await env.DB.prepare(`SELECT team_kaisyo, kaisyo_cap FROM team_members WHERE owner_id='owner1' AND character_id='mem1'`).first()
    expect(m1.team_kaisyo).toBe(0)
    expect(m1.kaisyo_cap).toBe(20)
  })

  it('チーム優勝戦を行うと勝敗不問でteam_kaisyoが増加', async () => {
    const token1 = await generateToken('owner1')
    await app.request('/api/champion/challenge/team', { method: 'POST', headers: { 'Authorization': `Bearer ${token1}` } }, env)

    const champ = await env.DB.prepare(`SELECT champion_id FROM champions WHERE type='team'`).first()
    expect(champ.champion_id).toBe('owner1')

    const m1 = await env.DB.prepare(`SELECT team_kaisyo FROM team_members WHERE owner_id='owner1' AND character_id='mem1'`).first()
    expect(m1.team_kaisyo).toBe(0)

    const token2 = await generateToken('owner2')
    await app.request('/api/champion/challenge/team', { method: 'POST', headers: { 'Authorization': `Bearer ${token2}` } }, env)

    const m1_2 = await env.DB.prepare(`SELECT team_kaisyo FROM team_members WHERE owner_id='owner1' AND character_id='mem1'`).first()
    expect(m1_2.team_kaisyo).toBe(1)

    const m2 = await env.DB.prepare(`SELECT team_kaisyo FROM team_members WHERE owner_id='owner2' AND character_id='mem2'`).first()
    expect(m2.team_kaisyo).toBe(1)
  })

  it('除隊でkaisyoは消える（レコード削除）', async () => {
    const token1 = await generateToken('owner1')
    const m = await env.DB.prepare(`SELECT id FROM team_members WHERE owner_id='owner1'`).first()
    await app.request(`/api/squad/remove/${m.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token1}` } }, env)

    const count = await env.DB.prepare(`SELECT COUNT(*) as c FROM team_members WHERE owner_id='owner1'`).first()
    expect(count.c).toBe(0)
  })
})
