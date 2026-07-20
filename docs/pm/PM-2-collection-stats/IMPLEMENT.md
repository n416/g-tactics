# PM-2 実装指示書

あなたはこのプロジェクトの実装担当です。同ディレクトリの `DESIGN.md`（承認済み最終版）を読み、
以下を実装してください。**プラン提示や確認は不要、直ちに実装を開始してください。**

## 禁止事項（厳守）

- `wrangler deploy` などのデプロイ操作
- `--remote` を伴う一切の DB 操作（本番DBに触らない）
- `git commit` / `git push`（レビューは呼び出し元が git diff で行う）
- DESIGN.md のスコープ外のリファクタリング

## 実装タスク

1. **`backend/migrations/0001_baseline.sql`** — DESIGN.md 1章の CREATE TABLE を追記する。
   既存ファイルの他テーブル定義のスタイル（DROP TABLE IF EXISTS の有無、コメントの書き方）に合わせること。
   配置は hangars テーブル定義の近くが妥当。

2. **`backend/tools/p58_user_unit_stats.sql`** — DESIGN.md 5章の冪等スクリプト（CREATE TABLE IF NOT EXISTS 全文＋バックフィル2文）を新規作成。
   既存の `tools/p57_add_google_sub.sql` 等の書式・コメント様式に合わせること。

3. **`backend/scripts/preflight.mjs`** — checks 配列に DESIGN.md 4章のエントリを追加。

4. **共通ヘルパー `backend/src/utils/unitStats.ts`（新規）** — SQL重複を避けるため以下を export:
   - `recordUnitObtained(db, userId, unitId)` — DESIGN.md 2.1章の UPSERT を1回実行
   - `recordUnitBattleResult(db, { userId, unitId, isWin })` — DESIGN.md 2.2章の勝利/敗北 UPSERT を実行
   - どちらも NPC や不正値をガード: userId が falsy、または unitId が 0 以下なら何もしない

5. **入手フックの組み込み**（DESIGN.md 2.1章の表のとおり）:
   - `backend/src/routes/factory.ts` 購入ハンドラ: hangars INSERT の直後に recordUnitObtained を1回（キャラリセット処理 unit.id===9999 の分岐では呼ばない）
   - `backend/src/routes/auth.ts` 初期機体付与（:200 付近）
   - `backend/src/routes/trade.ts` の hangars INSERT 3箇所（:32, :247, :283 付近）
   - 乗り換え・派閥機体には入れない

6. **戦闘フックの組み込み**（DESIGN.md 2.2章）:
   - `backend/src/utils/battleRewards.ts` の戦績更新（total_battles/win_battles を更新している :399 付近）で、
     attacker と defender の双方に recordUnitBattleResult を呼ぶ。
     attacker/defender オブジェクトの搭乗機 unit_id と id を使う。NPC 側はヘルパーのガードで自然に無視されるようにする
     （NPC 判定が必要なら既存の isNpcId 等の慣例に従う）。
   - `backend/src/routes/tournament.ts` の勝敗確定（:435 付近、isNpcId チェックの慣例に合わせる）で勝者に isWin: true を記録。
     勝者の搭乗機 unit_id は characters から取得している既存クエリがあれば再利用、無ければ1クエリ追加してよい。
     敗者側も同箇所で isWin: false を記録できるなら記録する（NPC はガードで除外）。

7. **検証** — `backend` で `npm run typecheck` を実行し、エラーゼロを確認すること。
   既存テストがあるので `npm test -- --run` も実行し、自分の変更で落ちたテストが無いことを確認すること
   （元から落ちているテストは触らなくてよいが、報告に含めること）。

## 完了報告（標準出力へ）

- 変更・新規作成したファイルの一覧と各変更の要旨
- typecheck / test の実行結果
- 判断に迷って仕様を解釈した点があればその内容
