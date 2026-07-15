import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'

describe('Trade API', () => {
  let env: any

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }

    // Seed test data
    await db.prepare(`
      INSERT INTO characters (id, password_hash, handle_name, chara_name, money) 
      VALUES ('user1', 'hash', 'user1', 'User 1', 1000)
    `).run()

    await db.prepare(`
      INSERT INTO characters (id, password_hash, handle_name, chara_name, money) 
      VALUES ('user2', 'hash', 'user2', 'User 2', 500)
    `).run()

    // Add units for trade
    await db.prepare(`
      INSERT INTO hangars (id, user_id, unit_id) 
      VALUES (1, 'user1', 1) -- user1 has Unit 1 (ジム)
    `).run()

    await db.prepare(`
      INSERT INTO hangars (id, user_id, unit_id) 
      VALUES (2, 'user2', 2) -- user2 has Unit 2 (ザクII)
    `).run()

    // Add items for trade
    await db.prepare(`
      INSERT INTO item_inventory (id, user_id, item_id) 
      VALUES (1, 'user1', 1) -- user1 has Item 1 (ビームサーベル)
    `).run()

  })

  // Token generator
  const getToken = async (id: string) => {
    const jwt = await import('hono/jwt')
    return await jwt.sign({ id }, env.JWT_SECRET)
  }

  it('1. user1 can sell a unit', async () => {
    const token = await getToken('user1')
    const res = await app.request('/api/trade/sell', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_type: 'unit', target_id: 1, price: 300, message: 'Mint condition' })
    }, env)
    
    expect(res.status).toBe(200)
    const json = await res.json() as any
    expect(json.success).toBe(true)

    // Verify hangar is empty
    const hangarCheck = await env.DB.prepare('SELECT * FROM hangars WHERE id = 1').first()
    expect(hangarCheck).toBeNull()

    // Verify market_listings has the item
    const marketCheck = await env.DB.prepare('SELECT * FROM market_listings WHERE seller_id = ?').bind('user1').first()
    expect(marketCheck).toBeDefined()
    expect(marketCheck.price).toBe(300)
  })

  it('2. get listings shows the item', async () => {
    const res = await app.request('/api/trade/listings', { method: 'GET' }, env)
    expect(res.status).toBe(200)
    const json = await res.json() as any
    expect(json.success).toBe(true)
    expect(json.listings.length).toBeGreaterThan(0)
    expect(json.listings[0].seller_id).toBe('user1')
    expect(json.listings[0].unit_name).toBe('ボール・カスタム') // 実データseed: unit_id 1
  })

  it('3. user2 cannot buy with insufficient funds', async () => {
    // user2 has 500G. Let's make user1 sell something for 600G.
    const token1 = await getToken('user1')
    await app.request('/api/trade/sell', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token1}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_type: 'item', target_id: 1, price: 600, message: 'Rare item' })
    }, env)

    const listRes = await app.request('/api/trade/listings', { method: 'GET' }, env)
    const listings = (await listRes.json() as any).listings
    const expensiveItem = listings.find((l: any) => l.price === 600)

    const token2 = await getToken('user2')
    const res = await app.request('/api/trade/buy', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token2}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: expensiveItem.id })
    }, env)

    expect(res.status).toBe(400)
    const json = await res.json() as any
    expect(json.success).toBe(false)
    expect(json.message).toContain('資金が足りません')
  })

  it('4. user2 can buy an affordable unit', async () => {
    const listRes = await app.request('/api/trade/listings', { method: 'GET' }, env)
    const listings = (await listRes.json() as any).listings
    const affordableItem = listings.find((l: any) => l.price === 300)

    const token2 = await getToken('user2')
    const res = await app.request('/api/trade/buy', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token2}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: affordableItem.id })
    }, env)

    expect(res.status).toBe(200)
    const json = await res.json() as any
    expect(json.success).toBe(true)

    // Verify money transfer
    const user1 = await env.DB.prepare('SELECT money FROM characters WHERE id = ?').bind('user1').first()
    const user2 = await env.DB.prepare('SELECT money FROM characters WHERE id = ?').bind('user2').first()
    expect(user1.money).toBe(1300) // 1000 + 300
    expect(user2.money).toBe(200) // 500 - 300

    // Verify hangar transfer
    const hangarCheck = await env.DB.prepare('SELECT * FROM hangars WHERE user_id = ? AND unit_id = ?').bind('user2', 1).first()
    expect(hangarCheck).toBeDefined()
  })

  it('5. user cannot buy their own listing', async () => {
    const listRes = await app.request('/api/trade/listings', { method: 'GET' }, env)
    const listings = (await listRes.json() as any).listings
    const ownItem = listings.find((l: any) => l.seller_id === 'user1') // The 600G item

    const token = await getToken('user1')
    const res = await app.request('/api/trade/buy', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: ownItem.id })
    }, env)

    expect(res.status).toBe(400)
    const json = await res.json() as any
    expect(json.success).toBe(false)
    expect(json.message).toContain('自身が出品した商品は購入できません')
  })

  it('6. user can cancel their own listing', async () => {
    const listRes = await app.request('/api/trade/listings', { method: 'GET' }, env)
    const listings = (await listRes.json() as any).listings
    const ownItem = listings.find((l: any) => l.seller_id === 'user1')

    const token = await getToken('user1')
    const res = await app.request('/api/trade/cancel', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: ownItem.id })
    }, env)

    expect(res.status).toBe(200)
    const json = await res.json() as any
    expect(json.success).toBe(true)

    // Verify it's back in inventory
    const invCheck = await env.DB.prepare('SELECT * FROM item_inventory WHERE user_id = ? AND item_id = ?').bind('user1', 1).first()
    expect(invCheck).toBeDefined()

    // Verify it's gone from market
    const marketCheck = await env.DB.prepare('SELECT * FROM market_listings WHERE id = ?').bind(ownItem.id).first()
    expect(marketCheck).toBeNull()
  })

  it('7. 複製防止: 同一出品を二重購入しても機体が増えず二重課金もされない', async () => {
    // user1 に新しい機体(ガンダム=unit3)を用意して出品
    await env.DB.prepare(`INSERT INTO hangars (id, user_id, unit_id) VALUES (10, 'user1', 3)`).run()
    await env.DB.prepare(`UPDATE characters SET money = 1000 WHERE id = 'user2'`).run()

    const t1 = await getToken('user1')
    await app.request('/api/trade/sell', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${t1}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_type: 'unit', target_id: 10, price: 100 })
    }, env)

    const listings = (await (await app.request('/api/trade/listings', { method: 'GET' }, env)).json() as any).listings
    const listing = listings.find((l: any) => l.price === 100 && l.seller_id === 'user1')

    const t2 = await getToken('user2')
    const buy = () => app.request('/api/trade/buy', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${t2}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: listing.id })
    }, env)

    // 1回目: 成功
    const r1 = await buy()
    expect(r1.status).toBe(200)

    const moneyAfter1 = (await env.DB.prepare('SELECT money FROM characters WHERE id = ?').bind('user2').first() as any).money
    const countAfter1 = (await env.DB.prepare('SELECT COUNT(*) as cnt FROM hangars WHERE user_id = ? AND unit_id = 3').bind('user2').first() as any).cnt
    expect(moneyAfter1).toBe(900) // 1000 - 100
    expect(countAfter1).toBe(1)

    // 2回目: 同じ出品IDは削除済みなので拒否され、機体・所持金は不変（複製・二重課金なし）
    const r2 = await buy()
    expect(r2.status).toBe(400)

    const moneyAfter2 = (await env.DB.prepare('SELECT money FROM characters WHERE id = ?').bind('user2').first() as any).money
    const countAfter2 = (await env.DB.prepare('SELECT COUNT(*) as cnt FROM hangars WHERE user_id = ? AND unit_id = 3').bind('user2').first() as any).cnt
    expect(moneyAfter2).toBe(900) // 二重課金されない
    expect(countAfter2).toBe(1)   // 機体が増えない
  })
})

