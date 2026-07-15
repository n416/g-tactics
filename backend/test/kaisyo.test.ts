import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'
import { calcMapl, calcTul, gainKaisyo } from '../src/utils/kaisyo'

describe('機体熟練度（機熟=kaisyo） P44b', () => {
  describe('式（msvs.cgi:404-405 準拠）', () => {
    it('MAPL = (200 + カスタム数*10) - 運動', () => {
      expect(calcMapl(0, 40)).toBe(160)
      expect(calcMapl(17, 30)).toBe(340)
    })

    it('TUL = (200 + (150-機体Lv)*5) - 運動', () => {
      expect(calcTul(1, 40)).toBe(905)
      expect(calcTul(150, 30)).toBe(170)
      expect(calcTul(40, 42)).toBe(200 + 110 * 5 - 42) // 708
    })
  })

  describe('増加（battlelib.pl:1538-1542 準拠）', () => {
    it('MAPL未満・優勝戦/個別戦闘（certain）は必ず+1', () => {
      expect(gainKaisyo(10, 100, 900, true, 50)).toBe(11)
    })

    it('MAPL到達時は増えない', () => {
      expect(gainKaisyo(100, 100, 900, true, 50)).toBe(100)
      expect(gainKaisyo(150, 100, 900, false, 1)).toBe(150)
    })

    it('シミュレーター（chance）は rand(キャラLv) < 10 のとき+1', () => {
      // rand=0.99, level=100 → floor(99) >= 10 → 増えない
      expect(gainKaisyo(10, 100, 900, false, 100, () => 0.99)).toBe(10)
      // rand=0.05, level=100 → floor(5) < 10 → +1
      expect(gainKaisyo(10, 100, 900, false, 100, () => 0.05)).toBe(11)
      // level<=10 なら必ず+1（floor(rand*10)は常に<10）
      expect(gainKaisyo(10, 100, 900, false, 5, () => 0.99)).toBe(11)
    })

    it('TULでクランプされる', () => {
      expect(gainKaisyo(150, 200, 150, true, 50)).toBe(150)
    })
  })

  describe('ライフサイクル（原作 tensyoku/job 準拠）', () => {
    let env: any
    let token: string

    beforeAll(async () => {
      const db = new D1Mock()
      await applySchema(db)
      env = { DB: db, JWT_SECRET: 'test-secret' }

      await env.DB.prepare(`INSERT INTO units (id, name, price, hp, en, armor, mobility, sensor, unit_lv, req_fame) VALUES (91001, 'K現行機', 100, 100, 100, 10, 20, 10, 1, 0)`).run()
      await env.DB.prepare(`INSERT INTO units (id, name, price, hp, en, armor, mobility, sensor, unit_lv, req_fame) VALUES (91002, 'K格納機', 100, 120, 110, 12, 22, 12, 1, 0)`).run()
      await env.DB.prepare(
        `INSERT INTO characters (id, password_hash, handle_name, chara_name, money, unit_id, unit_kaisyo, unit_custom_hp, unit_custom_en, unit_custom_mobility)
         VALUES ('kaisyo_user', 'h', 'K', 'K', 10000, 91001, 77, 100, 100, 20)`
      ).run()
      // 現行機の退避先と、乗り換え先（kaisyo=500 を保持）
      await env.DB.prepare(`INSERT INTO hangars (id, user_id, unit_id, kaisyo) VALUES (9101, 'kaisyo_user', 91001, 0)`).run()
      await env.DB.prepare(`INSERT INTO hangars (id, user_id, unit_id, kaisyo) VALUES (9102, 'kaisyo_user', 91002, 500)`).run()

      token = await sign({ id: 'kaisyo_user' }, env.JWT_SECRET)
    })

    it('格納庫乗換で機熟が退避・復元される（job.cgi の stock 行準拠）', async () => {
      const res = await app.request('/api/hangar/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ hangar_id: 9102 })
      }, env)
      expect(res.status).toBe(200)

      // 降りた機体（91001）の行へ現在の機熟77が退避
      const old: any = await env.DB.prepare(`SELECT kaisyo FROM hangars WHERE user_id = 'kaisyo_user' AND unit_id = 91001`).first()
      expect(old.kaisyo).toBe(77)

      // 乗った機体の機熟500が復元される（TUL=200+(150-1)*5-運動 は500より大きいのでクランプなし）
      const me: any = await env.DB.prepare(`SELECT unit_kaisyo FROM characters WHERE id = 'kaisyo_user'`).first()
      expect(me.unit_kaisyo).toBe(500)
    })

    it('機体購入（乗り換え）で機熟が0リセットされる（anahaim_act.cgi:670 準拠）', async () => {
      const res = await app.request('/api/buy_unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ unit_id: 91001 })
      }, env)
      expect(res.status).toBe(200)

      const me: any = await env.DB.prepare(`SELECT unit_kaisyo FROM characters WHERE id = 'kaisyo_user'`).first()
      expect(me.unit_kaisyo).toBe(0)
    })
  })
})
