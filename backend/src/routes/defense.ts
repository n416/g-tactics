// ==========================================
// 個別戦闘（原作 manual_kobetu.htm・優勝戦と同型の個人設置型防衛戦）
// 原作: ps_btlview.cgi（sanka/tetai/ps_settei_view）＋ sub/btlview.pl ＋ battle.cgi の w_knm 分岐
// - 参戦(sanka): 作戦名・戦場・参加条件(機体限定/耐久/ランク)を設定して自分が初代防衛者になる
// - 挑戦: 条件を満たす者だけが挑戦でき、勝った挑戦者は作戦の新しい防衛者になる（原作 battle.cgi: wcount=1 で勝者交代）
// - 敗北した挑戦者側: 防衛者の連勝数+1、防衛者に戦果（連勝数ポイント）
// - 24時間戦闘がない作戦は自動消滅（原作 btlview.pl:331 wdate+86400）
// - 撤退(tetai): 現防衛者のみ可能
// ==========================================
import { Hono } from 'hono'
import { verify } from 'hono/jwt'
import { simulateBattleRound, simulateTeamBattle, getFullCharacter, calcMaxHp, calcMaxEn } from '../utils/battleEngine'
import { applyPersonalBattleResults, checkGateRequirements } from '../utils/battleRewards'
import { checkBattleCooldown, touchBattleTime } from '../utils/cooldown'

type Bindings = {
  DB: any
  JWT_SECRET: string
}

const GATE_LIFETIME_MS = 24 * 60 * 60 * 1000;

export const defenseApp = new Hono<{ Bindings: Bindings; Variables: { user: any } }>()

defenseApp.use('*', async (c, next) => {
  const token = c.req.header('Authorization')?.split(' ')[1]
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    c.set('user', payload)
    await next()
  } catch (e) {
    console.error('JWT Error:', e)
    return c.json({ error: 'Invalid token' }, 401)
  }
})

// 24時間戦闘のない作戦を削除（原作: wdate + 60*60*24 経過で del_winner）
async function expireOldGates(db: any) {
  const cutoff = new Date(Date.now() - GATE_LIFETIME_MS).toISOString().replace('T', ' ').substring(0, 19);
  await db.prepare(`DELETE FROM defense_battles WHERE last_challenge_at < ?`).bind(cutoff).run();
}

