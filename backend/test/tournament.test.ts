import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Tournament API (Dual Support & Cancel)', () => {
  let env: any

  const generateToken = async (id: string) => {
    return await sign({ id }, 'test-secret', 'HS256')
  }

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }

    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, is_admin, money) 
       VALUES 
       ('admin1', 'hash', 'Admin', 'Admin Chara', 1, 10000),
       ('user1', 'hash', 'User1', 'User Chara 1', 0, 10000),
       ('user2', 'hash', 'User2', 'User Chara 2', 0, 500)`
    ).run()
  })

  it('should allow tournament creation by normal user and deduct money', async () => {
    const token = await generateToken('user1')
    const res = await app.request('/api/tournaments', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Player Tournament',
        description: 'Hosted by user1',
        prize_money: 1000,
        entry_fee: 100,
        participant_limit: 16
      })
    }, env)
    
    const j = await res.clone().json(); console.log("ERROR:", j); expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    const tournament = await env.DB.prepare(`SELECT * FROM tournaments WHERE name = 'Player Tournament'`).first()
    expect(tournament).toBeDefined()
    expect(tournament.host_id).toBe('user1')
    
    const user = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'user1'`).first()
    expect(user.money).toBe(9000) // 10000 - 1000
  })

  it('should reject tournament creation by normal user if money is insufficient', async () => {
    const token = await generateToken('user2')
    const res = await app.request('/api/tournaments', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Poor Tournament',
        description: 'Should fail',
        prize_money: 1000,
        entry_fee: 10,
        participant_limit: 16
      })
    }, env)
    
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.success).toBe(false)
    expect(json.message).toContain('所持金が不足')
  })

  it('should allow tournament creation by admin (no money deduction, host_id is NULL)', async () => {
    const token = await generateToken('admin1')
    const res = await app.request('/api/tournaments', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Official Tournament',
        description: 'Hosted by admin',
        prize_money: 5000,
        entry_fee: 500,
        participant_limit: 2
      })
    }, env)
    
    const j = await res.clone().json(); console.log("ERROR:", j); expect(res.status).toBe(200)

    const tournament = await env.DB.prepare(`SELECT * FROM tournaments WHERE name = 'Official Tournament'`).first()
    expect(tournament.host_id).toBeNull()

    const admin = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'admin1'`).first()
    expect(admin.money).toBe(10000) // Unchanged
  })

  it('should reject cancel tournament by another user', async () => {
    const token = await generateToken('user2')
    const res = await app.request('/api/tournaments/1/cancel', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    
    expect(res.status).toBe(403)
    const json = (await res.json()) as any
    expect(json.success).toBe(false)
  })

  it('should cancel tournament by host and refund prize money', async () => {
    const token = await generateToken('user1')
    const res = await app.request('/api/tournaments/1/cancel', { // ID 1 is the Player Tournament
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    
    const j = await res.clone().json(); console.log("ERROR:", j); expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    // User should get 1000 back
    const user = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'user1'`).first()
    expect(user.money).toBe(10000)

    // Tournament 1 should be deleted
    const tournament = await env.DB.prepare(`SELECT * FROM tournaments WHERE id = 1`).first()
    expect(tournament).toBeNull()
  })

  it('should allow users to enter the tournament (Official Tournament)', async () => {
    const token1 = await generateToken('user1')
    const token2 = await generateToken('user2')

    // user1 entry to Official Tournament (ID = 2)
    let res = await app.request('/api/tournaments/2/entry', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    let json = (await res.json()) as any
    expect(json.success).toBe(true)

    // user2 entry
    res = await app.request('/api/tournaments/2/entry', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token2}` }
    }, env)
    json = (await res.json()) as any
    expect(json.success).toBe(true)

    // Check money deduction for entry
    const user2 = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'user2'`).first()
    expect(user2.money).toBe(0) // 500 - 500
  })

  it('should refund participants entry fee if official tournament is cancelled by admin', async () => {
    const token = await generateToken('admin1')
    const res = await app.request('/api/tournaments/2/cancel', { // ID 2 is Official Tournament
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }, env)
    
    const j = await res.clone().json(); console.log("ERROR:", j); expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    // user2 should get 500 back
    const user2 = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'user2'`).first()
    expect(user2.money).toBe(500)

    const tournament = await env.DB.prepare(`SELECT * FROM tournaments WHERE id = 2`).first()
    expect(tournament).toBeNull()
  })

  it('should execute the tournament (testing full flow again)', async () => {
    // Recreate a tournament for execution test
    const tokenAdmin = await generateToken('admin1')
    await app.request('/api/tournaments', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Final Tournament',
        description: 'For execution',
        prize_money: 1000,
        entry_fee: 100,
        participant_limit: 2
      })
    }, env)
    // ID will be 3
    
    const token1 = await generateToken('user1')
    const token2 = await generateToken('user2')
    await app.request('/api/tournaments/3/entry', { method: 'POST', headers: { 'Authorization': `Bearer ${token1}` } }, env)
    await app.request('/api/tournaments/3/entry', { method: 'POST', headers: { 'Authorization': `Bearer ${token2}` } }, env)

    const res = await app.request('/api/tournaments/3/execute', {
      method: 'POST'
    }, env)
    
    const j = await res.clone().json(); console.log("ERROR:", j); expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.champion_id).toBeDefined()

    const tournament = await env.DB.prepare(`SELECT * FROM tournaments WHERE id = 3`).first()
    expect(tournament.status).toBe(2) // finished
  })

  it('二重取り下げ: 連打しても賞金は一度しか返金されない', async () => {
    const token = await generateToken('user1')
    await app.request('/api/tournaments', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'DoubleCancel', prize_money: 2000, entry_fee: 0, participant_limit: 2 })
    }, env)
    const listing = (await (await app.request('/api/tournaments', { method: 'GET' }, env)).json() as any)
      .tournaments.find((t: any) => t.name === 'DoubleCancel')
    const moneyBeforeCancel = (await env.DB.prepare(`SELECT money FROM characters WHERE id = 'user1'`).first() as any).money

    const cancel = () => app.request(`/api/tournaments/${listing.id}/cancel`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
    }, env)

    const r1 = await cancel()
    expect(r1.status).toBe(200)
    const r2 = await cancel()
    expect(r2.status).not.toBe(200) // 2回目は失敗（逐次=404 / 同時=claim-guardで400）

    const moneyAfter = (await env.DB.prepare(`SELECT money FROM characters WHERE id = 'user1'`).first() as any).money
    expect(moneyAfter).toBe(moneyBeforeCancel + 2000) // 返金は一度だけ（二重返金なし）
  })
})

// P33/P39: 大会4形式（manual_tournament.htm でルール確定）
describe('Tournament formats (P33/P39)', () => {
  let env: any
  const generateToken = async (id: string) => await sign({ id }, 'test-secret', 'HS256')

  const setup = async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }
    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, is_admin, money, fame, unit_id, level)
       VALUES
       ('admin1', 'hash', 'Admin', 'AdminChara', 1, 100000, 0, 1, 5),
       ('p1', 'hash', 'P1', 'ぱいろっと1', 0, 1000, 0, 1, 5),
       ('p2', 'hash', 'P2', 'ぱいろっと2', 0, 1000, 0, 2, 5),
       ('p3', 'hash', 'P3', 'ぱいろっと3', 0, 1000, 0, 1, 5),
       ('p4', 'hash', 'P4', 'ぱいろっと4', 0, 1000, 0, 2, 5)`
    ).run()
  }

  const createTournament = async (format: number, extra: any = {}) => {
    const token = await generateToken('admin1')
    await app.request('/api/tournaments', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `F${format}大会`, prize_money: 1000, entry_fee: 0, participant_limit: 8, format, ...extra })
    }, env)
    const t: any = await env.DB.prepare(`SELECT * FROM tournaments ORDER BY id DESC LIMIT 1`).first()
    return t
  }

  const enter = async (tid: number, cid: string, side?: number) => {
    const token = await generateToken(cid)
    return await app.request(`/api/tournaments/${tid}/entry`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: side ? JSON.stringify({ side }) : JSON.stringify({})
    }, env)
  }

  it('バトルロイヤル(1): 全員乱戦で優勝者が決まり、撃破ごとに名声が入る', async () => {
    await setup()
    const t = await createTournament(1)
    for (const p of ['p1', 'p2', 'p3', 'p4']) expect((await enter(t.id, p)).status).toBe(200)

    const res = await app.request(`/api/tournaments/${t.id}/execute`, { method: 'POST' }, env)
    const j = await res.clone().json(); console.log("ERROR:", j); expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.success).toBe(true)
    expect(json.champion_id).toBeTruthy()

    const after: any = await env.DB.prepare(`SELECT * FROM tournaments WHERE id = ?`).bind(t.id).first()
    expect(after.status).toBe(2)
    // 優勝賞金は総取り
    const champ: any = await env.DB.prepare(`SELECT money, fame FROM characters WHERE id = ?`).bind(json.champion_id).first()
    expect(champ.money).toBeGreaterThanOrEqual(2000) // 1000 + 賞金1000
  })

  it('団体総力戦(3): 陣営必須・勝利陣営全員に名声1と賞金均等分配', async () => {
    await setup()
    const t = await createTournament(3)
    // 陣営未指定は拒否
    const ng = await enter(t.id, 'p1')
    expect(ng.status).toBe(400)

    expect((await enter(t.id, 'p1', 1)).status).toBe(200)
    expect((await enter(t.id, 'p2', 1)).status).toBe(200)
    expect((await enter(t.id, 'p3', 2)).status).toBe(200)
    expect((await enter(t.id, 'p4', 2)).status).toBe(200)

    const res = await app.request(`/api/tournaments/${t.id}/execute`, { method: 'POST' }, env)
    const j = await res.clone().json(); console.log("ERROR:", j); expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.success).toBe(true)

    // 勝利陣営の2人に賞金500ずつ＋名声1ずつ（敗北側は増えない）
    const rows: any = await env.DB.prepare(`SELECT id, money, fame FROM characters WHERE id IN ('p1','p2','p3','p4')`).all()
    const gained = rows.results.filter((r: any) => r.money === 1500 && r.fame === 1)
    const notGained = rows.results.filter((r: any) => r.money === 1000 && r.fame === 0)
    expect(gained.length).toBe(2)
    expect(notGained.length).toBe(2)
  })

  it('シャッフルトーナメント(2): 完走して優勝者に賞金・各勝利に名声1', async () => {
    await setup()
    const t = await createTournament(2)
    for (const p of ['p1', 'p2', 'p3', 'p4']) expect((await enter(t.id, p)).status).toBe(200)

    const res = await app.request(`/api/tournaments/${t.id}/execute`, { method: 'POST' }, env)
    const json: any = await res.json()
    expect(json.success).toBe(true)

    // 4人勝ち抜きなら試合数3・優勝者は2勝=名声2+優勝ボーナス10
    const matches: any = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM tournament_matches WHERE tournament_id = ?`).bind(t.id).first()
    expect(matches.cnt).toBe(3)
    const champ: any = await env.DB.prepare(`SELECT fame FROM characters WHERE id = ?`).bind(json.champion_id).first()
    expect(champ.fame).toBe(12)
  })
  describe('P43 B5: 大会制限事項', () => {
    it('熟練度制限（以上）を満たさない参加者はエントリー拒否される (trmnt_setei 準拠)', async () => {
      await setup()
      // 熟練度20以上限定の大会を設置（設置は admin1）
      const t = await createTournament(0, { limit_lv: 20, limit_lv_jyo: 1 })
      expect(t).toBeTruthy()

      // p1（level 5）はエントリー拒否
      const eRes = await enter(t.id, 'p1')
      expect(eRes.status).toBe(400)
      const json = (await eRes.json()) as any
      expect(json.message).toContain('熟練度')

      // level を満たせばエントリーできる
      await env.DB.prepare(`UPDATE characters SET level = 25 WHERE id = 'p1'`).run()
      const okRes = await enter(t.id, 'p1')
      const okJson = (await okRes.json()) as any
      expect(okJson.success).toBe(true)
    })

    it('機体耐久制限（以下）を超える機体はエントリー拒否される', async () => {
      await setup()
      // 耐久200以下限定
      const t = await createTournament(0, { limit_taikyu: 200, limit_taikyu_jyo: -1 })

      // p1 の機体（unit_id=1）の耐久を確認して超過側に設定できないため、キャラの機体を高耐久ユニットに差し替える
      const bigUnit: any = await env.DB.prepare(`SELECT id FROM units WHERE hp > 200 ORDER BY hp DESC LIMIT 1`).first()
      if (bigUnit) {
        await env.DB.prepare(`UPDATE characters SET unit_id = ? WHERE id = 'p2'`).bind(bigUnit.id).run()
        const eRes = await enter(t.id, 'p2')
        expect(eRes.status).toBe(400)
        const json = (await eRes.json()) as any
        expect(json.message).toContain('耐久')
      }
    })

    it('コスト上限(limit_cost) の機体Lvを考慮した検証', async () => {
      // コスト300以下の大会を作成
      const t = await createTournament(0, { limit_cost: 300, limit_cost_jyo: -1 })
      
      // 仮の機体（unit_lv=500）を作成し、キャラに割り当てることでコストを跳ね上がらせる
      await env.DB.prepare(`INSERT OR REPLACE INTO units (id, name, unit_lv) VALUES (9999, 'TestUnit', 500)`).run();
      await env.DB.prepare(`UPDATE characters SET unit_id = 9999, level = 100 WHERE id = 'p1'`).run()
      
      const eRes = await enter(t.id, 'p1')
      expect(eRes.status).toBe(400)
      const json = (await eRes.json()) as any
      expect(json.message).toContain('コストが条件を満たしていません')
    })

    it('大会コメント(Q5): 投稿→GET で古い順に返る・空欄/未認証は拒否', async () => {
      await setup()
      const t = await createTournament(0)

      // 未認証は401
      const noAuth = await app.request(`/api/tournaments/${t.id}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: 'hi' })
      }, env)
      expect(noAuth.status).toBe(401)

      const token1 = await generateToken('p1')
      const post = (comment: string) => app.request(`/api/tournaments/${t.id}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
        body: JSON.stringify({ comment })
      }, env)

      // 空白のみは400
      const empty = await post('  　 ')
      expect(empty.status).toBe(400)

      // 参加していないキャラでも投稿可（原作: ログイン中キャラなら誰でも）
      expect((await post('いい大会だ')).status).toBe(200)
      const token2 = await generateToken('p2')
      const post2 = await app.request(`/api/tournaments/${t.id}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token2}` },
        body: JSON.stringify({ comment: '参加します' })
      }, env)
      expect(post2.status).toBe(200)

      // GET /:id で古い順（id ASC）に返る・名前はスナップショット
      const res = await app.request(`/api/tournaments/${t.id}`, { method: 'GET' }, env)
      const data = await res.json() as any
      expect(data.comments.length).toBe(2)
      expect(data.comments[0].comment).toBe('いい大会だ')
      expect(data.comments[0].chara_name).toBe('ぱいろっと1')
      expect(data.comments[1].comment).toBe('参加します')
    })

    it('自動削除（purge）の検証: 期限切れ大会が一覧から消えること', async () => {
      // 1. 未開催（status=0）で15日前の大会
      await env.DB.prepare(`
        INSERT INTO tournaments (name, status, created_at)
        VALUES ('Expired Recruiting', 0, datetime('now', '-15 days'))
      `).run();
      // 2. 開催済み（status=1）で8日前の大会
      await env.DB.prepare(`
        INSERT INTO tournaments (name, status, created_at)
        VALUES ('Expired Completed', 1, datetime('now', '-8 days'))
      `).run();
      // 3. 正常な大会（昨日作成）
      await env.DB.prepare(`
        INSERT INTO tournaments (name, status, created_at)
        VALUES ('Valid Tournament', 0, datetime('now', '-1 days'))
      `).run();

      const res = await app.request('/api/tournaments', { method: 'GET' }, env)
      const data = await res.json() as any
      
      const names = data.tournaments.map((x: any) => x.name);
      expect(names).not.toContain('Expired Recruiting');
      expect(names).not.toContain('Expired Completed');
      expect(names).toContain('Valid Tournament');
    })
  })
})

// 開催地形（field_terrain）: 原作準拠で主催者が作成時に選択。-2=ランダム（開始時に抽選して確定）。
// 作成→エントリー→実行→保存されたリプレイ(meta)までのフル実行E2E。
describe('Tournament field_terrain (開催地形のフル実行E2E)', () => {
  let env: any
  const generateToken = async (id: string) => await sign({ id }, 'test-secret', 'HS256')

  const setup = async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }
    await env.DB.prepare(
      `INSERT INTO characters (id, password_hash, handle_name, chara_name, is_admin, money, fame, unit_id, level)
       VALUES
       ('admin1', 'hash', 'Admin', 'AdminChara', 1, 100000, 0, 1, 5),
       ('p1', 'hash', 'P1', 'ぱいろっと1', 0, 1000, 0, 1, 5),
       ('p2', 'hash', 'P2', 'ぱいろっと2', 0, 1000, 0, 2, 5),
       ('p3', 'hash', 'P3', 'ぱいろっと3', 0, 1000, 0, 1, 5),
       ('p4', 'hash', 'P4', 'ぱいろっと4', 0, 1000, 0, 2, 5)`
    ).run()
  }

  const createTournament = async (extra: any = {}) => {
    const token = await generateToken('admin1')
    const res = await app.request('/api/tournaments', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '地形大会', prize_money: 1000, entry_fee: 0, participant_limit: 8, ...extra })
    }, env)
    expect(res.status).toBe(200)
    return await env.DB.prepare(`SELECT * FROM tournaments ORDER BY id DESC LIMIT 1`).first() as any
  }

  const enter = async (tid: number, cid: string, side?: number) => {
    const token = await generateToken(cid)
    const res = await app.request(`/api/tournaments/${tid}/entry`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: side ? JSON.stringify({ side }) : JSON.stringify({})
    }, env)
    expect(res.status).toBe(200)
  }

  const execute = async (tid: number) => {
    const res = await app.request(`/api/tournaments/${tid}/execute`, { method: 'POST' }, env)
    const j = await res.clone().json(); if (res.status !== 200) console.log("ERROR:", j)
    expect(res.status).toBe(200)
    return (await res.json()) as any
  }

  // 保存された全試合のリプレイ（log_text JSON）を取り出す
  const loadMatches = async (tid: number) => {
    const rows: any = await env.DB.prepare(`SELECT log_text FROM tournament_matches WHERE tournament_id = ?`).bind(tid).all()
    return rows.results.map((r: any) => JSON.parse(r.log_text))
  }

  it('地形を指定した大会: 全試合のリプレイ meta.terrain が指定値になり、DB の値も変わらない', async () => {
    await setup()
    const t = await createTournament({ format: 0, field_terrain: 3 }) // 3=宇宙
    expect(t.field_terrain).toBe(3)

    for (const p of ['p1', 'p2', 'p3', 'p4']) await enter(t.id, p)
    const json = await execute(t.id)
    expect(json.success).toBe(true)
    expect(json.champion_id).toBeTruthy()

    const after: any = await env.DB.prepare(`SELECT field_terrain, status FROM tournaments WHERE id = ?`).bind(t.id).first()
    expect(after.status).toBe(2)
    expect(after.field_terrain).toBe(3) // 指定済みなら抽選で上書きされない

    const matches = await loadMatches(t.id)
    expect(matches.length).toBe(3) // 4人トーナメント=3試合
    for (const m of matches) {
      expect(m.meta.terrain).toBe(3)
      expect(Array.isArray(m.events)).toBe(true) // リプレイ再生に使う events が保存されている
      expect(m.meta.attackerName).toBeTruthy()
    }
  })

  it('地形未指定(-2)の大会: 開始時に1〜5へ抽選・確定し、全試合の meta.terrain が一致する', async () => {
    await setup()
    const t = await createTournament({ format: 0 }) // field_terrain 未指定 → 既定 -2
    expect(t.field_terrain).toBe(-2)

    for (const p of ['p1', 'p2', 'p3', 'p4']) await enter(t.id, p)
    const json = await execute(t.id)
    expect(json.success).toBe(true)

    const after: any = await env.DB.prepare(`SELECT field_terrain FROM tournaments WHERE id = ?`).bind(t.id).first()
    expect(after.field_terrain).toBeGreaterThanOrEqual(1)
    expect(after.field_terrain).toBeLessThanOrEqual(5)

    const matches = await loadMatches(t.id)
    expect(matches.length).toBe(3)
    for (const m of matches) {
      expect(m.meta.terrain).toBe(after.field_terrain) // 抽選値が全試合で共通
    }
  })

  it('バトルロイヤル(1): 地形指定が確定し、保存された全試合の meta.terrain に反映される', async () => {
    await setup()
    const t = await createTournament({ format: 1, field_terrain: 2 }) // 2=水中
    for (const p of ['p1', 'p2', 'p3', 'p4']) await enter(t.id, p)
    const json = await execute(t.id)
    expect(json.success).toBe(true)

    const after: any = await env.DB.prepare(`SELECT field_terrain FROM tournaments WHERE id = ?`).bind(t.id).first()
    expect(after.field_terrain).toBe(2)

    // 撃破が発生した試合のみ保存される形式のため、保存分すべてを検証
    const matches = await loadMatches(t.id)
    for (const m of matches) {
      expect(m.meta.terrain).toBe(2)
    }
  })

  it('団体総力戦(3): 1試合が保存され meta.terrain に開催地形が入る', async () => {
    await setup()
    const t = await createTournament({ format: 3, field_terrain: 5 }) // 5=仮想空間
    await enter(t.id, 'p1', 1)
    await enter(t.id, 'p2', 1)
    await enter(t.id, 'p3', 2)
    await enter(t.id, 'p4', 2)
    const json = await execute(t.id)
    expect(json.success).toBe(true)

    const matches = await loadMatches(t.id)
    expect(matches.length).toBe(1)
    expect(matches[0].meta.terrain).toBe(5)
    expect(Array.isArray(matches[0].events)).toBe(true)
  })

  it('過去データ互換: field_terrain が範囲外(0など)でも実行時に1〜5へ確定する', async () => {
    await setup()
    const t = await createTournament({ format: 0, field_terrain: 0 }) // 異常値
    for (const p of ['p1', 'p2']) await enter(t.id, p)
    const json = await execute(t.id)
    expect(json.success).toBe(true)

    const after: any = await env.DB.prepare(`SELECT field_terrain FROM tournaments WHERE id = ?`).bind(t.id).first()
    expect(after.field_terrain).toBeGreaterThanOrEqual(1)
    expect(after.field_terrain).toBeLessThanOrEqual(5)
  })
})
