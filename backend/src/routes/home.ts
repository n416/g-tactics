import { Hono } from 'hono'

export const homeApp = new Hono<{ Bindings: { DB: D1Database } }>()

homeApp.get('/info', async (c) => {
  try {
    // 個人戦の現優勝者（名前＋現在の連勝数）。
    // ※原作LAKの永続「連勝記録」(歴代ハイスコア/保持者名: index.cgi:116-256) は未実装。
    //   現チャンプの進行中連勝を表示する簡易版（A案）。「月間」は原作に無い表記のため不採用。
    const indChampion: any = await c.env.DB.prepare(
      `SELECT c.win_count, ch.chara_name, ch.handle_name FROM champions c JOIN characters ch ON c.champion_id = ch.id WHERE c.type = 'individual'`
    ).first()

    // チーム戦の現優勝者
    const teamChampion: any = await c.env.DB.prepare(
      `SELECT c.win_count, ch.chara_name FROM champions c JOIN characters ch ON c.champion_id = ch.id WHERE c.type = 'team'`
    ).first()

    // 3. 直近の情勢 (events テーブルから最新10件取得)
    const { results: events } = await c.env.DB.prepare(
      `SELECT * FROM events ORDER BY created_at DESC LIMIT 10`
    ).all()

    return c.json({
      success: true,
      individual_champion: indChampion ? { chara_name: indChampion.chara_name, handle_name: indChampion.handle_name, win_count: indChampion.win_count } : null,
      team_champion: teamChampion ? { chara_name: teamChampion.chara_name, win_count: teamChampion.win_count } : null,
      events: events
    })
  } catch (e: any) {
    return c.json({ success: false, message: 'Server Error: ' + e.message }, 500)
  }
})
