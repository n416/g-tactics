import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'

describe('Message API', () => {
  let env: any
  let user1Token: string
  let user2Token: string
  
  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    
    // Test users
    await db.prepare(`
      INSERT INTO characters (id, password_hash, handle_name, chara_name, faction_id)
      VALUES ('user1', 'hash', 'user1', 'Pilot1', 1),
             ('user2', 'hash', 'user2', 'Pilot2', 2),
             ('user3', 'hash', 'user3', 'Pilot3', 1)
    `).run()

    await db.prepare(`
      INSERT INTO factions (id, name, leader_id)
      VALUES (1, 'Faction A', 'user1'), (2, 'Faction B', 'user2')
    `).run()

    env = { DB: db, JWT_SECRET: 'test-secret' }

    // Mock tokens
    const { sign } = await import('hono/jwt')
    user1Token = await sign({ id: 'user1' }, env.JWT_SECRET)
    user2Token = await sign({ id: 'user2' }, env.JWT_SECRET)
  })

  describe('Chat', () => {
    it('should post a public chat message', async () => {
      const res = await app.request('/api/messages/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user1Token}`
        },
        body: JSON.stringify({ message: 'Hello World', is_faction_only: false })
      }, env)
      
      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
    })

    it('should post a faction only chat message', async () => {
      const res = await app.request('/api/messages/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user1Token}`
        },
        body: JSON.stringify({ message: 'Secret to Faction A', is_faction_only: true })
      }, env)
      
      expect(res.status).toBe(200)
    })

    it('should fetch chat messages appropriately', async () => {
      // user2 should not see user1's faction only message unless ?all=1 is used
      const res = await app.request('/api/messages/chat', {
        headers: { 'Authorization': `Bearer ${user2Token}` }
      }, env)
      
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.messages.length).toBe(1) // only 'Hello World'
      expect(data.messages[0].message).toBe('Hello World')

      // user2 with ?all=1 should see both
      const resAll = await app.request('/api/messages/chat?all=1', {
        headers: { 'Authorization': `Bearer ${user2Token}` }
      }, env)
      
      const dataAll = await resAll.json() as any
      expect(dataAll.messages.length).toBe(2)
    })

    it('should reject empty message', async () => {
      const res = await app.request('/api/messages/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user1Token}`
        },
        body: JSON.stringify({ message: '  ' })
      }, env)
      
      expect(res.status).toBe(400)
    })
  })

  describe('BBS', () => {
    it('should post a bbs message', async () => {
      const res = await app.request('/api/messages/bbs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user1Token}`
        },
        body: JSON.stringify({ title: 'First Thread', message: 'Content here' })
      }, env)
      
      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
    })

    it('should fetch bbs messages', async () => {
      const res = await app.request('/api/messages/bbs', {
        headers: { 'Authorization': `Bearer ${user2Token}` }
      }, env)
      
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.messages.length).toBe(1)
      expect(data.messages[0].title).toBe('First Thread')
    })
  })

  describe('Private Messages', () => {
    it('should send a private message', async () => {
      const res = await app.request('/api/messages/private/user2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user1Token}`
        },
        body: JSON.stringify({ message: 'Hello user2' })
      }, env)
      
      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
    })

    it('should prevent sending to oneself', async () => {
      const res = await app.request('/api/messages/private/user1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user1Token}`
        },
        body: JSON.stringify({ message: 'Hello me' })
      }, env)
      
      expect(res.status).toBe(400)
    })

    it('should fetch unread count and private messages, and mark as read', async () => {
      // 1 unread message for user2
      const resCount = await app.request('/api/messages/private/unread-count', {
        headers: { 'Authorization': `Bearer ${user2Token}` }
      }, env)
      const dataCount = await resCount.json() as any
      expect(dataCount.count).toBe(1)

      // Fetch messages
      const res = await app.request('/api/messages/private', {
        headers: { 'Authorization': `Bearer ${user2Token}` }
      }, env)
      
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.messages.length).toBe(1)
      expect(data.messages[0].message).toBe('Hello user2')
      expect(data.messages[0].is_read).toBe(0) // Return value is before marking as read typically, but in our impl we mark them as read after fetching. Oh wait, my backend returns `is_read` from DB as 0 in the `results` object, but it updates the DB. So `data.messages[0].is_read` should be 0.

      // 0 unread messages for user2 after fetching
      const resCount2 = await app.request('/api/messages/private/unread-count', {
        headers: { 'Authorization': `Bearer ${user2Token}` }
      }, env)
      const dataCount2 = await resCount2.json() as any
      expect(dataCount2.count).toBe(0)
    })

    it('本人が /private/mark-read で伝言を既読化できる（削除機能は原作に無いため廃止）', async () => {
      // user1 -> user2 に伝言（未読を作る）
      await app.request('/api/messages/private/user2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user1Token}` },
        body: JSON.stringify({ message: 'マーク対象' })
      }, env)
      const before = await (await app.request('/api/messages/private/unread-count', {
        headers: { 'Authorization': `Bearer ${user2Token}` }
      }, env)).json() as any
      expect(before.count).toBeGreaterThanOrEqual(1)

      // 本人(user2)が自ステ詳細を開いた時の既読化
      const mr = await app.request('/api/messages/private/mark-read', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${user2Token}` }
      }, env)
      expect(mr.status).toBe(200)

      const after = await (await app.request('/api/messages/private/unread-count', {
        headers: { 'Authorization': `Bearer ${user2Token}` }
      }, env)).json() as any
      expect(after.count).toBe(0)
    })

    it('伝言記録は準公開: 第三者が相手のステ詳細を開くと相手宛の伝言が見える（received_messages）', async () => {
      await app.request('/api/messages/private/user2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user1Token}` },
        body: JSON.stringify({ message: '準公開テスト伝言' })
      }, env)
      // 認証任意の公開エンドポイント。誰が開いても相手宛の伝言記録が返る。
      const res = await app.request('/api/profile/user2', {}, env)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(Array.isArray(data.received_messages)).toBe(true)
      expect(data.received_messages.some((m: any) => m.message === '準公開テスト伝言')).toBe(true)
    })
  })
})
