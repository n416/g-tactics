import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Faction API', () => {
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
       ('applicant1', 'hash', 'Appli', 'App Chara', 1, 'applicant', '【所属希望】', 'いれて', 10000),
       ('outsider1', 'hash', 'Outsider', 'Out Chara', 0, 'member', '', '', 10000)`
    ).run()
  })

  it('should list all factions', async () => {
    const res = await app.request('/api/factions', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.factions).toBeInstanceOf(Array)
    expect(json.factions.length).toBe(1)
    expect(json.factions[0].name).toBe('Test Faction')
    expect(json.factions[0].member_count).toBe(2) // applicant is excluded from count
  })

  it('should get faction details', async () => {
    const res = await app.request('/api/factions/1', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.faction).toBeDefined()
    expect(json.members).toBeInstanceOf(Array)
    expect(json.members.length).toBe(3) // leader, member, applicant
  })

  it('should apply to join faction', async () => {
    const token = await generateToken('outsider1')
    const res = await app.request('/api/factions/1/join', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '参加希望です' })
    }, env)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    // Check DB
    const chara = await env.DB.prepare(`SELECT * FROM characters WHERE id = 'outsider1'`).first()
    expect(chara.faction_id).toBe(1)
    expect(chara.faction_role).toBe('applicant')
    expect(chara.faction_message).toBe('参加希望です')
  })

  it('should approve an applicant by leader', async () => {
    const token = await generateToken('leader1')
    const res = await app.request('/api/factions/1/approve/outsider1', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    const chara = await env.DB.prepare(`SELECT * FROM characters WHERE id = 'outsider1'`).first()
    expect(chara.faction_role).toBe('member')
  })

  it('should reject non-leader actions with 403', async () => {
    const token = await generateToken('member1')
    
    // member1 tries to kick outsider1
    const resKick = await app.request('/api/factions/1/kick/outsider1', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    expect(resKick.status).toBe(403)
    
    // member1 tries to update faction settings
    const resUpdate = await app.request('/api/factions/1', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hacked Faction' })
    }, env)
    expect(resUpdate.status).toBe(403)
  })

  it('should kick a member by leader', async () => {
    const token = await generateToken('leader1')
    const res = await app.request('/api/factions/1/kick/outsider1', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    const chara = await env.DB.prepare(`SELECT * FROM characters WHERE id = 'outsider1'`).first()
    expect(chara.faction_id).toBe(0)
  })

  it('should update faction settings by leader', async () => {
    const token = await generateToken('leader1')
    const res = await app.request('/api/factions/1', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Faction', notice: 'New Notice', max_members: 50 })
    }, env)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    const faction = await env.DB.prepare(`SELECT * FROM factions WHERE id = 1`).first()
    expect(faction.name).toBe('Updated Faction')
    expect(faction.notice).toBe('New Notice')
    expect(faction.max_members).toBe(50)
  })

  it('should delegate leadership', async () => {
    const token = await generateToken('leader1')
    const res = await app.request('/api/factions/1/delegate/member1', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    const oldLeader = await env.DB.prepare(`SELECT * FROM characters WHERE id = 'leader1'`).first()
    expect(oldLeader.faction_role).toBe('member')

    const newLeader = await env.DB.prepare(`SELECT * FROM characters WHERE id = 'member1'`).first()
    expect(newLeader.faction_role).toBe('leader')

    const faction = await env.DB.prepare(`SELECT * FROM factions WHERE id = 1`).first()
    expect(faction.leader_id).toBe('member1')
  })

  it('should prevent leader from leaving if other members exist', async () => {
    // Now member1 is the leader.
    const token = await generateToken('member1')
    const res = await app.request('/api/factions/1/leave', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    const json = (await res.json()) as any
    // Should fail because leader1 and applicant1 are still in the faction
    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.message).toContain('脱退・解散できません')
  })

})
