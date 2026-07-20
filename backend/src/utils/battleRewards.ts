// ==========================================
// P47-B3: 戦闘後処理（原作準拠）
// 原典: battlelib.pl 1285-1548（経験値・スキル取得・レベルアップ・機熟）
//       battle.cgi 129-286（名声・戦果・機体損傷・勢力ポイント）
// 経験値は原作どおり減算式（レベルアップで exp -= level×500 を消費。msvs_ini:584）。
// リリース前のため旧累積値からの移行措置は無し（ユーザー承認済み）。
// ==========================================
import { calcMaxHp, applyPostBattleTokusyuEffects, parseTokusyu } from './battleEngine'
import { hasPostBattleEffect } from './tokusyuEffects'
import { parseTraits } from './traits'
import { fameGainBias, goldTraitRand, sonsyoTraitBonus, kitaiFetishSave } from './traitEffects'
import { calcMapl, calcTul, gainKaisyo } from './kaisyo'
import { recordUnitBattleResult } from './unitStats'

const irand = (x: number) => Math.floor(Math.random() * Math.max(0, x));
const int = Math.trunc;

export const MAX_LV = 256;   // レベル上限（msvs_ini:636）
export const LV_UP = 500;    // レベルアップ閾値係数（msvs_ini:584）
const KIJUN_EXP = 1;         // 基礎経験値係数（msvs_ini:620）

export const skillList = [
  'ground', 'space', 'water', 'air',
  'melee', 'focus_fire', 'snipe', 'provoke',
  'focus', 'kamikaze', 'recover', 'counter'
];
export const skillNameMap: Record<string, string> = {
  ground: '地形スキル(地上)', space: '地形スキル(宇宙)', water: '地形スキル(水中)', air: '地形スキル(空中)',
  melee: '格闘', focus_fire: '連続射撃', snipe: '精密射撃', provoke: '挑発',
  focus: '集中', kamikaze: '特攻', recover: '回復', counter: '反撃'
};

// ------------------------------------------
// 経験値（battlelib:1317-1331 勝利 / 1383-1400 敗北。kijun_exp=1）
// syurui: 1=優勝戦・個別戦闘, 2=対人シミュレーター, 3=NPC模擬戦
// NPC模擬戦の勝利式は原作 rand($mex+$msp) が simulator.cgi 欠落で不明のため、
// 対人シミュレーター(syurui=2)の式を流用する【仮定・台帳§15記録】
// ------------------------------------------
export function calcBattleExp(
  isWin: boolean, syurui: number, selfLevel: number,
  opp: { level?: number, unit_lv?: number, lp?: number }, wcount: number
): number {
  if ((selfLevel || 1) >= MAX_LV) return 0;                    // battlelib:1331,1400
  const oppLv = opp.level || 1;
  const oppUnitLv = opp.unit_lv || 1;
  const oppLp = opp.lp || 0;
  if (isWin) {
    const base = (oppLv + (oppUnitLv + oppLp) * 4) * KIJUN_EXP + irand(oppLv);
    if (syurui === 1) return base + wcount * 10;               // battlelib:1320-1321
    return base;                                               // battlelib:1325（syurui=2。3は仮定で流用）
  }
  if (syurui === 3) return irand(5);                           // battlelib:1398
  return oppLv + oppUnitLv * 3 * KIJUN_EXP + wcount;           // battlelib:1386
}

