import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Squad API (team_members)', () => {
  let env: any
  let token1: string
  let token2: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret', BATTLE_COOLDOWN_SECONDS: 0 }

    // Factions
    await env.DB.prepare("INSERT INTO factions (id, name, leader_id) VALUES (1, 'Test Faction', 'user1')").run()
    await env.DB.prepare("INSERT INTO factions (id, name, leader_id) VALUES (2, 'Rival Faction', 'user3')").run()

    // Test users
    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, faction_id) 
       VALUES ('user1', 'hash', 'Pilot1', 'Test User1', 1)`
    ).run()
    
    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, faction_id) 
       VALUES ('user2', 'hash', 'Pilot2', 'Test User2', 1)`
    ).run()

    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, faction_id) 
       VALUES ('user3', 'hash', 'Pilot3', 'Test User3', 2)`
    ).run()

    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, faction_id) 
       VALUES ('user4_nofaction', 'hash', 'Pilot4', 'Test User4', NULL)`
    ).run()

    token1 = await sign({ id: 'user1' }, env.JWT_SECRET)
    token2 = await sign({ id: 'user4_nofaction' }, env.JWT_SECRET)
  })

  it('should not allow recruit if user has no faction', async () => {
    const res = await app.request('/api/squad/recruit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token2}` },
      body: JSON.stringify({ target_id: 'user1' })
    }, env)
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.message).toContain('勢力に所属していないため')
  })

  it('should not allow recruit a target from another faction', async () => {
    const res = await app.request('/api/squad/recruit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
      body: JSON.stringify({ target_id: 'user3' })
    }, env)
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.message).toContain('同じ勢力または無所属のメンバーしか編成できません')
  })

  it('should successfully recruit a member from the same faction', async () => {
    const res = await app.request('/api/squad/recruit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
      body: JSON.stringify({ target_id: 'user2' })
    }, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    // Check squad API
    const squadRes = await app.request('/api/squad', {
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    const squadJson = (await squadRes.json()) as any
    expect(squadJson.squad.length).toBe(1)
    expect(squadJson.squad[0].character_id).toBe('user2')
    expect(squadJson.squad[0].name).toBe('Test User2')
  })

  it('should reject recruiting the same member twice (二重編成防止)', async () => {
    // 直前のテストで user2 は既に user1 のメンバー。同じ相手を再度勧誘すると拒否される。
    const res = await app.request('/api/squad/recruit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
      body: JSON.stringify({ target_id: 'user2' })
    }, env)
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.message).toContain('既にチームメンバー')

    // 二重に入っていないこと（1行のまま）
    const squadRes = await app.request('/api/squad', {
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    const squadJson = (await squadRes.json()) as any
    expect(squadJson.squad.length).toBe(1)
  })

  it('should list candidates: same faction and factionless (manual_team.htm 準拠)', async () => {
    const res = await app.request('/api/squad/candidates', {
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    const ids = json.candidates.map((c: any) => c.id).sort()
    expect(ids).toEqual(['user2', 'user4_nofaction']) // 自勢力 + 無所属。他勢力(user3)は含まない
  })

  it('should not allow recruiting self', async () => {
    const res = await app.request('/api/squad/recruit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
      body: JSON.stringify({ target_id: 'user1' })
    }, env)
    expect(res.status).toBe(400)
  })
  describe('P43 B5: コスト・チーム戦術制限', () => {
    it('candidates にコスト（/api/me と同式）が付与される', async () => {
      const res = await app.request('/api/squad/candidates', {
        headers: { 'Authorization': `Bearer ${token1}` }
      }, env)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.candidates.length).toBeGreaterThan(0)
      for (const cand of data.candidates) {
        expect(typeof cand.cost).toBe('number')
      }
    })

    it('総コスト240超の編成は拒否される (manual_team.htm 準拠)', async () => {
      // level 3000 → rankScore ≈ 75500 → kaiInd ≈ 301 → cost ≈ 332 で単独でも240超
      await env.DB.prepare(`UPDATE characters SET level = 3000, status_intuition = 100, status_piloting = 100, status_short_range = 100, status_mid_range = 100, status_long_range = 100 WHERE id = 'user4_nofaction'`).run()

      const res = await app.request('/api/squad/recruit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
        body: JSON.stringify({ target_id: 'user4_nofaction' })
      }, env)
      const data = await res.json() as any
      expect(data.success).toBe(false)
      expect(data.message).toContain('総コスト')
    })

    it('機体Lv違いでコストが変動することを確認', async () => {
      // ユーザー3（コストの確認対象）のunit_idを調整し、unit_lvでコストが変動するか確認する
      let res = await app.request('/api/squad/candidates', {
        headers: { 'Authorization': `Bearer ${token1}` }
      }, env);
      let data = await res.json() as any;
      const targetId = data.candidates[0].id;

      await env.DB.prepare(`UPDATE characters SET unit_id = 9999, level = 100 WHERE id = ?`).bind(targetId).run();
      await env.DB.prepare(`INSERT OR REPLACE INTO units (id, name, unit_lv) VALUES (9999, 'TestUnit', 1)`).run();
      
      res = await app.request('/api/squad/candidates', {
        headers: { 'Authorization': `Bearer ${token1}` }
      }, env);
      data = await res.json() as any;
      let cand1 = data.candidates.find((c: any) => c.id === targetId);
      const costLv1 = cand1.cost;

      // unit_lv = 500 の場合（コストが劇的に上がるはず、calcCostの仕様による）
      await env.DB.prepare(`UPDATE units SET unit_lv = 500 WHERE id = 9999`).run();
      
      res = await app.request('/api/squad/candidates', {
        headers: { 'Authorization': `Bearer ${token1}` }
      }, env);
      data = await res.json() as any;
      let cand500 = data.candidates.find((c: any) => c.id === targetId);
      const costLv500 = cand500.cost;

      expect(costLv500).toBeGreaterThan(costLv1);
    })
  })
})


