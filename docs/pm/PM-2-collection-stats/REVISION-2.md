# PM-2 設計書 第2次改訂指示（ユーザーレビュー差し戻し）

前回出力した「PM-2 データ設計書（改訂版）」に対し、以下3点を反映した**最終版の全文**を標準出力に出力すること。
**ファイル読み取りやコマンド実行は一切不要**。根拠となるリポジトリの実態は本書の抜粋に全て含まれている。

## 1. マイグレーション記述の全面訂正（7章の論点1と、関連する記述すべて）

このリポジトリは wrangler の差分マイグレーション機構（d1 migrations）を**使っていない**。
`0002_add_user_unit_stats.sql を作る` という記述は誤りなので削除し、以下の実運用に書き換えること。

ルート README.md からの抜粋（実運用の定義）:

> `migrations/0001_baseline.sql` がスキーマの単一の正です。スキーマを変更する場合は
> baseline を直接編集し、既存のローカル DB には `backend/tools/*.sql` の非破壊 ALTER で追随させます
>
> ### スキーマを変えたとき
> baseline を編集しただけでは本番は変わりません。`tools/*.sql` を `--remote` にも流す必要があります。
> **流し忘れは preflight が検知します。**

- `backend/tools/` の最新スクリプトは `p57_add_google_sub.sql`。今回は **`tools/p58_user_unit_stats.sql`** を新規作成する。
- `backend/scripts/preflight.mjs` には本番DBスキーマの流し忘れ検知チェックリスト（checks 配列。
  `pragma_table_info` で列有無を確認し、無ければ適用コマンドを案内する形式）があるので、
  **p58 のエントリ（`user_unit_stats` テーブルの存在チェック）を追加**する。
  preflight の既存エントリ例:
  ```js
  { sql: `SELECT COUNT(*) AS n FROM pragma_table_info('characters') WHERE name='google_sub';`, want: 1,
    okMsg: 'google_sub カラムがある', ngMsg: 'google_sub カラムが無い（Google 連携が落ちる）',
    how: 'npx wrangler d1 execute gtactics-db --remote --file ./tools/p57_add_google_sub.sql' },
  ```
  ※テーブル存在チェックは `pragma_table_info('user_unit_stats')` の列数や
  `sqlite_master` の COUNT で書ける。preflight に合う形を設計書内で示すこと。
- まとめると作業は3点セット: **(a) 0001_baseline.sql に CREATE TABLE を追記、(b) tools/p58_user_unit_stats.sql 作成、(c) preflight.mjs にチェック追加**。

## 2. 同時更新対策は「将来検討」ではなく今回実装に含める（7章の論点2を削除し、2章に統合）

- 戦闘結果フックも入手フックと同様に**単文の UPSERT に統一**する。SQLite の文単位の原子性と
  D1 の書き込み直列化により、ロストアップデートは構造的に発生しない。この根拠を設計書に明記すること。
- 勝利時の例:
  ```sql
  INSERT INTO user_unit_stats (user_id, unit_id, obtained_count, first_obtained_at, total_kills, current_win_streak, max_win_streak)
  VALUES (?, ?, 0, NULL, 1, 1, 1)
  ON CONFLICT (user_id, unit_id) DO UPDATE SET
    total_kills = total_kills + 1,
    current_win_streak = current_win_streak + 1,
    max_win_streak = MAX(max_win_streak, current_win_streak + 1),
    updated_at = CURRENT_TIMESTAMP;
  ```
- 前回の「アプリ側で更新対象行数をチェックし、無ければ INSERT する防御的実装を推奨」は
  **撤回**する（チェックとINSERTの間にレースがあるため）。
- 敗北/引き分け時も同形の UPSERT 1文にする（INSERT側は kills=0, streak=0）。
- 「未入手機体のまま戦闘した」場合に作られる行は `obtained_count = 0`, `first_obtained_at = NULL` とし、
  図鑑の収蔵判定は `obtained_count > 0` で行う（5章のクエリは既にそうなっているので整合する）。
  first_obtained_at 列は NULL 許容である旨を DDL コメントに反映すること。
- 複数の統計更新文をまとめて発行する箇所は `env.DB.batch()` を使うと明記すること。

## 3. リリース手順の具体化（7章の論点3を手順に書き換え）

`p58_user_unit_stats.sql` は**冪等スクリプト**として設計する:
- `CREATE TABLE IF NOT EXISTS user_unit_stats (...)`
- `hangars`（user_id, unit_id, created_at）と `characters`（id, unit_id, created_at）からの
  `INSERT OR IGNORE` によるバックフィル（first_obtained_at は hangars.created_at、
  characters.unit_id 由来の行は characters.created_at）

本番リリース手順:
1. `npx wrangler d1 execute gtactics-db --remote --file ./tools/p58_user_unit_stats.sql`（テーブル作成＋バックフィル）
2. 直後に worker をデプロイ（フック実装入り）
3. 手順1〜2の間に発生した入手の取りこぼしを塞ぐため、p58 を**再実行**（冪等なので安全）

ダウンタイム不要の理由も明記すること: 旧コードは新テーブルを参照しないため手順1は無害であり、
新コードのフックは UPSERT なのでバックフィル行の有無に依存しない。

## 出力形式

修正箇所以外は前回の内容を維持し、「PM-2 データ設計書（最終版)」として全文を出力すること。
