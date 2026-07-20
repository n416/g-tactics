# PM-1 実装指示書: 基地・施設システム

あなたはこのプロジェクトの実装担当です。同ディレクトリの `mock-base.html`（承認済みモック）と
`ECONOMY.md`（**特に6章の承認済み決定事項が正**。2章の表の数値は6章の決定で一部上書きされている）を読み、
以下を実装してください。**プラン提示や確認は不要、直ちに実装を開始してください。**

## 禁止事項（厳守）

- デプロイ操作、`--remote` を伴う一切のDB操作、`git commit` / `git push`
- スコープ外のリファクタリング
- 砲台の防衛戦への効果配線（PM-5管轄）、博物館の展示UI（PM-3管轄）はやらない

## 確定仕様（ECONOMY.md 6章より）

- 通貨表記は「pt」
- 発電所: Lv1〜5 = 5/12/25/50/100 pt/時、蓄積上限12時間、訪問時精算（受け取りボタン）
- 修理ドック: 修理費用割引 Lv1〜5 = 10/20/30/40/50%
- 工場: ショップ機体購入割引 Lv1〜5 = 2/5/8/12/15%
- 砲台・博物館: レベル保持のみ
- 建設/強化コスト: ECONOMY.md 2章の表のとおり（発電所 500/2k/8k/20k/50k など）
- 基地は1人1つ。作成時に名前と地形を指定。名前変更は無料、地形変更は 5,000pt
- 地形の値域は既存の戦闘地形に合わせる（`defense_battles.terrain` や tournament の fieldTerrain が 1〜5 を使っている。同じコード体系を使うこと）

## DB（PM-2 と同じ運用: baseline直接編集 + tools/pXX + preflight登録）

```sql
CREATE TABLE user_bases (
  user_id VARCHAR(255) PRIMARY KEY,
  name TEXT NOT NULL,
  terrain INTEGER NOT NULL DEFAULT 1,
  power_last_collected_at INTEGER NOT NULL DEFAULT 0,  -- unix秒。cooldown.ts と同じ Math.floor(Date.now()/1000) 方式
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE user_facilities (
  user_id VARCHAR(255) NOT NULL,
  facility TEXT NOT NULL,          -- 'power' | 'dock' | 'turret' | 'museum' | 'factory'
  level INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, facility),
  FOREIGN KEY (user_id) REFERENCES characters(id) ON DELETE CASCADE
);
```

- `backend/migrations/0001_baseline.sql` に追記（既存スタイルに合わせ DROP TABLE IF EXISTS 付き）
- `backend/tools/p59_base_facilities.sql` を新規作成（CREATE TABLE IF NOT EXISTS のみ。バックフィル不要。
  コメントは p58 と同じ `--` 形式・同じ書式）
- `backend/scripts/preflight.mjs` の checks に2テーブル分（または1エントリでまとめて）追加

## バックエンド

1. **経済定数 `backend/src/utils/baseFacilities.ts`（新規）** — 施設ごとの Lv1〜5 効果値と強化コストの定数表、
   `getFacilityLevel(db, userId, facility)`, `getFactoryDiscountRate(db, userId)`, `getDockDiscountRate(db, userId)` 等のヘルパー
2. **ルート `backend/src/routes/base.ts`（新規）** — `backend/src/index.ts` に登録。既存ルートの認証パターン（JWT verify）に合わせる:
   - `GET /api/base` — 自分の基地＋施設一覧＋未収収入（pendingIncome = min(now - power_last_collected_at, 12h) × レート）。基地未作成なら `{ exists: false }`
   - `POST /api/base/create` — { name, terrain }。既に基地があれば 400
   - `POST /api/base/rename` — { name }
   - `POST /api/base/terrain` — { terrain }。5,000pt 消費（資金不足は 400）
   - `POST /api/base/collect` — 未収収入を money に加算し power_last_collected_at を now に更新。
     加算は `UPDATE characters SET money = money + ?` の相対更新にすること
   - `POST /api/base/facility/build` — { facility }。未建設→Lv1（建設コスト消費）
   - `POST /api/base/facility/upgrade` — { facility }。Lv5 が上限。コスト消費
   - 資金消費はすべて「現在値を読んでチェック→相対 UPDATE」とし、負残高にならないようにガード
3. **割引の配線**:
   - `backend/src/routes/factory.ts` の機体購入（buy_unit）: price に工場割引を適用
   - `backend/src/routes/factory.ts` の修理（current_hp = -1 にしている有償修理箇所）: 修理費 kcost に修理ドック割引を適用
   - 割引適用時のレスポンスメッセージに割引が効いたことが分かる文言を入れる（任意だが望ましい）

## フロントエンド

1. **`frontend/src/pages/Base.tsx` ＋ `Base.css`（新規）** — mock-base.html のレイアウトを React で再現:
   - 基地ヘッダー（基地名・地形チップ・収入チップ・「収益を受け取る」ボタン）
   - 基地未作成時は作成フォーム（名前＋地形選択）を表示
   - 施設カード5種（Lv・効果・強化/建設ボタン→確認モーダル。既存 `frontend/src/components/Modal.tsx` を使う）
   - 博物館プレースホルダー区画（「PM-3で実装予定」）
   - 防衛ログサマリ行はダミー表示のまま（PM-5で接続）
   - 通貨表記は pt。API呼び出しの流儀・fetchヘルパは既存ページ（例: Hangar.tsx）に合わせる
2. **ルーティング**: `frontend/src/App.tsx` に `/base` を追加
3. **ナビ**: `frontend/src/components/nav.ts` に「基地」を追加（グループ構成を見て自然な位置に）

## 検証

- backend: `npm run typecheck` と `npm test -- --run`
- frontend: `npm run build`（frontend ディレクトリ。型エラー検出のため）
- 可能なら base.ts のユニットテストを既存テストの流儀で1ファイル追加（収入計算のキャップと施設コスト検証）

## 完了報告（標準出力へ）

- 変更・新規ファイル一覧と要旨
- typecheck / test / build の結果
- 仕様解釈で迷った点
