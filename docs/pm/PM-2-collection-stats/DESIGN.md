# PM-2 データ設計書（最終版）: コレクション統計基盤

- 起草: AGY (Gemini 3.1 Pro) / 編集・統合: PO
- 承認ゲート: ユーザー承認後に実装着手

## 1. テーブル設計

ユーザー×機体ごとの統計を記録する交差テーブルを新設する。

```sql
CREATE TABLE IF NOT EXISTS user_unit_stats (
  user_id VARCHAR(255) NOT NULL,
  unit_id INTEGER NOT NULL,
  obtained_count INTEGER NOT NULL DEFAULT 0,   -- 入手回数（売却→再入手も加算）。0 = 未入手（搭乗戦闘のみ発生した行）
  first_obtained_at DATETIME,                  -- 初入手日。NULL 許容（未入手機体での戦闘行）
  total_kills INTEGER NOT NULL DEFAULT 0,      -- 総撃墜数（その機体に搭乗して勝利した戦闘数）
  current_win_streak INTEGER NOT NULL DEFAULT 0,
  max_win_streak INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, unit_id),
  FOREIGN KEY (user_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
);
```

**推奨理由:** JSONカラム案と比較し、図鑑進捗クエリの性能・集計の容易さ・戦闘終了時のピンポイント更新のしやすさから、複合主キーの独立テーブルを採用する。

## 2. 更新方式: 全フックを単文 UPSERT に統一（同時更新対策）

すべての統計更新は単文の `INSERT ... ON CONFLICT DO UPDATE`（UPSERT）で行う。
SQLite の文単位の原子性と D1 の書き込み直列化により、ロストアップデートは構造的に発生しない。
「行数をチェックして無ければ INSERT」方式はチェックと INSERT の間にレースがあるため**採用しない**。
複数の統計更新文をまとめて発行する箇所は `env.DB.batch()` を使う。

### 2.1 機体入手時（obtained_count / first_obtained_at）

```sql
INSERT INTO user_unit_stats (user_id, unit_id, obtained_count, first_obtained_at)
VALUES (?, ?, 1, CURRENT_TIMESTAMP)
ON CONFLICT (user_id, unit_id) DO UPDATE SET
  obtained_count = obtained_count + 1,
  first_obtained_at = COALESCE(first_obtained_at, CURRENT_TIMESTAMP),
  updated_at = CURRENT_TIMESTAMP;
```

※ `COALESCE` は「未入手のまま戦闘した行（first_obtained_at = NULL）」を後から入手した場合に初入手日を埋めるため。

**適用箇所（この4系統のみ。1入手イベントにつき1回）:**

| # | 箇所 | 扱い |
|---|---|---|
| 1 | ショップ購入 `backend/src/routes/factory.ts` 購入ハンドラ | フックする。※同ハンドラ内の `UPDATE characters SET unit_id` (:116) と `INSERT INTO hangars` (:141) は同一の購入処理なので、**1回だけ**呼ぶ（二重カウント禁止） |
| 2 | 新規登録の初期機体付与 `backend/src/routes/auth.ts:200` | フックする |
| 3 | トレード `backend/src/routes/trade.ts:32, 247, 283`（落札・即決・受取） | フックする |
| 4 | 乗り換え（格納庫スワップ）`backend/src/routes/factory.ts:240-261` | **フックしない**（新規入手ではない） |
| 5 | 派閥機体の搭乗 `backend/src/routes/faction_unit.ts:98` | **フックしない**。派閥機体は個人所有ではなく貸与であり、個人図鑑に計上するのは体験上の違和感があるため |

### 2.2 戦闘結果時（total_kills / 連勝）

勝利した側（attacker / defender を問わない）:

```sql
INSERT INTO user_unit_stats (user_id, unit_id, obtained_count, first_obtained_at, total_kills, current_win_streak, max_win_streak)
VALUES (?, ?, 0, NULL, 1, 1, 1)
ON CONFLICT (user_id, unit_id) DO UPDATE SET
  total_kills = total_kills + 1,
  current_win_streak = current_win_streak + 1,
  max_win_streak = MAX(max_win_streak, current_win_streak + 1),
  updated_at = CURRENT_TIMESTAMP;
```

敗北・引き分けの側（同形の UPSERT 1文。INSERT側は全カウント0）:

```sql
INSERT INTO user_unit_stats (user_id, unit_id, obtained_count, first_obtained_at)
VALUES (?, ?, 0, NULL)
ON CONFLICT (user_id, unit_id) DO UPDATE SET
  current_win_streak = 0,
  updated_at = CURRENT_TIMESTAMP;
```

unit_id は戦闘時に搭乗していた機体（`characters.unit_id`。battleRewards では attacker/defender オブジェクトが保持）。

