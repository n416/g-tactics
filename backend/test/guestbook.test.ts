import { expect, test, describe, beforeAll, it } from 'vitest';
import { validateGuestbookContent, isRateLimitedPure } from '../src/routes/guestbook';
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('guestbook content validation', () => {
  test('empty string', () => {
    expect(validateGuestbookContent('')).toBe(false);
    expect(validateGuestbookContent('   ')).toBe(false);
  });

  test('valid string', () => {
    expect(validateGuestbookContent('a')).toBe(true);
    expect(validateGuestbookContent('あいうえお')).toBe(true);
  });

  test('max length 140 chars', () => {
    const s140 = 'a'.repeat(140);
    expect(validateGuestbookContent(s140)).toBe(true);

    const s141 = 'a'.repeat(141);
    expect(validateGuestbookContent(s141)).toBe(false);
  });
});

describe('rate limit validation', () => {
  test('first post', () => {
    expect(isRateLimitedPure(null, 1000000000)).toBe(false);
  });

  test('post within 1 hour', () => {
    const now = 1000000000;
    const last = now - (30 * 60 * 1000); // 30 min ago
    expect(isRateLimitedPure(last, now)).toBe(true);
  });

  test('post after 1 hour', () => {
    const now = 1000000000;
    const last = now - (60 * 60 * 1000); // exactly 1 hour ago
    expect(isRateLimitedPure(last, now)).toBe(false);
  });
});

describe('/api/guestbook Endpoints', () => {
  let env: any
  let curatorToken: string
  let posterToken: string
  let thirdToken: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }

    await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name) VALUES ('curator', 'hash', 'Curator', 'Curator')`).run()
    await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name) VALUES ('poster', 'hash', 'Poster', 'Poster')`).run()
    await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name) VALUES ('third', 'hash', 'Third', 'Third')`).run()
    
    // Curator has a base but no museum initially
    await db.prepare(`INSERT INTO user_bases (user_id, name) VALUES ('curator', 'Base')`).run()

    curatorToken = await sign({ id: 'curator' }, env.JWT_SECRET)
    posterToken = await sign({ id: 'poster' }, env.JWT_SECRET)
    thirdToken = await sign({ id: 'third' }, env.JWT_SECRET)
  })

  it('対象の博物館未建設 → 記帳 403', async () => {
    const res = await app.request('/api/guestbook/curator', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${posterToken}` },
      body: JSON.stringify({ content: 'Hello' })
    }, env)
    expect(res.status).toBe(403)
  })

  it('建設後: 記帳成功 / 141文字400 / 連投429', async () => {
    await env.DB.prepare(`INSERT INTO user_facilities (user_id, facility, level) VALUES ('curator', 'museum', 1)`).run()
    
    // 成功
    const res1 = await app.request('/api/guestbook/curator', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${posterToken}` },
      body: JSON.stringify({ content: 'Nice museum!' })
    }, env)
    expect(res1.status).toBe(200)

    // 141文字
    const res2 = await app.request('/api/guestbook/curator', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${posterToken}` },
      body: JSON.stringify({ content: 'a'.repeat(141) })
    }, env)
    expect(res2.status).toBe(400)

    // 連投 (同じposterがすぐ投稿)
    const res3 = await app.request('/api/guestbook/curator', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${posterToken}` },
      body: JSON.stringify({ content: 'Spam' })
    }, env)
    expect(res3.status).toBe(429)
  })

  it('GET: author_handle_name 付きで返る', async () => {
    const res = await app.request('/api/guestbook/curator', { headers: { 'Authorization': `Bearer ${thirdToken}` } }, env)
    expect(res.status).toBe(200)
    const json = await res.json() as any
    expect(json.notes.length).toBeGreaterThan(0)
    expect(json.notes[0].author_handle_name).toBe('Poster')
  })

  it('DELETE: 第三者403 / 館長成功 / 投稿者本人成功 / 論理削除', async () => {
    // 別の投稿を curator が自分で書き込む (テスト用)
    await env.DB.prepare(`INSERT INTO museum_guestbook (target_user_id, author_user_id, content) VALUES ('curator', 'third', 'Message 2')`).run()
    
    const entries: any[] = (await env.DB.prepare(`SELECT id, author_user_id FROM museum_guestbook WHERE target_user_id = 'curator' ORDER BY created_at ASC`).all()).results
    const posterEntryId = entries.find(e => e.author_user_id === 'poster').id
    const thirdEntryId = entries.find(e => e.author_user_id === 'third').id

    // 第三者が他人の投稿を削除 -> 403
    const res1 = await app.request(`/api/guestbook/${posterEntryId}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${thirdToken}` }
    }, env)
    expect(res1.status).toBe(403)

    // 館長が削除 -> 成功
    const res2 = await app.request(`/api/guestbook/${posterEntryId}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${curatorToken}` }
    }, env)
    expect(res2.status).toBe(200)

    // 投稿者本人が削除 -> 成功
    const res3 = await app.request(`/api/guestbook/${thirdEntryId}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${thirdToken}` }
    }, env)
    expect(res3.status).toBe(200)

    // 削除後の GET
    const res4 = await app.request('/api/guestbook/curator', { headers: { 'Authorization': `Bearer ${thirdToken}` } }, env)
    const json4 = await res4.json() as any
    expect(json4.notes.length).toBe(0) // 論理削除されているため表示されない
  })
});
