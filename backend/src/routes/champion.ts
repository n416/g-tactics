// ==========================================
// 優勝戦（個人／チーム）
// 原作: sub/btlview.pl（優勝者表示・挑戦導線・戦場変更=名声5）＋ battle.cgi / teambattle.cgi
// - 挑戦者が勝てば新優勝者（連勝1から）。負ければ優勝者の連勝+1＋戦果（連勝数ポイント）
// - 戦場は一定回数の戦闘ごとに自動移動（battle.cgi:232-241 wsenjyo_cnt。個人 rand(15)+5 / チーム rand(100)+30）
// - 名声5を消費して戦場を任意変更できる（btlview.pl:143-144）
// ==========================================
import { Hono } from 'hono'
import { verify } from 'hono/jwt'
import { simulateBattleRound, simulateTeamBattle, getFullCharacter, calcMaxHp, calcMaxEn } from '../utils/battleEngine'
import { applyPersonalBattleResults } from '../utils/battleRewards'
import { postNews } from '../utils/news'
import { checkBattleCooldown, touchBattleTime } from '../utils/cooldown'

type Bindings = {
  DB: any
  JWT_SECRET: string
}

export const championApp = new Hono<{ Bindings: Bindings; Variables: { user: any } }>()

championApp.use('*', async (c, next) => {
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

// GET /api/champion
championApp.get('/', async (c) => {
  const db = c.env.DB
  const user = c.get('user')

  let isDefender = false;
  if (user && user.id) {
    const defenseRes = await db.prepare(`SELECT id FROM defense_battles WHERE champion_id = ? LIMIT 1`).bind(user.id).first();
    if (defenseRes) {
      isDefender = true;
    }
  }

  // 機体名は専用機化(senyou)で付けた unit_custom_name を優先（原作 winchg で優勝者の機体名が反映されるのと等価。
  // port は live 読みのため常に最新）。未設定時はマスター機体名にフォールバック。
  const indResult = await db.prepare(`
    SELECT c.*, ch.chara_name, ch.level, COALESCE(NULLIF(ch.unit_custom_name, ''), u.name) as unit_name, u.image as unit_image
    FROM champions c
    JOIN characters ch ON c.champion_id = ch.id
    LEFT JOIN units u ON ch.unit_id = u.id
    WHERE c.type = 'individual'
    ORDER BY c.updated_at DESC LIMIT 1
  `).first()

  const teamResult = await db.prepare(`
    SELECT c.*, ch.chara_name, ch.level, COALESCE(NULLIF(ch.unit_custom_name, ''), u.name) as unit_name, u.image as unit_image
    FROM champions c
    JOIN characters ch ON c.champion_id = ch.id
    LEFT JOIN units u ON ch.unit_id = u.id
    WHERE c.type = 'team'
    ORDER BY c.updated_at DESC LIMIT 1
  `).first()

  let indLogs = [];
  if (indResult) {
    const rawLogs = (await db.prepare(`SELECT * FROM battle_logs WHERE defender_id = ? AND battle_type = 'champion_individual' ORDER BY id DESC LIMIT 5`).bind(indResult.champion_id).all()).results;
    indLogs = rawLogs.map((l: any) => ({
      ...l,
      events: l.events_json ? JSON.parse(l.events_json) : null,
      meta: l.meta_json ? JSON.parse(l.meta_json) : null
    }));
  }

  let teamLogs = [];
  if (teamResult) {
    const rawLogs = (await db.prepare(`SELECT * FROM battle_logs WHERE defender_id = ? AND battle_type = 'champion_team' ORDER BY id DESC LIMIT 5`).bind(teamResult.champion_id).all()).results;
    teamLogs = rawLogs.map((l: any) => ({
      ...l,
      events: l.events_json ? JSON.parse(l.events_json) : null,
      meta: l.meta_json ? JSON.parse(l.meta_json) : null
    }));
  }

  return c.json({
    individual: indResult ? { ...indResult, logs: indLogs } : null,
    team: teamResult ? { ...teamResult, logs: teamLogs } : null,
    is_defender: isDefender
  })
})

// POST /api/champion/challenge/:type
championApp.post('/challenge/:type', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const type = c.req.param('type')

  if (type !== 'individual' && type !== 'team') {
    return c.json({ error: 'Invalid champion type' }, 400)
  }

  const champion = await db.prepare(`SELECT * FROM champions WHERE type = ? ORDER BY updated_at DESC LIMIT 1`).bind(type).first()

  if (!champion) {
    await db.prepare(`INSERT INTO champions (type, champion_id, win_count, terrain, terrain_counter) VALUES (?, ?, 1, 1, 10)`).bind(type, user.id).run()
    return c.json({ success: true, message: '不戦勝であなたが新しい優勝者になりました。' })
  }

  if (champion.champion_id === user.id) {
    return c.json({ error: 'あなたは現在の優勝者です。' }, 400)
  }

  const attacker = await getFullCharacter(db, user.id)
  let defender: any = null;
  let parsedSnapshot: any = null;
  if (champion.snapshot_data) {
    parsedSnapshot = JSON.parse(champion.snapshot_data);
    defender = Array.isArray(parsedSnapshot) ? parsedSnapshot[0] : parsedSnapshot;
    defender.hp = champion.def_hp;
    defender.en = champion.def_en;
  } else {
    defender = await getFullCharacter(db, champion.champion_id);
  }

  if (!attacker || !defender) return c.json({ error: 'Character data missing' }, 400)

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

  if (type === 'individual') {
    // P47: ターン上限は原作の30（既定値）。満了時の勝敗はHP絶対値比較（battlelib:1280）＝res.win
    const res = simulateBattleRound(attacker, defender, 1, 0, undefined, undefined, champion.terrain)
    win = res.win
    logs = res.logs
    events = res.events
    meta = {
      isSuccess: win,
      attacker: { name: attacker.chara_name, image: attacker.unit_image || 'ms_c_0012.gif', maxHp: calcMaxHp(attacker.unit_base_hp, attacker.status_piloting), maxEn: calcMaxEn(attacker.unit_base_en, attacker.status_piloting) },
      defender: { name: defender.chara_name, image: defender.unit_image || 'ms_c_0012.gif', maxHp: calcMaxHp(defender.unit_base_hp, defender.status_piloting), maxEn: calcMaxEn(defender.unit_base_en, defender.status_piloting) },
      terrain: champion.terrain
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

    const dWingmen = await getTeamMembers(champion.champion_id)

    aTeam = [attacker, ...aWingmen]
    if (Array.isArray(parsedSnapshot)) {
      dTeam = parsedSnapshot;
      dTeam[0].hp = champion.def_hp;
      dTeam[0].en = champion.def_en;
    } else {
      dTeam = [defender, ...dWingmen];
    }

    const aSnare = aTeam.length * 150 - 300 + aWingmen.reduce((acc: number, m: any) => acc + m.team_kaisyo, 0);
    const dSnare = dTeam.length * 150 - 300 + dWingmen.reduce((acc: number, m: any) => acc + m.team_kaisyo, 0);

    const teamRes = simulateTeamBattle(aTeam, dTeam, champion.terrain, [aSnare, dSnare])
    win = teamRes.isSuccess
    logs = teamRes.logs
    events = teamRes.events
    meta = {
      isSuccess: win,
      attacker: { name: attacker.chara_name + ' (チーム)', image: attacker.unit_image || 'ms_c_0012.gif', maxHp: aTeam.reduce((acc, a) => acc + calcMaxHp(a.unit_base_hp, a.status_piloting), 0), maxEn: aTeam.reduce((acc, a) => acc + calcMaxEn(a.unit_base_en, a.status_piloting), 0) },
      defender: { name: defender.chara_name + ' (チーム)', image: defender.unit_image || 'ms_c_0012.gif', maxHp: dTeam.reduce((acc, d) => acc + calcMaxHp(d.unit_base_hp, d.status_piloting), 0), maxEn: dTeam.reduce((acc, d) => acc + calcMaxEn(d.unit_base_en, d.status_piloting), 0) },
      terrain: champion.terrain
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
    await updateTeamKaisyo(champion.champion_id, dWingmen);
  }

  const resultMessage = win ? '優勝者を打ち破りました！あなたが新しい優勝者です！' : '防衛者の壁は厚かった…。敗北しました。'

  // P37: 近況ニュース（優勝者交代）
  if (win) {
    await postNews(db, `${attacker.chara_name}が${type === 'team' ? 'チーム' : '個人'}優勝戦を制し、新たな優勝者となりました。`)
  }

  // 戦場ローテーション（原作 battle.cgi:232-241 / teambattle.cgi:427-436。優勝戦のみ）
  let newTerrain = champion.terrain
  let newCounter = champion.terrain_counter - 1
  if (newCounter < 1) {
    newTerrain = Math.floor(Math.random() * 4) + 1
    newCounter = type === 'team' ? Math.floor(Math.random() * 100) + 30 : Math.floor(Math.random() * 15) + 5
  }

  // 優勝者の交代／連勝更新
  let newSnapshotStr = champion.snapshot_data;
  let newDefHp = champion.def_hp;
  let newDefEn = champion.def_en;

  if (win) {
    if (type === 'team') {
      newSnapshotStr = JSON.stringify(aTeam);
      newDefHp = aTeam[0].hp;
      newDefEn = aTeam[0].en;
    } else {
      newSnapshotStr = JSON.stringify(attacker);
      newDefHp = attacker.hp;
      newDefEn = attacker.en;
    }
    await db.prepare(`UPDATE champions SET champion_id = ?, win_count = 1, terrain = ?, terrain_counter = ?, snapshot_data = ?, def_hp = ?, def_en = ?, updated_at = CURRENT_TIMESTAMP WHERE type = ?`)
      .bind(user.id, newTerrain, newCounter, newSnapshotStr, newDefHp, newDefEn, type).run()
  } else {
    if (type === 'team') {
      newSnapshotStr = JSON.stringify(dTeam);
      newDefHp = dTeam[0].hp;
      newDefEn = dTeam[0].en;
    } else {
      newSnapshotStr = JSON.stringify(defender);
      newDefHp = defender.hp;
      newDefEn = defender.en;
    }
    await db.prepare(`UPDATE champions SET win_count = win_count + 1, terrain = ?, terrain_counter = ?, snapshot_data = ?, def_hp = ?, def_en = ?, updated_at = CURRENT_TIMESTAMP WHERE type = ?`)
      .bind(newTerrain, newCounter, newSnapshotStr, newDefHp, newDefEn, type).run()
  }
  if (newTerrain !== champion.terrain) {
    logs.push(`【戦場移動】 優勝戦の戦場が移動した！`)
  }

  // 報酬・成長・損傷・戦績（優勝戦 = 個人戦。チーム優勝戦は battle_syurui 4）
  await touchBattleTime(db, user.id)

  const liveDefender = await getFullCharacter(db, champion.champion_id);
  if (liveDefender) {
    defender.hp = liveDefender.hp ?? calcMaxHp(liveDefender.unit_base_hp);
    defender.en = liveDefender.en ?? calcMaxEn(liveDefender.unit_base_en);
  }

  const reward = await applyPersonalBattleResults(db, attacker, defender, win, logs, {
    winCount: champion.win_count,
    isGateBattle: false,
    battleSyurui: type === 'team' ? 4 : 1,
    terrain: champion.terrain,
    battleType: type === 'team' ? 'champion_team' : 'champion_individual',
    events,
    meta
  })

  // 伝言で詳細を送信（以前の長文ログを自分に送っていたバグを修正し、防衛者へ簡潔な結果を送る）
  const defenseResultMsg = win 
    ? `【防衛戦敗北】あなたの防衛機体が${attacker.chara_name}に敗北し、優勝者の座を奪われました…。`
    : `【防衛戦勝利】あなたの防衛機体が${attacker.chara_name}を撃退しました！`;
  await db.prepare(`INSERT INTO private_messages (sender_id, recipient_id, message) VALUES (?, ?, ?)`).bind(user.id, champion.champion_id, defenseResultMsg).run()

  return c.json({ success: true, message: resultMessage + '\n(詳細は伝言ボックスをご確認ください)', events, meta, logs, reward })
})

championApp.post('/move-terrain/:type', async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const type = c.req.param('type')
  const { targetTerrain } = await c.req.json()

  // 5=仮想空間（無地形＝地形補正0。battleLogic が terrain=5 を地形なしとして扱う。manual_yusyo「仮想空間ワープ」）
  if (![1, 2, 3, 4, 5].includes(targetTerrain)) return c.json({ error: '無効な戦場です。' }, 400)

  const champion = await db.prepare(`SELECT champion_id FROM champions WHERE type = ?`).bind(type).first()
  if (!champion) return c.json({ error: '現在優勝者はいません。' }, 400)
  if (champion.champion_id !== user.id) return c.json({ error: '現在の優勝者のみが戦場を変更できます。' }, 403)

  const character = await db.prepare(`SELECT fame FROM characters WHERE id = ?`).bind(user.id).first()
  if (!character || character.fame < 5) return c.json({ error: '名声が足りません。' }, 400)

  await db.prepare(`UPDATE characters SET fame = fame - 5 WHERE id = ?`).bind(user.id).run()
  await db.prepare(`UPDATE champions SET terrain = ? WHERE type = ?`).bind(targetTerrain, type).run()

  return c.json({ success: true })
})


