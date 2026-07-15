// ==========================================
// P47-B1: battleEngine はアダプタ層
// 戦闘の計算本体は battleLogic.ts（battlelib.pl/dmg_calc.pl の1:1移植）。
// 本ファイルは「DBからキャラを読む・戦闘前の装備/特殊の適用・battleLogic への変換・
// イベント整形・戦闘後 tokusyu」だけを担う。
// ==========================================

import { parseTraits } from './traits';
import { applyCostDiscount } from './traitEffects';
import { supportHealBonus } from './traitEffects';
import { tacticTraitLv } from './traitEffects';
import { battleLogic, flagsFromTokusyu, emptyFlags } from './battleLogic';
import type { LFighter, LWeapon, LSupport, LTurnEvent } from './battleLogic';
import { TOKUSYU_REGISTRY, hasPostBattleEffect, hasSupportTokusyu, supportHealAmmo } from './tokusyuEffects';

export function getDistanceName(d: number) {
  if (d < 0) d = 0;
  if (d <= 33) return '近距離';
  if (d <= 66) return '中距離';
  return '遠距離';
}

export function getHani(d: number) {
  if (d <= 33) return 1;
  if (d <= 66) return 2;
  return 3;
}

// 最大耐久・最大EN = 保存値そのまま（原作 $maxtai/$maxen。仕様§2-1 ユーザー決定）
// 旧「＋操縦×10／＋操縦×2」のリメイク創作式は廃止。第2引数は互換のため残すが未使用。
export function calcMaxHp(baseHp: number | null, _piloting?: number) {
  return baseHp || 100;
}

export function calcMaxEn(baseEn: number | null, _piloting?: number) {
  return baseEn || 50;
}

// ==========================================
// 個人戦術（battlelib.pl:57-68, 786-808）
// resolveTactics/calcTacticCoeffs は battleLogic 内に同式があるが、
// チーム戦の事前計算・テストから参照されるため公開を維持する。
// P47: teamCo（団体戦術補正）はここでは扱わない（battleLogic の atkSen/defSen スロットへ。台帳§15）
// ==========================================
export function resolveTactics(f: any) {
  if (f.senIdo !== undefined) return;
  const t = String(f.tactics ?? '00').padStart(2, '0');
  let ido = parseInt(t[0], 10) || 0;
  let atk = parseInt(t[1], 10) || 0;
  if (ido === 8) ido = Math.min(3, Math.floor(Math.random() * 3) + 1);
  if (atk === 8) atk = Math.min(7, Math.floor(Math.random() * 4) + 4);
  f.senIdo = (ido >= 1 && ido <= 3) ? ido : 0;
  f.senAtk = (atk >= 4 && atk <= 7) ? atk : 0;
}

export function calcTacticCoeffs(f: any, opp: any) {
  let atkup = 1, kaiup = 1, dmgUp = 1, defUp = 1;
  const traits = f.parsedTraits || {};
  if (!f.senAtk && opp.senAtk) { atkup *= 0.4; kaiup *= 0.4; }
  if (f.senIdo === 1) { atkup *= 0.8; kaiup *= 1.2; dmgUp *= 0.8; defUp *= 0.8; }
  if (f.senIdo === 3) { atkup *= 1.2; kaiup *= 0.8; dmgUp *= 1.2; defUp *= 1.2; }
  const l = tacticTraitLv(traits, f.senAtk) / 25;
  if (f.senAtk === 4) { atkup *= 1.1 + l; kaiup *= 0.8 + l; dmgUp *= 1.3 + l; defUp *= 0.8 + l; }
  if (f.senAtk === 5) { atkup *= 0.9 + l; kaiup *= 1.3 + l; dmgUp *= 0.8 + l; defUp *= 1.4 + l; }
  if (f.senAtk === 6) { atkup *= 1.3 + l; kaiup *= 1.2 + l; dmgUp *= 0.9 + l; defUp *= 0.8 + l; }
  if (f.senAtk === 7) { atkup *= 1 + l; kaiup *= 1 + l; dmgUp *= 1 + l; defUp *= 1 + l; }
  if ((f.senAtk === 4 && opp.senAtk === 5) || (f.senAtk === 5 && opp.senAtk === 6) ||
      (f.senAtk === 6 && opp.senAtk === 7) || (f.senAtk === 7 && opp.senAtk === 4)) {
    atkup *= 0.4; kaiup *= 0.4; defUp *= 0.5;
  }
  return { atkup, kaiup, dmgUp, defUp };
}

