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

## 機体画像について

機体画像（`frontend/public/images/units/`）は**このリポジトリには含まれていません**（Git 管理外）。
ローカルおよびデプロイ時に別途配置してください。画像が無くてもゲームは動作しますが、機体画像は表示されません。

## デプロイ

```bash
cd backend
npx wrangler secret put JWT_SECRET   # 初回のみ
npm run deploy
```

## ライセンス / 注意

個人の非商用プロジェクトです。
作中に登場する名称・意匠等の権利は、それぞれの権利者に帰属します。
