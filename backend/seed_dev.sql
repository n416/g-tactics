-- ============================================================
-- 開発用シード（dev only）
-- ------------------------------------------------------------
-- ローカル開発DBに「ログインできる開発アカウント」を投入する。
-- スキーマの正である 0001_baseline.sql とは分離してある：
--   - baseline = スキーマ ＋ ゲーム内容(units/items)。テスト(applySchema)も本番も使う。
--   - このファイル = 開発者アカウントのみ。テスト・本番には適用しない。
--
-- 適用（データ全消しナシ・追記のみ。baseline 再適用でアカウントが消えた後に流す）:
--   cd backend
--   wrangler d1 execute gtactics-db --local --file ./seed_dev.sql
--
-- パスワードは無ソルト SHA-256（auth.ts の login と同方式）。
--   admin1 / パスワード: admin1   （is_admin=1）
--   user1  / パスワード: user1
-- ※ dev 用途限定。本番運用時はこのファイルを適用しないこと。
-- ============================================================

-- テスト用勢力の追加
INSERT OR IGNORE INTO factions (id, name, leader_id, funds) VALUES (1, '地球連邦軍(テスト)', 'admin1', 1000);

-- 管理者アカウント（既存があれば維持: OR IGNORE）
INSERT OR IGNORE INTO characters
  (id, password_hash, handle_name, chara_name, is_admin, money, fame, unit_id, faction_id,
   status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range, traits)
VALUES
  ('admin1', '25f43b1486ad95a1398e3eeb3d83bc4010015fcc9bedb35b432e00298d5021f7',
   'Admin', '管理者', 1, 100000, 500, 3, 1, 30, 30, 30, 30, 30, '{"短気": 1, "豪胆": 2}');

-- 動作確認用の一般アカウント1
INSERT OR IGNORE INTO characters
  (id, password_hash, handle_name, chara_name, is_admin, money, fame, unit_id, faction_id,
   status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range, traits)
VALUES
  ('user1', '0a041b9462caa4a31bac3567e0b6e6fd9100787db2ab433d96f6d178cabfce90',
   'TestUser', 'テスト隊員1', 0, 10000, 0, 1, 1, 10, 10, 10, 10, 10, '{"運が悪い": 1, "けちんぼ": 1}');

-- 動作確認用の一般アカウント2 (チーム編成用)
INSERT OR IGNORE INTO characters
  (id, password_hash, handle_name, chara_name, is_admin, money, fame, unit_id, faction_id,
   status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range, traits)
VALUES
  ('user2', '6025d18fe48abd45168528f18a82e265dd98d421a7084aa09f61b341703901a3',
   'TestUser2', 'テスト隊員2', 0, 10000, 0, 2, 1, 12, 12, 12, 12, 12, '{}');

-- 動作確認用の一般アカウント3 (チーム編成用)
INSERT OR IGNORE INTO characters
  (id, password_hash, handle_name, chara_name, is_admin, money, fame, unit_id, faction_id,
   status_intuition, status_piloting, status_short_range, status_mid_range, status_long_range, traits)
VALUES
  ('user3', 'b9b4fdf6cde4613ab794b1a43a051d9e26e25dfebbf5a2f528bf6f8099391ab1',
   'TestUser3', 'テスト隊員3', 0, 10000, 0, 4, 1, 15, 15, 15, 15, 15, '{}');

-- 既存アカウントの更新 (既に作成済みの場合は勢力をセット)
UPDATE characters SET faction_id = 1 WHERE id IN ('admin1', 'user1', 'user2', 'user3');

-- 搭乗機を格納庫にも登録（重複投入を避けるため NOT EXISTS でガード）
INSERT INTO hangars (user_id, unit_id)
  SELECT 'admin1', 3 WHERE NOT EXISTS (SELECT 1 FROM hangars WHERE user_id = 'admin1' AND unit_id = 3);
INSERT INTO hangars (user_id, unit_id)
  SELECT 'user1', 1 WHERE NOT EXISTS (SELECT 1 FROM hangars WHERE user_id = 'user1' AND unit_id = 1);
INSERT INTO hangars (user_id, unit_id)
  SELECT 'user2', 2 WHERE NOT EXISTS (SELECT 1 FROM hangars WHERE user_id = 'user2' AND unit_id = 2);
INSERT INTO hangars (user_id, unit_id)
  SELECT 'user3', 4 WHERE NOT EXISTS (SELECT 1 FROM hangars WHERE user_id = 'user3' AND unit_id = 4);

-- ============================================================
-- チーム戦を試すには（team_members は getFullCharacter 相当の snapshot JSON が要るため
-- 純SQLではなく専用スクリプトで投入）:
--   node scripts/seed_dev_teams.mjs      （または npm run seed:teams）
-- 投入後: Aチーム=admin1+user2 / Bチーム=user1+user3、チーム優勝者=user1、
--         チーム個別戦闘=user1所有。admin1 でログインしてチーム戦に挑める。
-- ============================================================