defenseApp.get('/', async (c) => {
  const db = c.env.DB
  await expireOldGates(db)
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = 10;
  const offset = (page - 1) * limit;
  
  const countRes: any = await db.prepare(`SELECT COUNT(*) as cnt FROM defense_battles`).first();
  const total = countRes ? countRes.cnt : 0;

  const results = await db.prepare(`
    SELECT d.*, o.chara_name as owner_name, c.chara_name as champion_name, COALESCE(NULLIF(c.unit_custom_name, ''), u.name) as unit_name, u.image as unit_image
    FROM defense_battles d
    JOIN characters o ON d.owner_id = o.id
    LEFT JOIN characters c ON d.champion_id = c.id
    LEFT JOIN units u ON c.unit_id = u.id
    ORDER BY d.last_challenge_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all()
  return c.json({ battles: results.results, total, page, limit })
})

defenseApp.post('/create', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const { title, isTeam, terrain, reqUnitType, reqMaxHp, reqRank } = await c.req.json()

  if (!title || !String(title).trim()) return c.json({ error: '作戦名を入力してください。' }, 400)

  const existing = await db.prepare(`SELECT id FROM defense_battles WHERE owner_id = ?`).bind(user.id).first()
  if (existing) return c.json({ error: 'すでに個別戦闘を設置しています。' }, 400)

  // 原作 sanka: 自分自身も参加条件を満たす必要がある（「自分が条件にあっていません」）
  const self = await getFullCharacter(db, user.id)
  if (!self) return c.json({ error: 'キャラクターが見つかりません。' }, 404)
  const gate = { req_unit_type: reqUnitType || '', req_max_hp: reqMaxHp || 0, req_rank: reqRank || 0 }
  const selfErr = checkGateRequirements(self, gate)
  if (selfErr) return c.json({ error: `自分が条件にあっていません。${selfErr}` }, 400)

  if (isTeam) {
    const cnt: any = await db.prepare(`SELECT COUNT(*) as cnt FROM team_members WHERE owner_id = ?`).bind(user.id).first()
    if (!cnt || cnt.cnt === 0) return c.json({ error: 'チームメンバーがいません。勢力からメンバーを編成してください。' }, 400)
  }

  await db.prepare(`
    INSERT INTO defense_battles (owner_id, title, is_team, terrain, req_unit_type, req_max_hp, req_rank, champion_id, win_count, last_challenge_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
  `).bind(user.id, String(title).trim(), isTeam ? 1 : 0, terrain || 1, gate.req_unit_type, gate.req_max_hp, gate.req_rank, user.id).run()

  return c.json({ success: true })
})

defenseApp.post('/challenge/:id', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const id = c.req.param('id')

  await expireOldGates(db)

  const battle = await db.prepare(`SELECT * FROM defense_battles WHERE id = ?`).bind(id).first()
  if (!battle) return c.json({ error: '撤退されています。' }, 404)

  if (battle.champion_id === user.id) return c.json({ error: 'あなたは現在の防衛者です。' }, 400)

  const attacker = await getFullCharacter(db, user.id)
  let defender: any = null
  let parsedSnapshot: any = null
  if (battle.snapshot_data) {
    parsedSnapshot = JSON.parse(battle.snapshot_data)
    defender = Array.isArray(parsedSnapshot) ? parsedSnapshot[0] : parsedSnapshot
    defender.hp = battle.def_hp
    defender.en = battle.def_en
  } else {
    defender = await getFullCharacter(db, battle.champion_id)
  }

  if (!attacker || !defender) return c.json({ error: 'Character data missing' }, 400)

  // 参加条件判定（原作 trmt_jyoken）
  const reqErr = checkGateRequirements(attacker, battle)
  if (reqErr) return c.json({ error: reqErr }, 400)

  if (attacker.hp !== null && attacker.hp <= 0) return c.json({ error: '機体が大破しています。整備を行ってください。' }, 400)

  // P32: 戦闘クールダウン（原作 battle.cgi:58-62 ほか全戦闘入口）
  const cdRemain = await checkBattleCooldown(db, user.id, c.env)
  if (cdRemain !== null) return c.json({ error: `${cdRemain}秒後闘えるようになります。` }, 400)

  let win = false
  let logs: string[] = []
  let events: any[] = []
  let meta: any = null
  let aTeam: any[] = []
  let dTeam: any[] = []

  if (battle.is_team === 0) { // 1v1
    // P47: ターン上限は原作の30（既定値）。満了時の勝敗はHP絶対値比較（battlelib:1280）＝res.win
    const res = simulateBattleRound(attacker, defender, 1, 0, undefined, undefined, battle.terrain)
    win = res.win
    logs = res.logs
    events = res.events
    meta = {
      isSuccess: win,
      attacker: { name: attacker.chara_name, image: attacker.unit_image || 'ms_c_0012.gif', maxHp: calcMaxHp(attacker.unit_base_hp, attacker.status_piloting), maxEn: calcMaxEn(attacker.unit_base_en, attacker.status_piloting) },
      defender: { name: defender.chara_name, image: defender.unit_image || 'ms_c_0012.gif', maxHp: calcMaxHp(defender.unit_base_hp, defender.status_piloting), maxEn: calcMaxEn(defender.unit_base_en, defender.status_piloting) },
      terrain: battle.terrain
    }
  } else {
    // チーム戦: 双方の team_members スナップショットを合流
    const getTeamMembers = async (ownerId: string) => {
      const res = await db.prepare(`
        SELECT character_id, snapshot_data, team_tactic, team_kaisyo, kaisyo_cap
        FROM team_members
        WHERE owner_id = ?
        ORDER BY created_at ASC
        LIMIT 4
      `).bind(ownerId).all()
      return res.results.map((r: any) => {
        const m = JSON.parse(r.snapshot_data)
        m.team_tactic = r.team_tactic || 'NN' // P38: チーム戦術
        m.team_kaisyo = r.team_kaisyo || 0
        m.kaisyo_cap = r.kaisyo_cap || 0
        m.character_id = r.character_id
        return m
      })
    }

    const aWingmen = await getTeamMembers(user.id)
    if (aWingmen.length === 0) {
      return c.json({ error: 'チームメンバーがいません。勢力からメンバーを編成してください。' }, 400)
    }

    const dWingmen = await getTeamMembers(battle.champion_id)

    aTeam = [attacker, ...aWingmen]
    if (Array.isArray(parsedSnapshot)) {
      dTeam = parsedSnapshot
      dTeam[0].hp = battle.def_hp
      dTeam[0].en = battle.def_en
    } else {
      dTeam = [defender, ...dWingmen]
    }

    const aSnare = aTeam.length * 150 - 300 + aWingmen.reduce((acc: number, m: any) => acc + m.team_kaisyo, 0);
    const dSnare = dTeam.length * 150 - 300 + dWingmen.reduce((acc: number, m: any) => acc + m.team_kaisyo, 0);

    const res = simulateTeamBattle(aTeam, dTeam, battle.terrain, [aSnare, dSnare])
    win = res.isSuccess
    logs = res.logs
    events = res.events
    meta = {
      isSuccess: win,
      attacker: { name: attacker.chara_name + ' (チーム)', image: attacker.unit_image || 'ms_c_0012.gif', maxHp: aTeam.reduce((acc, a) => acc + calcMaxHp(a.unit_base_hp, a.status_piloting), 0), maxEn: aTeam.reduce((acc, a) => acc + calcMaxEn(a.unit_base_en, a.status_piloting), 0) },
      defender: { name: defender.chara_name + ' (チーム)', image: defender.unit_image || 'ms_c_0012.gif', maxHp: dTeam.reduce((acc, d) => acc + calcMaxHp(d.unit_base_hp, d.status_piloting), 0), maxEn: dTeam.reduce((acc, d) => acc + calcMaxEn(d.unit_base_en, d.status_piloting), 0) },
      terrain: battle.terrain
    }

    const updateTeamKaisyo = async (ownerId: string, wingmen: any[]) => {
      for (const m of wingmen) {
        if (!m.character_id) continue;
        const newKaisyo = Math.min(m.team_kaisyo + 1, m.kaisyo_cap);
        await db.prepare(`UPDATE team_members SET team_kaisyo = ? WHERE owner_id = ? AND character_id = ?`)
          .bind(newKaisyo, ownerId, m.character_id).run();
      }
    };
    await updateTeamKaisyo(user.id, aWingmen);
    await updateTeamKaisyo(battle.champion_id, dWingmen);
  }

  const resultMessage = win ? '防衛者を打ち破った！この作戦の新しい防衛者になった！' : '防衛者の壁は厚かった…。敗北しました。'

  // 勝者交代＋防衛スナップショット/耐久持ち越し（原作 battle.cgi:349 $wtai=$vtai は個別戦闘=w_knm付きにも適用）
  let newSnapshotStr = battle.snapshot_data
  let newDefHp = battle.def_hp
  let newDefEn = battle.def_en
  if (win) {
    // 勝った挑戦者が新防衛者。snapshotは挑戦者の戦闘後状態
    if (battle.is_team) {
      newSnapshotStr = JSON.stringify(aTeam)
      newDefHp = aTeam[0].hp
      newDefEn = aTeam[0].en
    } else {
      newSnapshotStr = JSON.stringify(attacker)
      newDefHp = attacker.hp
      newDefEn = attacker.en
    }
    await db.prepare(`UPDATE defense_battles SET champion_id = ?, win_count = 1, snapshot_data = ?, def_hp = ?, def_en = ?, last_challenge_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(user.id, newSnapshotStr, newDefHp, newDefEn, id).run()
  } else {
    // 防衛成功。防衛者の戦闘後（削れた）耐久を持ち越す
    if (battle.is_team) {
      newSnapshotStr = JSON.stringify(dTeam)
      newDefHp = dTeam[0].hp
      newDefEn = dTeam[0].en
    } else {
      newSnapshotStr = JSON.stringify(defender)
      newDefHp = defender.hp
      newDefEn = defender.en
    }
    await db.prepare(`UPDATE defense_battles SET win_count = win_count + 1, snapshot_data = ?, def_hp = ?, def_en = ?, last_challenge_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(newSnapshotStr, newDefHp, newDefEn, id).run()
  }

  // 報酬・成長・損傷・戦績（個別戦闘 = 個人戦。チーム戦は battle_syurui 5）
  await touchBattleTime(db, user.id)
  // 防衛者の本体機体は防衛で減らさない: 報酬適用前にライブHPへ退避
  const liveDefender = await getFullCharacter(db, battle.champion_id)
  if (liveDefender) {
    defender.hp = liveDefender.hp ?? calcMaxHp(liveDefender.unit_base_hp)
    defender.en = liveDefender.en ?? calcMaxEn(liveDefender.unit_base_en)
  }
  const reward = await applyPersonalBattleResults(db, attacker, defender, win, logs, {
    winCount: battle.win_count,
    isGateBattle: true,
    battleSyurui: battle.is_team ? 5 : 1,
    terrain: battle.terrain,
    battleType: 'gate',
    events,
    meta,
    defenseBattleId: Number(battle.id)  // Q2観戦: この作戦の戦闘として保存
  })

  // 伝言で詳細を送信（以前の長文ログを自分に送っていたバグを修正し、防衛者へ簡潔な結果を送る）
  const defenseResultMsg = win 
    ? `【防衛戦敗北】個別戦闘 '${battle.title}' にて、あなたの防衛機体が${attacker.chara_name}に敗北し、防衛者の座を奪われました…。`
    : `【防衛戦勝利】個別戦闘 '${battle.title}' にて、あなたの防衛機体が${attacker.chara_name}を撃退しました！`;
  await db.prepare(`INSERT INTO private_messages (sender_id, recipient_id, message) VALUES (?, ?, ?)`).bind(user.id, battle.champion_id, defenseResultMsg).run()

  return c.json({ success: true, message: resultMessage + '\n(詳細は伝言ボックスをご確認ください)', events, meta, logs, reward })
})

// 個別戦闘の取り下げ導線（原作 ps_btlview.cgi mode=tetai 相当）
defenseApp.delete('/withdraw/:id', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const id = c.req.param('id')

  const battle = await db.prepare(`SELECT * FROM defense_battles WHERE id = ?`).bind(id).first()
  if (!battle) return c.json({ error: '作戦が見つかりません。' }, 404)
  if (battle.champion_id !== user.id) return c.json({ error: '現在の防衛者のみが作戦を撤退させることができます。' }, 403)

  await db.prepare(`DELETE FROM defense_battles WHERE id = ?`).bind(id).run()

  return c.json({ success: true, message: '作戦を終了（撤退）しました。' })
})

// 個別戦闘の観戦（原作 ps_btlview.cgi dsp_btl → action.cgi battleview 相当）
// 一覧から他人の作戦の直近戦闘を第三者が観戦する。原作は直近1戦だが履歴を活かし直近数件を返す。
defenseApp.get('/:id/logs', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')

  const { results } = await db.prepare(
    `SELECT b.id, b.is_attacker_win, b.log_text, b.events_json, b.meta_json, b.created_at,
            a.handle_name AS attacker_name, d.handle_name AS defender_name
     FROM battle_logs b
     LEFT JOIN characters a ON b.attacker_id = a.id
     LEFT JOIN characters d ON b.defender_id = d.id
     WHERE b.defense_battle_id = ?
     ORDER BY b.id DESC
     LIMIT 5`
  ).bind(id).all()

  const logs = (results as any[]).map((l) => ({
    id: l.id,
    is_attacker_win: l.is_attacker_win,
    attacker_name: l.attacker_name,
    defender_name: l.defender_name,
    created_at: l.created_at,
    log_text: l.log_text,
    events: l.events_json ? JSON.parse(l.events_json) : null,
    meta: l.meta_json ? JSON.parse(l.meta_json) : null,
  }))

  return c.json({ success: true, logs })
})
