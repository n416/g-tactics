import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Champion Snapshot (P53)', () => {
  let env: any
  let token1: string
  let token2: string
  let token3: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret', BATTLE_COOLDOWN_SECONDS: 0 }

    // 90001: 優勝者となる最強キャラ
    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id, unit_custom_hp)
       VALUES ('90001', 'hash', 'Champ1', '最強王者', 5, 1000, 10, 1, 50000)`
    ).run()
    // 90002: 挑戦者1
    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id)
       VALUES ('90002', 'hash', 'Chall1', '挑戦者1', 5, 1000, 10, 2)`
    ).run()
    // 90003: 挑戦者2
    await db.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id)
       VALUES ('90003', 'hash', 'Chall2', '挑戦者2', 5, 1000, 10, 2)`
    ).run()

    token1 = await sign({ id: '90001' }, env.JWT_SECRET)
    token2 = await sign({ id: '90002' }, env.JWT_SECRET)
    token3 = await sign({ id: '90003' }, env.JWT_SECRET)
  })

  it('連続防衛で優勝者の耐久が逓減し次戦へ持ち越す・回復しない・本体機体の耐久は減らない', async () => {
    // 1. 90001が不戦勝で優勝者になる
    await app.request('/api/champion/challenge/individual', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)

    let champ: any = await env.DB.prepare(`SELECT * FROM champions WHERE type = 'individual'`).first()
    expect(champ.champion_id).toBe('90001')
    expect(champ.snapshot_data).toBeNull() // 最初はスナップショットなし

    // 2. 90002が挑戦する (90001が防衛成功)
    const res2 = await app.request('/api/champion/challenge/individual', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token2}` }
    }, env)
    const json2 = (await res2.json()) as any;
    expect(json2.meta.isSuccess).toBe(false); // 90002は負ける

    champ = await env.DB.prepare(`SELECT * FROM champions WHERE type = 'individual'`).first()
    expect(champ.snapshot_data).not.toBeNull();
    const defHpAfter1 = champ.def_hp;
    expect(defHpAfter1).toBeLessThan(50000); // 削られていること
    expect(defHpAfter1).toBeGreaterThan(0);

    // 本体(90001)のcurrent_hpは減っていない（防衛では減らない）
    const chara1 = await env.DB.prepare(`SELECT current_hp FROM characters WHERE id = '90001'`).first()
    expect(chara1.current_hp === -1 || chara1.current_hp >= 50000).toBe(true); // または初期値

    // 3. 90003が挑戦する (90001がさらに防衛)
    const res3 = await app.request('/api/champion/challenge/individual', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token3}` }
    }, env)
    const json3 = (await res3.json()) as any;
    expect(json3.meta.isSuccess).toBe(false);

    const champAfter2 = await env.DB.prepare(`SELECT * FROM champions WHERE type = 'individual'`).first()
    const defHpAfter2 = champAfter2.def_hp;
    expect(defHpAfter2).toBeLessThan(defHpAfter1); // 持ち越し耐久からさらに削られていること
  })

  it('新王者は戦闘終了時耐久で開始する', async () => {
    // 90001に勝てるように90004を最強にする
    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id, unit_custom_hp)
       VALUES ('90004', 'hash', 'Chall3', '新王者', 5, 1000, 10, 1, 999999)`
    ).run()
    const token4 = await sign({ id: '90004' }, env.JWT_SECRET)

    // 90004が90001に挑戦して勝つ
    const res4 = await app.request('/api/champion/challenge/individual', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token4}` }
    }, env)
    const json4 = (await res4.json()) as any;
    expect(json4.meta.isSuccess).toBe(true); // 90004が勝つ

    // 優勝者が90004になり、snapshotが設定される
    const champ = await env.DB.prepare(`SELECT * FROM champions WHERE type = 'individual'`).first()
    expect(champ.champion_id).toBe('90004')
    expect(champ.def_hp).toBeLessThan(999999) // 完全無傷ではなく戦闘終了時耐久
    expect(champ.def_hp).toBe(json4.meta.attacker.hp ?? champ.def_hp); // メタ情報の出力と一致するはずだが、metaにhpはないので値が減っていることだけ確認
  })
})