// 戦闘用のフルキャラクター取得。
// P47: 武器の連続射程(range_min/max)・攻撃回数(hit_count)・種別(raw_syurui)を追加取得
export const getFullCharacter = async (db: any, id: string) => {
  const chara = await db.prepare(`
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
  `).bind(id).first()
  if (chara) {
    chara.item1 = { name: chara.item1_name, item_type: chara.item1_type, special_flags: chara.item1_flags };
    chara.item2 = { name: chara.item2_name, item_type: chara.item2_type, special_flags: chara.item2_flags };
    chara.maxHp = calcMaxHp(chara.unit_base_hp);
    chara.maxEn = calcMaxEn(chara.unit_base_en);
    chara.hp = chara.current_hp !== null && chara.current_hp >= 0 ? chara.current_hp : null;
    chara.en = chara.current_en !== null && chara.current_en >= 0 ? chara.current_en : null;
  }
  return chara
};

// ==========================================
// 特性・スキル・コメントのパース
// ==========================================
export function parseTraitsAndSkills(fighter: any) {
  fighter.parsedTraits = parseTraits(fighter.traits);

  let skills: Record<string, any> = {};
  try {
    skills = JSON.parse(fighter.skills || '{}');
  } catch (e) {}
  fighter.parsedSkills = skills;

  let comments: Record<string, any> = {};
  try {
    comments = JSON.parse(fighter.battle_comments || '{}');
  } catch (e) {}
  fighter.parsedComments = comments;

  fighter.charLevel = fighter.level || 1;
}

export function fireBattleComment(fighter: any, trigger: string): string | null {
  if (fighter.parsedComments && fighter.parsedComments[trigger]) {
    return `『【${fighter.handle_name}】「${fighter.parsedComments[trigger]}」』`;
  }
  return null;
}

export function parseTokusyu(tokusyuStr: string | number | null | undefined): (number | string)[] {
  if (!tokusyuStr) return [];
  return String(tokusyuStr).split('##').filter(s => s).map(s => {
    const num = parseInt(s, 10);
    return isNaN(num) ? s : num;
  });
}

// ==========================================
// アイテム tokusyu の合流とステータス修正（P27 / dmg_calc.pl 準拠）
// P47追加: 盾の枚数(shieldCount)と盾名(shieldName)を集計（dmg_calc:92-115 の $shield/$shieldname）
// ==========================================
export function applyEquipmentTokusyu(fighter: any) {
  if (fighter.tokusyuApplied) return;
  fighter.tokusyuApplied = true;

  const merged: (number | string)[] = parseTokusyu(fighter.unit_tokusyu);

  let ntmem = false;
  fighter.shieldCount = 0;
  fighter.shieldName = '';
  const itemDefs = [
    { t: fighter.weapon_tokusyu, name: fighter.weapon_name },
    { t: fighter.item1_tokusyu, name: fighter.item1_name },
    { t: fighter.item2_tokusyu, name: fighter.item2_name },
  ];
  for (const def of itemDefs) {
    for (const t of parseTokusyu(def.t)) {
      if (typeof t !== 'number') continue;
      if (t === 1) {
        // シールド: 装甲+4 運動-10・枚数集計（dmg_calc:99-106）
        fighter.armor = (fighter.armor || 0) + 4;
        fighter.mobility = (fighter.mobility || 0) - 10;
        fighter.hasShieldEquip = true;
        fighter.shieldCount = (fighter.shieldCount || 0) + 1;
        fighter.shieldName = def.name || '盾';
      }
      if (t === 24) ntmem = true;
      merged.push(-t);
    }
  }

  const nt = fighter.nt_level || 0;
  const maxEn0 = calcMaxEn(fighter.unit_base_en);

  // ステータス修正は tokusyuEffects の statMods 面が唯一の正。ここは merged 順に投影するだけ。
  for (const t of merged) {
    if (typeof t !== 'number') continue;
    TOKUSYU_REGISTRY[t]?.statMods?.({ fighter, nt, ntmem, maxEn0 });
  }

  const unitNt = fighter.req_nt_level || 0;
  if (nt !== 0 && ((unitNt > 0 && nt > 0) || (unitNt < 0 && nt < 0))) {
    fighter.sensor = Math.floor((fighter.sensor || 0) * (1 + Math.abs(nt) / 40));
  }

  const totalWeight = (fighter.weapon_weight || 0) + (fighter.item1_weight || 0) + (fighter.item2_weight || 0);
  const maxWeight = fighter.max_weight || 0;
  if (maxWeight > 0 && totalWeight > maxWeight) {
    fighter.mobility = (fighter.mobility || 0) - (totalWeight - maxWeight) * 10;
  }

  if ((fighter.mobility || 0) < 0) fighter.mobility = 0;

  fighter.maxEn = calcMaxEn(fighter.unit_base_en);
  fighter.unit_tokusyu = merged.join('##');
}

