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

| 変数 | 必須 | ローカル | 本番 |
| --- | --- | --- | --- |
| `JWT_SECRET` | **必須** | `backend/.dev.vars` | `npx wrangler secret put JWT_SECRET` |
| `GOOGLE_CLIENT_SECRET` | Google 連携を使うなら必須 | `backend/.dev.vars` | `npx wrangler secret put GOOGLE_CLIENT_SECRET` |
| `PUBLIC_ORIGIN` | ローカルのみ必須 | `backend/.dev.vars` に `http://localhost:5199` | **設定しない**（リクエストから導出される） |
| `GOOGLE_CLIENT_ID` | Google 連携を使うなら必須 | `backend/wrangler.jsonc` の `vars`（公開情報なのでコミット済み） | 同左 |

雛形は `backend/.dev.vars.example` にあります。`.dev.vars` は Git 管理外です。
**秘密鍵はリポジトリに置かないでください。** `GOOGLE_CLIENT_ID` だけは公開情報
（同意画面へのURLに載ってブラウザに出る）なので `wrangler.jsonc` に置いてあります。

> **`.dev.vars` を編集したら wrangler dev を再起動すること。** 起動時にしか読まれないため、
> 追記しても反映されず `redirect_uri` が古いまま送られてハマります。

#### `PUBLIC_ORIGIN` が要る理由

ローカルは Vite(5199) が `/api` を wrangler(8787) へプロキシしているため、**Worker から見た
自分の origin(8787) と、ブラウザが実際にいる場所(5199) が食い違います**。Google に登録した
リダイレクト URI と1文字でも違うと `redirect_uri_mismatch` で弾かれるので、ローカルでは
明示的に上書きします。本番はプロキシが挟まらないので未設定でかまいません。

### Google アカウント連携のセットアップ

Google Cloud Console →「OAuth クライアント ID の作成」→ **ウェブ アプリケーション**。

- **承認済みの JavaScript 生成元**: **空のまま**。サーバー側の認可コードフローなので不要です
  （ブラウザで Google の JS を動かす方式でだけ必要）。
- **承認済みのリダイレクト URI**: 以下の2つを登録します。

```
https://<本番のドメイン>/api/auth/google/callback
http://localhost:5199/api/auth/google/callback
```

ローカルが 8787 ではなく **5199** なのは上記の理由です。8787 を指定すると、Google から
戻った先が Vite の開発サーバーではなく Worker が配信する**ビルド済みの古い dist** になり、
開発中の変更が反映されません。

発行された値の置き場所は上の表のとおりです（ID は `wrangler.jsonc`、シークレットは
`wrangler secret put` と `.dev.vars`）。反映に数分〜数時間かかることがあります。

要求するスコープは **`openid` だけ**です。受け取るのは `sub`（このアプリ専用の不変な
識別子）のみで、**メールアドレスも氏名も受け取らないし保存しません**。`characters.email` を
「使わない個人情報を持たない」という理由で廃止しているため、ここで貰い始めると本末転倒になります。

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

### 稼働中の DB に必要な追随（P56 / P57）

**新規に作る DB では何もする必要はありません**（baseline に反映済み）。
すでに稼働している DB（本番を含む）にだけ、一度ずつ流してください。

| | 内容 | 性質 |
| --- | --- | --- |
| **P56** | `characters.email` の廃止 | **破壊的**（列とデータを削除） |
| **P57** | `characters.google_sub` の追加（Google 連携用） | 非破壊（ADD COLUMN + 索引） |

```bash
cd backend

# P56: 消えて困る値が入っていないか先に確認する
npx wrangler d1 execute gtactics-db --remote --command "SELECT COUNT(*) FROM characters WHERE email IS NOT NULL AND email <> '';"

npx wrangler d1 execute gtactics-db --local  --file ./tools/p56_drop_email.sql
npx wrangler d1 execute gtactics-db --remote --file ./tools/p56_drop_email.sql

npx wrangler d1 execute gtactics-db --local  --file ./tools/p57_add_google_sub.sql
npx wrangler d1 execute gtactics-db --remote --file ./tools/p57_add_google_sub.sql
```

> 他の `tools/*.sql` は「既存ローカル DB の追随用」ですが、**この2本は本番にも流す必要があります**。
> 本番だけ列が食い違うと baseline と実 DB が drift します。過去に `tournaments` で同じ事故が
> 起きています（`tools/local_drift_repair.sql` の経緯を参照）。

`email` を廃止したのは、登録時に集めていたものの**アプリのどこからも読まれない書き込み専用の
カラム**であり、使わない個人情報を保持し続ける理由が無いためです。

`google_sub` の一意性は、baseline と `p57` の**両方で同一定義の部分索引**にしてあります
（列に `UNIQUE` を書くと、`ADD COLUMN` しかできない既存 DB 側と schema が食い違うため）。

## ログイン方法の設計

ログイン手段は **パスワード** と **Google 連携** の2つで、どちらか一方があれば足ります。
アカウントの設定画面は `/account`（ヘッダー右上のユーザーメニューから）。
`/profile-edit` はゲーム側の設定（ランカー名・呼称・公開文・戦闘コメント）だけを扱います。

### 触る前に知っておくべき原則: 最後のログイン手段は外せない

