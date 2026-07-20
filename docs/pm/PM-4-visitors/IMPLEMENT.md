# PM-4 実装指示書: 見学者システム・見学者ノート

あなたはこのプロジェクトの実装担当です。同ディレクトリの `mock-visitors.html`（承認済みモック）と
`UX-NOTES.md`（**4章の承認済み決定事項が正**。2章の素案は4章の補正で一部上書き）を読み、
以下を実装してください。**プラン提示が必要ならプランのみ提示して停止してください。**

## 禁止事項（厳守）

- デプロイ操作、`--remote` を伴うDB操作、`git commit` / `git push`
- 足あと機能・NGワードフィルタ・非公開設定（すべてスコープ外と決定済み）
- スコープ外のリファクタリング

## DB（従来運用: baseline直接編集 + tools/p61 + preflight。コメントは p60 と同書式）

```sql
CREATE TABLE museum_guestbook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_user_id VARCHAR(255) NOT NULL,   -- 書き込まれた基地のオーナー
  author_user_id VARCHAR(255) NOT NULL,   -- 書き込んだユーザー（匿名不可）
  content TEXT NOT NULL,                  -- 最大140文字（サーバー側検証）
  is_deleted INTEGER NOT NULL DEFAULT 0,  -- 論理削除（館長 or 本人）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (target_user_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES characters(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_guestbook_target ON museum_guestbook (target_user_id, created_at DESC);
```

## バックエンド

1. **公開博物館API** — `backend/src/routes/museum.ts` に `GET /api/museum/user/:userId` を追加:
   - 既存 `GET /` の閲覧系ロジック（progress / museumLevel / slots / exhibits / featured。
     現所持チェック含む）を対象ユーザー向けに共通関数へ切り出して再利用。**ownedUnits（配置候補）は返さない**
   - 加えて基地情報を含める: `base: { name, terrain } | null`、`owner: { id, handle_name, chara_name }`
   - 認証必須（既存と同じ）。対象ユーザーが存在しなければ 404。博物館未建設でも 200 で `museumLevel: 0` を返す
2. **ゲストブックAPI** — `backend/src/routes/guestbook.ts`（新規、index.ts に `/api/guestbook` 登録）:
   - `GET /:targetUserId` — is_deleted=0 のみ、新しい順、`?limit=20&offset=0` ページング、
     author の handle_name を JOIN で付与
   - `POST /:targetUserId` — body `{ content }`。検証:
     content 必須・トリム後1〜140文字 / 対象ユーザー存在 / **対象の博物館が建設済み（museum施設Lv≥1）** /
     **レート制限: 同一 author→同一 target への直近投稿から1時間未満なら 429**（created_at 比較で実装）
   - `DELETE /:noteId` — 館長（target_user_id=自分）または投稿者本人（author_user_id=自分）のみ。
     `UPDATE museum_guestbook SET is_deleted = 1` の論理削除。他人は 403
   - 検証エラーは 400/403/404/429 を適切に使い分ける（success:false + message）
   - 文字数検証・レート制限判定は純関数に切り出してテスト可能にする

## フロントエンド

1. **Museum.tsx の見学モード拡張**:
   - ルート: `App.tsx` に `/museum/:userId` を追加（既存 `/museum` は自分用のまま）
   - userId パラメータがあり自分以外なら**見学モード**: 公開APIを叩き、
     モック準拠の「他プレイヤーの基地を見学中」Stickyバナー＋「自分の基地へ帰還」ボタンを表示。
     展示編集・殿堂設定などの編集UIは一切非表示。図鑑タブは相手の進捗サマリのみ（911機一覧は出さなくてよい）
   - 相手が博物館未建設の場合はモックの「🚧 まだ博物館を建設していません」表示
2. **見学者ノート区画**（自分の博物館・他人の博物館の両方に表示。PM-3 のプレースホルダーを置き換え）:
   - 一覧（投稿者名はプロフィール `/profile/:id` へのリンク・日時・本文）
   - 記帳フォーム（140字カウンタ。他人の基地でのみ表示。未建設なら非表示）
   - 削除ボタン（館長視点: 全投稿に表示 / 投稿者本人: 自分の投稿のみ）。確認は既存の confirm 系UIに合わせる
   - レート制限 429 時はメッセージをトースト等（既存 toast.ts の流儀）で表示
3. **導線**: `frontend/src/pages/Profile.tsx` に「基地を見学する」ボタンを追加（→ /museum/:userId）。
   モックの配置例に準拠しつつ既存プロフィールのレイアウトを尊重

## テスト・検証

- `backend/test/guestbook.test.ts`: content検証（空・141字・境界140字）とレート制限判定純関数の実テスト
  （プレースホルダーテスト禁止）
- backend: `npm run typecheck` / `npm test -- --run`、frontend: `npm run build`

## 完了報告（標準出力へ）

変更・新規ファイル一覧と要旨 / 検証結果 / 迷った点
