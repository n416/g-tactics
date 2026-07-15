import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

// 個別戦闘(defense_battles)の防衛者に対する winchg（戦術反映）と 整備回復。
// champions と同じ導線が defense_battles にも効くことを確認する。
describe('個別戦闘 winchg / 整備回復', () => {
  let env: any
  let token: string
  let battleId: number

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }

    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id, tactics)
       VALUES ('90401','h','D','防衛者',5,1000,10,1,'00')`
    ).run()

    // 90401 が防衛者の個別戦闘（snapshot: tactics=00, maxHp=1000, def_hp=300 と削れた状態）
    const snap = JSON.stringify({ chara_name: '防衛者', tactics: '00', maxHp: 1000, maxEn: 200 })
    await db.prepare(
      `INSERT INTO defense_battles (owner_id, title, is_team, terrain, req_unit_type, req_max_hp, req_rank, champion_id, win_count, snapshot_data, def_hp, def_en)
       VALUES ('90401','個別戦闘',0,1,'',0,0,'90401',3,?,300,50)`
    ).bind(snap).run()
    const b: any = await db.prepare(`SELECT id FROM defense_battles WHERE owner_id='90401'`).first()
    battleId = b.id

    token = await sign({ id: '90401' }, env.JWT_SECRET)
  })

  it('winchg: 戦術変更を update_champion=true で個別戦闘のsnapshotへ反映', async () => {
    const res = await app.request('/api/tactics', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tactics: 'LA', update_champion: true })
    }, env)
    expect(res.status).toBe(200)

    const b: any = await env.DB.prepare(`SELECT snapshot_data FROM defense_battles WHERE id=?`).bind(battleId).first()
    expect(JSON.parse(b.snapshot_data).tactics).toBe('LA')
  })

  it('整備: update_champion=true で個別戦闘の防衛耐久が満タンに戻る', async () => {
    const res = await app.request('/api/seibi', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_champion: true })
    }, env)
    expect(res.status).toBe(200)

    const b: any = await env.DB.prepare(`SELECT def_hp, def_en FROM defense_battles WHERE id=?`).bind(battleId).first()
    expect(b.def_hp).toBe(1000)
    expect(b.def_en).toBe(200)
  })
})