**このゲームにはパスワードの再設定メールがありません**（メールアドレスを集めていないので
作れません）。そのため、ログイン手段を失うと復旧手段がゼロになります。ここは以下の
不変条件で守っています。**壊すと、利用者が自分のアカウントへ二度と入れなくなります。**

- Google だけで登録した人は `password_hash = ''`。`verifyPassword('')` は必ず false を
  返すので、パスワードでのログインは構造的に不可能です。
  （SQLite は既存列の `NOT NULL` を落とせず、`characters.id` は30列から参照されているため
  テーブル再構築は割に合わない、という判断）
- **パスワードを持たない人の Google 連携解除は拒否します**（`/api/auth/google/unlink`）。
- **`/api/edit` は、`password_hash` が `''` の場合に限り `current_password` なしで
  初回設定を許します。** ここを「常に現在のパスワードを要求する」に戻すと、Google だけの人が
  永久にパスワードを設定できず、結果として連携も解除できない詰みになります。
- 1つの Google アカウントは1キャラまで（DB 側の部分索引でも担保）。

この不変条件は `backend/test/google_auth.test.ts` と
`frontend/tests/google-link.spec.ts` が見ています。

## パスワードの保存方式

`src/utils/password.ts` が唯一の正です。**PBKDF2-HMAC-SHA256 / 60万回 / ソルト16バイト**
（保存形式 `pbkdf2$<反復回数>$<salt_b64>$<hash_b64>`）。

- 以前は無ソルトの SHA-256 でした。ログインは旧形式も受け付け、**認証に成功した時点で
  自動的に新形式へ書き換えます**。既存アカウントは何もしなくてもそのまま使えます。
- 反復回数は保存値の中に持たせてあるので、後から引き上げても既存行を照合できます。
- Workers はネイティブモジュールを読めないため bcrypt/argon2 は使えません。PBKDF2 は
  WebCrypto 標準で、Workers でもテストの Node でも同じコードが動きます。
- **60万回は Workers Paid 前提**です（実測 約200ms/回。CPU 上限は既定30秒）。
  Free プラン（CPU 上限 10ms）へ移る場合はこの回数では超過します。
- `scripts/make_admin.mjs` は `node:crypto` で同じ形式を作ります。ここがズレると
  作った管理者がログインできなくなるため、両者の一致を `test/password.test.ts` が検証しています。

## テスト・型チェック

```bash
cd backend
npm test               # vitest
npm run typecheck

cd ../frontend
npm run typecheck      # tsc -b
npx playwright test    # E2E（dev server を起動しておくこと）
```

> **frontend で `npx tsc --noEmit` を使わないこと。** `frontend/tsconfig.json` は
> `{"files": [], "references": [...]}` のソリューション構成なので、`-b` を付けずに走らせると
> **src 配下を1ファイルも読まずに成功します**（型エラーがあっても通る）。
> 実体は `tsconfig.app.json` 側にあります。`npm run typecheck`（= `tsc -b`）を使ってください。
> backend は `tsconfig.json` が実体なので `tsc --noEmit` で問題ありません。

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

```bash
cd backend
npm run preflight   # 本番の状態を点検（読み取りのみ。落ちても何も壊さない）
npm run deploy      # フロントのビルド → Worker のデプロイ
```

**通常はこれだけです。** `npm run deploy` はフロントのビルドを含みます
（`wrangler.jsonc` が `../frontend/dist` を配信するため、ビルドを忘れると
**古い画面が無言でデプロイされる**。それを起こせないよう1コマンドにまとめてあります）。

`npm run preflight` は、本番で「無言で壊れる」種類のものだけを実際に本番へ問い合わせて確認します。

- secret の入れ忘れ → ログインだけが動かない
- マイグレーションの流し忘れ → baseline と実 DB が drift する
- `dist` が `src` より古い → 古い画面が配信される

NG があると、実行すべきコマンドをその場に表示します。

### 初回だけ必要なこと

```bash
cd backend
npx wrangler secret put JWT_SECRET             # 未設定だと認証が動かない
npx wrangler secret put GOOGLE_CLIENT_SECRET   # 未設定だと Google ログインだけが落ちる
npx wrangler d1 execute gtactics-db --remote --file ./migrations/0001_baseline.sql
```

Google 連携には Console 側の設定も要ります（「Google アカウント連携のセットアップ」の節）。
`seed_dev.sql` は開発用テストキャラなので**本番には流さないでください**。

### スキーマを変えたとき

baseline を編集しただけでは本番は変わりません。`tools/*.sql` を `--remote` にも流す必要があります
（「稼働中の DB に必要な追随」の節）。**流し忘れは preflight が検知します。**

### 構成

フロント・API・画像はすべて 1 つの Worker (`g-tactics`) に集約されています。

```
/api/*          → API (D1)
/images/units/* → R2
/*              → フロントの静的アセット（SPA フォールバック）
```

機体画像は R2 にあり、リポジトリにもデプロイ成果物にも含まれません。
そのためコードをデプロイしても画像は消えません（「機体画像について」の節）。

## ライセンス / 注意

個人の非商用プロジェクトです。
作中に登場する名称・意匠等の権利は、それぞれの権利者に帰属します。
