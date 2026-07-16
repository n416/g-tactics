import { Hono } from 'hono'
import { verify } from 'hono/jwt'
import { parseTraits } from '../utils/traits'
import { trainingSuccessTraitTerm } from '../utils/traitEffects'
import { getUpOver240, calcNormalCost, calcEnhancedCost, checkNormalSuccess, checkEnhancedSuccess } from '../utils/trainingLogic'
import { getFullCharacter, calcMaxHp, calcMaxEn } from '../utils/battleEngine'
import { hashPassword, verifyPassword } from '../utils/password'


type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const profileApp = new Hono<{ Bindings: Bindings }>()

profileApp.post('/training', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Unauthorized' }, 401)
    }

    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')

    if (!payload || !payload.id) {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }

    const { stat_type, course, kaisu: rawKaisu } = await c.req.json()
    const kaisu = typeof rawKaisu === 'number' ? rawKaisu : 1;
    // 原作は kaisu>10 を不正行為として拒否（training.cgi:48）
    if (kaisu < 1 || kaisu > 10 || !Number.isInteger(kaisu)) {
      return c.json({ success: false, message: '不正な回数指定です' }, 400)
    }

    const validStats = ['intuition', 'piloting', 'short_range', 'mid_range', 'long_range']
    if (!validStats.includes(stat_type)) {
      return c.json({ success: false, message: '不正なステータス指定です' }, 400)
    }

    const columnMap: Record<string, string> = {
      'intuition': 'status_intuition',
      'piloting': 'status_piloting',
      'short_range': 'status_short_range',
      'mid_range': 'status_mid_range',
      'long_range': 'status_long_range'
    }
    const statColumn = columnMap[stat_type]

    const user: any = await c.env.DB.prepare(`SELECT money, traits, level, status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range FROM characters WHERE id = ?`).bind(payload.id).first()
    if (!user) {
      return c.json({ success: false, message: 'User not found' }, 404)
    }

    const currentStat = user[statColumn]
    const lv = Math.max(1, user.level)
    const sum5 = user.status_intuition + user.status_piloting + user.status_short_range + user.status_mid_range + user.status_long_range
    const upOver240 = getUpOver240(sum5)
    const traits = parseTraits(user.traits)
    const traitTerm = trainingSuccessTraitTerm(traits)

    let totalCost = 0
    let successCount = 0
    let tempStat = currentStat

    if (course === 'normal') {
      const costPerTime = calcNormalCost(tempStat, lv, upOver240)
      if (user.money < costPerTime * kaisu) {
        return c.json({ success: false, message: 'ポイントが足りません' }, 400)
      }
      
      for (let i = 0; i < kaisu; i++) {
        totalCost += costPerTime;
        const rand10 = Math.random() * 10;
        if (checkNormalSuccess(rand10, upOver240, traitTerm)) {
          successCount++;
          tempStat++;
        }
      }
    } else if (course === 'enhanced') {
      const costPerTime = calcEnhancedCost(lv)
      if (user.money < costPerTime * kaisu) {
        return c.json({ success: false, message: 'ポイントが足りません' }, 400)
      }

      for (let i = 0; i < kaisu; i++) {
        if (tempStat >= 170) {
          return c.json({ success: false, message: 'ステータスが170以上の場合は特別強化を行えません' }, 400)
        }
        totalCost += costPerTime;
        const rand10 = Math.random() * 10;
        if (checkEnhancedSuccess(rand10, traitTerm)) {
          successCount++;
          tempStat += 10;
        }
      }
    } else {
      return c.json({ success: false, message: '不正なコース指定です' }, 400)
    }

    const newMoney = user.money - totalCost
    await c.env.DB.prepare(`UPDATE characters SET money = ?, ${statColumn} = ? WHERE id = ?`)
      .bind(newMoney, tempStat, payload.id).run()

    const message = successCount > 0
      ? (course === 'normal' ? `訓練に${successCount}回成功しました` : `強化に${successCount}回成功しました`)
      : (course === 'normal' ? `訓練に失敗しました` : `強化に失敗しました`)

    return c.json({
      success: true,
      seiko: successCount,
      spent: totalCost,
      new_stat: tempStat,
      new_money: newMoney,
      message
    })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// インベントリの取得
