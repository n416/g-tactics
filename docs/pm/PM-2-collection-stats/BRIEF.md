# PM-2 ブリーフ: コレクション統計基盤のデータ設計書作成依頼

あなたはこのプロジェクトのPM兼テックリードです。以下の要件と現状を読み、
**データ設計書（DESIGN.md 相当のMarkdown）を標準出力に出力してください。**
ファイル書き込みは不要です。コードの実装もまだ行わないでください。設計書のみが成果物です。

## プロダクト背景

G-Tactics はブラウザ機体育成×対戦ゲーム。React/TS フロント + Hono (Cloudflare Workers) + D1 (SQLite)。
今後「基地・機体博物館」機能を作る。博物館では機体ごとに以下を展示する:

- 入手回数（その機体を何回入手したか。売却後に買い直しても加算）
- 初入手日
- 総撃墜数（その機体に搭乗して勝った戦闘数）
- 最高連勝数（その機体での連勝記録）
- 収蔵図鑑進捗（全 units 約900機のうち何機を一度でも入手したか）

これらは**現在いっさい記録されていない**。本スレッドの目的は、この統計を記録する
基盤（テーブル＋既存処理へのフック）を設計することである。UIは別スレッドで作る。

## 現行スキーマ（抜粋・backend/migrations/0001_baseline.sql）

- `units(id, name, image, unit_lv, price, ...)` — 機体マスタ約900行
- `hangars(id, user_id, unit_id, custom_*, created_at)` — 所持機体（現在搭乗していない機体の格納庫）
- `characters(id, unit_id, money, total_battles, win_battles, ...)` — プレイヤー。unit_id が現在搭乗機
- `battle_logs(id, attacker_id, defender_id, is_attacker_win, events_json, meta_json, battle_type, defense_battle_id, created_at)` — 戦闘ログ
- `defense_battles(...)` — 防衛戦の作戦定義（既存）

## 機体入手のフック候補（調査済み・全箇所）

1. `backend/src/routes/factory.ts:141` — ショップ購入 `INSERT INTO hangars`
2. `backend/src/routes/auth.ts:200` — 新規登録時の初期機体付与
3. `backend/src/routes/trade.ts:32, 247, 283` — トレード（落札・即決購入・受取）での hangars INSERT
4. `backend/src/routes/factory.ts:116` — 搭乗機の乗り換え（characters.unit_id 書き換え。hangars を経由しないケースがあるか要確認ポイントとして設計書に明記）
5. `backend/src/routes/faction_unit.ts:98` — 派閥機体の搭乗（これを「入手」と数えるかは論点。数えない推奨で理由を書くこと）

## 戦闘結果のフック候補（調査済み）

1. `backend/src/utils/battleRewards.ts:399` 付近 — 通常戦闘の戦績更新（attacker/defender 両方。attacker オブジェクトは搭乗機情報を持つ）
2. `backend/src/routes/tournament.ts:435` — 大会の勝敗確定
3. 防衛戦は battleRewards 経由か個別処理か、設計書では「実装時に要確認」と明記すればよい

## 設計書に必ず含める項目

1. **テーブル設計** — DDL付き。(user, unit) 単位の統計テーブルを想定しているが、代替案があれば比較して推奨案を示す。連勝の現在値と最高値の持ち方も含める
2. **各フック地点での更新ロジック** — どのファイルのどの処理にどんな UPDATE/INSERT を入れるか（擬似コードでよい）
3. **撃墜・連勝の帰属ルール** — 「勝利=搭乗機に撃墜+1」でよいか、引き分け・NPC戦・チーム戦・大会戦の扱い
4. **既存データのバックフィル** — battle_logs / hangars から過去分を復元できる範囲とできない範囲
5. **図鑑進捗のクエリ設計** — 「34 / 911 機」を出すクエリ
6. **将来の博物館UIが必要とするAPI形状の素案**（エンドポイント一覧レベルでよい）
7. **論点・リスク一覧** — D1(SQLite)での同時更新、マイグレーション運用（現在 0001_baseline.sql に squash されている点に注意）

日本語で、開発者がそのまま実装に入れる粒度で書いてください。