// ==========================================
// 脱出装置（tokusyu >= 100。battlelib.pl:1104-1126）
// 脱出先テーブルは創作値のままFIX（ユーザー決定・仕様§2）
// ==========================================
const ESCAPE_UNITS: Record<number, { hp: number, name: string }> = {
  100: { hp: 150, name: 'コア・ファイター' },
  101: { hp: 180, name: 'コア・ファイターII' },
  102: { hp: 200, name: 'コア・ファイターII Fb' },
  103: { hp: 300, name: 'ジオング・ヘッド' },
  104: { hp: 250, name: 'ネオバード形態' },
  105: { hp: 150, name: 'コア・ポッド' },
  106: { hp: 250, name: 'ウェイブライダー' },
  107: { hp: 150, name: 'マゼラ・トップ' },
  108: { hp: 250, name: 'Ｇフライヤー' },
  109: { hp: 200, name: 'コア・ファイター(ZZ)' },
  110: { hp: 200, name: 'コア・ファイター(V2)' },
  111: { hp: 150, name: 'コアランダー' },
  112: { hp: 250, name: '搭載モビルスーツ' },
  113: { hp: 500, name: 'ステイメン' },
  114: { hp: 350, name: 'リ・ガズィ' },
  115: { hp: 300, name: 'Ｇファイター' },
  116: { hp: 250, name: '脱出ブロック' },
  117: { hp: 150, name: 'コアランダー(シャイニング)' },
  118: { hp: 150, name: 'コアランダー(ノーベル)' },
  119: { hp: 150, name: 'コアランダー(マスター)' },
  120: { hp: 100, name: '脱出ポッド(ガンガル)' },
  122: { hp: 200, name: 'コムサイ' },
  123: { hp: 220, name: 'コムサイ(後期型)' },
  124: { hp: 250, name: 'コムサイII' },
  125: { hp: 150, name: '脱出艇' },
  127: { hp: 180, name: 'コア・ファイター(キャスバル)' },
  128: { hp: 400, name: 'デビルガンダム(コア)' },
  129: { hp: 290, name: 'グフ・カスタム' },
  130: { hp: 300, name: 'ガンダム' },
  131: { hp: 150, name: '脱出ポッド' },
  132: { hp: 150, name: '脱出ポッド' },
  133: { hp: 300, name: '搭載モビルスーツ' },
  134: { hp: 250, name: 'コア・ブースター' },
  137: { hp: 300, name: 'Ｇクルーザー' },
  138: { hp: 350, name: '風雲再起(単独)' },
  139: { hp: 150, name: 'ランチ' },
  140: { hp: 150, name: 'ランチ' },
  141: { hp: 300, name: 'ガンダム' },
  142: { hp: 180, name: 'コア・ファイター(X1)' },
  143: { hp: 180, name: 'コア・ファイター(X2)' },
  144: { hp: 180, name: 'コア・ファイター(X3)' },
  148: { hp: 250, name: 'グフ' },
  151: { hp: 200, name: 'コア・ファイター(∀)' },
  156: { hp: 150, name: 'コア・ブロック' },
  157: { hp: 150, name: 'コアランダー(クーロン)' }
};