profileApp.get('/inventory', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { results } = await c.env.DB.prepare(`
      SELECT inv.id as inventory_id, i.* 
      FROM item_inventory inv
      JOIN items i ON inv.item_id = i.id
      WHERE inv.user_id = ?
      ORDER BY inv.created_at ASC
    `).bind(payload.id).all()

    return c.json({ success: true, inventory: results })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// アイテムの装備
profileApp.post('/equip', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    // slot: 'weapon_id', 'item1_id', 'item2_id'
    const { inventory_id, slot, update_champion } = await c.req.json()

    if (!['weapon_id', 'item1_id', 'item2_id'].includes(slot)) {
      return c.json({ success: false, message: '不正な装備スロットです' })
    }

    const chara: any = await c.env.DB.prepare(`
      SELECT c.*,
             CASE WHEN c.unit_custom_weight >= 0 THEN c.unit_custom_weight ELSE u.max_weight END as max_weight,
             w.weight as weapon_weight,
             i1.weight as item1_weight,
             i2.weight as item2_weight
      FROM characters c
      LEFT JOIN units u ON c.unit_id = u.id
      LEFT JOIN items w ON c.weapon_id = w.id
      LEFT JOIN items i1 ON c.item1_id = i1.id
      LEFT JOIN items i2 ON c.item2_id = i2.id
      WHERE c.id = ?
    `).bind(payload.id).first()
    if (!chara) return c.json({ success: false, message: 'キャラクターが見つかりません' }, 404)

    // 装備を外す処理（inventory_idがnullまたは0の場合）
    if (!inventory_id) {
      const currentEquipId = chara[slot]
      if (currentEquipId && currentEquipId !== 0) {
        await c.env.DB.prepare(`INSERT INTO item_inventory (user_id, item_id) VALUES (?, ?)`).bind(payload.id, currentEquipId).run()
      }
      await c.env.DB.prepare(`UPDATE characters SET ${slot} = 0 WHERE id = ?`).bind(payload.id).run()
      
      if (update_champion) {
        await updateChampionSnapshotPartial(c.env.DB, payload.id as string);
      }

      return c.json({ success: true, message: '装備を外しました' })
    }

    // 新たに装備する処理
    const invItem: any = await c.env.DB.prepare(`SELECT * FROM item_inventory WHERE id = ? AND user_id = ?`).bind(inventory_id, payload.id).first()
    if (!invItem) return c.json({ success: false, message: '指定されたアイテムを所持していません' }, 404)

    const targetItemId = invItem.item_id
    const itemData: any = await c.env.DB.prepare(`SELECT * FROM items WHERE id = ?`).bind(targetItemId).first()
    if (!itemData) return c.json({ success: false, message: 'アイテムデータが見つかりません' })

    const isWeapon = itemData.item_type >= 1 && itemData.item_type <= 5
    if (slot === 'weapon_id' && !isWeapon) {
      return c.json({ success: false, message: '武器スロットには武器しか装備できません' })
    }
    if ((slot === 'item1_id' || slot === 'item2_id') && isWeapon) {
      return c.json({ success: false, message: 'アイテムスロットに武器は装備できません' })
    }

    const currentWeaponWeight = slot === 'weapon_id' ? 0 : (chara.weapon_weight || 0);
    const currentItem1Weight = slot === 'item1_id' ? 0 : (chara.item1_weight || 0);
    const currentItem2Weight = slot === 'item2_id' ? 0 : (chara.item2_weight || 0);
    const targetItemWeight = itemData.weight || 0;
    const newWeight = currentWeaponWeight + currentItem1Weight + currentItem2Weight + targetItemWeight;
    const maxWeight = chara.max_weight || 0;

    if (newWeight > maxWeight) {
      return c.json({ success: false, message: '機体の最大積載量（重量）を超過するため装備できません' }, 400);
    }

    const currentEquipId = chara[slot]
    if (currentEquipId && currentEquipId !== 0) {
      await c.env.DB.prepare(`INSERT INTO item_inventory (user_id, item_id) VALUES (?, ?)`).bind(payload.id, currentEquipId).run()
    }

    await c.env.DB.prepare(`UPDATE characters SET ${slot} = ? WHERE id = ?`).bind(targetItemId, payload.id).run()
    await c.env.DB.prepare(`DELETE FROM item_inventory WHERE id = ?`).bind(inventory_id).run()

    if (update_champion) {
      await updateChampionSnapshotPartial(c.env.DB, payload.id as string);
    }

    return c.json({ success: true, message: `${itemData.name} を装備しました` })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})


