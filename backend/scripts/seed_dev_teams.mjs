// ============================================================
// 開発用シード（チーム戦）: dev only
// ------------------------------------------------------------
// seed_dev.sql（admin1 / user1..3）を投入した後に実行すると、
// チーム優勝戦・チーム個別戦闘をすぐ試せる状態にする:
//   - Aチーム: admin1 ＋ user2（メンバー）
//   - Bチーム: user1  ＋ user3（メンバー）
//   - チーム優勝者 = user1（Bチーム）→ admin1 が /api/champion/challenge/team で挑める
//   - チーム個別戦闘 = user1 所有（is_team=1）→ admin1 が挑める
//
// 実行（サーバー不要・ローカルD1ファイルへ直接書く。冪等）:
//   cd backend
//   node scripts/seed_dev_teams.mjs
//
// team_members.snapshot_data は本番 recruit（squad.ts）と同一＝getFullCharacter の
// 出力JSON。下の SELECT は battleEngine.ts:76 getFullCharacter の複製。
// ★getFullCharacter を変更したらこのクエリも同期すること（スナップショットは
//   本番でも点在的に古くなる設計なので、再実行で再生成すれば足りる）。
// ============================================================
import Database from 'better-sqlite3';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

// ローカル D1 の sqlite ファイルを探す（ハッシュ名）
const d1Dir = join(process.cwd(), '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
let dbFile;
try {
  dbFile = readdirSync(d1Dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
} catch (e) {
  console.error(`ローカルD1が見つかりません（${d1Dir}）。先に wrangler dev か baseline 適用を行ってください。`);
  process.exit(1);
}
if (!dbFile) { console.error('D1 sqlite ファイルが見つかりません。'); process.exit(1); }

const db = new Database(join(d1Dir, dbFile));

// battleEngine.ts:76 getFullCharacter の複製（★同期対象）
const GET_FULL_CHARACTER = `
  SELECT c.*,
         c.unit_custom_hp as unit_base_hp, c.unit_custom_en as unit_base_en,
         c.unit_custom_armor as armor, c.unit_custom_mobility as mobility, c.unit_custom_sensor as sensor,
         u.name as unit_name, u.tokusyu as unit_tokusyu, u.image as unit_image, u.unit_lv,
         CASE WHEN c.unit_custom_weight >= 0 THEN c.unit_custom_weight ELSE u.max_weight END as max_weight,
         u.req_nt_level,
         u.terrain_ground, u.terrain_water, u.terrain_space, u.terrain_air,
         w.name as weapon_name, w.power as weapon_power, w.en_cost as weapon_en_cost,
         w.ammo as weapon_ammo,
         w.range_min as weapon_range_min, w.range_max as weapon_range_max,
         w.range_short as w_range_short, w.range_mid as w_range_mid, w.range_long as w_range_long,
         w.hit_count as weapon_hit_count, w.raw_syurui as weapon_raw_syurui,
         w.raw_hani as weapon_raw_hani,
         w.special_flags as weapon_special_flags, w.item_type as weapon_item_type,
         w.tokusyu as weapon_tokusyu, w.weight as weapon_weight,
         i1.name as item1_name, i1.item_type as item1_type, i1.special_flags as item1_flags,
         i1.tokusyu as item1_tokusyu, i1.weight as item1_weight, i1.raw_syurui as item1_raw_syurui,
         i1.raw_hani as item1_raw_hani,
         i2.name as item2_name, i2.item_type as item2_type, i2.special_flags as item2_flags,
         i2.tokusyu as item2_tokusyu, i2.weight as item2_weight, i2.raw_hani as item2_raw_hani
  FROM characters c
  LEFT JOIN units u ON c.unit_id = u.id
  LEFT JOIN items w ON c.weapon_id = w.id
  LEFT JOIN items i1 ON c.item1_id = i1.id
  LEFT JOIN items i2 ON c.item2_id = i2.id
  WHERE c.id = ?
`;

// calcMaxHp/calcMaxEn（battleEngine.ts:30-36。保存値をそのまま最大値に＝P47でボーナス式廃止。既定 HP=100 / EN=50）
const calcMaxHp = (base) => base || 100;
const calcMaxEn = (base) => base || 50;

function getFullCharacter(id) {
  const chara = db.prepare(GET_FULL_CHARACTER).get(id);
  if (!chara) return null;
  chara.item1 = { name: chara.item1_name, item_type: chara.item1_type, special_flags: chara.item1_flags };
  chara.item2 = { name: chara.item2_name, item_type: chara.item2_type, special_flags: chara.item2_flags };
  chara.maxHp = calcMaxHp(chara.unit_base_hp);
  chara.maxEn = calcMaxEn(chara.unit_base_en);
  chara.hp = chara.current_hp !== null && chara.current_hp >= 0 ? chara.current_hp : null;
  chara.en = chara.current_en !== null && chara.current_en >= 0 ? chara.current_en : null;
  return chara;
}

// 編成: [オーナー, メンバー配列]
const TEAMS = [
  ['admin1', ['user2']],
  ['user1', ['user3']],
];

const recruit = db.prepare(
  `INSERT INTO team_members (owner_id, character_id, snapshot_data, team_kaisyo, kaisyo_cap) VALUES (?, ?, ?, 0, ?)`
);

const tx = db.transaction(() => {
  // 冪等: dev オーナーのチーム行と dev のチーム優勝者/チーム作戦を消してから作り直す
  for (const [owner] of TEAMS) {
    db.prepare(`DELETE FROM team_members WHERE owner_id = ?`).run(owner);
  }
  db.prepare(`DELETE FROM champions WHERE type = 'team' AND champion_id IN ('user1','admin1')`).run();
  db.prepare(`DELETE FROM defense_battles WHERE owner_id IN ('user1','admin1') AND is_team = 1`).run();

  let recruited = 0;
  for (const [owner, members] of TEAMS) {
    for (const memberId of members) {
      const m = getFullCharacter(memberId);
      if (!m) { console.warn(`  skip: ${memberId} が存在しません（seed_dev.sql 未適用？）`); continue; }
      recruit.run(owner, memberId, JSON.stringify(m), m.status_piloting || 0);
      recruited++;
      console.log(`  recruit ${owner} <- ${memberId}（kaisyo_cap=${m.status_piloting || 0}）`);
    }
  }

  // チーム優勝者 = user1（Bチーム）
  db.prepare(
    `INSERT INTO champions (type, champion_id, win_count, terrain, terrain_counter) VALUES ('team', 'user1', 1, 1, 10)`
  ).run();
  console.log('  team champion = user1');

  // チーム個別戦闘 = user1 所有
  db.prepare(
    `INSERT INTO defense_battles (owner_id, title, is_team, terrain, champion_id, win_count, last_challenge_at)
     VALUES ('user1', 'チーム戦テスト作戦', 1, 1, 'user1', 1, CURRENT_TIMESTAMP)`
  ).run();
  console.log('  team defense gate owner = user1');

  return recruited;
});

const n = tx();
db.close();
console.log(`\n完了: team_members ${n}件 ＋ チーム優勝者 ＋ チーム作戦を投入。`);
console.log('admin1 でログイン → 優勝戦 or 個別戦闘の「チーム戦」で user1 チームに挑めます。');
