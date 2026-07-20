# PM-6 実装指示書: 基地戦

あなたはこのプロジェクトの実装担当です。同ディレクトリの `CONCEPT.md`（**7章の承認済み決定事項が正**）と
`mock-basebattle.html`（承認済みモック）を読み、以下を実装してください。
**プラン提示が必要ならプランのみ提示して停止してください。**

## 禁止事項

- デプロイ、`--remote` DB操作、`git commit/push`
- 見学ページ（/museum/:userId）への襲撃導線の追加（プロフィールのみと決定済み）
- スコープ外リファクタリング

## 1. DB（従来運用: baseline直接編集 + tools/p62 + preflight）

- `user_bases` に `shield_until INTEGER NOT NULL DEFAULT 0` を追加（unix秒。power_last_collected_at と同形式）
- baseline の CREATE TABLE を更新し、`tools/p62_base_battle_shield.sql` は
  `ALTER TABLE user_bases ADD COLUMN shield_until ...` の非破壊追随（p57 のADD COLUMN方式・`--`コメント様式）
- preflight に列存在チェックを追加
- 24h再襲撃制限・履歴は新テーブルを作らず `battle_logs`（battle_type='base'）への問い合わせで実現する

## 2. バックエンド: 襲撃API

`backend/src/routes/base.ts` に追加（または `basebattle.ts` 新設して index.ts 登録。どちらでも可）:

### `GET /api/base/user/:userId` — 襲撃対象の公開情報
- 認証必須。{ base: {name, terrain}, owner: {id, handle_name}, facilities（レベルのみ）, shieldRemainingSec, canAttack, reason } を返す
- canAttack=false の reason: シールド中 / 自分自身 / 24h以内に自分が襲撃済み / 相手が基地未作成

### `POST /api/base/attack/:userId` — 基地戦の実行
処理順（既存 defense.ts の challenge 実装の流儀に合わせる）:
1. ガード: 自分自身 400 / 対象基地なし 404 / シールド中 400（残り時間をmessageに） /
   同一攻撃者→同一対象の battle_type='base' ログが過去24hにあれば 400 /
   既存の戦闘クールダウン（checkBattleCooldown / touchBattleTime）
2. 防衛側 = 基地オーナーの現キャラ＋搭乗機（getFullCharacter。非同期戦）
3. **砲台迎撃（Turn 0）**: 防衛側の turret レベルで getTurretIntercept。攻撃側HPを削る（最低1残す）。
   ログ行とイベントは PM-5 で defense.ts に実装した形式をそのまま流用
4. 本戦: `simulateBattleRound(attacker, defender, 1, 0, undefined, undefined, base.terrain)`（**基地の地形**で戦う）
5. 決着処理:
   - **攻撃側勝利**: 防衛側の pendingIncome を calcPendingIncome で算出し、
     loot = floor(pending × 0.3)。**防衛側 money += (pending - loot)、攻撃側 money += loot、
     power_last_collected_at = now**（強制精算方式。7章参照）。
     loot が 0 の場合は攻撃側に 20pt をシステム支給（防衛側からは引かない）。攻撃側に名声+1
   - **防衛側勝利**: 防衛側 money +10pt・名声+1。略奪なし
   - 勝敗問わず `shield_until = now + 8*3600`
   - HP/EN の永続化・recordUnitBattleResult（両者）・battle_logs 保存
     （battle_type='base'、events/meta。meta に loot 額と地形を含める）は既存実装の流儀に従う
6. レスポンス: { success, win, loot, battleLogId, message }

## 3. 個別戦からの砲台撤去

- `backend/src/routes/defense.ts` の砲台迎撃ブロック（PM-5で追加した Turn 0 処理）を**削除**
- `backend/test/defense.test.ts` の砲台テスト2件は削除し、同等の検証を基地戦テストに移す
- `frontend/src/pages/Base.tsx` の砲台説明「個別戦の防衛時、開幕に迎撃射撃を行う。」→
  「**基地戦**の防衛時、開幕に迎撃射撃を行う。」

## 4. フロントエンド

1. **プロフィール（Profile.tsx）**: 「基地を襲撃する」ボタンを追加（自分のプロフィールには出さない）。
   押下で `GET /api/base/user/:userId` を呼び、モック②準拠の襲撃確認モーダル
   （基地名・施設Lv・砲台警告・シールド中は理由表示で攻撃不可）を表示 →「襲撃する」で attack API 実行
2. **戦闘の閲覧**: attack 成功後は `navigate('/replay/' + battleLogId)` で既存リプレイページに遷移して
   戦闘を再生（当事者なので閲覧可）。遷移前に略奪結果のトースト（+Npt 略奪！等）を表示
3. **基地ページ（Base.tsx）**: モック①準拠の「基地戦サマリ」区画を個別戦サマリと並べて追加:
   - 過去24hの被襲撃件数・防衛成否・被害総額（battle_type='base' で defender=自分。
     `GET /api/base` の defenseSummary と同様に baseBattleSummary をAPIに追加）
   - シールド中は残り時間を表示（分単位でよい）
4. 通貨表記は pt。トークンや fetch の流儀は既存ページに合わせる

## 5. テスト（プレースホルダー禁止。既存の D1Mock + app.request パターン）

`backend/test/basebattle.test.ts`（新規）:
- 自分自身への攻撃 400 / シールド中 400 / 24h以内の再襲撃 400
- 略奪計算: 防衛側の power_last_collected_at を2時間前に設定（発電所Lv1=10pt蓄積）→
  攻撃側勝利時に攻撃側 +3pt・防衛側 +7pt・last_collected リセット・shield_until 設定を検証
  （勝敗を確定させるため、攻撃側を圧倒的ステータスにする等、既存テストの手法で制御する）
- loot 0 時の 20pt ボーナス
- 砲台 Lv1 ありで battle_logs の log_text に『Turn 0』が含まれる / 砲台なしで含まれない
- defense.test.ts から砲台テストが撤去されていること（個別戦に Turn 0 が出ない検証を1本残す）

## 6. 検証

- backend `npm run typecheck` / `npm test -- --run`、frontend `npm run build`
- p62 をローカルD1に `--local` 適用

## 完了報告

変更・新規ファイル一覧と要旨 / テスト・ビルド結果 / 迷った点
