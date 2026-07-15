-- P57: characters.google_sub を追加する（既存DB用の後追い・非破壊）
--
-- Google アカウント連携用。値は Google の sub（このアプリ専用の不変な識別子）。
-- 要求スコープは openid のみなので、メールアドレスや氏名は受け取らないし保存もしない。
--
-- baseline.sql には反映済み。新規に作るDBには不要で、稼働中のDBにだけ流す。
--   ローカル: npx wrangler d1 execute gtactics-db --local  --file ./tools/p57_add_google_sub.sql
--   本番:     npx wrangler d1 execute gtactics-db --remote --file ./tools/p57_add_google_sub.sql
--
-- ★ 本番にも流す必要がある（p56 と同じ）。ただしこちらは ADD COLUMN のみで非破壊。
--
-- 冪等性: 既に列があるDBで流すと "duplicate column name" になる。

ALTER TABLE characters ADD COLUMN google_sub TEXT;

-- ADD COLUMN では UNIQUE 制約を付けられない（SQLite の制限）ため、一意性は索引で担保する。
-- 部分索引にしてあるので、未連携（NULL）の行が複数あっても衝突しない。
CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_google_sub
  ON characters (google_sub) WHERE google_sub IS NOT NULL;
