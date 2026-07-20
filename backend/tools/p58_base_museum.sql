-- P58: 基地・博物館機能群の一括追随（旧 p58〜p62 を本番適用前に統合したもの）
--
-- 追加するもの:
--   1. user_unit_stats     — 機体ごとの入手/撃墜/連勝統計（バックフィル込み）
--   2. user_bases          — 基地（shield_until = 基地戦の保護シールド。旧p62の列を統合済み）
--   3. user_facilities     — 基地施設（発電所/修理ドック/砲台/博物館/工場）
--   4. museum_settings     — 博物館の殿堂・館長コメント
--   5. museum_exhibits     — 博物館の展示枠
--   6. museum_guestbook    — 見学者ノート
--
-- baseline.sql には反映済み。新規に作るDBには不要で、稼働中のDBにだけ流す。
--   ローカル: npx wrangler d1 execute gtactics-db --local  --file ./tools/p58_base_museum.sql
--   本番:     npx wrangler d1 execute gtactics-db --remote --file ./tools/p58_base_museum.sql
--
-- ★ 冪等スクリプトのため、安全に再実行可能。
--   本番デプロイ手順: (1) 本スクリプトを --remote 適用 → (2) worker デプロイ →
--   (3) 本スクリプトを再実行（適用〜デプロイ間の機体入手の取りこぼしを冪等バックフィルで補完）
--
-- ※ 統合前の旧p59〜p61を個別適用した開発DBで user_bases に shield_until が無い場合のみ、
--   手動で `ALTER TABLE user_bases ADD COLUMN shield_until INTEGER NOT NULL DEFAULT 0;` を流すこと
--   （preflight が列の有無を検知する）。

-- 1) 機体コレクション統計
CREATE TABLE IF NOT EXISTS user_unit_stats (
  user_id VARCHAR(255) NOT NULL,
  unit_id INTEGER NOT NULL,
  obtained_count INTEGER NOT NULL DEFAULT 0,
  first_obtained_at DATETIME,
  total_kills INTEGER NOT NULL DEFAULT 0,
  current_win_streak INTEGER NOT NULL DEFAULT 0,
  max_win_streak INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, unit_id),
  FOREIGN KEY (user_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
);

-- 格納庫の所持機体から復元（同一機体の複数所持は入手回数に反映、初入手日は最古の created_at）
INSERT OR IGNORE INTO user_unit_stats (user_id, unit_id, obtained_count, first_obtained_at)
SELECT user_id, unit_id, COUNT(*), MIN(created_at)
FROM hangars
GROUP BY user_id, unit_id;

-- 現在搭乗中の機体から復元（hangars に行が無い場合の補完）
INSERT OR IGNORE INTO user_unit_stats (user_id, unit_id, obtained_count, first_obtained_at)
SELECT id, unit_id, 1, created_at
FROM characters
WHERE unit_id > 0;

-- 2) 基地（shield_until を最初から含む）
CREATE TABLE IF NOT EXISTS user_bases (
  user_id VARCHAR(255) PRIMARY KEY,
  name TEXT NOT NULL,
  terrain INTEGER NOT NULL DEFAULT 1,
  power_last_collected_at INTEGER NOT NULL DEFAULT 0,
  shield_until INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- 3) 基地施設
CREATE TABLE IF NOT EXISTS user_facilities (
  user_id VARCHAR(255) NOT NULL,
  facility TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, facility),
  FOREIGN KEY (user_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- 4) 博物館の設定（殿堂・館長コメント）
CREATE TABLE IF NOT EXISTS museum_settings (
  user_id VARCHAR(255) PRIMARY KEY,
  featured_unit_id INTEGER DEFAULT 0,
  curator_comment TEXT DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- 5) 博物館の展示枠
CREATE TABLE IF NOT EXISTS museum_exhibits (
  user_id VARCHAR(255) NOT NULL,
  slot_index INTEGER NOT NULL,
  unit_id INTEGER NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, slot_index),
  FOREIGN KEY (user_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- 6) 見学者ノート
CREATE TABLE IF NOT EXISTS museum_guestbook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_user_id VARCHAR(255) NOT NULL,
  author_user_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (target_user_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES characters(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_guestbook_target ON museum_guestbook (target_user_id, created_at DESC);
