# QA ブリーフ: 新設エンドポイントの統合テスト追加

あなたはこのプロジェクトのQA担当です。PM-1〜PM-5 で追加した新エンドポイント群に、
**既存の書式に沿ったエンドポイント統合テスト**を追加してください。
グローバルルールに従いプラン提示が必要ならプランのみ提示して停止すること。

## 必ず既存パターンに従うこと

`backend/test/factory.test.ts` や `backend/test/defense.test.ts` を精読し、同じ流儀で書く:
- `D1Mock`（backend/test/d1-mock.ts）＋ `applySchema`（backend/test/test-utils.ts。baseline を適用するので
  user_bases / user_facilities / user_unit_stats / museum_settings / museum_exhibits / museum_guestbook は既に作られる）
- `app.request(path, opts, env)` 方式（`import app from '../src/index'`）
- JWT は `sign({ id }, env.JWT_SECRET)`
- テストデータは beforeAll で characters / units 等を直接 INSERT

既存の `base.test.ts` / `museum.test.ts` / `guestbook.test.ts` / `replay.test.ts` の純関数テストは
**残したまま**、同ファイルに describe を追加するか、内容に応じて整理してよい。

## カバーすべきケース（最低限）

### /api/base（base.test.ts に追加）
1. 基地未作成の GET → `exists: false`
2. create: terrain=9 が 400 / terrain=3 が成功 / 二重作成 400
3. rename 成功
4. collect: `power_last_collected_at` を直接 UPDATE で2時間前に書き換え → 発電所Lv1で +10pt（5pt/時×2h）、
   直後の再 collect は 400。48時間前に書き換えた場合は12時間キャップで +60pt
5. facility/build: 資金不足 400 / 成功で money 減算 / 二重建設 400
6. facility/upgrade: Lv5 での強化 400（レベル上限）
7. defenseSummary: battle_logs に battle_type='gate' defender_id=自分 の行を INSERT して
   recentCount / winCount / latestHasReplay が正しく集計される

### /api/museum（museum.test.ts に追加）
1. 博物館未建設 GET → museumLevel 0
2. 建設後 GET → slots 4。ownedUnits に「収蔵済み＋現所持」機体のみ
3. exhibit: 範囲外 slot 400 / 未所持機体 400 / 配置成功 / 別スロットへの再配置で旧スロットが空く（移動）
4. **所持チェックの表示時適用**: 展示後に hangars の行を DELETE（売却相当）→ GET で該当スロットが unit: null
5. featured: 101文字コメント 400 / 成功
6. collection: 未収蔵機体の name が '？？？'・image null、収蔵済みは実名
7. `GET /api/museum/user/:userId`: 他人から見て 200・owner/base を含む・**ownedUnits を含まない**・存在しないユーザー 404

### /api/guestbook（guestbook.test.ts に追加）
1. 対象の博物館未建設 → 記帳 403
2. 建設後: 記帳成功 / 141文字 400 / 直後の連投 429
3. GET: author_handle_name 付きで返る
4. DELETE: 第三者 403 / 館長成功 / 投稿者本人成功（別行で）/ 削除後の GET に出ない（論理削除）

### /api/replay（replay.test.ts に追加）
1. battle_logs を直接 INSERT（events_json あり/なしの2行）
2. attacker 本人 200 / defender 本人 200 / 第三者 403 / events_json なし 404 / 存在しないID 404

### 砲台迎撃（defense.test.ts に追加。既存テストの流儀を踏襲）
1. 防衛側（champion）に user_facilities で turret Lv1 を付与して challenge を実行 →
   レスポンスまたは保存された battle_logs.log_text に『Turn 0』の迎撃行が含まれる
2. turret 無しの challenge では『Turn 0』が含まれない

## 検証

- `npm run typecheck` と `npm test -- --run` を backend で実行し全パスを確認
- 既存テストを壊さないこと（アサーションの書き換え禁止。壊れた場合は自分の追加分を直す）

## 完了報告（標準出力へ）

追加した describe/テスト数の一覧、実行結果、実装の不具合を発見した場合はその内容
（テストを通すための実装改変は、明白なバグ修正のみ可。仕様変更は報告して指示を待つ）