// ランキングの並び替え軸（旧 ranking.cgi の sort 種別に対応）。
// 正準キーと、旧CGIのクエリ値をエイリアスとして両方受け付ける。
// 旧: no=勝率 / mesei=名声 / kaikyu=ランク(階級) / jyuku=熟練度(=level) / name=名前
const RANKING_SORTS: Record<string, string> = {
  // 勝率順: 戦績列(win_battles/total_battles)から算出。無戦績は0扱い。
  winrate: `CASE WHEN characters.total_battles > 0 THEN CAST(characters.win_battles AS REAL) / characters.total_battles ELSE 0 END DESC, characters.exp DESC`,
  no: 'winrate',
  // 名声順
  fame: `characters.fame DESC, characters.exp DESC`,
  mesei: 'fame',
  // 階級(ランク)順: 旧 kai_ind 相当の指数で並べる（能力5値 + level*25 + |nt_level|*100）。
  rank: `(characters.status_intuition + characters.status_piloting + characters.status_short_range + characters.status_mid_range + characters.status_long_range + characters.level * 25 + ABS(characters.nt_level) * 100) DESC, characters.exp DESC`,
  kaikyu: 'rank',
  // 熟練度順: 原作の熟練度=経験値駆動レベル＝リメイクの level（P11で確定）。
  level: `characters.level DESC, characters.exp DESC`,
  jyuku: 'level',
  // 名前順（昇順）
  name: `characters.chara_name ASC, characters.exp DESC`,
  kill_count: `characters.win_battles DESC, characters.exp DESC`,
  champ_count: `champ_wins DESC, characters.exp DESC`,
}

