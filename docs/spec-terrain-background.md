# 仕様: 戦闘画面の地形背景

> ## ⚠ この仕様書は古い。そのまま実装に使わないこと
>
> 初回に書いたもので、**「SVG で写実的な地形テクスチャを描く」という前提が既に崩れている**。
> 地上（草原）で2回試して2回とも失敗した（笹の葉／流星群）。
>
> 経緯・失敗の診断・方針の選択肢は **`docs/HANDOFF-terrain-background.md`** にある。
> 先にそちらを読み、方針を決めてからこの仕様書を書き直すこと。
>
> ただし以下は今も有効:
> - 地形IDの正（`Battle.tsx:7` の `TerrainMap`）
> - meta の生成箇所7つと、`BattleMeta.terrain` を optional にする理由
> - 変更してよいファイルのホワイトリストと禁止事項
> - 検証方法（特に `npx tsc --noEmit` を使わない件）

## 目的

戦闘アニメーションの背景が、どの地形で戦っていても同じ濃紺の塗り
（`rgba(15, 23, 42, 0.95)`）で、戦場の違いが伝わらない。
地形ごとの背景を出して、地上戦と宇宙戦が別物に見えるようにする。

## 前提として読むこと

実装前に必ず現物を読むこと。ここに書いていないことを推測で決めない。

- `frontend/src/components/BattleAnimation.tsx` / `.css` — 背景を敷く先
- `frontend/src/pages/Battle.tsx` の `TerrainMap` — 地形IDの正
- `backend/src/routes/battle.ts` / `champion.ts` / `defense.ts` / `tournament.ts` — meta の生成箇所

## 地形ID

`frontend/src/pages/Battle.tsx:7` に定義がある。これが唯一の正。

| ID | 名前 |
| --- | --- |
| 1 | 地上 |
| 2 | 水中 |
| 3 | 宇宙 |
| 4 | 空中 |
| 5 | 仮想空間 |

## 成果物

### 1. タイル可能な SVG パターン（5枚）

`frontend/public/images/terrain/` に置く。ファイル名は `ground.svg` / `water.svg` /
`space.svg` / `air.svg` / `virtual.svg`。

**必須要件: 継ぎ目なくタイルできること。** CSS の `background-repeat: repeat` で
敷き詰めたときに、タイルの境界が線として見えてはいけない。

- 図形がタイルの端をまたぐ場合、反対側の端にも同じ図形を同じ位置に置いて繋げる
  （端で図形を切りっぱなしにすると継ぎ目が出る）
- タイルは正方形。一辺は 128px か 256px を推奨（`viewBox="0 0 256 256"` 等）
- **ラスター画像（PNG/JPG/GIF）は使わない。** AI 生成画像は継ぎ目を消すのが難しく、
  容量も嵩む。SVG なら構造的に完全なシームレスにできる。
- 1枚あたり 8KB 以下に収めること
- 外部フォント・外部参照は使わない（CSP と R2 配信の都合。自己完結させる）

**各地形の方向性**（細部は任せる。ただし「暗い背景の上に敷く控えめな模様」であること）:

| 地形 | 方向性 |
| --- | --- |
| 地上 | 地表・岩肌・クレーター。土っぽい茶〜灰 |
| 水中 | 波紋・水泡・光の筋。青〜青緑 |
| 宇宙 | 星々・遠い星雲。ほぼ黒に白い点 |
| 空中 | 雲・気流の筋。青灰〜白 |
| 仮想空間 | ワイヤーフレームの格子。シアン系の線画 |

**背景であることを忘れないこと。** 前面には戦闘ログ・HPバー・機体画像が乗る。
主張が強いと文字が読めなくなる。彩度と明度を抑え、コントラストは前面側に譲ること。

### 2. 地形定数の共有モジュール

`TerrainMap` が `Battle.tsx` にローカル定義されていて、他から使えない。
`frontend/src/utils/terrain.ts` を新設して、そこを唯一の正にする。

- 地形ID → 名前
- 地形ID → SVG のファイル名
- `Battle.tsx` はローカル定義を消してこれを import する（表示文字列は変えない）

### 3. BattleAnimation で背景を出す

- `BattleMeta` に `terrain?: number` を追加する。**必ず任意（optional）にすること。**
  トーナメントの過去ログ（`tournament_matches` に JSON で保存済み）には地形が入っていない。
  必須にすると過去のリプレイが型で壊れる。
