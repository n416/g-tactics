import { Hono } from 'hono'
import { verify } from 'hono/jwt'
import { simulateBattleRound, simulateTeamBattle, getFullCharacter, calcMaxHp, calcMaxEn, applyPostBattleTokusyuEffects } from '../utils/battleEngine'
import { charCost } from '../utils/cost'
import { calcRankIndex } from '../utils/battleRewards'
import { postNews } from '../utils/news'

type Bindings = {
  DB: any
  JWT_SECRET: string
}

export const tournamentApp = new Hono<{ Bindings: Bindings }>()

// 大会一覧の取得
tournamentApp.get('/', async (c) => {
  try {
    await c.env.DB.prepare(`
      DELETE FROM tournaments 
      WHERE (status = 0 AND created_at < datetime('now', '-14 days'))
         OR (status != 0 AND created_at < datetime('now', '-7 days'))
    `).run()

    const tournaments = await c.env.DB.prepare(
      `SELECT * FROM tournaments ORDER BY created_at DESC LIMIT 20`
    ).all()
    
    return c.json({ success: true, tournaments: tournaments.results })
  } catch (e: any) {
    console.error('SERVER ERROR IN TOURNAMENT ROUTE:', e); return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 【両対応】大会の新規作成（プレイヤー主催 / 管理者公式）
tournamentApp.post('/', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const chara: any = await c.env.DB.prepare('SELECT id, is_admin, money FROM characters WHERE id = ?').bind(payload.id).first();
    if (!chara) {
      return c.json({ success: false, message: 'キャラクターが見つかりません' }, 404);
    }

    const { name, description, prize_money, entry_fee, participant_limit, format, heal_between,
      limit_unit_types, limit_taikyu, limit_taikyu_jyo, limit_undo, limit_undo_jyo,
      limit_weight, limit_weight_jyo, limit_custom, limit_lv, limit_lv_jyo, limit_rank, limit_rank_jyo,
      limit_cost, limit_cost_jyo, limit_team_size_1, limit_team_size_2, limit_team_taikyu_1, limit_team_taikyu_2,
      limit_team_cost_1, limit_team_cost_2, participant_mask, field_terrain, allow_tactics, auto_start_time,
      team1_name, team2_name, team1_factions, team2_factions, team_leader, team_tactics, bet_points,
      team1_allow_free, team2_allow_free, has_special_condition
    } = await c.req.json()

    if (!name || name.trim() === '') {
      return c.json({ success: false, message: '大会名は必須です' }, 400)
    }

    const p_money = Math.max(0, Number(prize_money) || 0)
    const e_fee = Math.max(0, Number(entry_fee) || 0)
    const p_limit = Math.max(2, Number(participant_limit) || 16)
    // P33/P39: 大会形式（0=トーナメント/1=バトルロイヤル/2=シャッフル/3=団体総力戦）
    const fmt = [0, 1, 2, 3].includes(Number(format)) ? Number(format) : 0
    const heal = heal_between ? 1 : 0

    if (p_limit < 2) {
      return c.json({ success: false, message: '定員は2人以上である必要があります' }, 400)
    }

    let hostId = null
    if (!chara.is_admin) {
      if (chara.money < p_money) {
        return c.json({ success: false, message: '賞金を設定するための所持金が不足しています' }, 400)
      }
      hostId = chara.id
      // 所持金から賞金を引き落とし
      await c.env.DB.prepare(`UPDATE characters SET money = money - ? WHERE id = ?`).bind(p_money, chara.id).run()
    }

    await c.env.DB.prepare(`
      INSERT INTO tournaments (
        name, description, prize_money, entry_fee, participant_limit, host_id, status, format, heal_between,
        limit_unit_types, limit_taikyu, limit_taikyu_jyo, limit_undo, limit_undo_jyo,
        limit_weight, limit_weight_jyo, limit_custom, limit_lv, limit_lv_jyo, limit_rank, limit_rank_jyo,
        limit_cost, limit_cost_jyo, limit_team_size_1, limit_team_size_2, limit_team_taikyu_1, limit_team_taikyu_2,
        limit_team_cost_1, limit_team_cost_2, participant_mask, field_terrain, allow_tactics, auto_start_time,
        team1_name, team2_name, team1_factions, team2_factions, team_leader, team_tactics, bet_points,
        team1_allow_free, team2_allow_free, has_special_condition
      ) VALUES (
        ?, ?, ?, ?, ?, ?, 0, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `).bind(
      name, description || '', p_money, e_fee, p_limit, hostId, fmt, heal,
      limit_unit_types || '', limit_taikyu || 0, limit_taikyu_jyo || 0, limit_undo || 0, limit_undo_jyo || 0,
      limit_weight || 0, limit_weight_jyo || 0, limit_custom || 0, limit_lv || 0, limit_lv_jyo || 0, limit_rank || 0, limit_rank_jyo || 0,
      limit_cost || 0, limit_cost_jyo || 0, limit_team_size_1 || 0, limit_team_size_2 || 0, limit_team_taikyu_1 || 0, limit_team_taikyu_2 || 0,
      limit_team_cost_1 || 0, limit_team_cost_2 || 0, participant_mask || 0, field_terrain ?? -2, allow_tactics || 0, auto_start_time || null,
      team1_name || '', team2_name || '', team1_factions || '', team2_factions || '', team_leader || 0, team_tactics || 0, bet_points || 0,
      team1_allow_free || 0, team2_allow_free || 0, has_special_condition || 0
    ).run()

    return c.json({ success: true, message: '大会を作成しました' })
  } catch (e: any) {
    console.error('SERVER ERROR IN TOURNAMENT ROUTE:', e); return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 大会の取り下げ（キャンセル）
tournamentApp.post('/:id/cancel', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const chara: any = await c.env.DB.prepare('SELECT id, is_admin FROM characters WHERE id = ?').bind(payload.id).first();
    if (!chara) return c.json({ success: false, message: 'キャラクターが見つかりません' }, 404);

    const id = c.req.param('id')
    const tournament = await c.env.DB.prepare(`SELECT * FROM tournaments WHERE id = ?`).bind(id).first()
    
    if (!tournament) return c.json({ success: false, message: '大会が見つかりません' }, 404)
    if (tournament.status !== 0) return c.json({ success: false, message: '開始済みの大会は取り下げできません' }, 400)

    // 権限チェック（主催者本人 または 管理者）
    if (tournament.host_id !== chara.id && !chara.is_admin) {
      return c.json({ success: false, message: '取り下げる権限がありません' }, 403)
    }

    // ★アトミックな「確保」: 先に大会を削除し、削除できた(=競合に勝った)リクエストだけが返金へ進む。
    //   連打や cancel と execute の競合による二重返金／開始済み大会の返金を防ぐ。
    const claim = await c.env.DB.prepare(`DELETE FROM tournaments WHERE id = ? AND status = 0`).bind(id).run()
    if (!claim.meta || claim.meta.changes === 0) {
      return c.json({ success: false, message: 'この大会はすでに取り下げられたか、開始されました' }, 400)
    }

    // 主催者がいる場合は賞金を返金
    if (tournament.host_id) {
      await c.env.DB.prepare(`UPDATE characters SET money = money + ? WHERE id = ?`).bind(tournament.prize_money, tournament.host_id).run()
    }

    // 参加者がいれば参加費を返金
    if (tournament.entry_fee > 0) {
      const participants = await c.env.DB.prepare(`SELECT character_id FROM tournament_participants WHERE tournament_id = ?`).bind(id).all()
      for (const p of participants.results) {
        await c.env.DB.prepare(`UPDATE characters SET money = money + ? WHERE id = ?`).bind(tournament.entry_fee, p.character_id).run()
      }
    }

    // 子テーブルの削除
    await c.env.DB.prepare(`DELETE FROM tournament_participants WHERE tournament_id = ?`).bind(id).run()
    await c.env.DB.prepare(`DELETE FROM tournament_matches WHERE tournament_id = ?`).bind(id).run()

    return c.json({ success: true, message: '大会を取り下げました' })
  } catch (e: any) {
    console.error('SERVER ERROR IN TOURNAMENT ROUTE:', e); return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// トーナメントの詳細と参加者を取得
tournamentApp.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const tournament = await c.env.DB.prepare(
      `SELECT * FROM tournaments WHERE id = ?`
    ).bind(id).first()

    if (!tournament) return c.json({ success: false, message: '大会が見つかりません' }, 404)

    const participants = await c.env.DB.prepare(
      `SELECT tp.*, c.handle_name, c.chara_name, c.level, u.name as unit_name
       FROM tournament_participants tp
       JOIN characters c ON tp.character_id = c.id
       LEFT JOIN units u ON c.unit_id = u.id
       WHERE tp.tournament_id = ?
       ORDER BY tp.registered_at ASC`
    ).bind(id).all()

    const matches = await c.env.DB.prepare(
      `SELECT tm.*, 
        c1.handle_name as fighter1_name, c2.handle_name as fighter2_name,
        u1.name as fighter1_unit, u2.name as fighter2_unit
       FROM tournament_matches tm
       LEFT JOIN characters c1 ON tm.fighter1_id = c1.id
       LEFT JOIN characters c2 ON tm.fighter2_id = c2.id
       LEFT JOIN units u1 ON c1.unit_id = u1.id
       LEFT JOIN units u2 ON c2.unit_id = u2.id
       WHERE tm.tournament_id = ?
       ORDER BY tm.round_num ASC, tm.match_index ASC`
    ).bind(id).all()

    let viewerId = null;
    const authHeader = c.req.header('Authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      try {
        const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
        viewerId = payload.id;
      } catch (e) {}
    }

    const isHost = viewerId === tournament.host_id;
    let processedParticipants = participants.results;
    let isMasked = false;

    if (!isHost) {
      if (tournament.participant_mask === 1) {
        processedParticipants = processedParticipants.map((p: any) => {
          if (p.character_id === viewerId) return p;
          return {
            ...p,
            handle_name: '？？？？',
            chara_name: '？？？？',
            unit_name: '？？？？',
            level: '？？？？',
            cost: '？？？？'
          };
        });
      } else if (tournament.participant_mask === 2) {
        isMasked = true;
        processedParticipants = processedParticipants.filter((p: any) => p.character_id === viewerId);
        // format=3（団体総力戦）の場合は陣営情報を本来返すが、現行は未対応とし「陣営名のみ・集計は0/未対応」とする。
        // リスト自体は本人以外消すことでマスク仕様を満たす
      }
    }

    // Q5: 大会コメント（tornament.cgi trmt_syosai:976-1013）。古い順・名前＋本文。マスクとは非連動（原作もコメントは常に名前表示）。
    const comments = await c.env.DB.prepare(
      `SELECT id, character_id, chara_name, comment, created_at
       FROM tournament_comments WHERE tournament_id = ? ORDER BY id ASC`
    ).bind(id).all()

    return c.json({
      success: true,
      tournament,
      participants: processedParticipants,
      isMasked,
      matches: matches.results,
      comments: comments.results
    })
  } catch (e: any) {
    console.error('SERVER ERROR IN TOURNAMENT ROUTE:', e); return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// Q5: 大会コメントの投稿（tornament.cgi mode=cmnt → trmnt_cmnt）
// 原作: ログイン中キャラなら誰でも可（参加者に限らない）・空欄不可・maxlength200・編集/削除なし。
tournamentApp.post('/:id/comments', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const id = c.req.param('id')
    const tournament = await c.env.DB.prepare(`SELECT id FROM tournaments WHERE id = ?`).bind(id).first()
    if (!tournament) return c.json({ success: false, message: '大会が見つかりません' }, 404)

    const chara: any = await c.env.DB.prepare('SELECT id, chara_name FROM characters WHERE id = ?').bind(payload.id).first()
    if (!chara) return c.json({ success: false, message: 'キャラクターが見つかりません' }, 404)

    const body = await c.req.json().catch(() => ({}))
    // 原作: 空白のみは未入力扱い（$cmntchk =~ s/[ 　]//g）。全角/半角スペースを除いて判定。
    const raw = String(body?.comment ?? '')
    if (raw.replace(/[ 　]/g, '').length === 0) {
      return c.json({ success: false, message: 'コメントが未入力です' }, 400)
    }
    // 原作 maxlength=200 に合わせてサーバー側でも制限
    const comment = raw.slice(0, 200)

    await c.env.DB.prepare(
      `INSERT INTO tournament_comments (tournament_id, character_id, chara_name, comment) VALUES (?, ?, ?, ?)`
    ).bind(id, chara.id, chara.chara_name || '', comment).run()

    return c.json({ success: true, message: 'コメントを投稿しました' })
  } catch (e: any) {
    console.error('SERVER ERROR IN TOURNAMENT ROUTE:', e); return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// トーナメントへの参加登録
tournamentApp.post('/:id/entry', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401)

    let payload: any
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    } catch {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const id = c.req.param('id')
    const charaId = payload.id

    const tournament = await c.env.DB.prepare(`SELECT * FROM tournaments WHERE id = ?`).bind(id).first()
    if (!tournament) return c.json({ success: false, message: '大会が見つかりません' }, 404)
    if (tournament.status !== 0) return c.json({ success: false, message: 'この大会は現在エントリーを受け付けていません' }, 400)

    const existingEntry = await c.env.DB.prepare(`SELECT * FROM tournament_participants WHERE tournament_id = ? AND character_id = ?`).bind(id, charaId).first()
    if (existingEntry) return c.json({ success: false, message: '既にエントリー済みです' }, 400)

        const participantCount = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM tournament_participants WHERE tournament_id = ?`).bind(id).first()
    if (participantCount.count >= tournament.participant_limit) {
      return c.json({ success: false, message: '参加定員に達しています' }, 400)
    }

    const chara = await c.env.DB.prepare(`SELECT * FROM characters WHERE id = ?`).bind(charaId).first()
    if (chara.money < tournament.entry_fee) return c.json({ success: false, message: '参加費用が不足しています' }, 400)

    const unit = await c.env.DB.prepare(`SELECT * FROM units WHERE id = ?`).bind(chara.unit_id).first()
    if (unit) {
      if (tournament.limit_taikyu_jyo !== 0) {
        if (tournament.limit_taikyu_jyo > 0 && unit.hp < tournament.limit_taikyu) return c.json({ success: false, message: '機体の耐久が条件を満たしていません' }, 400)
        if (tournament.limit_taikyu_jyo < 0 && unit.hp > tournament.limit_taikyu) return c.json({ success: false, message: '機体の耐久が条件を満たしていません' }, 400)
      }
      if (tournament.limit_undo_jyo !== 0) {
        if (tournament.limit_undo_jyo > 0 && unit.mobility < tournament.limit_undo) return c.json({ success: false, message: '機体の運動性が条件を満たしていません' }, 400)
        if (tournament.limit_undo_jyo < 0 && unit.mobility > tournament.limit_undo) return c.json({ success: false, message: '機体の運動性が条件を満たしていません' }, 400)
      }
      if (tournament.limit_weight_jyo !== 0) {
        if (tournament.limit_weight_jyo > 0 && unit.max_weight < tournament.limit_weight) return c.json({ success: false, message: '機体の重量が条件を満たしていません' }, 400)
        if (tournament.limit_weight_jyo < 0 && unit.max_weight > tournament.limit_weight) return c.json({ success: false, message: '機体の重量が条件を満たしていません' }, 400)
      }
    }

        if (tournament.limit_lv_jyo !== 0) {
      if (tournament.limit_lv_jyo > 0 && chara.level < tournament.limit_lv) return c.json({ success: false, message: '熟練度が条件を満たしていません' }, 400)
      if (tournament.limit_lv_jyo < 0 && chara.level > tournament.limit_lv) return c.json({ success: false, message: '熟練度が条件を満たしていません' }, 400)
    }
    
    if (tournament.limit_custom !== 0) {
      const isCustom = chara.unit_custom_hp > 0 || chara.unit_custom_en > 0 || chara.unit_custom_armor > 0 || chara.unit_custom_mobility > 0;
      if (tournament.limit_custom === 1 && !isCustom) return c.json({ success: false, message: 'カスタム機限定です' }, 400);
      if (tournament.limit_custom === 2 && isCustom) return c.json({ success: false, message: 'カスタム機は参加できません' }, 400);
    }
    
    if (tournament.limit_rank_jyo !== 0) {
      // 原作 trmt_jyoken のランク指数（名声ではない）で判定
      const idx = calcRankIndex(chara);
      if (tournament.limit_rank_jyo > 0 && idx < tournament.limit_rank - 1) return c.json({ success: false, message: '階級(ランク)が条件を満たしていません' }, 400);
      if (tournament.limit_rank_jyo < 0 && idx > Math.abs(tournament.limit_rank) - 1) return c.json({ success: false, message: '階級(ランク)が条件を満たしていません' }, 400);
    }

    if (tournament.limit_cost_jyo !== 0) {
      // コストは /api/me・チーム編成と同式（rankScore・機体Lv・カスタム数）
      chara.unit_lv = unit?.unit_lv || 1;
      const cost = charCost(chara);
      if (tournament.limit_cost_jyo > 0 && cost < tournament.limit_cost) return c.json({ success: false, message: 'コストが条件を満たしていません' }, 400);
      if (tournament.limit_cost_jyo < 0 && cost > tournament.limit_cost) return c.json({ success: false, message: 'コストが条件を満たしていません' }, 400);
    }

    // P33: 団体総力戦は陣営(1/2)の選択が必須（trmnt_sanka.cgi trmt_dantai「所属を選択してください」）
    let side = 0
    if (tournament.format === 3) {
      const body = await c.req.json().catch(() => ({}))
      side = Number(body?.side)
      if (side !== 1 && side !== 2) {
        return c.json({ success: false, message: '所属陣営（1 または 2）を選択してください' }, 400)
      }
    }

    // 資金消費とエントリー登録
    await c.env.DB.prepare(`UPDATE characters SET money = money - ? WHERE id = ?`).bind(tournament.entry_fee, charaId).run()
    await c.env.DB.prepare(`INSERT INTO tournament_participants (tournament_id, character_id, side) VALUES (?, ?, ?)`).bind(id, charaId, side).run()

    return c.json({ success: true, message: 'エントリーが完了しました！' })
  } catch (e: any) {
    console.error('SERVER ERROR IN TOURNAMENT ROUTE:', e); return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// 【管理者用/システムバッチ用】大会の実行処理
// P33/P39: 4形式対応（manual_tournament.htm でルール確定・実行コードは未収録のため進行の内部処理は推定）
//   0=トーナメント（組み合わせは登録順=manual準拠）/ 1=バトルロイヤル（全員乱戦の生き残り戦・1撃破で名声1）
//   2=シャッフルトーナメント（1回戦ごとに組み合わせを乱択）/ 3=団体総力戦（陣営戦・勝利側全員に名声1・賞金均等分配）
tournamentApp.post('/:id/execute', async (c) => {
  try {
    const id = c.req.param('id')
    const tournament = await c.env.DB.prepare(`SELECT * FROM tournaments WHERE id = ?`).bind(id).first()
    if (!tournament) return c.json({ success: false, message: '大会が見つかりません' }, 404)
    if (tournament.status !== 0) return c.json({ success: false, message: 'この大会は既に実行済みか、開始できません' }, 400)

    // 登録順（manual: トーナメントの組み合わせは登録/再登録されたキャラクター順）
    const participantsData = await c.env.DB.prepare(`SELECT character_id, side FROM tournament_participants WHERE tournament_id = ? ORDER BY registered_at ASC`).bind(id).all()
    const entries: { character_id: string, side: number }[] = participantsData.results

    if (entries.length < 2) return c.json({ success: false, message: '参加者が足りません' }, 400)

    const format = Number(tournament.format) || 0
    const isNpcId = (cid: string) => cid.startsWith('npc_') || cid.startsWith('NPC')

    // 開催地形（原作: 主催者が大会作成時に選択）。-2=未指定/ランダムは開始時に1〜5を抽選して確定し、
    // 以降の全試合の戦闘計算とリプレイ meta に同じ値を使う
    const storedTerrain = Number(tournament.field_terrain)
    const fieldTerrain = storedTerrain >= 1 && storedTerrain <= 5 ? storedTerrain : 1 + Math.floor(Math.random() * 5)
    if (fieldTerrain !== storedTerrain) {
      await c.env.DB.prepare(`UPDATE tournaments SET field_terrain = ? WHERE id = ?`).bind(fieldTerrain, id).run()
    }

    const loadFighter = async (cid: string) => {
      const f: any = await getFullCharacter(c.env.DB, cid)
      if (!f) return null
      f.maxHp = calcMaxHp(f.unit_base_hp, f.status_piloting)
      f.hp = f.maxHp
      f.en = calcMaxEn(f.unit_base_en, f.status_piloting)
      return f
    }

    const saveFighter = async (f: any) => {
      if (isNpcId(f.id)) return
      await c.env.DB.prepare(`UPDATE characters SET current_hp = ?, current_en = ? WHERE id = ?`).bind(f.hp, f.en, f.id).run()
    }
    const addFame = async (cid: string, amount: number) => {
      if (isNpcId(cid) || amount <= 0) return
      await c.env.DB.prepare(`UPDATE characters SET fame = fame + ? WHERE id = ?`).bind(amount, cid).run()
    }
    const recordBattleStats = async (winnerId: string, loserId: string) => {
      if (!isNpcId(winnerId)) await c.env.DB.prepare(`UPDATE characters SET total_battles = total_battles + 1, win_battles = win_battles + 1 WHERE id = ?`).bind(winnerId).run()
      if (!isNpcId(loserId)) await c.env.DB.prepare(`UPDATE characters SET total_battles = total_battles + 1 WHERE id = ?`).bind(loserId).run()
    }
    const markLoser = async (cid: string) => {
      await c.env.DB.prepare(`UPDATE tournament_participants SET status = 1 WHERE tournament_id = ? AND character_id = ?`).bind(id, cid).run()
    }
    const saveMatch = async (roundNum: number, matchIndex: number, f1: any, f2: any, winnerId: string, events: any[]) => {
      await c.env.DB.prepare(
        `INSERT INTO tournament_matches (tournament_id, round_num, match_index, fighter1_id, fighter2_id, winner_id, log_text) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, roundNum, matchIndex, f1.id, f2.id, winnerId, JSON.stringify({ events, meta: { attackerName: f1.handle_name, defenderName: f2.handle_name, attackerUnit: f1.unit_name || '', defenderUnit: f2.unit_name || '', attackerImage: f1.unit_image || null, defenderImage: f2.unit_image || null, isSuccess: winnerId === f1.id, rewardMoney: 0, rewardExp: 0, terrain: fieldTerrain } })).run()
    }

    // 大会を進行中にする
    await c.env.DB.prepare(`UPDATE tournaments SET status = 1, started_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run()

    let championId: string
    let resultMessage = ''

    if (format === 3) {
      // ---- 団体総力戦: 陣営対陣営の集団戦（P30/P38 の simulateTeamBattle を流用） ----
      const side1Ids = entries.filter(e => Number(e.side) === 1).map(e => e.character_id)
      const side2Ids = entries.filter(e => Number(e.side) === 2).map(e => e.character_id)
      if (side1Ids.length === 0 || side2Ids.length === 0) {
        await c.env.DB.prepare(`UPDATE tournaments SET status = 0, started_at = NULL WHERE id = ?`).bind(id).run()
        return c.json({ success: false, message: '両陣営に参加者が必要です' }, 400)
      }
      const team1 = (await Promise.all(side1Ids.map(loadFighter))).filter(Boolean)
      const team2 = (await Promise.all(side2Ids.map(loadFighter))).filter(Boolean)

      const res = simulateTeamBattle(team1 as any[], team2 as any[], fieldTerrain)
      const winners = res.isSuccess ? team1 : team2
      const losers = res.isSuccess ? team2 : team1

      for (const f of [...team1, ...team2]) await saveFighter(f)
      for (const f of losers) await markLoser(f.id)
      // 勝利陣営全員に名声1（撃破されたキャラを含む＝manual準拠）＋賞金を均等分配
      const share = Math.floor((tournament.prize_money || 0) / winners.length)
      for (const f of winners) {
        await addFame(f.id, 1)
        if (share > 0 && !isNpcId(f.id)) {
          await c.env.DB.prepare(`UPDATE characters SET money = money + ? WHERE id = ?`).bind(share, f.id).run()
        }
      }
      await saveMatch(1, 0, team1[0], team2[0], res.isSuccess ? team1[0].id : team2[0].id, res.events)

      championId = res.isSuccess ? team1[0].id : team2[0].id
      resultMessage = `団体総力戦を実行しました（${res.isSuccess ? '陣営1' : '陣営2'}の勝利・賞金は勝利陣営で均等分配）`
    } else if (format === 1) {
      // ---- バトルロイヤル: 全員入り乱れの生き残り戦（1撃破ごとに名声1=manual準拠。進行は団体戦同様の1ペア交戦の連続=推定） ----
      const fighters = (await Promise.all(entries.map(e => loadFighter(e.character_id)))).filter(Boolean) as any[]
      const pairKyori = new Map<string, number>()
      const maxTurns = fighters.length * 8
      let seq = 1
      for (let turn = 1; turn <= maxTurns; turn++) {
        const alive = fighters.filter(f => f.hp > 0)
        if (alive.length <= 1) break
        const i = Math.floor(Math.random() * alive.length)
        let j = Math.floor(Math.random() * (alive.length - 1))
        if (j >= i) j++
        const fa = alive[i], fb = alive[j]
        const key = `${fa.id}#${fb.id}`
        const kyori = pairKyori.get(key) ?? Math.floor(Math.random() * 100)
        const r = simulateBattleRound(fa, fb, turn, 0, undefined, undefined, fieldTerrain, [], [], 1, kyori)
        pairKyori.set(key, r.kyori)
        fa.hp = r.attackerHp
        fb.hp = r.defenderHp
        if (fb.hp <= 0) {
          await addFame(fa.id, 1) // 1人倒すごとに名声1
          await recordBattleStats(fa.id, fb.id)
          await markLoser(fb.id)
          await saveMatch(seq++, 0, fa, fb, fa.id, r.events)
        }
        if (fa.hp <= 0) {
          await addFame(fb.id, 1)
          await recordBattleStats(fb.id, fa.id)
          await markLoser(fa.id)
          await saveMatch(seq++, 0, fb, fa, fb.id, r.events)
        }
      }
      const alive = fighters.filter(f => f.hp > 0)
      // 生き残り or ターン上限時は残HP率最大が優勝（推定）
      const best = (alive.length ? alive : fighters).reduce((a, b) => (a.hp / a.maxHp) >= (b.hp / b.maxHp) ? a : b)
      for (const f of fighters) await saveFighter(f)
      championId = best.id
      await c.env.DB.prepare(`UPDATE characters SET money = money + ?, fame = fame + 10 WHERE id = ?`).bind(tournament.prize_money, championId).run()
      resultMessage = 'バトルロイヤルを実行しました'
    } else {
      // ---- トーナメント / シャッフルトーナメント ----
      let participants = entries.map(e => e.character_id)
      let roundNum = 1
      while (participants.length > 1) {
        // P39: シャッフルトーナメントは1回戦ごとに組み合わせを乱択（manual準拠）。通常は登録順のまま
        if (format === 2) {
          for (let i = participants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [participants[i], participants[j]] = [participants[j], participants[i]]
          }
        }
        const nextRound: string[] = []
        for (let i = 0; i < participants.length; i += 2) {
          if (i + 1 >= participants.length) { nextRound.push(participants[i]); continue }

          const f1 = await loadFighter(participants[i])
          const f2 = await loadFighter(participants[i + 1])
          if (!f1 || !f2) { nextRound.push(participants[i]); continue }

          // 1戦毎の恢復が無い場合は前試合のHP/ENを引き継ぐ（heal_between=1なら全快のまま）
          if (!tournament.heal_between && roundNum > 1) {
            const cur1: any = await c.env.DB.prepare(`SELECT current_hp, current_en FROM characters WHERE id = ?`).bind(f1.id).first()
            const cur2: any = await c.env.DB.prepare(`SELECT current_hp, current_en FROM characters WHERE id = ?`).bind(f2.id).first()
            if (cur1 && cur1.current_hp >= 0) { f1.hp = cur1.current_hp; f1.en = cur1.current_en }
            if (cur2 && cur2.current_hp >= 0) { f2.hp = cur2.current_hp; f2.en = cur2.current_en }
          }

          const result = simulateBattleRound(f1, f2, 1, 0, undefined, undefined, fieldTerrain)
          f1.hp = result.attackerHp
          f2.hp = result.defenderHp

          // 戦闘後能力の適用 (-18等。battle_syurui=3 個人大会)
          const postEff1 = applyPostBattleTokusyuEffects(f1, 3, { exp: 0 })
          const postEff2 = applyPostBattleTokusyuEffects(f2, 3, { exp: 0 })
          f1.hp = postEff1.fighterHp; f1.en = postEff1.fighterEn
          f2.hp = postEff2.fighterHp; f2.en = postEff2.fighterEn

          await saveFighter(f1)
          await saveFighter(f2)

          const winnerId = f2.hp > f1.hp ? f2.id : f1.id
          const loserId = winnerId === f1.id ? f2.id : f1.id

          await saveMatch(roundNum, i / 2, f1, f2, winnerId, result.events)
          await markLoser(loserId)
          await recordBattleStats(winnerId, loserId)
          await addFame(winnerId, 1) // 1勝するごとに名声1（manual準拠）

          nextRound.push(winnerId)
        }
        participants = nextRound
        roundNum++
      }
      championId = participants[0]
      await c.env.DB.prepare(`UPDATE characters SET money = money + ?, fame = fame + 10 WHERE id = ?`).bind(tournament.prize_money, championId).run()
      resultMessage = format === 2 ? 'シャッフルトーナメントを実行しました' : 'トーナメントを実行しました'
    }

    // 大会終了処理
    await c.env.DB.prepare(`UPDATE tournaments SET status = 2, finished_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run()
    const champChar: any = await c.env.DB.prepare(`SELECT chara_name FROM characters WHERE id = ?`).bind(championId).first()
    await c.env.DB.prepare(`INSERT INTO events (type, message) VALUES ('tournament_finish', ?)`).bind(`大会「${tournament.name}」が終了しました。優勝者: ${champChar ? champChar.chara_name : 'なし'}`).run();
    if (champChar) {
      await postNews(c.env.DB, `大会「${tournament.name}」が終了。${champChar.chara_name}が優勝しました。`)
    }

    return c.json({ success: true, message: resultMessage, champion_id: championId })
  } catch (e: any) {
    console.error('SERVER ERROR IN TOURNAMENT ROUTE:', e); return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})








