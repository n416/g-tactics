# PM-5 ブリーフ: 防衛戦連携・リプレイ画面のモック作成依頼

あなたはこのプロジェクトのPM兼デザイナーです。以下を成果物として作成してください。
**アプリ本体のコードは一切変更しないこと。** 成果物は docs/pm/PM-5-replay/ 配下の新規ファイル2点のみ。

## 成果物

1. **`docs/pm/PM-5-replay/mock-replay.html`** — 単一HTML・外部依存なしのモック
2. **`docs/pm/PM-5-replay/UX-NOTES.md`** — 画面構成・データ設計素案・論点リスト

## 背景（すべて実物を読むこと）

- `docs/pm/PM-1-base/reference-mock-original.html` の基地ヘッダーに
  「昨夜 1 件の襲撃 — 防衛成功（リプレイを見る）」というサマリ行がある。これを実データに接続するのが本スレッド
- 既存資産（**必ず読んで再利用を検討**）:
  - `backend/src/routes/defense.ts` の `GET /:id/logs`（288行付近）— 防衛作戦ごとの直近戦闘を
    events/meta 付きで返す観戦APIが**既に存在する**
  - `backend/migrations/0001_baseline.sql` の `battle_logs`（defense_battle_id で作戦に紐付く）と `defense_battles`
  - `frontend/src/components/BattleAnimation.tsx` / `.css` — 戦闘イベント（events）を再生する既存コンポーネント
  - `frontend/src/pages/Battle.tsx` — BattleAnimation の使い方の実例
  - `frontend/src/pages/Log.tsx` — 既存の戦闘ログ一覧（テキストのみ）
  - 実装済みの基地ページ `frontend/src/pages/Base.tsx`（防衛ログサマリ行は現在ダミー）
- デザイントークン: `frontend/src/index.css` / `AppLayout.css`。通貨は pt

## モックに含める画面・状態

1. **基地ヘッダーの防衛サマリ**（Base.tsx のヘッダー行に収まる想定で状態別に並べる）:
   - 襲撃なし（過去24時間）
   - 襲撃1件・防衛成功（「リプレイを見る」リンク付き）
   - 襲撃複数件・成敗混在（例: 3件中2勝1敗 → 一覧への導線）
   - 防衛作戦を未設定のユーザー向けの案内（防衛戦の入口への導線）
2. **防衛履歴一覧**: 自分の作戦への襲撃履歴（日時・挑戦者・勝敗・リプレイボタン）。
   既存の「防衛履歴」ナビ項目/ページとの関係は UX-NOTES で提案
3. **リプレイ画面**: 戦闘再生ビュー。BattleAnimation 風の戦闘ステージ（機体2体・HPバー等の
   プレースホルダー）＋再生コントロール（再生/一時停止/速度/スキップ）＋テキストログ併記。
   対戦カード（挑戦者vs防衛者・地形・日時）ヘッダー付き

## UX-NOTES.md に含める内容

1. 画面構成: リプレイは専用ページ（例 /replay/:battleLogId）かモーダルか。既存 Log.tsx・防衛履歴ページとの統合方針
2. データ: 既存 `GET /api/defense/:id/logs` と battle_logs で何がまかなえるか、
   追加で必要な API（例: 基地サマリ用の「直近24hの自分宛襲撃集計」）の素案
3. 砲台（PM-1で保留した防衛戦での迎撃効果）をこのスレッドで配線するか否かの提案
4. 論点リスト（リプレイの公開範囲: 本人のみ/全員、保持期間、events_json が無い古いログの扱い等）

## 進め方

プラン提示や確認は不要、直ちに作成してファイルを書き出すこと。
完了したら、作成した2ファイルのパスと主要なUX判断を標準出力に報告すること。
