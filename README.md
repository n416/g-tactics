# G-Tactics

ブラウザで遊ぶ、機体育成 × 対戦シミュレーションの個人プロジェクトです。
往年のブラウザゲームのゲームシステム（戦闘計算・育成・大会・勢力戦など）を、
モダンな Web 技術で再現することを目標にしています。

## 技術スタック

**フロントエンド**: React / TypeScript / Vite / Vanilla CSS（カスタムデザインシステム）
**バックエンド**: Hono（Cloudflare Workers）/ Cloudflare D1（SQLite）

## ディレクトリ構成

- `frontend/` — フロントエンドアプリケーション（React / Vite）
- `backend/` — バックエンド API・DB 定義・マイグレーション（Hono / Cloudflare D1）

## セットアップ

前提: Node.js v20 以上

```bash
# バックエンド
cd backend
npm install
cp .dev.vars.example .dev.vars    # JWT_SECRET を設定する（必須）
npm run dev                       # wrangler dev（Cloudflare D1 ローカルエミュレータ）

# フロントエンド（別ターミナル）
cd frontend
npm install
npm run dev
```

### 環境変数

`JWT_SECRET` は**必須**です。未設定だと認証が動作しません。

- ローカル: `backend/.dev.vars` に記述（このファイルは Git 管理外）
- 本番: `npx wrangler secret put JWT_SECRET`

秘密鍵はリポジトリに置かないでください。

### データベースの初期化

```bash
cd backend
npx wrangler d1 execute gtactics-db --local --file ./migrations/0001_baseline.sql
npx wrangler d1 execute gtactics-db --local --file ./seed_dev.sql   # 開発用のテストキャラ
```

`0001_baseline.sql` はスキーマに加えて機体マスタ（units 911件 / items 396件）も含むため、
これ1本でゲームが動く状態になります。`seed_dev.sql` は開発用のテストキャラなので、
**本番には流さないでください**。

`migrations/0001_baseline.sql` がスキーマの単一の正です。スキーマを変更する場合は
baseline を直接編集し、既存のローカル DB には `backend/tools/*.sql` の非破壊 ALTER で追随させます
（既存ローカル DB の取りこぼしの修復は `tools/local_drift_repair.sql`）。

## テスト・型チェック

```bash
cd backend
npm test               # vitest
npm run typecheck

cd ../frontend
npx tsc --noEmit
npx playwright test    # E2E
```

## 管理者アカウント

`is_admin` を持つキャラは管理画面（`/admin`）を使えます。ローカル・本番のどちらにも同じコマンドで作れます。
**`--local` / `--remote` は必須**です（既定値を持たせると事故るため）。

```bash
cd backend

# 【推奨】サイトで新規登録してから、そのキャラを管理者に昇格する
npm run admin -- --id=<ログインID> --local
npm run admin -- --id=<ログインID> --remote     # 本番

# 【非常用】新規に管理者キャラを直接作る
npm run admin -- --id=<ログインID> --create --handle=<ハンドル名> --chara=<キャラ名> --local
```

パスワードは引数で渡しません（シェル履歴に残るため）。実行時にプロンプトで訊かれます。
自動化する場合のみ環境変数 `ADMIN_PASSWORD` が使えます。

> **昇格を推奨する理由**: `--create` は本体の登録処理を通らないため、通常の登録で行われる
> **ランダムな特性の付与（Lv1〜9 で1つ）** が再現されず、**特性を持たないキャラ**になります（戦闘計算に影響）。
> ステータス合計の上限チェックも通りません。サイトに登録導線がある限り、登録→昇格を使ってください。

## 機体画像について

機体画像は **R2 バケット `g-tactics-assets`** に置いてあり、Worker が `/images/units/*` で配信します。
**リポジトリにもデプロイ成果物にも含まれません**（`.gitignore` ＋ ビルド時に `dist` から除外）。
そのため、コードをデプロイしても画像は消えません。画像が無いユニットはプレースホルダが表示されます。

- ローカル開発用の実体: `frontend/public/images/units/`（Git 管理外。Vite dev server が配信）
- 本番の配信元: R2（`units/<ファイル名>` というキーで格納）

### 画像を追加・更新する

```bash
cd backend
npx wrangler r2 object put g-tactics-assets/units/<ファイル名> \
  --remote --file ../frontend/public/images/units/<ファイル名> --content-type image/gif
```

> **`--remote` を必ず付けること。** 付け忘れるとローカルのエミュレータに書き込まれ、
> `Upload complete.` と表示されるのに本番には**一切反映されません**（無言で失敗する）。
> 確認は `npx wrangler r2 object get g-tactics-assets/units/<ファイル名> --remote --file /tmp/x` で行う。
> `wrangler r2 bucket info` の `object_count` は反映が遅れるため、確認に使わないこと。

DB の `units.image` に書かれたファイル名がそのままキーになります（大文字小文字も区別されます）。

## デプロイ

フロント・API・画像はすべて 1 つの Worker (`g-tactics`) に集約されています。

```
/api/*          → API (D1)
/images/units/* → R2
/*              → フロントの静的アセット（SPA フォールバック）
```

```bash
# 1) フロントをビルド（機体画像は自動で dist から除外される）
cd frontend && npm run build

# 2) Worker をデプロイ
cd ../backend
npx wrangler secret put JWT_SECRET   # 初回のみ。未設定だと認証が動かない
npm run deploy
```

本番 DB の初期化は初回のみ:

```bash
cd backend
npx wrangler d1 execute gtactics-db --remote --file ./migrations/0001_baseline.sql
```

`seed_dev.sql` は開発用テストキャラなので**本番には流さないでください**。

## ライセンス / 注意

個人の非商用プロジェクトです。
作中に登場する名称・意匠等の権利は、それぞれの権利者に帰属します。
