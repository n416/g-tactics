-- ローカルD1 drift 修復（非破壊・catch-up）
-- 発見: 2026-07-15（Q5作業中に tournaments 作成が 500 で判明）。
-- 原因: P33/P39/P49 で baseline.sql の tournaments に 33 カラムを追加した際、
--       既存ローカルDB向けの local_alter が用意されず、当該DBだけ列が欠落していた。
-- 対象: baseline と実ローカルを better-sqlite3 で全数突合した結果、drift は tournaments のみ。
-- 方針: ADD COLUMN のみ（既存データ非破壊）。全列に安全な DEFAULT（auto_start_time は nullable）。
-- 冪等性: 既に列がある環境で流すと "duplicate column" エラーになる。新規/同期済みDBには不要。
ALTER TABLE tournaments ADD COLUMN limit_unit_types VARCHAR(255) DEFAULT '';
ALTER TABLE tournaments ADD COLUMN limit_taikyu INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_taikyu_jyo INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_undo INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_undo_jyo INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_weight INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_weight_jyo INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_custom INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_lv INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_lv_jyo INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_rank INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_rank_jyo INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_cost INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_cost_jyo INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_team_size_1 INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_team_size_2 INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_team_taikyu_1 INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_team_taikyu_2 INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_team_cost_1 INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN limit_team_cost_2 INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN field_terrain INTEGER DEFAULT -2;
ALTER TABLE tournaments ADD COLUMN allow_tactics INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN auto_start_time DATETIME;
ALTER TABLE tournaments ADD COLUMN team1_name VARCHAR(255) DEFAULT '';
ALTER TABLE tournaments ADD COLUMN team2_name VARCHAR(255) DEFAULT '';
ALTER TABLE tournaments ADD COLUMN team1_factions VARCHAR(255) DEFAULT '';
ALTER TABLE tournaments ADD COLUMN team2_factions VARCHAR(255) DEFAULT '';
ALTER TABLE tournaments ADD COLUMN team_leader INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN team_tactics INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN bet_points INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN team1_allow_free INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN team2_allow_free INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN has_special_condition INTEGER DEFAULT 0;
