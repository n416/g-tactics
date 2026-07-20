import { describe, it, expect, beforeAll } from 'vitest';
import { getMuseumSlots } from '../src/utils/baseFacilities';
import { validateCuratorComment } from '../src/routes/museum';
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Museum Logic', () => {
  describe('getMuseumSlots', () => {
    it('returns 0 slots for level 0', () => {
      expect(getMuseumSlots(0)).toBe(0);
    });
    it('returns correct slots for valid levels (1-5)', () => {
      expect(getMuseumSlots(1)).toBe(4);
      expect(getMuseumSlots(2)).toBe(8);
      expect(getMuseumSlots(3)).toBe(12);
      expect(getMuseumSlots(4)).toBe(18);
      expect(getMuseumSlots(5)).toBe(24);
    });
    it('returns 0 slots for invalid levels', () => {
      expect(getMuseumSlots(-1)).toBe(0);
      expect(getMuseumSlots(6)).toBe(0);
    });
  });

  describe('validateCuratorComment', () => {
    it('allows empty comment', () => {
      expect(validateCuratorComment('')).toBe(true);
      expect(validateCuratorComment(null as any)).toBe(true);
      expect(validateCuratorComment(undefined as any)).toBe(true);
    });
    it('allows comments up to 100 characters', () => {
      expect(validateCuratorComment('a'.repeat(100))).toBe(true);
    });
    it('rejects comments over 100 characters', () => {
      expect(validateCuratorComment('a'.repeat(101))).toBe(false);
    });
  });

  describe('/api/museum Endpoints', () => {
    let env: any
    let token: string
    let otherToken: string

    beforeAll(async () => {
      const db = new D1Mock()
      await applySchema(db)
      env = { DB: db, JWT_SECRET: 'test-secret' }

      await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name) VALUES ('museumuser', 'hash', 'Museum', 'Owner')`).run()
      await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name) VALUES ('otheruser', 'hash', 'Other', 'Visitor')`).run()
      await db.prepare(`INSERT OR REPLACE INTO units (id, name, image) VALUES (101, 'Unit A', 'a.jpg')`).run()
      await db.prepare(`INSERT OR REPLACE INTO units (id, name, image) VALUES (102, 'Unit B', 'b.jpg')`).run()
      await db.prepare(`INSERT OR REPLACE INTO units (id, name, image) VALUES (103, 'Unit C', 'c.jpg')`).run()
      
      // museumuser owns unit 101, 102
      await db.prepare(`INSERT INTO hangars (id, user_id, unit_id) VALUES (1, 'museumuser', 101)`).run()
      await db.prepare(`INSERT INTO hangars (id, user_id, unit_id) VALUES (2, 'museumuser', 102)`).run()
      // also collected 101, 102 in user_unit_stats
      await db.prepare(`INSERT INTO user_unit_stats (user_id, unit_id, obtained_count) VALUES ('museumuser', 101, 1)`).run()
      await db.prepare(`INSERT INTO user_unit_stats (user_id, unit_id, obtained_count) VALUES ('museumuser', 102, 1)`).run()

      token = await sign({ id: 'museumuser' }, env.JWT_SECRET)
      otherToken = await sign({ id: 'otheruser' }, env.JWT_SECRET)
    })

    it('博物館未建設 GET', async () => {
      const res = await app.request('/api/museum', { headers: { 'Authorization': `Bearer ${token}` } }, env)
      const json = await res.json() as any
      expect(json.museumLevel).toBe(0)
    })

    it('建設後 GET (slots, ownedUnits)', async () => {
      // 基地と施設を作成
      await env.DB.prepare(`INSERT INTO user_bases (user_id, name) VALUES ('museumuser', 'MyBase')`).run()
      await env.DB.prepare(`INSERT INTO user_facilities (user_id, facility, level) VALUES ('museumuser', 'museum', 1)`).run()

      const res = await app.request('/api/museum', { headers: { 'Authorization': `Bearer ${token}` } }, env)
      const json = await res.json() as any
      expect(json.museumLevel).toBe(1)
      expect(json.slots).toBe(4)
      expect(json.ownedUnits.length).toBe(2) // 101, 102 (collected & owned)
    })

    it('exhibit 展示: 範囲外, 未所持, 成功, 移動', async () => {
      const res1 = await app.request('/api/museum/exhibit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ slot_index: 99, unit_id: 101 }) // 範囲外
      }, env)
      expect(res1.status).toBe(400)

      // 未所持
      const res2 = await app.request('/api/museum/exhibit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ slot_index: 1, unit_id: 103 })
      }, env)
      expect(res2.status).toBe(400)

      // 成功
      const res3 = await app.request('/api/museum/exhibit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ slot_index: 1, unit_id: 101 })
      }, env)
      expect(res3.status).toBe(200)

      // 外す
      const res4 = await app.request('/api/museum/exhibit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ slot_index: 1, unit_id: 0 })
      }, env)
      expect(res4.status).toBe(200)
    })

    it('所持チェックの表示時適用', async () => {
      // まず展示する
      await app.request('/api/museum/exhibit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ slot_index: 1, unit_id: 101 })
      }, env)
      
      // hangar を消す
      await env.DB.prepare(`DELETE FROM hangars WHERE user_id = 'museumuser' AND unit_id = 101`).run()

      const res = await app.request('/api/museum', { headers: { 'Authorization': `Bearer ${token}` } }, env)
      const json = await res.json() as any
      const slot1 = json.exhibits.find((e: any) => e.slot_index === 1)
      expect(slot1).toBeTruthy()
      expect(slot1.unit).toBeNull() // unit info shouldn't be populated if unowned
    })

    it('featured: 101文字400, 成功', async () => {
      const res1 = await app.request('/api/museum/featured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ unit_id: 102, comment: 'a'.repeat(101) })
      }, env)
      expect(res1.status).toBe(400)

      const res2 = await app.request('/api/museum/featured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ unit_id: 102, comment: 'Nice unit' })
      }, env)
      expect(res2.status).toBe(200)

      const res3 = await app.request('/api/museum', { headers: { 'Authorization': `Bearer ${token}` } }, env)
      const json3 = await res3.json() as any
      expect(json3.featured.unit.id).toBe(102)
      expect(json3.featured.comment).toBe('Nice unit')
    })

    it('collection: 未収蔵は ???, 収蔵済は実名', async () => {
      const res = await app.request('/api/museum/collection', { headers: { 'Authorization': `Bearer ${token}` } }, env)
      expect(res.status).toBe(200)
      const json = await res.json() as any
      expect(json.collection).toBeTruthy()

      const unitA = json.collection.find((u: any) => u.unit_id === 101)
      expect(unitA.name).toBe('Unit A')

      const unitC = json.collection.find((u: any) => u.unit_id === 103)
      expect(unitC.name).toBe('？？？')
      expect(unitC.image).toBeNull()
    })

    it('他人の博物館閲覧 GET /api/museum/user/:userId', async () => {
      const res1 = await app.request('/api/museum/user/museumuser', { headers: { 'Authorization': `Bearer ${otherToken}` } }, env)
      expect(res1.status).toBe(200)
      const json1 = await res1.json() as any
      expect(json1.owner).toBeTruthy()
      expect(json1.owner.handle_name).toBe('Museum')
      expect(json1.base).toBeTruthy()
      expect(json1.base.name).toBe('MyBase')
      expect(json1.ownedUnits).toBeUndefined() // 他人には見せない

      const res2 = await app.request('/api/museum/user/nobody', { headers: { 'Authorization': `Bearer ${otherToken}` } }, env)
      expect(res2.status).toBe(404)
    })
  })
});
