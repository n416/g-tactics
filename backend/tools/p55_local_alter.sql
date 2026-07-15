-- P55 (Q5 大会コメント): tournament_comments を追加（非破壊・ローカルD1用）
-- baseline.sql には既に反映済み。既存ローカルDBにだけ後追いで足す（IF NOT EXISTS でデータ非破壊）。
CREATE TABLE IF NOT EXISTS tournament_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  character_id VARCHAR(255) NOT NULL,
  chara_name VARCHAR(255) NOT NULL,
  comment TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