// ------------------------------------------
// 戦果（battle.cgi:143-183）
// 戻り値 moneyGain は gold＋bonus2（battle.cgi:183 は gold に bonus2 を含めた上で
// さらに bonus2 を加算する＝連勝ボーナスの二重加算。原作の挙動を忠実に再現）
// ------------------------------------------
export function calcBattleGold(
  isWin: boolean, attacker: { level?: number, unit_lv?: number, unit_tokusyu?: string, traits?: any },
  opp: { level?: number, unit_lv?: number }, wcount: number
): { gold: number, bonus2: number, moneyGain: number } {
  const selfLv = attacker.level || 1;
  const selfUnitLv = attacker.unit_lv || 1;
  const oppLv = opp.level || 1;
  const oppUnitLv = opp.unit_lv || 1;
  let gold: number;
  let bonus2 = 0;
  if (isWin) {
    bonus2 = wcount * 10;                                      // battle.cgi:143
    const tokusyu = parseTokusyu(attacker.unit_tokusyu);
    if (hasPostBattleEffect(tokusyu, 'biosensorGold')) {
      // バイオセンサー(-17)所持: 戦果の上振れ式（battle.cgi:147-152）
      const traits = parseTraits(attacker.traits);
      let glv = oppLv - irand(selfLv * 2);
      if (glv < 0) glv = 1;
      gold = oppLv + (glv + oppUnitLv - irand(selfUnitLv)) * int(Math.random() * (10 + goldTraitRand(traits)) + 2);
    } else {
      // 通常式（battle.cgi:155-157）
      let glv = oppLv - selfLv;
      if (glv < 0) glv = 1;
      gold = glv * 6 + oppUnitLv - irand(selfUnitLv);
    }
    if (gold <= 10) gold = 10;                                 // battle.cgi:160
  } else {
    gold = 10 + irand(oppUnitLv);                              // battle.cgi:173
  }
  gold = irand(gold) + 10 + bonus2;                            // battle.cgi:182
  return { gold, bonus2, moneyGain: gold + bonus2 };           // battle.cgi:183
}

// ------------------------------------------
// レベルアップ（battlelib:1456-1485。1戦闘につき1回判定・expは減算式）
// weaponHani: 武器の成長種別（item master hani欄 1=近/2=中/3=遠）
// itemHani: 装備の成長種別（4=直感/5=操縦）
// ------------------------------------------
export function applyLevelUp(
  char: { level?: number, exp?: number }, expGained: number, syurui: number,
  weaponHani: number, itemHani: number, logs: string[]
): { level: number, exp: number, statGains: Record<string, number> } {
  let exp = (char.exp || 0) + expGained;
  let level = char.level || 1;
  const statGains: Record<string, number> = {};
  const grew: Record<string, boolean> = {};
  const add = (col: string, amount: number) => {
    statGains[col] = (statGains[col] || 0) + amount;
    grew[col] = true;
  };

  if (exp >= level * LV_UP && level < MAX_LV) {                // battlelib:1457
    exp -= level * LV_UP;                                      // battlelib:1459
    level += 1;
    logs.push('熟練度が上がった！');

    // 能力上昇抽選（battlelib:1464-1471。模擬戦NPC(3)と団体(4)では上がらない）
    if (syurui !== 3 && syurui !== 4) {
      const denom = int(level / 10) + 5;
      if (irand(denom) === 0) add('status_intuition', irand(20) + 1);
      if (irand(denom) === 0) add('status_piloting', irand(20) + 1);
      if (irand(denom) === 0) add('status_short_range', irand(20) + 1);
      if (irand(denom) === 0) add('status_mid_range', irand(20) + 1);
      if (irand(denom) === 0) add('status_long_range', irand(20) + 1);
    }
    // 武器ボーナス（battlelib:1472-1477。使用武器の成長種別に対応した能力が伸びる）
    if (weaponHani === 1) add('status_short_range', irand(5) + 1);
    else if (weaponHani === 2) add('status_mid_range', irand(5) + 1);
    else if (weaponHani === 3) add('status_long_range', irand(5) + 1);
    if (itemHani === 4) add('status_intuition', irand(2) + 1);
    else if (itemHani === 5) add('status_piloting', irand(2) + 1);

    // 表示（battlelib:1480-1484）
    if (grew['status_intuition']) logs.push('直感が上がった。');
    if (grew['status_piloting']) logs.push('操縦が上がった。');
    if (grew['status_short_range']) logs.push('近距離が上がった。');
    if (grew['status_mid_range']) logs.push('中距離が上がった。');
    if (grew['status_long_range']) logs.push('遠距離が上がった。');
  }
  return { level, exp, statGains };
}

// ------------------------------------------
// スキル取得・NT覚醒（battlelib:1333-1358 勝利 / 1403-1427 敗北）
// 8枠制: 0=格闘 1=連続射撃 2=精密射撃(上限2) / 3-6=地形4種(上限3) /
// 7=挑発系1枠（特攻・回復・挑発・集中・反撃が排他。新規習得で前のものを忘れる）
// NT覚醒: 一般人(0)→1、NT(1-9)→+1(最大10)。強化人間(負)とOldType(waza持ち)は戦闘では変化しない
// ------------------------------------------
const N12_GROUP = ['kamikaze', 'recover', 'provoke', 'focus', 'counter'];  // 原作 skill_12 の 1..5

