import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

// チーム戦（優勝戦・個別戦闘）を最後まで通し、レスポンスと持ち越しを検証する。
// これまで team 経路は「メンバー無し→400」か「レスポンス無検証」しか無く、
// 勝敗更新（aTeam/dTeam 参照）まで到達＋検証するテストが無かった＝スコープバグを素通りさせた。
describe('チーム戦 完走＋耐久持ち越し (優勝戦/個別戦闘)', () => {
  let env: any
  let t1: string, t2: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret', BATTLE_COOLDOWN_SECONDS: 0 }

    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, faction_id, money, status_piloting, unit_id)
       VALUES
       ('owner1','h','O1','隊長1',1,10000,15,1),
       ('mem1','h','M1','隊員1',1,10000,20,1),
       ('owner2','h','O2','隊長2',2,10000,10,1),
       ('mem2','h','M2','隊員2',2,10000,30,1)`
    ).run()

    t1 = await sign({ id: 'owner1' }, env.JWT_SECRET)
    t2 = await sign({ id: 'owner2' }, env.JWT_SECRET)

    // チーム編成（team_members を作る）
    await app.request('/api/squad/recruit', { method: 'POST', headers: { Authorization: `Bearer ${t1}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ target_id: 'mem1' }) }, env)
    await app.request('/api/squad/recruit', { method: 'POST', headers: { Authorization: `Bearer ${t2}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ target_id: 'mem2' }) }, env)
  })

  it('チーム優勝戦: 挑戦が500で落ちず完走し、防衛snapshot/def_hpが記録される', async () => {
    // owner1 が不戦勝でチーム優勝者に
    await app.request('/api/champion/challenge/team', { method: 'POST', headers: { Authorization: `Bearer ${t1}` } }, env)

    // owner2 がフルのチーム戦を挑戦（ここで勝敗更新=aTeam/dTeam 参照に到達）
    const res = await app.request('/api/champion/challenge/team', { method: 'POST', headers: { Authorization: `Bearer ${t2}` } }, env)
    expect(res.status).toBe(200) // ReferenceError なら 500 になる

    const champ: any = await env.DB.prepare(`SELECT snapshot_data, def_hp FROM champions WHERE type='team'`).first()
    expect(champ.snapshot_data).not.toBeNull()
    expect(typeof champ.def_hp).toBe('number')
  })

  it('個別戦闘(チーム): 挑戦が500で落ちず完走し、防衛snapshot/def_hpが記録される', async () => {
    // 直前のチーム優勝戦で挑戦側が大破しているとRNG次第で「大破」400になるため整備
    await env.DB.prepare(`UPDATE characters SET current_hp = -1, current_en = -1 WHERE id IN ('owner2','mem2')`).run()

    // owner1 がチーム個別戦闘を設置（防衛者=owner1）
    await env.DB.prepare(
      `INSERT INTO defense_battles (owner_id, title, is_team, terrain, req_unit_type, req_max_hp, req_rank, champion_id, win_count)
       VALUES ('owner1','チーム個別戦闘',1,1,'',0,0,'owner1',1)`
    ).run()
    const b: any = await env.DB.prepare(`SELECT id FROM defense_battles WHERE owner_id='owner1'`).first()

    const res = await app.request(`/api/defense/challenge/${b.id}`, { method: 'POST', headers: { Authorization: `Bearer ${t2}`, 'Content-Type': 'application/json' }, body: '{}' }, env)
    expect(res.status).toBe(200)

    const bat: any = await env.DB.prepare(`SELECT snapshot_data, def_hp FROM defense_battles WHERE id=?`).bind(b.id).first()
    expect(bat.snapshot_data).not.toBeNull()
    expect(typeof bat.def_hp).toBe('number')
  })
})