**適用箇所:**
1. 通常戦闘 `backend/src/utils/battleRewards.ts:399` 付近（attacker / defender 双方）
2. 大会 `backend/src/routes/tournament.ts:435`（勝敗確定時）
3. 防衛戦は `battleRewards.ts` の processBattleRewards を経由することが**確認済み**（`opts.defenseBattleId`・防衛側勝利特典処理あり）のため、1のフックで自動的にカバーされる

## 3. 撃墜・連勝の帰属ルール

- **勝利判定:** 勝利した時点で搭乗機に「撃墜+1」「連勝+1」
- **引き分け:** 撃墜は増えず、連勝は途切れる（current_win_streak = 0）
- **NPC戦:** 加算対象に含める（搭乗戦果として区別しない）
- **チーム戦:** チームの勝敗を基準とし、勝利チームの参加者は自機に撃墜+1
- **大会戦:** 加算対象に含める
- **未入手機体（派閥機体等）での戦闘:** 行は作られるが obtained_count = 0 / first_obtained_at = NULL のままで、図鑑には収蔵されない

## 4. スキーマ変更の運用（このリポジトリの実運用に準拠）

wrangler の差分マイグレーション機構は**使わない**。README の運用どおり3点セットで行う:

1. **`migrations/0001_baseline.sql` に CREATE TABLE を追記**（スキーマの単一の正）
2. **`backend/tools/p58_user_unit_stats.sql` を新規作成**（既存ローカル/本番DBへの非破壊追随。p57 の次番号）
3. **`backend/scripts/preflight.mjs` の checks 配列にエントリ追加**（本番への流し忘れ検知）:

```javascript
{ sql: `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='user_unit_stats';`, want: 1,
  okMsg: 'user_unit_stats テーブルがある', ngMsg: 'user_unit_stats テーブルが無い（博物館/図鑑の統計が落ちる）',
  how: 'npx wrangler d1 execute gtactics-db --remote --file ./tools/p58_user_unit_stats.sql' },
```

## 5. 既存データのバックフィル（p58 に同梱）

`tools/p58_user_unit_stats.sql` は**冪等スクリプト**とする:

```sql
CREATE TABLE IF NOT EXISTS user_unit_stats ( ...第1章のDDL... );

-- 格納庫の所持機体から復元（同一機体の複数所持は入手回数に反映、初入手日は最古の created_at）
INSERT OR IGNORE INTO user_unit_stats (user_id, unit_id, obtained_count, first_obtained_at)
SELECT user_id, unit_id, COUNT(*), MIN(created_at)
FROM hangars
GROUP BY user_id, unit_id;

-- 現在搭乗中の機体から復元（hangars に行が無い場合の補完。characters の主キーは id）
INSERT OR IGNORE INTO user_unit_stats (user_id, unit_id, obtained_count, first_obtained_at)
SELECT id, unit_id, 1, created_at
FROM characters
WHERE unit_id > 0;
```

**復元できない範囲（ゼロスタート）:** 過去に手放した機体の入手履歴、total_kills、連勝記録。
battle_logs の全パースによる再構築は計算コストと履歴欠損の観点から行わない。

## 6. リリース手順（ダウンタイム不要）

1. `npx wrangler d1 execute gtactics-db --remote --file ./tools/p58_user_unit_stats.sql`（テーブル作成＋バックフィル）
2. 直後にフック実装入りの worker をデプロイ
3. 手順1〜2の間の入手取りこぼしを塞ぐため p58 を**再実行**（冪等なので安全）

ダウンタイムが不要な理由: 旧コードは新テーブルを参照しないため手順1は無害。新コードのフックは UPSERT なのでバックフィル行の有無に依存しない。
ローカルは `--local` で同スクリプトを適用する。

## 7. 図鑑進捗のクエリ

```sql
SELECT
  (SELECT COUNT(*) FROM user_unit_stats WHERE user_id = ? AND obtained_count > 0) AS collected_units,
  (SELECT COUNT(*) FROM units) AS total_units;
```

## 8. 博物館UI向け API 素案（PM-3 で確定）

1. `GET /api/museum/progress` — `{ "total": 911, "collected": 34 }`
2. `GET /api/museum/units` — 全 `units` に user_unit_stats を LEFT JOIN し、`is_collected (= obtained_count > 0)`, `obtained_count`, `first_obtained_at`, `total_kills`, `max_win_streak` をマージして返す

## 9. 残リスク

- **バックフィルの限界:** 撃墜・連勝は機能リリース後からの記録（ユーザー告知推奨）
- **派閥機体の図鑑除外:** 仕様として明記（3章・2.1章）。将来「派閥機体も図鑑に載せたい」となった場合はフック追加のみで対応可能