export function tryLearnSkillAndNt(
  userSkillsJson: string, isWin: boolean, currentNtLevel: number,
  logs: string[], syurui: number, isNpc: boolean
): { newSkillsJson: string, newNtLevel: number, requiresSkillForget: boolean } {
  let newNtLevel = currentNtLevel || 0;
  if (isNpc) return { newSkillsJson: userSkillsJson, newNtLevel, requiresSkillForget: false };

  let skillsObj: any = {};
  try {
    skillsObj = JSON.parse(userSkillsJson || '{}');
  } catch (e) {
    skillsObj = {};
  }

  const learnDenom = (isWin ? 50 : 100) * syurui;              // battlelib:1336/1406
  if (irand(learnDenom) === 0) {
    const pos = irand(8);                                      // battlelib:1338
    const slots = [
      { key: 'melee', max: 2 }, { key: 'focus_fire', max: 2 }, { key: 'snipe', max: 2 },
      { key: 'ground', max: 3 }, { key: 'water', max: 3 }, { key: 'space', max: 3 }, { key: 'air', max: 3 },
    ];
    if (pos < 7) {
      const s = slots[pos];
      if ((skillsObj[s.key] || 0) < s.max) {                   // battlelib:1340-1346 の上限
        skillsObj[s.key] = (skillsObj[s.key] || 0) + 1;
        logs.push(`>>> 【技術習得】 ${skillNameMap[s.key]}のレベルが ${skillsObj[s.key]} に上がった！`);
      }
    } else {
      // 挑発系1枠・排他（battlelib:1347-1351）
      const cur = N12_GROUP.find(k => skillsObj[k]);
      const next = N12_GROUP[irand(5)];
      for (const k of N12_GROUP) delete skillsObj[k];
      skillsObj[next] = 1;
      const forgot = cur && cur !== next ? `${skillNameMap[cur]}を忘れて` : '';
      logs.push(`>>> 【技術習得】 ${forgot}${skillNameMap[next]}を身に付けた！`);
    }
  } else if (irand(isWin ? 500 : 1000) === 0) {                // battlelib:1353/1422
    if (!skillsObj.waza && newNtLevel >= 0 && newNtLevel < 10) {
      newNtLevel += 1;                                         // battlelib:1355-1356（0→1・最大10）
      logs.push(`>>> 【覚醒】 ニュータイプとしての能力が上がった！（NT Lv.${newNtLevel}）`);
    }
  }

  // 原作 skill_max=12 は「特殊・NT除く」＝7系統(格闘/連続射撃/精密射撃/操縦地上水中宇宙空中)のみを合算する
  // （msvs_ini.cgi:363 コメント／超過判定 msvs.cgi:177,838・ps_btlview:60・trmt_jyoken:147 はいずれも kn_5..kn_11 のみ）。
  // 特殊(skill_12=N12_GROUP)は 1枠排他で skill_max に数えない。NT は nt_level で別管理のため元より非対象。
  let totalSkillLevel = 0;
  for (const sName of skillList) {
    if (N12_GROUP.includes(sName)) continue; // 特殊は cap 対象外
    if (skillsObj[sName]) totalSkillLevel += skillsObj[sName];
  }
  const requiresSkillForget = totalSkillLevel > 12; // skill_max（msvs.cgi 由来・P14）

  return { newSkillsJson: JSON.stringify(skillsObj), newNtLevel, requiresSkillForget };
}

// ランク指数（原作 trmt_jyoken.pl:122-126）
export function calcRankIndex(char: any): number {
  const statSum = (char.status_intuition || 0) + (char.status_piloting || 0) +
    (char.status_short_range || 0) + (char.status_mid_range || 0) + (char.status_long_range || 0);
  let idx = Math.floor((statSum + (char.level || 1) * 25 + Math.abs(char.nt_level || 0) * 100) / 250) - 1;
  if (idx > 40) idx = 40;
  if (idx < 0) idx = 0;
  return idx;
}

