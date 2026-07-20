# PM-5 実装指示書: 防衛戦連携・リプレイ

あなたはこのプロジェクトの実装担当です。同ディレクトリの `mock-replay.html`（承認済みモック）と
`UX-NOTES.md`（**5章の承認済み決定事項が正**）を読み、以下を実装してください。
**プラン提示や確認は不要、直ちに実装を開始してください。**

## 禁止事項（厳守）

- デプロイ操作、`--remote` を伴うDB操作、`git commit` / `git push`
- 既存の観戦API（defense.ts の `GET /:id/logs`）の仕様変更（公開のまま現状維持と決定済み）
- events_json のローテーション/削除機構（スコープ外と決定済み）
- スコープ外のリファクタリング

## 1. 砲台の迎撃配線（バックエンド）

- `backend/src/utils/baseFacilities.ts` に砲台の効果定数を追加:
  `TURRET_SHOTS = [0, 1, 1, 2, 2, 3]`（Lvごとの迎撃回数）、
  `TURRET_DAMAGE = [0, 20, 35, 35, 50, 50]`（1発あたりのダメージ。小=20/中=35/大=50）
  と `getTurretIntercept(level): { shots, damage }` ヘルパー
- `backend/src/routes/defense.ts` の防衛戦実行処理（個人戦・チーム戦の両方）で、
  戦闘シミュレーション開始**前**に防衛側基地の砲台Lvを取得
  （防衛側= `battle.champion_id` の user_facilities。無ければ迎撃なし）し、
  迎撃ダメージ（shots × damage）を挑戦者（attacker / aTeam 先頭機）のHPに適用する。
  HPは0未満にしない（最低1残す＝迎撃だけでは撃墜しない。理由: 戦闘不成立のエッジケースを避ける）
- **リプレイ演出**: 迎撃が発生した場合、logs の先頭に
  `【Turn 0】基地防衛システムの迎撃射撃！ ○○ に ×× のダメージ！` 形式の行を追加し、
  events 配列の先頭にも既存のイベントスキーマに適合する形でダメージイベントを挿入する。
  **既存の BattleAnimation.tsx が改修なしで再生できるイベント形式にすること**
  （まず events_json の実データと BattleAnimation の events 処理を読み、対応している type のみ使う。
  適合する type が無ければ無理に挿入せず、テキストログのみとし、その旨を完了報告に書くこと）

## 2. 基地サマリAPI＋UI

- `GET /api/base`（backend/src/routes/base.ts）のレスポンスに `defenseSummary` を追加:
  `{ recentCount, winCount, loseCount, latestLogId, latestHasReplay }`
  - 集計対象: 過去24時間の `battle_logs` で `battle_type = 'gate'` かつ `defender_id = 自分`
  - `latestHasReplay` は最新ログの events_json が非NULLか
- `frontend/src/pages/Base.tsx` のヘッダー: モックの防衛サマリ（4状態）を実装
  - 襲撃なし / 1件（結果＋「リプレイを見る」→ /replay/:id）/ 複数件（n勝m敗＋「防衛履歴を見る」→ /log）/
    防衛作戦未設定（defense_battles に自分がchampionの作戦が無い場合。防衛戦ページへの導線）
  - 「防衛作戦未設定」の判定に必要なら defenseSummary に `hasDefenseBattle` を追加してよい
  - モックの警報風スタイル（DEFENSE ALERT）を Base.css に移植

## 3. リプレイページ

- `backend/src/routes/replay.ts`（新規、index.ts に `/api/replay` 登録）:
  - `GET /api/replay/:battleLogId` — battle_logs から1件取得。
    **認可: attacker_id または defender_id が自分の場合のみ**（それ以外は 403）。
    events_json が NULL なら 404 相当（`{ success:false, message:'リプレイデータがありません' }`, 404）
    レスポンス: events, meta, log_text, attacker/defender の handle_name, created_at, battle_type
- `frontend/src/pages/Replay.tsx`（新規）＋ルート `/replay/:battleLogId`:
  - 対戦カードヘッダー（挑戦者 vs 防衛者・日時・地形は meta から）
  - 既存 `BattleAnimation.tsx` を再利用して events を再生（Battle.tsx での使い方に倣う）
  - 再生終了後に「もう一度見る」ボタン。再生速度等は BattleAnimation が対応している範囲でよい
    （BattleAnimation の改修が必要になる大掛かりな再生コントロールは実装しない。
    モックの速度/スキップUIは将来拡張とし、完了報告に明記）
  - テキストログ（log_text）を戦闘ステージ下に併記

## 4. Log.tsx 統合

- `GET /api/battle/logs`（battle.ts）のレスポンス各行に `id` と `has_replay`（events_json 非NULL）を追加
  （events_json 本体は一覧では返さない。データ量削減のため）
- `frontend/src/pages/Log.tsx`: 各行に「リプレイを見る」ボタンを追加（→ /replay/:id）。
  has_replay が false の行は非活性で「リプレイ期限切れ」表示（モック準拠）。
  一覧の見た目はモックのカード型に寄せるが、既存構造を大きく壊さない範囲でよい

## 5. テスト・検証

- `backend/test/replay.test.ts` 等: getTurretIntercept の表値、迎撃ダメージ適用（HP最低1保証）の
  純関数テスト（プレースホルダーテスト禁止）
- backend: `npm run typecheck` / `npm test -- --run`、frontend: `npm run build`

## 完了報告（標準出力へ）

変更・新規ファイル一覧と要旨 / 検証結果 / events スキーマ適合の結果（Turn 0 イベントを挿入できたか）/ 迷った点
