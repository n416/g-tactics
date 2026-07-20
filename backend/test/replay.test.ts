import { expect, test, describe, beforeAll, it } from 'vitest'
import { getTurretIntercept } from '../src/utils/baseFacilities'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Replay & Turret Logic', () => {
  test('getTurretIntercept returns correct values based on level', () => {
    // 範囲外
    expect(getTurretIntercept(0)).toEqual({ shots: 0, damage: 0 })
    expect(getTurretIntercept(6)).toEqual({ shots: 0, damage: 0 })

    // Lv1
    expect(getTurretIntercept(1)).toEqual({ shots: 1, damage: 20 })
    
    // Lv5
    expect(getTurretIntercept(5)).toEqual({ shots: 3, damage: 50 })
  })

  test('HP reduction logic in theory', () => {
    // 防衛側の迎撃ダメージ適用ロジックが HP 1 を保証するかの確認
    const turretDamage = 50 * 3; // 150
    let attackerHp = 100;
    
    const actualDamage = Math.max(0, Math.min(attackerHp - 1, turretDamage));
    attackerHp -= actualDamage;

    expect(actualDamage).toBe(99);
    expect(attackerHp).toBe(1);
    
    let attackerHp2 = 200;
    const actualDamage2 = Math.max(0, Math.min(attackerHp2 - 1, turretDamage));
    attackerHp2 -= actualDamage2;

    expect(actualDamage2).toBe(150);
    expect(attackerHp2).toBe(50);
  })
})

describe('/api/replay Endpoints', () => {
  let env: any
  let atkToken: string
  let defToken: string
  let thirdToken: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }

    await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name) VALUES ('atk', 'hash', 'Atk', 'Atk')`).run()
    await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name) VALUES ('def', 'hash', 'Def', 'Def')`).run()
    await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name) VALUES ('third', 'hash', 'Third', 'Third')`).run()

    atkToken = await sign({ id: 'atk' }, env.JWT_SECRET)
    defToken = await sign({ id: 'def' }, env.JWT_SECRET)
    thirdToken = await sign({ id: 'third' }, env.JWT_SECRET)

    // battle_logs 直接 INSERT
    await db.prepare(`
      INSERT INTO battle_logs (id, battle_type, attacker_id, defender_id, is_attacker_win, log_text, events_json) 
      VALUES (1, 'gate', 'atk', 'def', 1, 'text', '[{"type":"start"}]')
    `).run()

    await db.prepare(`
      INSERT INTO battle_logs (id, battle_type, attacker_id, defender_id, is_attacker_win, log_text, events_json) 
      VALUES (2, 'gate', 'atk', 'def', 1, 'text', NULL)
    `).run()
  })

  it('attacker 本人 200', async () => {
    const res = await app.request('/api/replay/1', { headers: { 'Authorization': `Bearer ${atkToken}` } }, env)
    expect(res.status).toBe(200)
    const json = await res.json() as any
    expect(json.events).toBeTruthy()
    expect(json.events.length).toBeGreaterThan(0)
  })

  it('defender 本人 200', async () => {
    const res = await app.request('/api/replay/1', { headers: { 'Authorization': `Bearer ${defToken}` } }, env)
    expect(res.status).toBe(200)
  })

  it('第三者 403', async () => {
    const res = await app.request('/api/replay/1', { headers: { 'Authorization': `Bearer ${thirdToken}` } }, env)
    expect(res.status).toBe(403)
  })

  it('events_json なし 404', async () => {
    const res = await app.request('/api/replay/2', { headers: { 'Authorization': `Bearer ${atkToken}` } }, env)
    expect(res.status).toBe(404)
  })

  it('存在しないID 404', async () => {
    const res = await app.request('/api/replay/999', { headers: { 'Authorization': `Bearer ${atkToken}` } }, env)
    expect(res.status).toBe(404)
  })
})