export function getEscapeUnit(tokusyuList: (number | string)[], unitName: string): { hp: number, name: string } | null {
  for (const t of tokusyuList) {
    if (typeof t !== 'number' || t < 100) continue;
    let esc = ESCAPE_UNITS[t];
    if (!esc) continue;
    if (t === 100) {
      const uName = unitName || '';
      if (uName.includes('キュベレイ') || uName.includes('ジ・Ｏ') || uName.includes('サザビー') || uName.includes('リック・ディアス') || uName.includes('ハンブラビ') || uName.includes('トールギス') || uName.includes('百式改') || uName.includes('ヴァサーゴ') || uName.includes('ライノサラス') || uName.includes('シャイターン') || uName.includes('バンデット')) {
        esc = { hp: 150, name: '脱出ポッド' };
      } else if (uName.includes('ザンジバル') || uName.includes('グワジン') || uName.includes('ラー・カイラム') || uName.includes('バーミンガム') || uName.includes('アルビオン') || uName.includes('リーンホース') || uName.includes('ペガサス') || uName.includes('ピースミリオン') || uName.includes('リリー・マルレーン') || uName.includes('ダブデ')) {
        esc = { hp: 150, name: 'ランチ' };
      }
    }
    return esc;
  }
  return null;
}

// ==========================================
// アダプタ: エンジン用キャラクター → battleLogic の LFighter
// ==========================================

// 武器の連続射程。range_min/max（P45で item_ini から取り込み済み）を優先し、
// 無い場合（テスト・カスタム武器）は3帯フラグから近似する
function weaponRange(f: any): { short: number, long: number } {
  const rmin = f.weapon_range_min;
  const rmax = f.weapon_range_max;
  if ((rmin ?? 0) > 0 || (rmax ?? 0) > 0) return { short: rmin || 0, long: rmax || 0 };
  const s = f.w_range_short === 1, m = f.w_range_mid === 1, l = f.w_range_long === 1;
  if (!s && !m && !l) return { short: 0, long: 99 };
  const short = s ? 0 : m ? 34 : 67;
  const long = l ? 99 : m ? 66 : 33;
  return { short, long };
}

// 武器種別（1=ビーム 2=実弾 3=格闘）。raw_syurui（item_ini 実データ）優先、
// 無い場合は item_type=1(格闘)→3、名前に「ビーム」→1、それ以外→2 で近似
function weaponSyurui(f: any): number {
  const raw = parseInt(f.weapon_raw_syurui, 10);
  if (!isNaN(raw) && raw > 0) return raw;
  if ((f.weapon_item_type || f.weapon_type) === 1) return 3;
  if ((f.weapon_name || '').includes('ビーム')) return 1;
  return 2;
}

