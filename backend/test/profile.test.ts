import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'

describe('Profile API', () => {
  let env: any
  let user1Token: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)

    await db.prepare(`
      INSERT INTO characters (id, password_hash, handle_name, chara_name, faction_id)
      VALUES ('user1', 'hash', 'user1', 'Pilot1', null)
    `).run()

    env = { DB: db, JWT_SECRET: 'test-secret' }

    const { sign } = await import('hono/jwt')
    user1Token = await sign({ id: 'user1' }, env.JWT_SECRET)
  })

  it('should fetch profile hangar', async () => {
    const res = await app.request('/api/profile/user1/hangar', {
      method: 'GET'
    }, env)

    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.success).toBe(true)
    expect(data.hangar).toBeDefined()
  })

  it('should update profile (public_comment)', async () => {
    const res = await app.request('/api/edit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user1Token}`
      },
      body: JSON.stringify({ public_comment: 'This is my new profile text' })
    }, env)

    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.success).toBe(true)

    // Verify it was updated
    const getRes = await app.request('/api/profile/user1', {
      method: 'GET'
    }, env)
    const getData = await getRes.json() as any
    expect(getData.profile.public_comment).toBe('This is my new profile text')
  })
})
