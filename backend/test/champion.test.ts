import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Champion (優勝戦) API', () => {
  let env: any
  let token1: string
  let token2: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret', BATTLE_COOLDOWN_SECONDS: 0 }

    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id)
       VALUES ('champ1', 'hash', 'Champ1', '王者候補', 5, 1000, 10, 1)`
    ).run()
    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id)
       VALUES ('chall1', 'hash', 'Chall1', '挑戦者', 5, 1000, 10, 2)`
    ).run()

    token1 = await sign({ id: 'champ1' }, env.JWT_SECRET)
    token2 = await sign({ id: 'chall1' }, env.JWT_SECRET)
  })

  it('不正な type は拒否される', async () => {
    const res = await app.request('/api/champion/challenge/invalid', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    expect(res.status).toBe(400)
  })

  it('優勝者不在なら不戦勝で優勝者になる', async () => {
    const res = await app.request('/api/champion/challenge/individual', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.message).toContain('不戦勝')

    const champ: any = await env.DB.prepare(`SELECT * FROM champions WHERE type = 'individual'`).first()
    expect(champ.champion_id).toBe('champ1')
    expect(champ.win_count).toBe(1)
  })

  it('現優勝者は自分に挑戦できない', async () => {
    const res = await app.request('/api/champion/challenge/individual', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    expect(res.status).toBe(400)
  })

  it('挑戦が成立し、勝敗に応じて優勝者交代 or 連勝+1・戦場カウンタが進む', async () => {
    const before: any = await env.DB.prepare(`SELECT * FROM champions WHERE type = 'individual'`).first()
    const res = await app.request('/api/champion/challenge/individual', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token2}` }
    }, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    const after: any = await env.DB.prepare(`SELECT * FROM champions WHERE type = 'individual'`).first()
    if (json.meta.isSuccess) {
      expect(after.champion_id).toBe('chall1')
      expect(after.win_count).toBe(1)
    } else {
      expect(after.champion_id).toBe('champ1')
      expect(after.win_count).toBe(2)
    }
    // 戦場カウンタは1減る（<1でローテーションして再設定）
    expect(after.terrain_counter === before.terrain_counter - 1 || after.terrain_counter >= 5).toBe(true)

    // 戦績（P16）: 両者 total +1・勝敗合計1
    const a: any = await env.DB.prepare(`SELECT total_battles, win_battles FROM characters WHERE id = 'chall1'`).first()
    const d: any = await env.DB.prepare(`SELECT total_battles, win_battles FROM characters WHERE id = 'champ1'`).first()
    expect(a.total_battles).toBe(1)
    expect(d.total_battles).toBe(1)
    expect(a.win_battles + d.win_battles).toBe(1)
  })

  it('優勝者が存在する状態で GET /api/champion が 200・logs を返す', async () => {
    // 確実なテストのために、現在の優勝者を defender とするログを手動挿入する
    const champ: any = await env.DB.prepare(`SELECT champion_id FROM champions WHERE type = 'individual'`).first()
    await env.DB.prepare(`INSERT INTO battle_logs (attacker_id, defender_id, is_attacker_win, log_text, battle_type) VALUES (?, ?, ?, ?, ?)`)
      .bind('dummy', champ.champion_id, 0, 'test_log', 'champion_individual').run()

    const res = await app.request('/api/champion', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.individual).not.toBeNull()
    expect(json.individual.logs).toBeDefined()
    expect(json.individual.logs.length).toBeGreaterThan(0)
    // 挿入したログのbattle_typeが取得できているか確認
    expect(json.individual.logs[0].battle_type).toBe('champion_individual')
  })

  it('チーム優勝戦はチームメンバー無しでは挑戦できない', async () => {
    // 直前の個人優勝戦の勝敗はRNG依存で、敗北すると current_hp<=0 が残り
    // 大破判定（champion.ts）に先に当たってしまう。本テストの対象は
    // チームメンバー検査なので、機体を整備済み(-1=未設定=満タン扱い)に戻す
    await env.DB.prepare(`UPDATE characters SET current_hp = -1, current_en = -1 WHERE id IN ('champ1', 'chall1')`).run()

    // 先に团体枠の優勝者を作る（不戦勝）
    await app.request('/api/champion/challenge/team', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)

    const res = await app.request('/api/champion/challenge/team', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token2}` }
    }, env)
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.error).toContain('チームメンバーがいません')
  })

  it('戦場変更は現在の優勝者のみ可能で名声5を消費する', async () => {
    // 他人は拒否される（token1: champ1 は既に優勝者ではない）
    const resForbidden = await app.request('/api/champion/move-terrain/individual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
      body: JSON.stringify({ targetTerrain: 3 })
    }, env)
    expect(resForbidden.status).toBe(403)

    // 名声不足
    await env.DB.prepare(`UPDATE characters SET fame = 3 WHERE id = 'chall1'`).run()
    const resNg = await app.request('/api/champion/move-terrain/individual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token2}` },
      body: JSON.stringify({ targetTerrain: 3 })
    }, env)
    expect(resNg.status).toBe(400)

    // 名声十分かつ現優勝者（token2: chall1）
    await env.DB.prepare(`UPDATE characters SET fame = 10 WHERE id = 'chall1'`).run()
    const resOk = await app.request('/api/champion/move-terrain/individual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token2}` },
      body: JSON.stringify({ targetTerrain: 3 })
    }, env)
    expect(resOk.status).toBe(200)

    const champ: any = await env.DB.prepare(`SELECT terrain FROM champions WHERE type = 'individual'`).first()
    expect(champ.terrain).toBe(3)
    const chara: any = await env.DB.prepare(`SELECT fame FROM characters WHERE id = 'chall1'`).first()
    expect(chara.fame).toBe(5)
  })
})
