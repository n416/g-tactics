import { Hono } from 'hono'
import { verify } from 'hono/jwt'
import { recordUnitObtained } from '../utils/unitStats'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const tradeApp = new Hono<{ Bindings: Bindings }>()

// P34: 締切を過ぎたオークションの落札処理（routean.pl joborction 相当。
// 原作同様 cron ではなく画面表示のたびの遅延評価で処理する）
async function settleExpiredAuctions(db: any) {
  const now = Math.floor(Date.now() / 1000)
  const { results } = await db.prepare(
    `SELECT * FROM market_listings WHERE is_auction = 1 AND deadline_at IS NOT NULL AND deadline_at <= ?`
  ).bind(now).all()

  for (const listing of results) {
    // アトミックな確保（多重落札防止）
    const claim = await db.prepare(`DELETE FROM market_listings WHERE id = ? AND is_auction = 1`).bind(listing.id).run()
    if (!claim.meta || claim.meta.changes === 0) continue

    let settled = false
    if (listing.current_bidder_id) {
      const bidder: any = await db.prepare('SELECT id, money FROM characters WHERE id = ?').bind(listing.current_bidder_id).first()
      // 落札者の残金が足りない場合は流札（→最低価格の通常売り出しへ。リメイク独自の安全策）
      if (bidder && bidder.money >= listing.current_bid) {
        await db.prepare('UPDATE characters SET money = money - ? WHERE id = ?').bind(listing.current_bid, bidder.id).run()
        await db.prepare('UPDATE characters SET money = money + ? WHERE id = ?').bind(listing.current_bid, listing.seller_id).run()
        if (listing.listing_type === 'unit') {
          await db.prepare('INSERT INTO hangars (user_id, unit_id) VALUES (?, ?)').bind(bidder.id, listing.target_id).run()
          await recordUnitObtained(db, bidder.id as string, listing.target_id)
        } else {
          await db.prepare('INSERT INTO item_inventory (user_id, item_id) VALUES (?, ?)').bind(bidder.id, listing.target_id).run()
        }
        settled = true
      }
    }
    if (!settled) {
      // 入札なし → 最低価格での通常売り出しに切り替え（tyuko.cgi:147 準拠）
      await db.prepare(`
        INSERT INTO market_listings (seller_id, seller_name, listing_type, target_id, price, message, is_auction)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `).bind(listing.seller_id, listing.seller_name, listing.listing_type, listing.target_id, listing.price, listing.message || '').run()
    }
  }
}

