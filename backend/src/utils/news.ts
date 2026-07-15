// P37: 近況ニュース（原作 msvslib.pl kinkyo1_write 系）
// 結成・優勝者交代・大会終了などをトップページに流す。最新30件だけ保持。
export async function postNews(db: any, text: string, color: string = '') {
  try {
    await db.prepare(`INSERT INTO news (text, color) VALUES (?, ?)`).bind(text, color).run()
    await db.prepare(`DELETE FROM news WHERE id NOT IN (SELECT id FROM news ORDER BY id DESC LIMIT 30)`).run()
  } catch {
    // ニュースは補助機能: 失敗しても本処理を止めない
  }
}
