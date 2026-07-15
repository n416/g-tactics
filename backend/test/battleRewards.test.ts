import { describe, it, expect, beforeAll } from 'vitest'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { applyPersonalBattleResults } from '../src/utils/battleRewards'

// 個人戦（優勝戦・個別戦闘）の戦闘後パイプラインが DB まで正しく反映されることの検証（P28）
describe('applyPersonalBattleResults 戦闘後 tokusyu 配線', () => {
  let env: any

  const mkFighter = (id: string, tokusyu: string) => ({
    id,
    handle_name: id,
    unit_tokusyu: tokusyu,
    level: 5,
    exp: 0,
    money: 100,
    fame: 10,
    hp: 50,
    en: 40,
    unit_base_hp: 100,
    unit_base_en: 100,
    status_piloting: 0,
    nt_level: 0,
    traits: '',
    skills: ''
  })

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db }

    for (const id of ['rw_atk16', 'rw_def16', 'rw_atk10', 'rw_def10']) {
      await db.prepare(
        `INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame) VALUES (?, 'hash', ?, ?, 5, 100, 10)`
      ).bind(id, id, id).run()
    }
  })

  it('-16(学習型コンピュータ): 敗北時に経験値が勝利額へ引き上げられ DB に反映される', async () => {
    const attacker: any = mkFighter('rw_atk16', '-16')
    const defender: any = mkFighter('rw_def16', '')
    const logs: string[] = []

    const result = await applyPersonalBattleResults(env.DB, attacker, defender, false, logs, {
      winCount: 3, isGateBattle: true, battleSyurui: 1, battleType: 'gate'
    })

    // 敗北ベース(2) < 勝利額(5+連勝ボーナス30) に差し替わっている
    expect(result.rewardExp).toBeGreaterThanOrEqual(35)
    const row: any = await env.DB.prepare(`SELECT exp FROM characters WHERE id = 'rw_atk16'`).first()
    expect(row.exp).toBe(result.rewardExp)
    expect(logs.some(l => l.includes('学習型コンピュータ'))).toBe(true)
  })

  it('-10(戦闘後ENドレイン): 個人戦後に EN が枯渇して DB に反映される', async () => {
    const attacker: any = mkFighter('rw_atk10', '-10')
    const defender: any = mkFighter('rw_def10', '')
    const logs: string[] = []

    await applyPersonalBattleResults(env.DB, attacker, defender, true, logs, {
      winCount: 1, isGateBattle: false, battleSyurui: 1, battleType: 'champion_individual'
    })

    const row: any = await env.DB.prepare(`SELECT current_en FROM characters WHERE id = 'rw_atk10'`).first()
    expect(row.current_en).toBe(0)
  })
})
