import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

// P53 第2便: winchg（優勝戦反映）
// - 現王者が update_champion=true で機体/戦術を変えると防衛snapshotに反映される
// - update_champion 未指定/false なら防衛snapshotは据え置き
// - 非王者は winchg 対象外（champions を触らない・エラーにならない）
describe('Champion winchg (P53 第2便)', () => {
  let env: any
  let champToken: string
  let nonChampToken: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret', BATTLE_COOLDOWN_SECONDS: 0 }

    // 90101: 現・個人戦優勝者（tactics=00）
    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id, tactics)
       VALUES ('90101', 'hash', 'King', '王者', 5, 1000, 10, 1, '00')`
    ).run()
    // 90102: 非優勝者
    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id, tactics)
       VALUES ('90102', 'hash', 'Nobody', '一般兵', 5, 1000, 10, 2, '00')`
    ).run()

    // champions: 90101 を優勝者に。防衛snapshot(tactics=00)と def_hp を持たせる
    const snap = JSON.stringify({ chara_name: '王者', tactics: '00', maxHp: 1000 })
    await db.prepare(
      `INSERT INTO champions (type, champion_id, win_count, terrain, terrain_counter, snapshot_data, def_hp, def_en)
       VALUES ('individual', '90101', 3, 1, 10, ?, 800, 100)`
    ).bind(snap).run()

    champToken = await sign({ id: '90101' }, env.JWT_SECRET)
    nonChampToken = await sign({ id: '90102' }, env.JWT_SECRET)
  })

  const postTactics = (token: string, body: any) =>
    app.request('/api/tactics', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, env)

  const readSnapTactics = async () => {
    const champ: any = await env.DB.prepare(`SELECT snapshot_data FROM champions WHERE type = 'individual'`).first()
    return JSON.parse(champ.snapshot_data).tactics
  }

  it('王者が update_champion=true で戦術を変えると防衛snapshotに反映される', async () => {
    const res = await postTactics(champToken, { tactics: 'LA', update_champion: true })
    expect(res.status).toBe(200)
    expect(await readSnapTactics()).toBe('LA')
  })

  it('update_champion=false では防衛snapshotは据え置き（本体の戦術だけ変わる）', async () => {
    const res = await postTactics(champToken, { tactics: 'AD', update_champion: false })
    expect(res.status).toBe(200)
    // snapshot は前ケースの 'LA' のまま
    expect(await readSnapTactics()).toBe('LA')
    // 本体キャラの戦術は 'AD' に更新されている
    const me: any = await env.DB.prepare(`SELECT tactics FROM characters WHERE id = '90101'`).first()
    expect(me.tactics).toBe('AD')
  })

  it('非王者が update_champion=true でも champions は変わらずエラーにもならない', async () => {
    const res = await postTactics(nonChampToken, { tactics: 'DS', update_champion: true })
    expect(res.status).toBe(200)
    // 優勝者(90101)のsnapshotは無傷
    expect(await readSnapTactics()).toBe('LA')
    // 90102 の優勝者行は存在しない
    const row: any = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM champions WHERE champion_id = '90102'`).first()
    expect(row.cnt).toBe(0)
  })
})