profileApp.get('/ranking', async (c) => {
  try {
    const sortParam = (c.req.query('sort') || '').toLowerCase()
    // エイリアスを1段解決。未知/未指定の値は従来通り exp DESC にフォールバック。
    let entry = RANKING_SORTS[sortParam]
    if (entry && !entry.includes(' ')) entry = RANKING_SORTS[entry] // エイリアス→正準
    // P47-B3: expは減算式（レベル内の端数）になったため、既定は熟練度優先（原作 ranking.cgi に exp 単独軸は無い）
    const orderBy = entry || `characters.level DESC, characters.exp DESC`

    const { results } = await c.env.DB.prepare(
      `SELECT characters.id, characters.handle_name, characters.chara_name, characters.level, characters.exp,
              characters.fame, characters.money, characters.nt_level, characters.last_battle_at,
              characters.status_intuition, characters.status_piloting, characters.status_short_range, characters.status_mid_range, characters.status_long_range,
              characters.total_battles, characters.win_battles as kill_count, characters.unit_id,
              units.name as unit_name,
              (characters.status_intuition + characters.status_piloting + characters.status_short_range + characters.status_mid_range + characters.status_long_range + characters.level * 25 + ABS(characters.nt_level) * 100) as rank_score,
              CASE WHEN characters.total_battles > 0 THEN CAST(characters.win_battles AS REAL) / characters.total_battles * 100 ELSE 0 END as win_rate,
              IFNULL(c.win_count, 0) as champ_wins
       FROM characters
       LEFT JOIN units ON characters.unit_id = units.id
       LEFT JOIN (SELECT champion_id, MAX(win_count) as win_count FROM champions WHERE type = 'individual' GROUP BY champion_id) c ON characters.id = c.champion_id
       ORDER BY ${orderBy}
       LIMIT 100`
    ).all()

    // 表示用の派生値を付与（manual_ranking.htm 準拠）
    const now = Math.floor(Date.now() / 1000)
    const ranking = (results as any[]).map((r: any) => {
      // cv: 5能力の偏り指数。原作式が断片に無いため変動係数（標準偏差/平均）で代替（台帳P43-12に記録済み）
      const stats = [r.status_intuition, r.status_piloting, r.status_short_range, r.status_mid_range, r.status_long_range].map((v: any) => Number(v) || 0)
      const mean = stats.reduce((a, b) => a + b, 0) / 5
      let cv = '0.00'
      if (mean > 0) {
        const sd = Math.sqrt(stats.reduce((a, b) => a + (b - mean) * (b - mean), 0) / 5)
        cv = (sd / mean).toFixed(2)
      }
      // CLS: manual_database.htm の表記（NT(n)/強化(n)/UNS）
      const nt = Number(r.nt_level) || 0
      const cls = nt > 0 ? `NT(${nt})` : nt < 0 ? `強化(${-nt})` : 'UNS'
      // 【本作改変】キャラ自動削除は行わない（2026-07-15 決定）。
      // 原作は無戦闘20日で自動削除（msvs_ini.cgi:593 $limit=20）するが、これはフラットファイル運用の都合
      // （各CGIが全キャラファイルを走査するため死蔵アカウントが全体を重くする）であってゲーム性ではない。
      // D1 に同制約は無く、復帰プレイヤーのキャラを不可逆に消す実害の方が大きい（原作の復旧機構 fukkyu も
      // chrcter.pl:55,65 のバックアップ書込コメントアウトで休眠＝原作でも undo 不可）。
      // よって削除は実装せず、「削除まで N日」の予告表示も撤去し、活動状況の情報表示（最終戦闘からの経過日数）に置換する。
      const last = Number(r.last_battle_at) || 0
      const days_since_last_battle = last > 0 ? Math.floor((now - last) / 86400) : 0
      const { status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range, last_battle_at, ...rest } = r
      return { ...rest, cv, cls, days_since_last_battle }
    })
    return c.json({ success: true, ranking })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

profileApp.get('/profile/:handle_name', async (c) => {
  try {
    const handleName = c.req.param('handle_name')
    const user: any = await c.env.DB.prepare(
      `SELECT characters.id, characters.handle_name, characters.chara_name, characters.level, characters.exp, characters.money,
              characters.status_intuition, characters.status_piloting, characters.status_short_range, characters.status_mid_range, characters.status_long_range,
              characters.unit_id, units.name as unit_name, units.image as unit_image, units.description as unit_description,
              characters.public_comment, characters.icon, characters.katagaki, characters.fame, characters.total_battles, characters.win_battles,
              characters.unit_custom_mobility, characters.weapon_id, w.name as weapon_name, characters.traits
       FROM characters 
       LEFT JOIN units ON characters.unit_id = units.id
       LEFT JOIN items w ON characters.weapon_id = w.id
       WHERE characters.handle_name = ? OR characters.id = ?`
    ).bind(handleName, handleName).first()

    if (!user) {
      return c.json({ success: false, message: 'ユーザーが見つかりません' }, 404)
    }

    // 伝言記録（原作 manual_dengon: ステ詳細画面に着信降順・最大10件・準公開）
    // このキャラ宛の伝言を、プロフィールを開いた誰にでも見せる。既読化は本人閲覧時に別API(/private/mark-read)で行う。
    const { results: received } = await c.env.DB.prepare(
      `SELECT pm.id, pm.sender_id, s.chara_name AS sender_name, pm.message, pm.created_at
       FROM private_messages pm
       LEFT JOIN characters s ON pm.sender_id = s.id
       WHERE pm.recipient_id = ?
       ORDER BY pm.created_at DESC LIMIT 10`
    ).bind(user.id).all()

    return c.json({ success: true, profile: user, received_messages: received })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

profileApp.get('/profile/:id/hangar', async (c) => {
  try {
    const userId = c.req.param('id')
    const { results } = await c.env.DB.prepare(
      `SELECT hangars.id as hangar_id, units.id as unit_id, units.name, units.hp, units.en, units.armor, units.mobility, units.sensor, units.image, units.description
       FROM hangars
       JOIN units ON hangars.unit_id = units.id
       WHERE hangars.user_id = ?
       ORDER BY hangars.created_at DESC`
    ).bind(userId).all()

    return c.json({ success: true, hangar: results })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// P36: キャラクター削除（原作 action.cgi sakujyo / profile.cgi profsakujyo）
// 確認のため chara_name の一致を要求する
profileApp.post('/delete-character', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const { confirm_name } = await c.req.json()
    const me: any = await c.env.DB.prepare('SELECT id, chara_name FROM characters WHERE id = ?').bind(payload.id).first()
    if (!me) return c.json({ success: false, message: 'キャラクターが見つかりません' }, 404)
    if (!confirm_name || confirm_name !== me.chara_name) {
      return c.json({ success: false, message: '確認のためキャラクター名を正確に入力してください' }, 400)
    }

    const db = c.env.DB
    // 依存データを掃除（FKカスケードが無いテーブルも明示的に削除）
    await db.prepare('DELETE FROM team_members WHERE owner_id = ? OR character_id = ?').bind(me.id, me.id).run()
    await db.prepare('DELETE FROM hangars WHERE user_id = ?').bind(me.id).run()
    await db.prepare('DELETE FROM item_inventory WHERE user_id = ?').bind(me.id).run()
    await db.prepare('DELETE FROM market_listings WHERE seller_id = ?').bind(me.id).run()
    await db.prepare('DELETE FROM tournament_participants WHERE character_id = ?').bind(me.id).run()
    await db.prepare('DELETE FROM private_messages WHERE sender_id = ? OR recipient_id = ?').bind(me.id, me.id).run().catch(() => {})
    // 優勝者・防衛者の座は空位化
    await db.prepare('DELETE FROM champions WHERE champion_id = ?').bind(me.id).run().catch(() => {})
    await db.prepare('DELETE FROM defense_battles WHERE champion_id = ?').bind(me.id).run().catch(() => {})

    await db.prepare('DELETE FROM characters WHERE id = ?').bind(me.id).run();
    await db.prepare(`INSERT INTO events (type, message) VALUES ('delete', ?)`).bind(`がキャラクターを削除しました。`).run();

    return c.json({ success: true, message: 'キャラクターを削除しました。ご利用ありがとうございました。' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

// P37: 近況ニュース一覧（公開・最新10件）
profileApp.get('/news', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`SELECT * FROM news ORDER BY id DESC LIMIT 10`).all()
    return c.json({ success: true, news: results })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

profileApp.get('/icons', async (c) => {
  const icons = [
    'face01.png', 'face02.png', 'face03.png', 'face04.png', 'face05.png',
    'face06.png', 'face07.png', 'face08.png', 'face09.png', 'face10.png',
    'face11.png', 'face12.png', 'face13.png', 'face14.png', 'face15.png'
  ]
  try {
    const { results } = await c.env.DB.prepare(`SELECT icon FROM characters WHERE icon != '' AND icon IS NOT NULL`).all()
    const usedIcons = new Set(results.map((r: any) => r.icon))
    const availableIcons = icons.map(icon => ({
      filename: icon,
      is_used: usedIcons.has(icon)
    }))
    return c.json({ success: true, icons: availableIcons })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})

profileApp.post('/edit', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const token = authHeader.split(' ')[1]
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if (!payload || !payload.id) return c.json({ success: false, message: 'Invalid token' }, 401)

    const user: any = await c.env.DB.prepare(`SELECT * FROM characters WHERE id = ?`).bind(payload.id).first()
    if (!user) return c.json({ success: false, message: 'User not found' }, 404)

    const data = await c.req.json()
    
    // パスワードの設定・変更。ハッシュ方式は utils/password に集約してある（旧方式もここで照合できる）。
    //
    // Google だけで登録した人は password_hash が '' で、照合できる「現在のパスワード」を
    // そもそも持たない。以前はここが current_password を必ず要求していたため、
    // その人は永久にパスワードを設定できず、結果として Google 連携も解除できなかった。
    // 既に JWT で本人確認は済んでいるので、パスワード未設定の場合に限り初回設定を許す。
    if (data.new_password) {
      const hasPassword = !!user.password_hash
      if (hasPassword) {
        const { ok } = await verifyPassword(user.password_hash, data.current_password || '')
        if (!ok) {
          return c.json({ success: false, message: '現在のパスワードが間違っています' }, 400)
        }
      }
      if (String(data.new_password).length < 4) {
        return c.json({ success: false, message: 'パスワードは4文字以上で入力してください' }, 400)
      }
      const new_password_hash = await hashPassword(data.new_password)
      await c.env.DB.prepare(`UPDATE characters SET password_hash = ? WHERE id = ?`).bind(new_password_hash, payload.id).run()
    }

    let newFame = user.fame
    if (data.katagaki !== undefined && data.katagaki !== user.katagaki) {
      if (user.fame < 1) return c.json({ success: false, message: '名声が足りません' }, 400)
      newFame -= 1
    }

    if (data.handle_name && data.handle_name !== user.handle_name) {
      await c.env.DB.prepare(`INSERT INTO events (type, message) VALUES (?, ?)`).bind('rename', `${user.handle_name} が ${data.handle_name} にハンドルネームを変更しました`).run()
    }
    if (data.chara_name && data.chara_name !== user.chara_name) {
      await c.env.DB.prepare(`INSERT INTO events (type, message) VALUES (?, ?)`).bind('rename', `${user.chara_name} が ${data.chara_name} にキャラクター名を変更しました`).run()
    }

    if (data.icon && data.icon !== user.icon) {
      const isUsed = await c.env.DB.prepare(`SELECT id FROM characters WHERE icon = ? AND id != ?`).bind(data.icon, payload.id).first()
      if (isUsed) return c.json({ success: false, message: 'そのアイコンは既に使用されています' }, 400)
    }

    const newComments = data.battle_comments !== undefined ? (typeof data.battle_comments === 'string' ? data.battle_comments : JSON.stringify(data.battle_comments)) : user.battle_comments;

    await c.env.DB.prepare(`
      UPDATE characters SET
        handle_name = COALESCE(?, handle_name),
        chara_name = COALESCE(?, chara_name),
        public_comment = COALESCE(?, public_comment),
        katagaki = COALESCE(?, katagaki),
        icon = COALESCE(?, icon),
        team_notify = COALESCE(?, team_notify),
        battle_comments = ?,
        fame = ?
      WHERE id = ?
    `).bind(
      data.handle_name ?? null,
      data.chara_name ?? null,
      data.public_comment ?? null,
      data.katagaki ?? null,
      data.icon ?? null,
      data.team_notify ?? null,
      newComments,
      newFame,
      payload.id
    ).run()

    return c.json({ success: true, message: 'プロフィールを更新しました' })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})



// winchg(装備・能力): 自分が防衛者の 優勝戦＋個別戦闘 の snapshot に能力/装備/maxHp を反映
async function updateChampionSnapshotPartial(db: any, userId: string) {
  const champs = await db.prepare('SELECT type, snapshot_data, def_hp, def_en FROM champions WHERE champion_id = ?').bind(userId).all();
  const gates = await db.prepare('SELECT id, snapshot_data, def_hp, def_en FROM defense_battles WHERE champion_id = ?').bind(userId).all();
  const champRows = (champs.results || []) as any[];
  const gateRows = (gates.results || []) as any[];
  if (champRows.length === 0 && gateRows.length === 0) return;
  const charaFull = await getFullCharacter(db, userId);
  if (!charaFull) return;
  const newMaxHp = calcMaxHp(charaFull.unit_base_hp, charaFull.status_piloting);
  const newMaxEn = calcMaxEn(charaFull.unit_base_en, charaFull.status_piloting);
  const buildSnap = (snapStr: string) => {
    let snap = JSON.parse(snapStr);
    snap.unit_custom_armor = charaFull.unit_custom_armor;
    snap.unit_custom_mobility = charaFull.unit_custom_mobility;
    snap.unit_custom_sensor = charaFull.unit_custom_sensor;
    snap.armor = charaFull.armor;
    snap.mobility = charaFull.mobility;
    snap.sensor = charaFull.sensor;
    snap.max_weight = charaFull.max_weight;
    snap.weapon_id = charaFull.weapon_id;
    snap.item1_id = charaFull.item1_id;
    snap.item2_id = charaFull.item2_id;
    snap.weapon_name = charaFull.weapon_name;
    snap.item1_name = charaFull.item1_name;
    snap.item2_name = charaFull.item2_name;
    Object.assign(snap, {
      weapon_power: charaFull.weapon_power, weapon_en_cost: charaFull.weapon_en_cost, weapon_ammo: charaFull.weapon_ammo,
      weapon_range_min: charaFull.weapon_range_min, weapon_range_max: charaFull.weapon_range_max,
      w_range_short: charaFull.w_range_short, w_range_mid: charaFull.w_range_mid, w_range_long: charaFull.w_range_long,
      weapon_hit_count: charaFull.weapon_hit_count, weapon_raw_syurui: charaFull.weapon_raw_syurui, weapon_raw_hani: charaFull.weapon_raw_hani,
      weapon_special_flags: charaFull.weapon_special_flags, weapon_item_type: charaFull.weapon_item_type,
      weapon_tokusyu: charaFull.weapon_tokusyu, weapon_weight: charaFull.weapon_weight,
      item1_type: charaFull.item1_type, item1_flags: charaFull.item1_flags, item1_tokusyu: charaFull.item1_tokusyu,
      item1_weight: charaFull.item1_weight, item1_raw_syurui: charaFull.item1_raw_syurui, item1_raw_hani: charaFull.item1_raw_hani,
      item2_type: charaFull.item2_type, item2_flags: charaFull.item2_flags, item2_tokusyu: charaFull.item2_tokusyu,
      item2_weight: charaFull.item2_weight, item2_raw_hani: charaFull.item2_raw_hani,
      item1: charaFull.item1, item2: charaFull.item2,
      maxHp: newMaxHp, maxEn: newMaxEn
    });
    return snap;
  };
  const clamp = (dh: any, de: any): [number, number] => [Math.min(Number(dh) || newMaxHp, newMaxHp), Math.min(Number(de) || newMaxEn, newMaxEn)];
  for (const champ of champRows) {
    if (!champ.snapshot_data) continue;
    const [nh, ne] = clamp(champ.def_hp, champ.def_en);
    await db.prepare('UPDATE champions SET snapshot_data = ?, def_hp = ?, def_en = ?, updated_at = CURRENT_TIMESTAMP WHERE champion_id = ? AND type = ?').bind(JSON.stringify(buildSnap(champ.snapshot_data)), nh, ne, userId, champ.type).run();
  }
  for (const g of gateRows) {
    if (!g.snapshot_data) continue;
    const [nh, ne] = clamp(g.def_hp, g.def_en);
    await db.prepare('UPDATE defense_battles SET snapshot_data = ?, def_hp = ?, def_en = ? WHERE id = ?').bind(JSON.stringify(buildSnap(g.snapshot_data)), nh, ne, g.id).run();
  }
}

