import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { applySchema } from './test-utils'
import { D1Mock } from './d1-mock'
import { sign } from 'hono/jwt'

describe('Base Battle (基地戦) API', () => {
  let env: any
  let token1: string
  let token2: string

  beforeAll(async () => {
    const db = new D1Mock()
    await applySchema(db)
    env = { DB: db, JWT_SECRET: 'test-secret', BATTLE_COOLDOWN_SECONDS: 0 }

    await env.DB.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id) VALUES ('atk1', 'hash', 'Attacker', 'アタッカー', 5, 1000, 10, 2)`).run()
    await env.DB.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id) VALUES ('def1', 'hash', 'Defender', 'ディフェンダー', 5, 1000, 10, 1)`).run()

    token1 = await sign({ id: 'atk1' }, env.JWT_SECRET)
    token2 = await sign({ id: 'def1' }, env.JWT_SECRET)

    const now = Math.floor(Date.now() / 1000)
    // base 作成
    await env.DB.prepare(`INSERT INTO user_bases (user_id, name, terrain, power_last_collected_at, shield_until) VALUES ('def1', '防衛基地', 1, ?, 0)`).bind(now - 3600).run()
    // 砲台5、発電所5
    await env.DB.prepare(`INSERT INTO user_facilities (user_id, facility, level) VALUES ('def1', 'turret', 5)`).run()
    await env.DB.prepare(`INSERT INTO user_facilities (user_id, facility, level) VALUES ('def1', 'power', 5)`).run()
  })

  it('自身の基地は襲撃できない', async () => {
    const res = await app.request(`/api/base/attack/def1`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token2}` }
    }, env)
    expect(res.status).toBe(400)
    const data = await res.json() as any
    expect(data.message).toContain('自身の基地')
  })

  it('他人の基地を襲撃でき、砲台迎撃（Turn 0）が発生し、資金が略奪されシールドが張られる', async () => {
    // def1 は1時間分の未回収資金を持つ。発電所Lv5(60000/d = 2500/h)
    const preDef: any = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'def1'`).first()
    const preAtk: any = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'atk1'`).first()

    // アタッカーを強くして勝つようにする
    await env.DB.prepare(`UPDATE characters SET unit_custom_mobility = 999, status_piloting = 999, current_hp = 1000, current_en = 100 WHERE id = 'atk1'`).run()

    const res = await app.request(`/api/base/attack/def1`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.success).toBe(true)

    const logRow: any = await env.DB.prepare(`SELECT log_text, is_attacker_win FROM battle_logs WHERE attacker_id = 'atk1' AND defender_id = 'def1' ORDER BY id DESC LIMIT 1`).first()
    expect(logRow).toBeDefined()
    const logs = logRow.log_text
    expect(logs).toContain('Turn 0')
    expect(logs).toContain('基地防衛システム')

    if (logRow.is_attacker_win === 1) {
      expect(data.message).toContain('略奪')
      const postDef: any = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'def1'`).first()
      const postAtk: any = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'atk1'`).first()
      
      expect(postAtk.money).toBeGreaterThan(preAtk.money)
      expect(postDef.money).toBeGreaterThan(preDef.money)
    }

    const base: any = await env.DB.prepare(`SELECT shield_until FROM user_bases WHERE user_id = 'def1'`).first()
    const now = Math.floor(Date.now() / 1000)
    expect(base.shield_until).toBeGreaterThan(now)
  })

  it('シールド中の基地は襲撃できない', async () => {
    const res = await app.request(`/api/base/attack/def1`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    expect(res.status).toBe(400)
    const data = await res.json() as any
    expect(data.message).toContain('シールドで保護')
  })

  it('シールドを解除して24時間以内の再襲撃を試みると、再襲撃ガードで弾かれる', async () => {
    await env.DB.prepare(`UPDATE user_bases SET shield_until = 0 WHERE user_id = 'def1'`).run()

    const res = await app.request(`/api/base/attack/def1`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    expect(res.status).toBe(400)
    const data = await res.json() as any
    expect(data.message).toContain('24時間に1回まで')
  })

  it('別の攻撃者が襲撃し、0ptだった場合はシステムから20pt支給される', async () => {
    await env.DB.prepare(`INSERT INTO characters (id, password_hash, handle_name, chara_name, level, money, fame, unit_id) VALUES ('atk2', 'hash', 'Atk2', 'アタッカー2', 5, 1000, 10, 2)`).run()
    const token3 = await sign({ id: 'atk2' }, env.JWT_SECRET)

    const preAtk: any = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'atk2'`).first()
    await env.DB.prepare(`UPDATE characters SET unit_custom_mobility = 999, status_piloting = 999, current_hp = 1000, current_en = 100 WHERE id = 'atk2'`).run()

    const res = await app.request(`/api/base/attack/def1`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token3}` }
    }, env)
    
    const data = await res.json() as any
    expect(data.success).toBe(true)

    const logRow: any = await env.DB.prepare(`SELECT is_attacker_win FROM battle_logs WHERE attacker_id = 'atk2' AND defender_id = 'def1' ORDER BY id DESC LIMIT 1`).first()
    if (logRow && logRow.is_attacker_win === 1) {
      const postAtk: any = await env.DB.prepare(`SELECT money FROM characters WHERE id = 'atk2'`).first()
      expect(postAtk.money).toBe(preAtk.money + 20)
    }
  })

  it('attack レスポンスに battleLogId が含まれ、その ID で GET /api/replay/:id が攻撃者本人に 200 を返す', async () => {
    await env.DB.prepare(`UPDATE user_bases SET shield_until = 0 WHERE user_id = 'def1'`).run()
    // 連戦ガードを回避するため、直近のバトルログを消す
    await env.DB.prepare(`DELETE FROM battle_logs WHERE attacker_id = 'atk1' AND defender_id = 'def1' AND battle_type = 'base'`).run()
    
    const res = await app.request(`/api/base/attack/def1`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.success).toBe(true)
    expect(data.battleLogId).toBeDefined()
    
    const replayRes = await app.request(`/api/replay/${data.battleLogId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token1}` }
    }, env)
    
    expect(replayRes.status).toBe(200)
    const replayData = await replayRes.json() as any
    expect(replayData.success).toBe(true)
  })
})
