import { describe, it, expect, beforeAll } from 'vitest'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { applyEquipmentTokusyu, simulateBattleRound } from '../src/utils/battleEngine'

describe('P45: 武器マスタ実データ化＋弾数システム', () => {
  describe('item_ini 変換データ（原典スポット照合）', () => {
    let db: any
    beforeAll(async () => {
      db = new D1Mock()
      await applySchema(db)
    })

    it('件数が原典相当（394件以上）に変換されている', async () => {
      const row: any = await db.prepare('SELECT COUNT(*) as cnt FROM items').first()
      expect(row.cnt).toBeGreaterThanOrEqual(394)
    })

    it('ザクマシンガン: 威力65・弾数40・EN1（item_ini 0016）', async () => {
      const w: any = await db.prepare(`SELECT power, ammo, en_cost FROM items WHERE name = 'ザクマシンガン'`).first()
      expect(w).toBeTruthy()
      expect(w.power).toBe(65)
      expect(w.ammo).toBe(40)
      expect(w.en_cost).toBe(1)
    })

    it('シュツルムファウスト: 威力150・弾数2（item_ini 0023 使い捨て高威力）', async () => {
      const w: any = await db.prepare(`SELECT power, ammo FROM items WHERE name = 'シュツルムファウスト'`).first()
      expect(w).toBeTruthy()
      expect(w.power).toBe(150)
      expect(w.ammo).toBe(2)
    })
  })

  describe('弾数倍化特殊 -19/-32（dmg_calc.pl:167-171,199-203）', () => {
    it('装備アイテムの tokusyu 19 で ammoMultiplier=4 になり、ENコストは変化しない', () => {
      const f: any = { unit_tokusyu: '', item1_tokusyu: '19', weapon_en_cost: 20, mobility: 0, armor: 0 }
      applyEquipmentTokusyu(f)
      expect(f.ammoMultiplier).toBe(4)
      expect(f.weapon_en_cost).toBe(20) // 旧実装のEN÷4等価表現は廃止
    })

    it('装備アイテムの tokusyu 32 で ammoMultiplier=6', () => {
      const f: any = { unit_tokusyu: '', item1_tokusyu: '32', weapon_en_cost: 12, mobility: 0, armor: 0 }
      applyEquipmentTokusyu(f)
      expect(f.ammoMultiplier).toBe(6)
      expect(f.weapon_en_cost).toBe(12)
    })
  })

  describe('弾数消費（battlelib.pl:1274-1276 準拠）', () => {
    it('弾数1の武器は1発撃つと弾切れになり、以降のログに弾切れが出る', () => {
      const atk: any = {
        handle_name: '撃ち手', tactics: '00', unit_base_hp: 2000, unit_base_en: 500, status_piloting: 10,
        mobility: 30, armor: 10, sensor: 200, traits: '', skills: '',
        weapon_id: 12345, weapon_name: 'テスト単発砲', weapon_power: 10, weapon_en_cost: 0, weapon_ammo: 1,
        w_range_short: 1, w_range_mid: 1, w_range_long: 1,
      }
      const def: any = {
        handle_name: '的', tactics: '00', unit_base_hp: 2000, unit_base_en: 500, status_piloting: 10,
        mobility: 30, armor: 10, sensor: 200, traits: '', skills: '',
      }
      // maxTurns=30・初期距離50（射程内）で複数ターン戦わせる
      const res = simulateBattleRound(atk, def, 1, 0, undefined, undefined, 1, [], [], 30, 50)
      expect(atk.weapon_ammo_left).toBeDefined()
      expect(atk.weapon_ammo_left).toBeLessThanOrEqual(0) // 初期1発を撃ち切っている
      expect(res.logs.some((l: string) => l.includes('弾切れ'))).toBe(true)
    })
  })
})
