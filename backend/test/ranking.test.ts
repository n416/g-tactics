import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'

describe('Ranking API (多軸ソート / P15)', () => {
  let env: any

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret' }

    // 3人を軸ごとに順位が入れ替わるように投入。
    // A: 高EXP / 高勝率 / 低名声 / 高階級指数
    // B: 中EXP / 中勝率 / 高名声 / 低階級指数
    // C: 低EXP / 無戦績 / 中名声 / 中階級指数
    const insert = (
      id: string, name: string, level: number, exp: number, fame: number,
      total: number, win: number, stat: number, nt: number
    ) => db.prepare(
      `INSERT INTO characters
        (id, password_hash, handle_name, chara_name, level, exp, fame, total_battles, win_battles,
         status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range, nt_level)
       VALUES (?, 'hash', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, name, name, level, exp, fame, total, win, stat, stat, stat, stat, stat, nt).run()

    // stat は5値それぞれの値。階級指数 = stat*5 + level*25 + |nt|*100
    await insert('A', 'Alpha', 30, 5000, 10, 10, 9, 100, 5) // 勝率90%, 指数= 500+750+500=1750
    await insert('B', 'Bravo', 20, 3000, 500, 10, 5, 20, 0) // 勝率50%, 指数= 100+500+0=600
    await insert('C', 'Charlie', 10, 1000, 100, 0, 0, 40, 1) // 勝率0%,  指数= 200+250+100=550
  })

  const idsFor = async (query: string): Promise<string[]> => {
    const res = await app.request(`/api/ranking${query}`, {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    return json.ranking.map((r: any) => r.id)
  }

  it('default (no sort) falls back to exp DESC', async () => {
    expect(await idsFor('')).toEqual(['A', 'B', 'C'])
  })

  it('sort=winrate orders by win rate DESC', async () => {
    // A(90) > B(50) > C(0)
    expect(await idsFor('?sort=winrate')).toEqual(['A', 'B', 'C'])
  })

  it('sort=fame orders by fame DESC', async () => {
    // B(500) > C(100) > A(10)
    expect(await idsFor('?sort=fame')).toEqual(['B', 'C', 'A'])
  })

  it('sort=rank (階級指数) orders by rank score DESC', async () => {
    // A(1750) > B(600) > C(550)
    expect(await idsFor('?sort=rank')).toEqual(['A', 'B', 'C'])
  })

  it('sort=level (熟練度) orders by level DESC', async () => {
    // A(30) > B(20) > C(10)
    expect(await idsFor('?sort=level')).toEqual(['A', 'B', 'C'])
  })

  it('sort=name orders by chara_name ASC', async () => {
    // Alpha < Bravo < Charlie
    expect(await idsFor('?sort=name')).toEqual(['A', 'B', 'C'])
  })

  it('accepts legacy sort aliases (no=winrate, mesei=fame, kaikyu=rank, jyuku=level)', async () => {
    expect(await idsFor('?sort=mesei')).toEqual(['B', 'C', 'A']) // = fame
    expect(await idsFor('?sort=jyuku')).toEqual(['A', 'B', 'C']) // = level
    expect(await idsFor('?sort=kaikyu')).toEqual(['A', 'B', 'C']) // = rank
  })

  it('invalid sort value does not crash and falls back to exp DESC', async () => {
    expect(await idsFor('?sort=__bogus__')).toEqual(['A', 'B', 'C'])
  })

  it('exposes computed win_rate and fame fields', async () => {
    const res = await app.request('/api/ranking?sort=winrate', {}, env)
    const json = (await res.json()) as any
    const a = json.ranking.find((r: any) => r.id === 'A')
    expect(Math.round(a.win_rate)).toBe(90)
    expect(a.fame).toBe(10)
  })

  it('P43-12: cv/CLS/最終戦闘からの経過日数 の派生値を返す (manual_ranking.htm 準拠)', async () => {
    const res = await app.request('/api/ranking', {}, env)
    const json = (await res.json()) as any
    const a = json.ranking.find((r: any) => r.id === 'A')
    const b = json.ranking.find((r: any) => r.id === 'B')
    const c2 = json.ranking.find((r: any) => r.id === 'C')

    // cv: 5能力が均等なら 0.00（変動係数）
    expect(a.cv).toBe('0.00')
    // CLS: NT(n) / 強化(n) / UNS（manual_database.htm の表記）
    expect(a.cls).toBe('NT(5)')
    expect(b.cls).toBe('UNS')
    expect(c2.cls).toBe('NT(1)')
    // 【本作改変】キャラ自動削除は行わない＝「削除まで」予告は撤去し、最終戦闘からの経過日数を返す。
    // last_battle_at=0（未戦闘）なら 0日。削除予告フィールドは返さない。
    expect(a.days_since_last_battle).toBe(0)
    expect(a.days_until_deletion).toBeUndefined()
    // money が応答に含まれる（名声/現預金列用）
    expect(typeof a.money).toBe('number')
  })
})
