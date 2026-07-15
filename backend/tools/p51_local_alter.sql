-- P51: team_members の同一相手二重編成を DB 側で禁止する
-- 既存ローカルD1向け（baseline は CREATE TABLE 直後に同インデックスを持つ）。
-- 適用: cd backend && wrangler d1 execute gtactics-db --local --file ./tools/p51_local_alter.sql
-- 既存の重複行があるとインデックス作成が失敗するため、min(id) を残して先に除去する。
DELETE FROM team_members WHERE id NOT IN (SELECT MIN(id) FROM team_members GROUP BY owner_id, character_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_owner_char ON team_members(owner_id, character_id);