export function prepareLogicFighter(f: any, wsenjyo: number): LFighter {
  applyEquipmentTokusyu(f);
  parseTraitsAndSkills(f);

  const maxHp = calcMaxHp(f.unit_base_hp);
  const maxEn = calcMaxEn(f.unit_base_en);
  f.maxHp = maxHp;
  f.maxEn = f.maxEn ?? maxEn;
  f.hp = f.hp ?? maxHp;
  f.en = f.en ?? f.maxEn;

  // 弾数の初期化（P45。-19/-32 の倍化は applyEquipmentTokusyu が ammoMultiplier に設定）
  if (f.weapon_ammo_left === undefined) {
    f.weapon_ammo_left = (f.weapon_ammo || 0) * (f.ammoMultiplier || 1);
  }

  const tokusyuNums = parseTokusyu(f.unit_tokusyu).filter((t): t is number => typeof t === 'number');
  const skills = f.parsedSkills || {};

  let weapon: LWeapon | null = null;
  if (f.weapon_id && f.weapon_power) {
    const range = weaponRange(f);
    weapon = {
      name: f.weapon_name || '不明な武装',
      dmg: f.weapon_power || 10,
      en: f.weapon_en_cost || 0,
      short: range.short,
      long: range.long,
      hitnum: f.weapon_hit_count || 1,
      syurui: weaponSyurui(f),
      syurui2: parseInt(f.item1_raw_syurui, 10) || 0,
    };
  }

  // 機体地形×75（dmg_calc:274 の $tikei_koka）
  const terrainAttr = [f.terrain_ground || 0, f.terrain_water || 0, f.terrain_space || 0, f.terrain_air || 0];
  const tikeiKoka = (wsenjyo >= 1 && wsenjyo <= 4) ? terrainAttr[wsenjyo - 1] * 75 : 0;

  const comments: Record<string, any> = { ...(f.parsedComments || {}) };
  if (comments.other && !Array.isArray(comments.other)) comments.other = [comments.other];

  const lf: LFighter & { tikeiKoka: number } = {
    name: f.chara_name || f.handle_name || '無名',
    unitName: f.unit_name || '無人機',
    hp: f.hp, maxHp,
    en: f.en, maxEn: f.maxEn,
    sou: f.armor || 0, un: f.mobility || 0, saku: f.sensor || 0,
    n0: f.status_intuition || 0, n1: f.status_piloting || 0,
    n2: f.status_short_range || 0, n3: f.status_mid_range || 0, n4: f.status_long_range || 0,
    terrainSkill: [skills.ground || 0, skills.water || 0, skills.space || 0, skills.air || 0],
    lv: f.charLevel || 1,
    nt: f.nt_level || 0,
    aisyo: f.unit_kaisyo || 0,
    unitLv: f.unit_lv || 1,
    lp: f.unit_custom_lp || 0,
    idouEquip: f.idouBonus || 0,
    tactics: String(f.tactics ?? '00'),
    traits: f.parsedTraits || {},
    skills,
    flags: f.escaped ? emptyFlags() : flagsFromTokusyu(tokusyuNums),
    weapon: f.escaped ? null : weapon,
    shieldCount: f.shieldCount || (f.hasShieldEquip ? 1 : 0),
    shieldName: f.shieldName || '盾',
    comments,
    quotes: f.quotes,
    jyotai: f.jyotai || 0,
    tama: f.weapon_ammo_left || 0,
    escaped: !!f.escaped,
    escapeTable: (self) => getEscapeUnit(tokusyuNums, self.unitName),
    tikeiKoka,
  };
  return lf;
}

// チーム戦のサポーター情報（battlelib:1068-1090 の $spt_*）
function supportOf(allies: any[]): LSupport | null {
  for (const ally of allies) {
    const allyTokusyu = [
      ...parseTokusyu(ally.unit_tokusyu),
      ...parseTokusyu(ally.weapon_tokusyu).map(t => typeof t === 'number' ? -t : t),
      ...parseTokusyu(ally.item1_tokusyu).map(t => typeof t === 'number' ? -t : t),
      ...parseTokusyu(ally.item2_tokusyu).map(t => typeof t === 'number' ? -t : t)
    ];
    const hasSupport = hasSupportTokusyu(allyTokusyu) ||
      [ally.item1, ally.item2].some(item =>
        item && (item.name?.includes('補給') || item.name?.includes('サポート') || item.name?.includes('弾薬') || item.name?.includes('回復')));
    if (hasSupport) {
      const traits = ally.parsedTraits || parseTraits(ally.traits);
      // spt_heal = 気前がいい−倹約家（battlelib:1075）。spt_heal_t の原典値は不明のため
      // 「-42（弾薬補給装置）所持なら5発」を仮定として採用（台帳§15に記録済みの欠落領域）
      return {
        active: true,
        healBonus: Math.max(1, 20 + supportHealBonus(traits)),
        healAmmo: supportHealAmmo(allyTokusyu),
      };
    }
  }
  return null;
}