// 総合力（battle.cgi:264-265 の勢力ポイント比較用: 5能力合計＋熟練度×25＋|NT|×100）
function totalPower(char: any): number {
  return (char.status_intuition || 0) + (char.status_piloting || 0) +
    (char.status_short_range || 0) + (char.status_mid_range || 0) + (char.status_long_range || 0) +
    (char.level || 1) * 25 + Math.abs(char.nt_level || 0) * 100;
}

// 個別戦闘の参加条件判定（原作 trmt_jyoken.pl）
export function checkGateRequirements(challenger: any, gate: { req_unit_type?: string | null, req_max_hp?: number | null, req_rank?: number | null }): string | null {
  const reqUnit = (gate.req_unit_type || '').trim();
  if (reqUnit) {
    if (String(challenger.unit_id || 0) !== reqUnit) return '機体が参加条件に反しています。';
  }

  const reqHp = gate.req_max_hp || 0;
  if (reqHp !== 0) {
    const maxHp = calcMaxHp(challenger.unit_base_hp);
    if (reqHp > 0 && maxHp < reqHp) return '機体耐久力が参加条件を下回っています。';
    if (reqHp < 0 && maxHp > Math.abs(reqHp)) return '機体耐久力が参加条件を上回っています。';
  }

  const reqRank = gate.req_rank || 0;
  if (reqRank !== 0) {
    const idx = calcRankIndex(challenger);
    if (reqRank > 0 && idx < reqRank - 1) return 'ランクが参加条件を下回っています。';
    if (reqRank < 0 && idx > Math.abs(reqRank) - 1) return 'ランクが参加条件を上回っています。';
  }

  return null;
}

export interface PersonalBattleOpts {
  winCount: number;       // 防衛側の現在連勝数（経験値・戦果・名声に使用）
  isGateBattle: boolean;  // true=個別戦闘(w_knm) / false=優勝戦
  battleSyurui?: number;  // 既定 1=個人戦
  enCost?: number;        // 出撃EN消費（既定 15）
  terrain?: number;       // 戦場（機体損傷判定は戦場>0のとき。battle.cgi:197）
  battleType: string;
  events?: any[];
  meta?: any;
  defenseBattleId?: number;  // Q2観戦: 個別戦闘なら作戦(defense_battles.id)を紐付けて保存
}