// 市場の出品一覧を取得
tradeApp.get('/listings', async (c) => {
  try {
    await settleExpiredAuctions(c.env.DB)

    const { results } = await c.env.DB.prepare(`
      SELECT m.*,
             u.name as unit_name, u.image as unit_image, u.description as unit_description, u.hp, u.en, u.armor, u.mobility, u.sensor,
             i.name as item_name, i.description as item_description, i.item_type, i.power, i.ammo
      FROM market_listings m
      LEFT JOIN units u ON m.listing_type = 'unit' AND m.target_id = u.id
      LEFT JOIN items i ON m.listing_type = 'item' AND m.target_id = i.id
      ORDER BY m.created_at DESC
    `).all()

    // 価格クローズのオークションは入札額・入札者を伏せる（tyuko.cgi:148）
    const listings = results.map((r: any) => {
      if (r.is_auction && r.price_closed) {
        return { ...r, current_bid: null, current_bidder_name: r.current_bidder_id ? '？？？？' : null, current_bidder_id: null, has_bid: !!r.current_bidder_id }
      }
      return { ...r, has_bid: !!r.current_bidder_id }
    })

    return c.json({ success: true, listings })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// P34: オークションへの入札
tradeApp.post('/bid', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { listing_id, amount } = await c.req.json()
    const bidAmount = Math.floor(Number(amount) || 0)

    await settleExpiredAuctions(c.env.DB)

    const listing: any = await c.env.DB.prepare('SELECT * FROM market_listings WHERE id = ? LIMIT 1').bind(listing_id).first()
    if (!listing || !listing.is_auction) return c.json({ success: false, message: 'このオークションは終了したか、存在しません。' }, 400)
    if (listing.seller_id === payload.id) return c.json({ success: false, message: '自身の出品には入札できません。' }, 400)

    const now = Math.floor(Date.now() / 1000)
    if (listing.deadline_at && listing.deadline_at <= now) {
      return c.json({ success: false, message: '締め切りを過ぎています。' }, 400)
    }

    // 最低価格・現在価格未満では入札できない（tyuko.cgi:345）
    if (bidAmount < listing.price || bidAmount <= (listing.current_bid || 0)) {
      return c.json({ success: false, message: '最低価格・現在の入札額以下では入札できません。' }, 400)
    }

    const bidder: any = await c.env.DB.prepare('SELECT id, money, chara_name FROM characters WHERE id = ?').bind(payload.id).first()
    if (!bidder || bidder.money < bidAmount) {
      return c.json({ success: false, message: '所持金が入札額に足りません。' }, 400)
    }

    await c.env.DB.prepare(
      `UPDATE market_listings SET current_bid = ?, current_bidder_id = ?, current_bidder_name = ? WHERE id = ? AND is_auction = 1`
    ).bind(bidAmount, bidder.id, bidder.chara_name, listing.id).run()

    return c.json({ success: true, message: `${bidAmount}G で入札しました。` })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 機体・アイテムを出品
tradeApp.post('/sell', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { target_type, target_id, price, message, is_auction, deadline_hours, price_closed } = await c.req.json()

    if (!target_type || !['unit', 'item'].includes(target_type) || !target_id || !price || price <= 0) {
      return c.json({ success: false, message: '入力が不正です。価格は1G以上に設定してください。' }, 400)
    }

    // P34: オークション形式（tyuko.cgi:138-148。締切1〜99時間・価格クローズ）
    let deadlineAt: number | null = null
    if (is_auction) {
      const hours = Math.floor(Number(deadline_hours) || 0)
      if (hours < 1 || hours > 99) {
        return c.json({ success: false, message: '締め切りは1〜99時間で設定してください。' }, 400)
      }
      deadlineAt = Math.floor(Date.now() / 1000) + hours * 3600
    }

    const user: any = await c.env.DB.prepare('SELECT id, chara_name, unit_id, weapon_id, item1_id, item2_id FROM characters WHERE id = ?').bind(payload.id).first()
    if (!user) return c.json({ success: false, message: 'User not found' }, 404)

    let unitOrItemId = 0;

    if (target_type === 'unit') {
      const hangarItem: any = await c.env.DB.prepare(
        'SELECT id, unit_id FROM hangars WHERE id = ? AND user_id = ? LIMIT 1'
      ).bind(target_id, payload.id).first()

      if (!hangarItem) return c.json({ success: false, message: '指定された機体は格納庫にありません。' }, 400)
      if (user.unit_id === hangarItem.unit_id) return c.json({ success: false, message: '現在搭乗中の機体は出品できません。' }, 400)
      
      unitOrItemId = hangarItem.unit_id;
      // ★アトミックな確保（連打による機体複製を防止）
      const claim = await c.env.DB.prepare('DELETE FROM hangars WHERE id = ?').bind(hangarItem.id).run();
      if (!claim.meta || claim.meta.changes === 0) {
        return c.json({ success: false, message: 'この機体はすでに出品されたか、失われました。' }, 400);
      }
    } else if (target_type === 'item') {
      const invItem: any = await c.env.DB.prepare(
        'SELECT id, item_id FROM item_inventory WHERE id = ? AND user_id = ? LIMIT 1'
      ).bind(target_id, payload.id).first()

      if (!invItem) return c.json({ success: false, message: '指定されたアイテムは所持していません。' }, 400)
      if ([user.weapon_id, user.item1_id, user.item2_id].includes(invItem.item_id)) {
        return c.json({ success: false, message: '現在装備中のアイテムは出品できません。' }, 400)
      }

      unitOrItemId = invItem.item_id;
      // ★アトミックな確保（連打によるアイテム複製を防止）
      const claim = await c.env.DB.prepare('DELETE FROM item_inventory WHERE id = ?').bind(invItem.id).run();
      if (!claim.meta || claim.meta.changes === 0) {
        return c.json({ success: false, message: 'このアイテムはすでに出品されたか、失われました。' }, 400);
      }
    }

    // 出品テーブルに登録
    await c.env.DB.prepare(`
      INSERT INTO market_listings (seller_id, seller_name, listing_type, target_id, price, message, is_auction, deadline_at, price_closed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(user.id, user.chara_name, target_type, unitOrItemId, price, message || '', is_auction ? 1 : 0, deadlineAt, price_closed ? 1 : 0).run()

    return c.json({ success: true, message: is_auction ? `オークション形式で出品しました（締切${deadline_hours}時間後）。` : '市場へ出品しました。' })

  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 購入
tradeApp.post('/buy', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { listing_id } = await c.req.json()

    // 購入者情報を取得
    const buyer: any = await c.env.DB.prepare('SELECT id, money, chara_name FROM characters WHERE id = ?').bind(payload.id).first()
    if (!buyer) return c.json({ success: false, message: 'User not found' }, 404)

    // 出品情報を取得
    const listing: any = await c.env.DB.prepare('SELECT * FROM market_listings WHERE id = ? LIMIT 1').bind(listing_id).first()
    if (!listing) return c.json({ success: false, message: '指定された商品はすでに売却されたか、取り下げられました。' }, 400)

    if (listing.seller_id === buyer.id) {
      return c.json({ success: false, message: '自身が出品した商品は購入できません。' }, 400)
    }

    // P34: オークション品は即決購入不可（入札のみ）
    if (listing.is_auction) {
      return c.json({ success: false, message: 'オークション形式の出品です。入札してください。' }, 400)
    }

    if (buyer.money < listing.price) {
      return c.json({ success: false, message: '資金が足りません。' }, 400)
    }

    // ★アトミックな「確保」: 先に出品を削除し、実際に削除できた(=競合に勝った)リクエストだけが
    //   以降の付与処理へ進む。これにより同時購入/二重送信でも機体・アイテムは複製されない。
    const claim = await c.env.DB.prepare('DELETE FROM market_listings WHERE id = ?').bind(listing.id).run()
    if (!claim.meta || claim.meta.changes === 0) {
      return c.json({ success: false, message: 'この商品はすでに売却されたか、取り下げられました。' }, 400)
    }

    // ここから先はこのリクエストが出品を排他的に確保済み。
    // 売り手情報を取得
    const seller: any = await c.env.DB.prepare('SELECT id, money FROM characters WHERE id = ?').bind(listing.seller_id).first()

    // 所持金の移動
    await c.env.DB.prepare('UPDATE characters SET money = money - ? WHERE id = ?').bind(listing.price, buyer.id).run()
    if (seller) {
      await c.env.DB.prepare('UPDATE characters SET money = money + ? WHERE id = ?').bind(listing.price, seller.id).run()
    }

    // アイテム/機体の譲渡
    if (listing.listing_type === 'unit') {
      await c.env.DB.prepare('INSERT INTO hangars (user_id, unit_id) VALUES (?, ?)').bind(buyer.id, listing.target_id).run()
      await recordUnitObtained(c.env.DB, buyer.id as string, listing.target_id)
    } else {
      await c.env.DB.prepare('INSERT INTO item_inventory (user_id, item_id) VALUES (?, ?)').bind(buyer.id, listing.target_id).run()
    }

    return c.json({ success: true, message: `購入が完了しました。${listing.price}G を支払いました。` })

  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 出品取り下げ
tradeApp.post('/cancel', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { listing_id } = await c.req.json()

    // 出品情報を取得（返却データ用）
    const listing: any = await c.env.DB.prepare('SELECT * FROM market_listings WHERE id = ? AND seller_id = ? LIMIT 1').bind(listing_id, payload.id).first()
    if (!listing) return c.json({ success: false, message: '指定された出品情報が見つかりません。' }, 400)

    // ★アトミックな「確保」: 先に削除し、削除できた場合のみ返却する。
    //   購入と競合しても「買い手に付与」と「売り手へ返却」の二重付与（複製）を防ぐ。
    const claim = await c.env.DB.prepare('DELETE FROM market_listings WHERE id = ? AND seller_id = ?').bind(listing.id, payload.id).run()
    if (!claim.meta || claim.meta.changes === 0) {
      return c.json({ success: false, message: 'この出品はすでに売却されたか、処理済みです。' }, 400)
    }

    // アイテム/機体の返却
    if (listing.listing_type === 'unit') {
      await c.env.DB.prepare('INSERT INTO hangars (user_id, unit_id) VALUES (?, ?)').bind(payload.id, listing.target_id).run()
    } else {
      await c.env.DB.prepare('INSERT INTO item_inventory (user_id, item_id) VALUES (?, ?)').bind(payload.id, listing.target_id).run()
    }

    return c.json({ success: true, message: '出品を取り下げました。アイテムはインベントリに戻りました。' })

  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})