// ==========================================
// 戦闘実行（旧IFの simulateBattleRound を置換。仕様§5.1）
// 戻り値: { logs, events, attackerHp, defenderHp, attackerEn, defenderEn, kyori, win }
// events: 1ターン=1イベント（LTurnEvent）
// ==========================================
export const simulateBattleRound = (
  attacker: any, defender: any, _round: number = 1, _tactics: number = 0,
  customAttackerWeapon?: any, customDefenderWeapon?: any, terrain: number = 1,
  attackerTeam: any[] = [], defenderTeam: any[] = [], maxTurns: number = 30, initialKyori?: number,
  snare?: [number, number]
) => {
  const lf0 = prepareLogicFighter(attacker, terrain);
  const lf1 = prepareLogicFighter(defender, terrain);

  // デバッグ/カスタム武器（battle.ts /debug）
  const applyCustom = (lf: LFighter, cw: any) => {
    if (!cw) return;
    lf.weapon = {
      name: cw.name, dmg: cw.power || 10, en: cw.en_cost || 0,
      short: 0, long: 99, hitnum: cw.hit_count || 1,
      syurui: cw.isBeam ? 1 : 2, syurui2: 0,
    };
    lf.tama = cw.ammo || 99;
  };
  applyCustom(lf0, customAttackerWeapon);
  applyCustom(lf1, customDefenderWeapon);

  // 団体戦術補正（teamCo）を原作の atk_sen/def_sen スロットへ接続（台帳§15・仕様§6-1）
  const atkSen: [number, number] = [
    (attacker.teamCo?.atkup ?? 1) * (attacker.teamCo?.dmgUp ?? 1),
    (defender.teamCo?.atkup ?? 1) * (defender.teamCo?.dmgUp ?? 1),
  ];
  const defSen: [number, number] = [
    (attacker.teamCo?.kaiup ?? 1) * (attacker.teamCo?.defUp ?? 1),
    (defender.teamCo?.kaiup ?? 1) * (defender.teamCo?.defUp ?? 1),
  ];

  const result = battleLogic([lf0, lf1], {
    maxTurns,
    wsenjyo: terrain,
    initialKyori,
    startTurn: attacker.continuedTurn,
    atkSen, defSen,
    snare,
    support: [
      supportOf(attackerTeam.filter(t => t !== attacker && t.hp > 0)),
      supportOf(defenderTeam.filter(t => t !== defender && t.hp > 0)),
    ],
  });

  // 状態の書き戻し（継続戦闘・戦闘後処理用）
  attacker.hp = lf0.hp; attacker.en = lf0.en;
  attacker.weapon_ammo_left = lf0.tama; attacker.jyotai = lf0.jyotai; attacker.escaped = lf0.escaped;
  defender.hp = lf1.hp; defender.en = lf1.en;
  defender.weapon_ammo_left = lf1.tama; defender.jyotai = lf1.jyotai; defender.escaped = lf1.escaped;

  // イベントへ表示用の名前を付与（フロントB2が使用）
  const events = result.events.map((e: LTurnEvent) => ({
    ...e,
    attackerName: lf0.name, defenderName: lf1.name,
    attackerUnit: lf0.unitName, defenderUnit: lf1.unitName,
  }));

  return {
    logs: result.logs,
    events,
    attackerHp: lf0.hp,
    defenderHp: lf1.hp,
    attackerEn: lf0.en,
    defenderEn: lf1.en,
    kyori: result.kyori,
    win: result.win,
  };
};

// ==========================================
// 戦闘後処理の特殊能力適用（battlelib.pl:1383-1394, 1497-1524）
// ==========================================
export function applyPostBattleTokusyuEffects(fighter: any, battle_syurui: number, originalReward: { exp: number, winExp?: number }, isWin: boolean = true) {
  const abilities = parseTokusyu(fighter.unit_tokusyu);
  let finalExp = originalReward.exp;

  if (!isWin && hasPostBattleEffect(abilities, 'expBoostOnLoss') && (battle_syurui === 1 || battle_syurui === 2)) {
    finalExp = Math.max(finalExp, originalReward.winExp ?? finalExp);
  }

  if (hasPostBattleEffect(abilities, 'enDrain') && (battle_syurui === 1 || battle_syurui === 2)) {
    fighter.en = 0;
  }

  if (hasPostBattleEffect(abilities, 'hpEnRestore')) {
    const maxHp = calcMaxHp(fighter.unit_base_hp);
    const maxEn = calcMaxEn(fighter.unit_base_en);
    fighter.hp = Math.min(maxHp, Math.floor((fighter.hp || 0) * 1.5));
    fighter.en = Math.min(maxEn, Math.floor((fighter.en || 0) * 1.5));
  }

  return { finalExp, fighterHp: fighter.hp, fighterEn: fighter.en };
}