// 戦闘後の報酬・成長・損傷・勢力・戦績・ログ保存を一括適用する。
// attacker/defender は battle 実行後（hp/en 更新済み）のオブジェクトを渡すこと。
export async function applyPersonalBattleResults(db: any, attacker: any, defender: any, isWin: boolean, logs: string[], opts: PersonalBattleOpts) {
  const winCount = opts.winCount || 1;
  const battleSyurui = opts.battleSyurui ?? 1;
  const enCost = opts.enCost ?? 15;
  const terrain = opts.terrain ?? 1;
  const traits = parseTraits(attacker.traits);

  // -- 経験値（battlelib:1317-1331/1383-1400）--
  const oppRef = { level: defender.level, unit_lv: defender.unit_lv, lp: defender.unit_custom_lp };
  let rewardExp = calcBattleExp(isWin, battleSyurui, attacker.level, oppRef, winCount);
  // -16（学習型コンピュータ）の敗北時差し替え額 = 勝利式＋連勝ボーナス（battlelib:1391）
  const winExp = calcBattleExp(true, 1, attacker.level, oppRef, winCount);

  // -- 戦果（battle.cgi:143-183）--
  const goldRes = calcBattleGold(isWin, attacker, oppRef, winCount);
  const rewardMoney = goldRes.moneyGain;
  if (isWin && goldRes.bonus2 > 0) {
    logs.push(`連勝ストップボーナス、戦果＋${goldRes.bonus2} 経験値＋${winCount * 10}！！`);  // battle.cgi:162
  }

  // -- 名声（battle.cgi:132-179）--
  let rewardFame = 0;
  if (isWin) {
    const fameCap = opts.isGateBattle ? (2 + fameGainBias(traits)) : (winCount + 1 + fameGainBias(traits));
    rewardFame = Math.floor(Math.random() * Math.max(1, fameCap));
    if (rewardFame > 0) logs.push(`【名声】 名声が ${rewardFame} 上がった！`);
  } else {
    if ((defender.fame || 0) <= (attacker.fame || 0) && (attacker.fame || 0) > 0) {
      rewardFame = -1;
      logs.push(`【名声】 格下相手の敗北で名声が下がった…`);
    }
  }

  logs.push(`---------------------------------`);
  if (isWin) {
    logs.push(`【勝敗】 ${attacker.handle_name} の勝利！`);
  } else {
    logs.push(`【勝敗】 ${attacker.handle_name} の敗北...`);
  }
  logs.push(`【戦果】 ${rewardMoney}G と ${rewardExp}EXP を獲得。`);

  // -- 戦闘後 tokusyu（-16 は敗北時のみ勝利額に差し替え・-10/-18）--
  const postEff = applyPostBattleTokusyuEffects(attacker, battleSyurui, { exp: rewardExp, winExp }, isWin);
  if (!isWin && postEff.finalExp > rewardExp) {
    logs.push(`【学習型コンピュータ】 敗北からも多くを学んだ！（経験値 ${postEff.finalExp}）`);
  }
  rewardExp = postEff.finalExp;
  attacker.hp = postEff.fighterHp;
  attacker.en = postEff.fighterEn;

  const newMoney = (attacker.money || 0) + rewardMoney;
  const newFame = Math.max(0, (attacker.fame || 0) + rewardFame);

  // -- レベルアップ（battlelib:1456-1485）--
  const weaponHani = parseInt(attacker.weapon_raw_hani, 10) || 0;
  const itemHani = parseInt(attacker.item1_raw_hani, 10) || parseInt(attacker.item2_raw_hani, 10) || 0;
  const lvRes = applyLevelUp(attacker, rewardExp, battleSyurui, weaponHani, itemHani, logs);
  const newExp = lvRes.exp;
  const newLevel = lvRes.level;
  for (const [col, amount] of Object.entries(lvRes.statGains)) {
    await db.prepare(`UPDATE characters SET ${col} = ${col} + ? WHERE id = ?`).bind(amount, attacker.id).run();
  }

  // -- スキル取得・NT覚醒（battlelib:1333-1358/1403-1427）--
  const { newSkillsJson, newNtLevel, requiresSkillForget } = tryLearnSkillAndNt(attacker.skills, isWin, attacker.nt_level, logs, battleSyurui, false);

  // -- 機体損傷（battle.cgi:187-225）--
  // sonsyo = 装備重量超過×20 ＋（運動−装甲）。負なら5。判定は rand(最大耐久) < sonsyo＋特性分（戦場>0のみ）
  const equipWeight = (attacker.weapon_weight || 0) + (attacker.item1_weight || 0) + (attacker.item2_weight || 0);
  const overWeight = equipWeight - (attacker.max_weight || 0);
  let sonsyo = overWeight > 0 ? overWeight * 20 : 0;
  sonsyo += (attacker.unit_custom_mobility || 0) - (attacker.unit_custom_armor || 0);
  if (sonsyo < 0) sonsyo = 5;
  const maxHp = calcMaxHp(attacker.unit_base_hp);
  if (terrain > 0 && irand(maxHp) < sonsyo + sonsyoTraitBonus(traits)) {
    const stats = [
      { col: 'unit_custom_hp', label: '耐久力' },
      { col: 'unit_custom_armor', label: '装甲' },
      { col: 'unit_custom_mobility', label: '運動性' },
      { col: 'unit_custom_sensor', label: '索敵能力' },
      { col: 'unit_custom_en', label: 'ＥＮ容量' },
    ];
    const pick = stats[irand(5)];                              // battle.cgi:199-206
    // 機体フェチが損傷を回避（battle.cgi:212-222）
    if (kitaiFetishSave(traits) > irand(20)) {
      logs.push(`【損傷】 激しい戦闘で${pick.label}が下がってしまった・・・というところで、機体フェチの執念が損傷を回避した。`);
    } else {
      await db.prepare(`UPDATE characters SET ${pick.col} = MAX(1, ${pick.col} - 1) WHERE id = ?`).bind(attacker.id).run();
      logs.push(`【損傷】 激しい戦闘で機体の${pick.label}が下がってしまった・・・。`);
    }
  }

  // -- 勢力ポイント（battle.cgi:243-286/355-396。優勝戦・個別戦闘共通）--
  const aFaction = attacker.faction_id || 0;
  const dFaction = defender.faction_id || 0;
  if (aFaction !== dFaction) {
    if (isWin) {
      if (aFaction) {
        await db.prepare(`UPDATE factions SET influence = influence + 1 WHERE id = ?`).bind(aFaction).run();
        // 格上（総合力で上回る相手）に勝ったら相手勢力から-1（battle.cgi:264-284）
        if (dFaction && totalPower(attacker) < totalPower(defender)) {
          await db.prepare(`UPDATE factions SET influence = MAX(0, influence - 1) WHERE id = ?`).bind(dFaction).run();
        }
      }
    } else {
      if (aFaction && dFaction) {
        await db.prepare(`UPDATE factions SET influence = influence + 1 WHERE id = ?`).bind(dFaction).run();
        // 格下（総合力で上回っている側）が負けたら自勢力から-1（battle.cgi:377-394）
        if (totalPower(attacker) >= totalPower(defender)) {
          await db.prepare(`UPDATE factions SET influence = MAX(0, influence - 1) WHERE id = ?`).bind(aFaction).run();
        }
      }
    }
  }

  const fullLogText = logs.join('\n');

  // -- 機熟増加（battlelib.pl:1538-1542）--
  const newKaisyo = gainKaisyo(
    attacker.unit_kaisyo || 0,
    calcMapl(attacker.unit_custom_lp || 0, attacker.mobility || 0),
    calcTul(attacker.unit_lv || 1, attacker.mobility || 0),
    true,
    newLevel
  );

  await db.prepare(`UPDATE characters SET money = ?, exp = ?, level = ?, fame = ?, current_hp = ?, current_en = ?, skills = ?, nt_level = ?, unit_kaisyo = ? WHERE id = ?`)
    .bind(newMoney, newExp, newLevel, newFame, Math.max(0, attacker.hp), Math.max(0, (attacker.en || 0) - enCost), newSkillsJson, newNtLevel, newKaisyo, attacker.id).run();

  // 防衛側: HP/EN 保存＋防衛成功時は勝利特典（原作: 戦果=連勝数ポイント。battle.cgi:453-472）
  const defenderBonus = isWin ? 0 : winCount;
  await db.prepare(`UPDATE characters SET current_hp = ?, current_en = ?, money = money + ? WHERE id = ?`)
    .bind(Math.max(0, defender.hp), Math.max(0, defender.en || 0), defenderBonus, defender.id).run();
  if (!isWin) {
    logs.push(`${defender.handle_name} は勝利特典として ${winCount} ポイントの戦果を獲得した。`);
  }

  // 戦績（P16）: 対人戦のみ両者 total +1・勝者 win +1
  await db.prepare(`UPDATE characters SET total_battles = total_battles + 1, win_battles = win_battles + ? WHERE id = ?`)
    .bind(isWin ? 1 : 0, attacker.id).run();
  await db.prepare(`UPDATE characters SET total_battles = total_battles + 1, win_battles = win_battles + ? WHERE id = ?`)
    .bind(isWin ? 0 : 1, defender.id).run();

  await recordUnitBattleResult(db, { userId: attacker.id, unitId: attacker.unit_id, isWin });
  await recordUnitBattleResult(db, { userId: defender.id, unitId: defender.unit_id, isWin: !isWin });

  const eventsJson = opts.events ? JSON.stringify(opts.events) : null;
  const metaJson = opts.meta ? JSON.stringify(opts.meta) : null;
  await db.prepare(`INSERT INTO battle_logs (attacker_id, defender_id, is_attacker_win, log_text, events_json, meta_json, battle_type, defense_battle_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(attacker.id, defender.id, isWin ? 1 : 0, fullLogText, eventsJson, metaJson, opts.battleType, opts.defenseBattleId ?? null).run();

  return { rewardMoney, rewardExp, rewardFame, newMoney, newExp, newLevel, levelUp: newLevel > (attacker.level || 1), requiresSkillForget, fullLogText };
}
