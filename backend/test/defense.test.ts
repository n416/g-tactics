import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Defense (個別戦闘) API', () => {
  let env: any
  let token1: string
  let token2: string
  let weakToken: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret', BATTLE_COOLDOWN_SECONDS: 0 }

    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id)
       VALUES ('def1', 'hash', 'Defender1', '防衛者', 5, 1000, 10, 1)`
    ).run()
    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id)
       VALUES ('atk1', 'hash', 'Attacker1', '挑戦者', 5, 1000, 10, 2)`
    ).run()
    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id)
       VALUES ('weak1', 'hash', 'Weak1', '弱い人', 1, 100, 0, 1)`
    ).run()

    token1 = await sign({ id: 'def1' }, env.JWT_SECRET)
    token2 = await sign({ id: 'atk1' }, env.JWT_SECRET)
    weakToken = await sign({ id: 'weak1' }, env.JWT_SECRET)
  })

  it('作戦名なしの作戦設置は拒否される', async () => {
    const res = await app.request('/api/defense/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
      body: JSON.stringify({ title: '  ' })
    }, env)
    expect(res.status).toBe(400)
  })

  it('作戦を設置でき、設置者が初代防衛者になる', async () => {
    const res = await app.request('/api/defense/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
      body: JSON.stringify({ title: 'テスト防衛線', terrain: 2 })
    }, env)
    expect(res.status).toBe(200)

    const gate: any = await env.DB.prepare(`SELECT * FROM defense_battles WHERE owner_id = 'def1'`).first()
    expect(gate).toBeTruthy()
    expect(gate.champion_id).toBe('def1')
    expect(gate.win_count).toBe(1)
    expect(gate.terrain).toBe(2)
  })

  it('二重設置は拒否される', async () => {
    const res = await app.request('/api/defense/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
      body: JSON.stringify({ title: '二つ目' })
    }, env)
    expect(res.status).toBe(400)
  })

  it('防衛者本人は自分の作戦に挑戦できない', async () => {
    const gate: any = await env.DB.prepare(`SELECT id FROM defense_battles WHERE owner_id = 'def1'`).first()
    const res = await app.request(`/api/defense/challenge/${gate.id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    expect(res.status).toBe(400)
  })

  it('参加条件（ランク以上）を満たさない挑戦者は拒否される', async () => {
    // ランク条件5以上の作戦を atk1 が設置しようとすると自分も満たさないため拒否される
    const resSelf = await app.request('/api/defense/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token2}` },
      body: JSON.stringify({ title: 'ランク制限作戦', reqRank: 30 })
    }, env)
    expect(resSelf.status).toBe(400)
    const json = (await resSelf.json()) as any
    expect(json.error).toContain('自分が条件にあっていません')
  })

  it('参加条件（耐久力以上）を満たさない挑戦者は拒否される', async () => {
    // def1 の作戦に耐久条件を直接設定（テスト用）
    await env.DB.prepare(`UPDATE defense_battles SET req_max_hp = 99999 WHERE owner_id = 'def1'`).run()
    const gate: any = await env.DB.prepare(`SELECT id FROM defense_battles WHERE owner_id = 'def1'`).first()

    const res = await app.request(`/api/defense/challenge/${gate.id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${weakToken}` }
    }, env)
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.error).toContain('耐久力')

    await env.DB.prepare(`UPDATE defense_battles SET req_max_hp = 0 WHERE owner_id = 'def1'`).run()
  })

  it('挑戦が成立し、勝敗に応じて作戦状態が更新される（勝者交代 or 連勝+1）', async () => {
    const gateBefore: any = await env.DB.prepare(`SELECT * FROM defense_battles WHERE owner_id = 'def1'`).first()
    const res = await app.request(`/api/defense/challenge/${gateBefore.id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token2}` }
    }, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.meta).toBeTruthy()

    const gateAfter: any = await env.DB.prepare(`SELECT * FROM defense_battles WHERE id = ?`).bind(gateBefore.id).first()
    if (json.meta.isSuccess) {
      // 勝った挑戦者が新防衛者（原作: 作戦は消えず wcount=1 で交代）
      expect(gateAfter.champion_id).toBe('atk1')
      expect(gateAfter.win_count).toBe(1)
    } else {
      expect(gateAfter.champion_id).toBe('def1')
      expect(gateAfter.win_count).toBe(2)
    }

    // 戦績（P16）: 両者 total +1
    const a: any = await env.DB.prepare(`SELECT total_battles FROM characters WHERE id = 'atk1'`).first()
    const d: any = await env.DB.prepare(`SELECT total_battles FROM characters WHERE id = 'def1'`).first()
    expect(a.total_battles).toBe(1)
    expect(d.total_battles).toBe(1)
  })

  it('第三者が作戦の直近戦闘を観戦できる（Q2: defense_battle_id で紐付き保存）', async () => {
    const gate: any = await env.DB.prepare(`SELECT * FROM defense_battles WHERE owner_id = 'def1'`).first()

    // 直前の挑戦戦闘が、作戦(defense_battle_id)に紐付いて battle_logs に保存されている
    const logRow: any = await env.DB.prepare(`SELECT * FROM battle_logs WHERE defense_battle_id = ?`).bind(gate.id).first()
    expect(logRow).toBeTruthy()
    expect(logRow.battle_type).toBe('gate')

    // 当事者でない第三者(weak1)でも観戦APIで直近戦闘を取得できる
    const res = await app.request(`/api/defense/${gate.id}/logs`, {
      headers: { 'Authorization': `Bearer ${weakToken}` }
    }, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.logs.length).toBeGreaterThanOrEqual(1)
    expect(json.logs[0].attacker_name).toBe('Attacker1')
    expect(json.logs[0].events).toBeTruthy()  // シーン再生用イベント
  })

  // 「撤退」テストは /withdraw/:id 撤去（原作に取り下げ導線なし・manual_kobetu）に伴い削除

  it('24時間戦闘のない作戦は一覧取得時に自動消滅する', async () => {
    await env.DB.prepare(`
      INSERT INTO defense_battles (owner_id, title, champion_id, win_count, last_challenge_at)
      VALUES ('def1', '期限切れ作戦', 'def1', 1, '2000-01-01 00:00:00')
    `).run()

    const res = await app.request('/api/defense', {
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.battles.every((b: any) => b.title !== '期限切れ作戦')).toBe(true)
  })

  it('チーム戦作戦はチームメンバー無しでは設置できない', async () => {
    // 旧・撤退テストが担っていた def1 作戦の後片付け（1人1設置制限のため）
    await env.DB.prepare(`DELETE FROM defense_battles WHERE owner_id = 'def1'`).run()
    const res = await app.request('/api/defense/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
      body: JSON.stringify({ title: 'チーム作戦', isTeam: true })
    }, env)
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.error).toContain('チームメンバーがいません')
  })
  describe('P43 B5: 個別戦闘制限', () => {
    it('ランク条件を満たさない挑戦者は拒否される（原作 trmt_jyoken 準拠）', async () => {
      // 設置者自身も条件を満たす必要がある（原作 sanka）ため def1 を強化。
      // rankScore = 500 + 30*25 = 1250 → idx = floor(1250/250)-1 = 4 ≥ reqRank(3)-1 ✓
      await env.DB.prepare(`UPDATE characters SET level = 30, status_intuition = 100, status_piloting = 100, status_short_range = 100, status_mid_range = 100, status_long_range = 100 WHERE id = 'def1'`).run()

      const cRes = await app.request('/api/defense/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
        body: JSON.stringify({ title: 'ランク制限作戦', isTeam: false, terrain: 1, reqRank: 3 })
      }, env)
      expect(cRes.status).toBe(200)

      const gate: any = await env.DB.prepare(`SELECT id FROM defense_battles WHERE title = 'ランク制限作戦'`).first()
      expect(gate).toBeTruthy()

      // weak1（idx = floor((50+25)/250)-1 = -1）はランク条件未達で拒否される
      const res = await app.request(`/api/defense/challenge/${gate.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${weakToken}` }
      }, env)
      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toContain('ランク')
    })

    it('機体限定条件（unit_id指定）に反する挑戦者は拒否される', async () => {
      // 設置は1人1件のため、まだ未設置の atk1（unit_id=2）が機体限定 '2' の作戦を設置
      const cRes = await app.request('/api/defense/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token2}` },
        body: JSON.stringify({ title: '機体限定作戦', isTeam: false, terrain: 1, reqUnitType: '2' })
      }, env)
      expect(cRes.status).toBe(200)

      const gate: any = await env.DB.prepare(`SELECT id FROM defense_battles WHERE title = '機体限定作戦'`).first()

      // weak1 の機体は unit_id=1 → 機体条件で拒否
      const res = await app.request(`/api/defense/challenge/${gate.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${weakToken}` }
      }, env)
      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toContain('機体')
    })
  })

  describe('Withdraw API', () => {
    it('他人の作戦は撤退させられない（設置者であっても、現在の防衛者でなければ撤退できない）', async () => {
      // ランク制限作戦（owner_id = 'def1'）の現防衛者を強制的に 'atk1' に変更
      await env.DB.prepare(`UPDATE defense_battles SET champion_id = 'atk1' WHERE title = 'ランク制限作戦'`).run()
      const gate: any = await env.DB.prepare(`SELECT id FROM defense_battles WHERE title = 'ランク制限作戦'`).first()

      // def1 (token1) は所有者だが現在の防衛者ではないので拒否される
      const res = await app.request(`/api/defense/withdraw/${gate.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token1}` }
      }, env)
      expect(res.status).toBe(403)
      const data = await res.json() as any
      expect(data.error).toContain('現在の防衛者のみ')

      // まったく無関係の weak1 (weakToken) も当然拒否される
      const res2 = await app.request(`/api/defense/withdraw/${gate.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${weakToken}` }
      }, env)
      expect(res2.status).toBe(403)
    })

    it('現在の防衛者であれば、自身の所有する作戦でなくても撤退させられる', async () => {
      const gate: any = await env.DB.prepare(`SELECT id FROM defense_battles WHERE title = 'ランク制限作戦'`).first()

      // atk1 (token2) は所有者ではないが現在の防衛者なので許可される
      const res = await app.request(`/api/defense/withdraw/${gate.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token2}` }
      }, env)
      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)

      const check = await env.DB.prepare(`SELECT * FROM defense_battles WHERE id = ?`).bind(gate.id).first()
      expect(check).toBeNull()
    })

    it('存在しない作戦は404', async () => {
      const res = await app.request(`/api/defense/withdraw/99999`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token1}` }
      }, env)
      expect(res.status).toBe(404)
    })
  })

  describe('個別戦にTurn0（砲台迎撃）は発動しない', () => {
    it('防衛側に砲台があっても個別戦ではTurn0の迎撃は発生しない', async () => {
      await env.DB.prepare(`UPDATE characters SET money = 1000 WHERE id = 'def1'`).run()
      await env.DB.prepare(`DELETE FROM defense_battles WHERE owner_id = 'def1'`).run()

      const cRes = await app.request('/api/defense/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
        body: JSON.stringify({ title: '砲台テスト作戦', terrain: 1 })
      }, env)
      expect(cRes.status).toBe(200)
      const gate: any = await env.DB.prepare(`SELECT id FROM defense_battles WHERE title = '砲台テスト作戦'`).first()

      // 付与
      await env.DB.prepare(`INSERT OR REPLACE INTO user_bases (user_id, name) VALUES ('def1', 'DefBase')`).run()
      await env.DB.prepare(`INSERT OR REPLACE INTO user_facilities (user_id, facility, level) VALUES ('def1', 'turret', 1)`).run()

      const res = await app.request(`/api/defense/challenge/${gate.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token2}` }
      }, env)
      const json = await res.json() as any
      expect(json.success).toBe(true)

      // ログに Turn 0 がないことを確認
      const logRow: any = await env.DB.prepare(`SELECT log_text FROM battle_logs WHERE defense_battle_id = ? ORDER BY id DESC LIMIT 1`).bind(gate.id).first()
      expect(logRow.log_text).not.toContain('Turn 0')
    })
  })
})