// ==========================================
// 団体戦（P30・観察準拠の構造は維持=仕様§2）
// P38 の役割補正（teamCo）は simulateBattleRound が原作の団体戦術補正スロットに接続する
// ==========================================
export const simulateTeamBattle = (attackerTeam: any[], defenderTeam: any[], terrain: number = 1, snare?: [number, number]) => {
  let logs: string[] = [];
  let events: any[] = [];

  for (const fi of [...attackerTeam, ...defenderTeam]) {
    fi.hp = fi.hp ?? calcMaxHp(fi.unit_base_hp);
    fi.en = fi.en ?? calcMaxEn(fi.unit_base_en);
  }

  const maxTurns = 12;
  const pairKyori = new Map<string, number>();
  let aKills = 0;
  let dKills = 0;

  const teamTacticOf = (fi: any) => {
    const t = String(fi.team_tactic || 'NN').toUpperCase();
    return {
      target: 'NLADS'.includes(t[0] || 'N') ? (t[0] || 'N') : 'N',
      action: 'NADS'.includes(t[1] || 'N') ? (t[1] || 'N') : 'N',
    };
  };
  const roleOf = (fi: any) => teamTacticOf(fi).action;
  const roleKeyOf = (fi: any, team: any[]) => (fi === team[0] ? 'L' : roleOf(fi));

  const covers = (guard: any, ward: any, team: any[]) => {
    const tt = teamTacticOf(guard);
    return tt.target === 'N' || tt.target === roleKeyOf(ward, team);
  };

  const pickTarget = (me: any, enemyTeam: any[], aliveEnemies: any[]) => {
    const tt = teamTacticOf(me);
    let pool: any[] = [];
    if (tt.target === 'L') pool = aliveEnemies.filter(fi => fi === enemyTeam[0]);
    else if (tt.target !== 'N') pool = aliveEnemies.filter(fi => roleOf(fi) === tt.target && fi !== enemyTeam[0]);
    if (pool.length === 0) pool = aliveEnemies;
    return { target: pool[Math.floor(Math.random() * pool.length)], tt };
  };

  const roleCoeffs = (fi: any, isTargeted: boolean) => {
    const role = roleOf(fi);
    const co: any = { atkup: 1, kaiup: 1, dmgUp: 1, defUp: 1 };
    if (role === 'A') { co.dmgUp *= 1.2; co.kaiup *= 0.85; }
    if (role === 'D') { co.dmgUp *= 0.8; if (isTargeted) co.kaiup *= 0.9; }
    if (role === 'S') { co.dmgUp *= 0.7; if (isTargeted) co.kaiup *= 0.8; }
    if (role === 'N') { co.dmgUp *= 0.9; }
    return co;
  };

  for (let turn = 1; turn <= maxTurns; turn++) {
    const aliveAttackers = attackerTeam.filter(fi => fi.hp > 0);
    const aliveDefenders = defenderTeam.filter(fi => fi.hp > 0);
    if (aliveAttackers.length === 0 || aliveDefenders.length === 0) break;

    logs.push(`\n====== チーム戦 ${turn}ターン ======`);

    const aFighter = aliveAttackers[Math.floor(Math.random() * aliveAttackers.length)];
    const picked = pickTarget(aFighter, defenderTeam, aliveDefenders);
    let target = picked.target;
    const att = picked.tt;
    const ignoresTeamwork = att.target === 'N' && att.action === 'A';

    let blocked = false;
    const blockers = aliveDefenders.filter(fi =>
      fi !== target && roleOf(fi) === 'D' && covers(fi, target, defenderTeam));
    if (blockers.length > 0 && Math.floor(Math.random() * 2) === 0) {
      const blocker = blockers[Math.floor(Math.random() * blockers.length)];
      if (att.target === 'L') logs.push(`リーダーを攻撃しようとしたが阻まれた`);
      else logs.push(`${target.handle_name}を攻撃しようとしたが阻まれた`);
      target = blocker;
      blocked = true;
    } else if (att.target === 'L' && target === defenderTeam[0]) {
      logs.push(`リーダーを攻撃`);
    } else if (ignoresTeamwork) {
      logs.push(`団体行動を無視`);
    }
    logs.push(`▶ ${aFighter.handle_name} vs ${target.handle_name}`);

    aFighter.teamCo = roleCoeffs(aFighter, false);
    target.teamCo = roleCoeffs(target, true);
    if (blocked) {
      target.teamCo.kaiup *= 1.2;
      aFighter.teamCo.dmgUp *= 0.5;
    }
    const enemySupporters = aliveDefenders.filter(fi =>
      fi !== target && roleOf(fi) === 'S' && covers(fi, target, defenderTeam));
    if (enemySupporters.length > 0 && (!ignoresTeamwork || blocked)) {
      aFighter.teamCo.atkup *= 0.85;
      logs.push(`${target.handle_name}は${enemySupporters[0].handle_name}に掩護されている。`);
    }

    const pairKey = `${aFighter.id ?? aFighter.handle_name}#${target.id ?? target.handle_name}`;
    const kyori = pairKyori.get(pairKey) ?? Math.floor(Math.random() * 100);

    const aSupporters = aliveAttackers.filter(fi => fi !== aFighter && roleOf(fi) === 'S' && covers(fi, aFighter, attackerTeam));
    const dSupporters = aliveDefenders.filter(fi => fi !== target && roleOf(fi) === 'S' && covers(fi, target, defenderTeam));

    const result = simulateBattleRound(aFighter, target, turn, 0, undefined, undefined, terrain, [aFighter, ...aSupporters], [target, ...dSupporters], 1, kyori, snare);
    pairKyori.set(pairKey, result.kyori);

    delete aFighter.teamCo;
    delete target.teamCo;

    logs.push(...result.logs);
    events.push(...result.events);

    aFighter.hp = result.attackerHp;
    target.hp = result.defenderHp;

    if (target.hp <= 0) {
      aKills++;
      logs.push(`<b>${aFighter.handle_name}、1機撃破！！</b>`);
    }
    if (aFighter.hp <= 0) {
      dKills++;
      logs.push(`<b>${target.handle_name}、1機撃破！！</b>`);
    }
  }

  const aAlive = attackerTeam.filter(fi => fi.hp > 0).length;
  const dAlive = defenderTeam.filter(fi => fi.hp > 0).length;
  let isSuccess: boolean;
  if (dAlive === 0) {
    isSuccess = aAlive > 0;
  } else if (aAlive === 0) {
    isSuccess = false;
  } else if (aKills !== dKills) {
    isSuccess = aKills > dKills;
  } else {
    const hpRatio = (team: any[]) => team.reduce((acc, fi) => acc + Math.max(0, fi.hp) / (fi.maxHp || calcMaxHp(fi.unit_base_hp)), 0);
    isSuccess = hpRatio(attackerTeam) > hpRatio(defenderTeam);
  }

  return { logs, events, isSuccess, attackerTeam, defenderTeam };
}

// 原作 msvs.cgi: 1475-1487（階級に基づくコスト計算＋器用割引）
export function calcCost(rankScore: number, unitLevel: number, lp: number, traits: any = {}) {
  const kaiInd = Math.floor(rankScore / 250) - 1;
  let kind = kaiInd + 1;
  if (kind > 11) kind = 11;
  if (kind < 0) kind = 0;

  let cost = Math.floor((kaiInd + unitLevel + Math.floor(lp / 4)) * (kind / 10));

  cost = applyCostDiscount(traits, cost);

  return cost;
}
