import { describe, expect, it, beforeAll } from 'vitest'
import { calcPendingIncome, getFacilityUpgradeCost, POWER_PLANT_RATES } from '../src/utils/baseFacilities'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Base Facilities Logic Tests', () => {

  describe('calcPendingIncome', () => {
    const now = Math.floor(Date.now() / 1000);

    it('returns 0 for level 0 (not built)', () => {
      // 10 hours passed, level 0
      expect(calcPendingIncome(now - 10 * 3600, now, 0)).toBe(0);
    });

    it('calculates normal case and truncates decimals correctly', () => {
      // 2.5 hours passed, level 1 (rate is 5 pt/h)
      // 2.5 * 5 = 12.5 -> floor to 12
      expect(calcPendingIncome(now - 2.5 * 3600, now, 1)).toBe(12);

      // 5 hours passed, level 2 (rate is 12 pt/h)
      // 5 * 12 = 60
      expect(calcPendingIncome(now - 5 * 3600, now, 2)).toBe(60);
    });

    it('caps income at 12 hours', () => {
      // 48 hours passed, level 5 (rate is 100 pt/h)
      // Max 12 hours -> 12 * 100 = 1200
      expect(calcPendingIncome(now - 48 * 3600, now, 5)).toBe(1200);
    });
  });

  describe('getFacilityUpgradeCost', () => {
    it('returns Infinity for invalid levels', () => {
      expect(getFacilityUpgradeCost('power', 0)).toBe(Infinity);
      expect(getFacilityUpgradeCost('power', 6)).toBe(Infinity);
      expect(getFacilityUpgradeCost('unknown', 1)).toBe(Infinity);
    });

    it('returns correct costs for valid levels', () => {
      // power costs: [0, 500, 2000, 8000, 20000, 50000]
      expect(getFacilityUpgradeCost('power', 1)).toBe(500);
      expect(getFacilityUpgradeCost('power', 5)).toBe(50000);
      
      // dock costs: [0, 1000, 3000, 10000, 25000, 60000]
      expect(getFacilityUpgradeCost('dock', 1)).toBe(1000);
      expect(getFacilityUpgradeCost('dock', 5)).toBe(60000);
    });
  });

  describe('/api/base Endpoints', () => {
    let env: any
    let token: string

    beforeAll(async () => {
      const db = new D1Mock()
      await applySchema(db)
      env = { DB: db, JWT_SECRET: 'test-secret' }

      await db.prepare(
        `INSERT INTO characters (id, password_hash, handle_name, chara_name, money, unit_id) 
         VALUES ('baseuser', 'hash', 'Base', 'Base User', 10000, 0)`
      ).run()

      token = await sign({ id: 'baseuser' }, env.JWT_SECRET)
    })

    it('基地未作成の GET', async () => {
      const res = await app.request('/api/base', { headers: { 'Authorization': `Bearer ${token}` } }, env)
      const json = await res.json() as any
      expect(json.exists).toBe(false)
    })

    it('基地作成: terrain=9 は 400', async () => {
      const res = await app.request('/api/base/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ terrain: 9, name: 'test' })
      }, env)
      expect(res.status).toBe(400)
    })

    it('基地作成: terrain=3 は成功', async () => {
      const res = await app.request('/api/base/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ terrain: 3, name: 'TestBase' })
      }, env)
      expect(res.status).toBe(200)
      const json = await res.json() as any
      expect(json.success).toBe(true)
    })

    it('二重作成は 400', async () => {
      const res = await app.request('/api/base/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ terrain: 1, name: 'TestBase2' })
      }, env)
      expect(res.status).toBe(400)
    })

    it('rename 成功', async () => {
      const res = await app.request('/api/base/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: 'RenamedBase' })
      }, env)
      expect(res.status).toBe(200)
      const base: any = await env.DB.prepare(`SELECT name FROM user_bases WHERE user_id = 'baseuser'`).first()
      expect(base.name).toBe('RenamedBase')
    })

    it('collect: 2時間経過で +10pt, 直後は400, 48時間経過で +60ptキャップ', async () => {
      // 発電所Lv1 にする
      await env.DB.prepare(`INSERT OR IGNORE INTO user_facilities (user_id, facility, level) VALUES ('baseuser', 'power', 1)`).run()
      await env.DB.prepare(`UPDATE user_facilities SET level = 1 WHERE user_id = 'baseuser' AND facility = 'power'`).run()
      await env.DB.prepare(`UPDATE characters SET money = 0 WHERE id = 'baseuser'`).run()
      
      const now = Math.floor(Date.now() / 1000)
      const twoHoursAgo = now - 2 * 3600
      await env.DB.prepare(`UPDATE user_bases SET power_last_collected_at = ? WHERE user_id = 'baseuser'`).bind(twoHoursAgo).run()
      
      const res1 = await app.request('/api/base/collect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }, env)
      expect(res1.status).toBe(200)
      const json1 = await res1.json() as any
      expect(json1.success).toBe(true)
      expect(json1.new_money).toBe(10) // 5pt * 2h = 10

      const res2 = await app.request('/api/base/collect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }, env)
      expect(res2.status).toBe(400) // 直後はダメ

      const fortyEightHoursAgo = now - 48 * 3600
      await env.DB.prepare(`UPDATE user_bases SET power_last_collected_at = ${fortyEightHoursAgo} WHERE user_id = 'baseuser'`).run()
      const res3 = await app.request('/api/base/collect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }, env)
      expect(res3.status).toBe(200)
      const json3 = await res3.json() as any
      expect(json3.new_money).toBe(10 + 60) // caps at 12h = 60pt
    })

    it('facility/build: 資金不足400, 成功で money減算, 二重建設400', async () => {
      // 資金を減らす
      await env.DB.prepare(`UPDATE characters SET money = 50 WHERE id = 'baseuser'`).run()
      const res1 = await app.request('/api/base/facility/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ facility: 'dock' })
      }, env)
      expect(res1.status).toBe(400) // dock build cost is 1000

      // 資金を戻す
      await env.DB.prepare(`UPDATE characters SET money = 5000 WHERE id = 'baseuser'`).run()
      const res2 = await app.request('/api/base/facility/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ facility: 'dock' })
      }, env)
      expect(res2.status).toBe(200)
      const char: any = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'baseuser'`).first()
      expect(char.money).toBe(4000) // 5000 - 1000

      const res3 = await app.request('/api/base/facility/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ facility: 'dock' })
      }, env)
      expect(res3.status).toBe(400) // 二重建設
    })

    it('facility/upgrade: Lv5での強化は400', async () => {
      await env.DB.prepare(`UPDATE user_facilities SET level = 5 WHERE user_id = 'baseuser' AND facility = 'dock'`).run()
      const res = await app.request('/api/base/facility/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ facility: 'dock' })
      }, env)
      expect(res.status).toBe(400)
    })

    it('defenseSummary: battle_logs集計', async () => {
      await env.DB.prepare(
        `INSERT INTO battle_logs (battle_type, attacker_id, defender_id, is_attacker_win, log_text, created_at, events_json) 
         VALUES ('gate', 'attacker', 'baseuser', 0, '', datetime('now', '-1 day'), NULL)`
      ).run()
      await env.DB.prepare(
        `INSERT INTO battle_logs (battle_type, attacker_id, defender_id, is_attacker_win, log_text, created_at, events_json) 
         VALUES ('gate', 'attacker2', 'baseuser', 1, '', datetime('now'), '[{}]')`
      ).run()

      const res = await app.request('/api/base', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      }, env)
      expect(res.status).toBe(200)
      const json = await res.json() as any
      expect(json.defenseSummary.recentCount).toBe(2)
      expect(json.defenseSummary.winCount).toBe(1)
      expect(json.defenseSummary.loseCount).toBe(1)
      expect(json.defenseSummary.latestHasReplay).toBe(true)
    })
  })
});