// P34: 中古屋オークション（tyuko.cgi + routean.pl）
describe('Trade Auction (P34)', () => {
  let env: any
  const { sign } = require('hono/jwt')
  const tok = async (id: string) => await sign({ id }, 'test-secret', 'HS256')

  const setup = async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }
    await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, money) VALUES ('seller', 'h', 'S', '売り手', 1000)`).run()
    await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, money) VALUES ('bidder1', 'h', 'B1', '入札者1', 5000)`).run()
    await db.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, money) VALUES ('bidder2', 'h', 'B2', '入札者2', 10000)`).run()
    await db.prepare(`INSERT INTO hangars (id, user_id, unit_id) VALUES (10, 'seller', 2)`).run()
  }

  const sellAuction = async (hours = 24) => {
    return await app.request('/api/trade/sell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await tok('seller')}` },
      body: JSON.stringify({ target_type: 'unit', target_id: 10, price: 1000, is_auction: true, deadline_hours: hours })
    }, env)
  }

  it('オークション出品→入札の競り上げ→現在価格以下は拒否', async () => {
    await setup()
    expect((await sellAuction()).status).toBe(200)
    const listing: any = await env.DB.prepare(`SELECT * FROM market_listings WHERE is_auction = 1`).first()

    // 最低価格未満は拒否
    let res = await app.request('/api/trade/bid', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await tok('bidder1')}` },
      body: JSON.stringify({ listing_id: listing.id, amount: 500 })
    }, env)
    expect(res.status).toBe(400)

    // 正常入札
    res = await app.request('/api/trade/bid', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await tok('bidder1')}` },
      body: JSON.stringify({ listing_id: listing.id, amount: 1200 })
    }, env)
    expect(res.status).toBe(200)

    // 同額は拒否・競り上げは成功
    res = await app.request('/api/trade/bid', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await tok('bidder2')}` },
      body: JSON.stringify({ listing_id: listing.id, amount: 1200 })
    }, env)
    expect(res.status).toBe(400)
    res = await app.request('/api/trade/bid', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await tok('bidder2')}` },
      body: JSON.stringify({ listing_id: listing.id, amount: 2000 })
    }, env)
    expect(res.status).toBe(200)

    const after: any = await env.DB.prepare(`SELECT * FROM market_listings WHERE id = ?`).bind(listing.id).first()
    expect(after.current_bid).toBe(2000)
    expect(after.current_bidder_id).toBe('bidder2')

    // オークション品の即決購入は拒否
    res = await app.request('/api/trade/buy', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await tok('bidder1')}` },
      body: JSON.stringify({ listing_id: listing.id })
    }, env)
    expect(res.status).toBe(400)
  })

  it('締切後に落札成立: 機体移転と代金移動', async () => {
    await setup()
    await sellAuction()
    const listing: any = await env.DB.prepare(`SELECT * FROM market_listings WHERE is_auction = 1`).first()
    await app.request('/api/trade/bid', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await tok('bidder1')}` },
      body: JSON.stringify({ listing_id: listing.id, amount: 3000 })
    }, env)

    // 締切を過去にして listings を叩く（遅延落札）
    await env.DB.prepare(`UPDATE market_listings SET deadline_at = ? WHERE id = ?`).bind(Math.floor(Date.now() / 1000) - 10, listing.id).run()
    const res = await app.request('/api/trade/listings', {}, env)
    expect(res.status).toBe(200)

    const gone = await env.DB.prepare(`SELECT * FROM market_listings WHERE id = ?`).bind(listing.id).first()
    expect(gone).toBeFalsy()
    const hangar: any = await env.DB.prepare(`SELECT * FROM hangars WHERE user_id = 'bidder1' AND unit_id = 2`).first()
    expect(hangar).toBeTruthy()
    const b: any = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'bidder1'`).first()
    const s: any = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'seller'`).first()
    expect(b.money).toBe(2000)
    expect(s.money).toBe(4000)
  })

  it('入札なしで締切→最低価格の通常売り出しに切り替わる', async () => {
    await setup()
    await sellAuction()
    const listing: any = await env.DB.prepare(`SELECT * FROM market_listings WHERE is_auction = 1`).first()
    await env.DB.prepare(`UPDATE market_listings SET deadline_at = ? WHERE id = ?`).bind(Math.floor(Date.now() / 1000) - 10, listing.id).run()

    await app.request('/api/trade/listings', {}, env)

    const converted: any = await env.DB.prepare(`SELECT * FROM market_listings WHERE seller_id = 'seller' AND is_auction = 0`).first()
    expect(converted).toBeTruthy()
    expect(converted.price).toBe(1000)
  })
})
