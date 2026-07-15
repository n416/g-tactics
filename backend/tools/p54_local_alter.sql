-- P54 (Q2 個別戦闘の観戦): battle_logs に作戦紐付け列を追加（非破壊・ローカルD1用）
-- baseline.sql には既に反映済み。既存ローカルDBにだけ後追いで足す。
ALTER TABLE battle_logs ADD COLUMN defense_battle_id INTEGER;