- `terrain` が未指定・範囲外・未知の値なら、**現行の見た目のまま**にする（背景を出さない）。
  ここで落ちたり、無地の別物になったりしてはいけない。
- 背景は `.battle-animation-overlay` に敷く。`background-repeat: repeat`。
- 既存の暗幕（`rgba(15, 23, 42, 0.95)`）は残し、その下にパターンを敷くか、
  パターンの上に暗幕を重ねること。**前面の文字の可読性を今より下げないこと。**
- アニメーション（流れる背景等）を付ける場合は `@media (prefers-reduced-motion: reduce)` で
  必ず止めること。付けなくてもよい。

### 4. サーバー側で meta に terrain を載せる

meta を組み立てている箇所は以下。**すべて自分で開いて確認すること。**

- `backend/src/routes/battle.ts:281`
- `backend/src/routes/battle.ts:369`
- `backend/src/routes/champion.ts:149`
- `backend/src/routes/champion.ts:198`
- `backend/src/routes/defense.ts:145`
- `backend/src/routes/defense.ts:194`
- `backend/src/routes/tournament.ts:436`

各箇所で、その文脈に**地形の値が実在する場合にだけ** `terrain` を meta に足す。

- **地形の出所が無い箇所で、値を捏造しない。** 既定値 1（地上）を勝手に入れる等は禁止。
  出所が無ければ `terrain` を載せず、下記の台帳に「対象外」と理由を書くこと。
- 既存の meta のキー名・値は変えない。`terrain` を足すだけ。

## 変更してよいファイル（ホワイトリスト）

これ以外は**一切触らないこと**。特に認証・登録・Google 連携まわりは完成済みで、
本番で検証済み。触ったら差し戻す。

```
frontend/public/images/terrain/*.svg        (新規)
frontend/src/utils/terrain.ts               (新規)
frontend/src/components/BattleAnimation.tsx
frontend/src/components/BattleAnimation.css
frontend/src/pages/Battle.tsx               (TerrainMap の import 差し替えのみ)
backend/src/routes/battle.ts                (meta に terrain を足すのみ)
backend/src/routes/champion.ts              (meta に terrain を足すのみ)
backend/src/routes/defense.ts               (meta に terrain を足すのみ)
backend/src/routes/tournament.ts            (meta に terrain を足すのみ)
backend/test/terrain.test.ts                (新規)
docs/terrain-background-ledger.md           (新規。下記)
```

**禁止事項:**

- `git commit` を実行しないこと。コミットはこちらでやる。
- 上記以外のファイルを変更・削除しないこと。
- `.dev.vars` / `wrangler.jsonc` / `migrations/` / `tools/` に触らないこと。
- デバッグ用の一時ファイル（`fix_*.ps1` / `test-err*.cjs` / `update_*.ps1` 等）を残さないこと。
  作ったら消すこと。

## テスト（必須。追加ゼロは差し戻し）

`backend/test/terrain.test.ts` を新設し、最低限以下を検証すること。

- meta に terrain を足した各ルートについて、地形の値が meta に載ること
- 地形の出所が無い箇所では meta に terrain が入らないこと（捏造していないことの担保）
- 既存の meta のキーが消えていないこと

フロント側は既存の型チェックで担保する（`BattleMeta.terrain` が optional であること）。

## 検証方法

以下を自分で実行して、通ることを確認してから完了を報告すること。

```bash
cd backend && npm test -- --run && npm run typecheck
cd ../frontend && npm run typecheck && npm run build
```

**`frontend` の型チェックに `npx tsc --noEmit` を使わないこと。**
`frontend/tsconfig.json` は `{"files": [], "references": [...]}` のソリューション構成で、
`-b` を付けないと src 配下を1ファイルも読まずに成功する（型エラーがあっても通る）。
必ず `npm run typecheck`（= `tsc -b`）を使うこと。

## 台帳（必須）

`docs/terrain-background-ledger.md` に以下を記録すること。

- 5つの SVG それぞれについて、タイルサイズと「どうやって継ぎ目を消したか」
- meta に terrain を足した箇所と、**足さなかった箇所とその理由**（地形の出所が無い等）
- 仕様どおりにできなかったこと、判断に迷って決めたこと

「できました」だけの報告はしないこと。**やっていないことを「やった」と書かないこと。**
