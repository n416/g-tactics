import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Battle API', () => {
  let env: any
  let token: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret', BATTLE_COOLDOWN_SECONDS: 0 }

    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name) 
       VALUES ('defender1', 'hash', 'Defender', 'Def Chara')`
    ).run()

    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name) 
       VALUES ('attacker1', 'hash', 'Attacker', 'Att Chara')`
    ).run()

    await db.prepare(
      `INSERT INTO battle_logs (attacker_id, defender_id, is_attacker_win, log_text)
       VALUES ('attacker1', 'defender1', 1, 'Test Battle Log')`
    ).run()

    token = await sign({ id: 'defender1' }, env.JWT_SECRET)
  })

  it('should get battle logs for the user', async () => {
    const res = await app.request('/api/battle/logs', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)

    if (res.status !== 200) console.log(await res.json()); expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.logs).toBeInstanceOf(Array)
    expect(json.logs.length).toBe(1)
    expect(json.logs[0].log_text).toBe('Test Battle Log')
  })

  it('should fail without token', async () => {
    const res = await app.request('/api/battle/logs', {}, env)
    expect(res.status).toBe(401)
  })

  it('should return battle records via /api/me', async () => {
    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, total_battles, win_battles)
       VALUES ('meStats', 'hash', 'MeStats', 'M', 10, 7)`
    ).run()
    const meToken = await sign({ id: 'meStats' }, env.JWT_SECRET)
    const res = await app.request('/api/me', {
      headers: { 'Authorization': `Bearer ${meToken}` }
    }, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.user.total_battles).toBe(10)
    expect(json.user.win_battles).toBe(7)
  })

  it('should run a simulator battle without changing money/fame and no post-battle effects', async () => {
    // simA has -18 (1.5x recover) and -16 (exp x2) as tokusyu
    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, money, exp, fame, skills, unit_custom_hp, current_hp)
       VALUES ('simA', 'hash', 'SimA', 'A', 1000, 10, 5, '{"melee": 1}', 100, 50)`
    ).run()
    await env.DB.prepare(
      `INSERT INTO units (id, name, tokusyu) VALUES (90999, 'TestUnit', '-18##-16')`
    ).run()
    await env.DB.prepare(
      `UPDATE characters SET unit_id = 90999 WHERE id = 'simA'`
    ).run()
    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name) VALUES ('simB', 'hash', 'SimB', 'B')`
    ).run()

    const atkToken = await sign({ id: 'simA' }, env.JWT_SECRET)
    const res = await app.request('/api/battle/simulator', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${atkToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: 'simB', tactics: 2 })
    }, env)

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.requiresSkillForget).toBeDefined()
    
    const a: any = await env.DB.prepare(`SELECT money, exp, fame, current_hp FROM characters WHERE id = 'simA'`).first()
    expect(a.money).toBe(1000)
    expect(a.fame).toBe(5)
    // P47-B3: 対人シミュレーター(原作vschar=battle_syurui2)は原作どおり経験値が入る（賞金・名声はなし）
    expect(a.exp).toBeGreaterThan(10)

    // simulator DOES NOT update DB with result HP for PvP.
    expect(a.current_hp).toBe(50)
  })

  it('should trigger skill forget if skills exceed 12 and handle forget-skill', async () => {
    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, skills)
       VALUES ('simC', 'hash', 'SimC', 'C', '{"melee": 10, "snipe": 3}')`
    ).run()
    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name) VALUES ('npc_simD', 'hash', 'SimD', 'D')`
    ).run()


    const atkToken = await sign({ id: 'simC' }, env.JWT_SECRET)
    const forgetRes = await app.request('/api/battle/forget-skill', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${atkToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill_name: 'melee' })
    }, env)
    
    expect(forgetRes.status).toBe(200)
    const fJson = (await forgetRes.json()) as any
    expect(fJson.success).toBe(true)
    
    const user: any = await env.DB.prepare(`SELECT skills FROM characters WHERE id = 'simC'`).first()
    const skills = JSON.parse(user.skills)
    expect(skills.melee).toBe(9)
  })
})
