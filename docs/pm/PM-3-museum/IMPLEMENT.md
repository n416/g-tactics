# PM-3 実装指示書: 機体博物館

あなたはこのプロジェクトの実装担当です。同ディレクトリの `mock-museum.html`（承認済みモック）と
`UX-NOTES.md`（**5章の承認済み決定事項が正**。1〜4章の提案は5章の決定で一部上書き）を読み、
以下を実装してください。**プラン提示や確認は不要、直ちに実装を開始してください。**

## 禁止事項（厳守）

- デプロイ操作、`--remote` を伴うDB操作、`git commit` / `git push`
- スコープ外のリファクタリング
- 見学者ノート（PM-4）と他ユーザーの博物館閲覧（PM-4）、防衛リプレイ（PM-5）は実装しない
  （ただし将来 userId 指定で他人の博物館を読める construct にしやすい作りは意識してよい）

## 確定仕様（UX-NOTES 5章）

- 専用ページ `/museum`。基地ページの博物館施設パネル＋プレースホルダー区画から遷移
- 展示は機体種（unit_id）単位・**現所持のみ**:
  - 配置時: unit_id が「hangars に行がある or characters.unit_id と一致」かつ user_unit_stats.obtained_count > 0 を検証
  - 表示時: 展示行があっても現所持でなければ「空き」として返す（売却フックは作らない）
- 殿堂機体も現所持のみ。館長コメント最大100文字（サーバー側でも検証）
- 展示枠数: 博物館Lv1〜5 = 4/8/12/18/24。未建設(Lv0)は0枠
- 図鑑（コレクション一覧）は obtained_count > 0 を「収蔵」とする（所持と無関係）。
  未収蔵機体は名前を伏せて「？？？」表示（モック準拠）

## DB（従来と同じ運用: baseline直接編集 + tools/p60 + preflight）

```sql
CREATE TABLE museum_settings (
  user_id VARCHAR(255) PRIMARY KEY,
  featured_unit_id INTEGER DEFAULT 0,      -- 0 = 未設定
  curator_comment TEXT DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE museum_exhibits (
  user_id VARCHAR(255) NOT NULL,
  slot_index INTEGER NOT NULL,             -- 1〜24
  unit_id INTEGER NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, slot_index),
  FOREIGN KEY (user_id) REFERENCES characters(id) ON DELETE CASCADE
);
```

- `backend/tools/p60_museum.sql`（`--` コメント・p59 と同書式・CREATE TABLE IF NOT EXISTS のみ）
- `backend/scripts/preflight.mjs` に存在チェック追加

## バックエンド

1. `backend/src/utils/baseFacilities.ts` に `MUSEUM_SLOTS = [0, 4, 8, 12, 18, 24]` と
   `getMuseumSlots(level)` を追加
2. `backend/src/routes/museum.ts`（新規、index.ts に `/api/museum` で登録。認証は base.ts と同様）:
   - `GET /api/museum` — { progress: {collected, total}, museumLevel, slots, exhibits: [{slot_index, unit: {...stats付き} | null}], featured: { unit, stats, comment } | null, ownedUnits: 配置候補（現所持∧収蔵済み、unit名・画像・統計付き） }
     - 展示・殿堂の現所持チェックはこの GET 内で行う
   - `GET /api/museum/collection` — 図鑑一覧。全 units に user_unit_stats を LEFT JOIN し、
     { unit_id, name(未収蔵は伏せる), image(未収蔵は null), unit_lv, obtained_count, first_obtained_at, total_kills, max_win_streak, is_collected } を返す
     （911行を1レスポンスで返してよい。重くなる場合の対策は実装コメントに TODO として残す）
   - `POST /api/museum/exhibit` — { slot_index, unit_id }。unit_id: null または 0 で「外す」。
     slot_index は 1〜現Lvの枠数のみ許可。配置検証は確定仕様どおり
   - `POST /api/museum/featured` — { unit_id, comment }。検証は確定仕様どおり
3. 純関数テスト: `backend/test/museum.test.ts` — getMuseumSlots の表値、
   コメント長検証・slot範囲検証を純関数に切り出してテスト（プレースホルダーテスト禁止。
   D1が必要なものは無理にテストしなくてよい）

## フロントエンド

1. `frontend/src/pages/Museum.tsx` ＋ `Museum.css`（新規） — mock-museum.html 準拠:
   - ホール（進捗バー・殿堂・展示グリッド。空き枠/ロック枠の区別。枠数は API の slots に従う）
   - 展示編集モード（収蔵リストから選択→枠クリックで配置、外す、保存）
   - 殿堂・コメント編集（機体選択＋テキストエリア100文字カウンタ）
   - 図鑑ビュー（フィルタ: すべて/収蔵済み/未収蔵、ソート: 図鑑番号/入手回数/総撃墜。クライアントサイドで処理）
   - 機体画像は既存 `UnitImage.tsx` の使い方に合わせる。未収蔵は「？」表示
   - 博物館未建設（Lv0）の場合は「基地で博物館を建設してください」と基地への導線を表示
2. ルーティング: `App.tsx` に `/museum` 追加
3. `frontend/src/pages/Base.tsx` の博物館プレースホルダー区画を `/museum` への導線に差し替え、
   施設カード「博物館」からも遷移できるようにする。展示枠数の表示は 4/8/12/18/24 に一致させる
4. ナビ: `nav.ts` の「拠点」グループに「博物館」を追加

## 検証

- backend: `npm run typecheck` / `npm test -- --run`
- frontend: `npm run build`

## 完了報告（標準出力へ）

変更・新規ファイル一覧と要旨 / 検証結果 / 仕様解釈で迷った点
