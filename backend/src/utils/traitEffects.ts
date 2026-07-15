// ==========================================
// 特性（tokusei）の面別投影レイヤ
//
// ドメインモデル上の「特性」は characters.traits の1つだが、効果は
// 戦闘・報酬・整備・カスタマイズ・訓練など複数の面に散らばる。
// 特性名（日本語文字列）と効果式を消費点に直書きすると、
// 同じ特性のロジックが複数箇所に重複して同期漏れを生む
// （実例: 距離系特性が命中側と回避側で別実装、コスト割引が3重実装）。
//
// 本モジュールが「特性名 → 面ごとの効果値」の唯一の変換点。
// 消費側は特性名を知らず、ここの名前付きアクセサだけを使うこと。
// 原作の特性は toku_read が展開する @toku 配列（toku[index]）で、
// 対応が判明しているものはコメントに index を併記した。
//
// 【P47 ルール】戦闘エンジン再構築時、特性参照は必ずこの層を経由する。
// 式を原作準拠に直すときはこのファイル内だけを変更する。
// ==========================================

export type Traits = Record<string, number>;

const lv = (t: Traits | null | undefined, name: string): number => (t && t[name]) || 0;

// ------------------------------------------
// 戦闘面: 戦術特性（原作 toku[26..29]。battlelib.pl:796-799）
// senAtk: 4=攻撃重視, 5=回避重視, 6=撹乱重視, 7=操縦重視
// ------------------------------------------
export function tacticTraitLv(t: Traits, senAtk: number): number {
  if (senAtk === 4) return lv(t, '攻撃的');       // toku[26]
  if (senAtk === 5) return lv(t, '逃げ腰');       // toku[27]
  if (senAtk === 6) return lv(t, 'イタズラ好き'); // toku[28]
  if (senAtk === 7) return lv(t, '真面目');       // toku[29]
  return 0;
}

// ------------------------------------------
// 戦闘面: 距離系特性（原作 toku[4..9] の tokukyori に相当。battlelib.pl:749-769）
// 現行実装は命中側と回避側で式が非対称（P46台帳 §5 で軸違いと記録済み。
// 挙動維持のため現行式をそのまま封じ込める。P47でここを原作 tokukyori 式に差し替える）
// ------------------------------------------

// 命中側（旧 applyPreAttackBuffs。else-if 連鎖＝最初に該当した特性のみ有効）
export function distanceHitMul(t: Traits, hani: number): number {
  if (lv(t, '短気')) {
    if (hani === 1) return 1 + lv(t, '短気') * 0.1;
  } else if (lv(t, '熱血')) {
    if (hani === 2) return Math.max(0.1, 1 - lv(t, '熱血') * 0.05);
  } else if (lv(t, '中途半端')) {
    if (hani === 2) return 1 + lv(t, '中途半端') * 0.1;
  } else if (lv(t, '凡庸')) {
    if (hani === 3) return Math.max(0.1, 1 - lv(t, '凡庸') * 0.05);
  } else if (lv(t, '沈着')) {
    if (hani === 3) return 1 + lv(t, '沈着') * 0.1;
  } else if (lv(t, '策士')) {
    if (hani === 1) return Math.max(0.1, 1 - lv(t, '策士') * 0.05);
  }
  return 1;
}

// 回避側（旧 applyEvasionTraitsOnly。独立 if＝複数特性が同時に効く）
export function distanceEvadeMul(t: Traits, hani: number): number {
  let m = 1;
  if (lv(t, '短気') && hani === 2) m *= Math.max(0.1, 1 - lv(t, '短気') * 0.05);
  if (lv(t, '熱血') && hani === 1) m *= 1 + lv(t, '熱血') * 0.1;
  if (lv(t, '中途半端') && hani === 3) m *= Math.max(0.1, 1 - lv(t, '中途半端') * 0.05);
  if (lv(t, '凡庸') && hani === 2) m *= 1 + lv(t, '凡庸') * 0.1;
  if (lv(t, '沈着') && hani === 1) m *= Math.max(0.1, 1 - lv(t, '沈着') * 0.05);
  if (lv(t, '策士') && hani === 3) m *= 1 + lv(t, '策士') * 0.1;
  return m;
}

// ------------------------------------------
// 戦闘面: 地形特性（原作 toku[0..3]。battlelib.pl:76-81 の tokunum に相当）
// terrainType: 1=地上, 2=水中, 3=宇宙, 4=空中
// ------------------------------------------
export function terrainTraitMod(t: Traits, terrainType: number): number {
  let mod = 1.0;
  if (terrainType === 1) mod += 0.05 * lv(t, '豪胆') - 0.05 * lv(t, '冷酷');
  else if (terrainType === 2) mod += 0.05 * lv(t, 'おおらか') - 0.05 * lv(t, 'さわやか');
  else if (terrainType === 3) mod += 0.05 * lv(t, '冷酷') - 0.05 * lv(t, '豪胆');
  else if (terrainType === 4) mod += 0.05 * lv(t, 'さわやか') - 0.05 * lv(t, 'おおらか');
  return mod;
}

// ------------------------------------------
// 戦闘面: スキル発動率（1/denom）の特性補正
// 原作は 1/(base - toku[N]/係数) 型（battlelib.pl:556-620, 1020）
//   melee=格闘(toku[10]/手が早い) focus_fire=集中射撃(機転が利く) snipe=精密射撃(冷静)
//   provoke=挑発(toku[13]/自惚れ屋) focus=集中(toku[14]/一途) counter=反撃(toku[17]/執念深い)
// ------------------------------------------
export type TriggerSkill = 'melee' | 'focus_fire' | 'snipe' | 'provoke' | 'focus' | 'counter';

export function skillTriggerDenom(t: Traits, skill: TriggerSkill): number {
  switch (skill) {
    case 'melee': return probDenom(5, lv(t, '手が早い'), 5, 3);
    case 'focus_fire': return probDenom(5, lv(t, '機転が利く'), 5, 3);
    case 'snipe': return probDenom(5, lv(t, '冷静'), 5, 3);
    case 'provoke': return probDenom(5, lv(t, '自惚れ屋'), 5, 3);
    case 'focus': return probDenom(20, lv(t, '一途'), 2, 15);
    case 'counter': return probDenom(30, lv(t, '執念深い'), 2, 25);
  }
}

function probDenom(base: number, traitLv: number, divisor: number, floor: number): number {
  if (!traitLv) return base;
  return Math.max(floor, base - Math.floor(traitLv / divisor));
}

// ------------------------------------------
// 戦闘面: 防御・維持系
// ------------------------------------------

// 盾防御率%（原作 30 + toku[23]*2 = 頑丈。battlelib.pl:840）
export const shieldBlockPct = (t: Traits): number => 30 + lv(t, '頑丈') * 2;

// 拡散ビームのEN消費分母（原作 20 + toku[22]*2 = おとぼけ。battlelib.pl:442）
export const kakusanDrainDivisor = (t: Traits): number => 20 + lv(t, 'おとぼけ') * 2;

// Iフィールド維持のEN消費分母（原作 40 + toku[21]*2 = 新しものずき。battlelib.pl:429）
export const iFieldDrainDivisor = (t: Traits): number => 40 + lv(t, '新しものずき') * 2;

// 索敵ボーナス（原作 toku[36]*2 相当 = 注意深い。battlelib.pl:632。現行は ×3）
export const sensorTraitBonus = (t: Traits): number => lv(t, '注意深い') * 3;

// サポート補給量ボーナス（原作 spt_heal = 気前がいい − 倹約家。battlelib.pl:1075）
export const supportHealBonus = (t: Traits): number => lv(t, '気前がいい') - lv(t, '倹約家');

// 特攻の中距離許可（原作 hani <= 1 + int(toku[15]/6)。battlelib.pl:1134。Lv6以上で中距離も可）
export const kamikazeMidRangeOk = (t: Traits): boolean => lv(t, '暴走ぎみ') >= 6;

// 回復の中距離許可（原作 hani >= 3 - int(toku[16]/6)。battlelib.pl:1152）
export const recoverMidRangeOk = (t: Traits): boolean => lv(t, 'しぶとい') >= 6;

// ------------------------------------------
// 経済・報酬面
// ------------------------------------------

// コスト割引（原作 msvs.cgi:1483-1487 = toku[17]…器用。cost - int(cost/(20-器用))）
// ※旧実装は calcCost（クランプなし）と team_seibi（min(19)クランプ）で分裂していた。
//   器用>=20 でゼロ除算になるためクランプ版に統一（Lv19以下では両者同値）。
export function applyCostDiscount(t: Traits, cost: number): number {
  const kiyou = lv(t, '器用');
  if (kiyou <= 0) return cost;
  return cost - Math.floor(cost / (20 - Math.min(19, kiyou)));
}

// バイオセンサー戦果倍率（P21。ごうつくばり=toku[20]系 − ずうずうしい）
export const bioSensorMul = (t: Traits): number =>
  Math.max(1.0, 1.2 + (lv(t, 'ごうつくばり') - lv(t, 'ずうずうしい')) / 100);

// 名声獲得バイアス（原作 battle.cgi:136,140 の (toku[24]−toku[32])/10 = ずうずうしい − 人間嫌い）
export const fameGainBias = (t: Traits): number => (lv(t, 'ずうずうしい') - lv(t, '人間嫌い')) / 10;

// 戦闘後修復バイアス（P18-e。けちんぼ − 運が悪い > rand(20) で修復）
export const repairBias = (t: Traits): number => lv(t, 'けちんぼ') - lv(t, '運が悪い');

// ------------------------------------------
// 整備・カスタマイズ面（原作 anahaim_act.cgi custmaise:169-171 / custmaise_2:311-315）
// ------------------------------------------

// カスタマイズ失敗確率の基礎値（lp − int(人間嫌い/3)。上限は消費側でクランプ）
export const customizeFailBase = (t: Traits, lp: number): number =>
  lp - Math.trunc(lv(t, '人間嫌い') / 3);

// カスタマイズ失敗判定 rand の上限（60 + 人間嫌い/2。原作は小数のまま使う）
export const customizeFailRandMax = (t: Traits): number => 60 + lv(t, '人間嫌い') / 2;

// 安全カスタム回数の閾値（base − int((機体Lv−40)/6) − 運が悪い/2。
// base: 通常カスタム=20 / 置き換えカスタム=25。原作は小数のまま比較する）
export const customizeSafeThreshold = (t: Traits, unitLv: number, base: number): number =>
  base - Math.trunc((unitLv - 40) / 6) - lv(t, '運が悪い') / 2;

// ------------------------------------------
// 訓練面（P19。原作 rand(10) < 9 − toku[33]/5 + toku[31]/10 = 運が悪い/ナルシスト）
// ------------------------------------------
export const trainingSuccessTraitTerm = (t: Traits): number =>
  lv(t, 'ナルシスト') / 10 - lv(t, '運が悪い') / 5;

// 寄付の名声 rand 上限（training.cgi:734 rand(5 + ずうずうしい/5)。特性項は小数のまま・int は rand 結果に掛かる）
export const baimeiFameRandMax = (t: Traits): number =>
  5 + lv(t, 'ずうずうしい') / 5;

// ==========================================
// 以下、P47（原作1:1移植エンジン battleLogic.ts）用の原作式アクセサ。
// 上の旧式アクセサ（distanceHitMul等）は旧エンジンの挙動封じ込め用で、
// battleLogic からは使わない。B2完了後に旧式側は削除予定。
// ==========================================

// 距離系特性の tokukyori（battlelib:749-769。toku[4..9]=短気/熱血/中途半端/凡庸/沈着/策士）
// 攻撃側: hani1=1+(短気/10−策士/10)/2, hani2=1+(中途半端/10−熱血/10)/2, hani3=1+(沈着/10−凡庸/10)/2
// 回避側: hani1=1+(熱血/10−沈着/10)/2, hani2=1+(凡庸/10−短気/10)/2, hani3=1+(策士/10−中途半端/10)/2
// 結果が0のときは0.1（battlelib:768-769）
const tokukyoriPair = (a: number, b: number): number => {
  const v = 1 + (a / 10 - b / 10) / 2;
  return v === 0 ? 0.1 : v;
};
export function tokukyoriAtk(t: Traits, hani: number): number {
  if (hani === 1) return tokukyoriPair(lv(t, '短気'), lv(t, '策士'));
  if (hani === 2) return tokukyoriPair(lv(t, '中途半端'), lv(t, '熱血'));
  return tokukyoriPair(lv(t, '沈着'), lv(t, '凡庸'));
}
export function tokukyoriDef(t: Traits, hani: number): number {
  if (hani === 1) return tokukyoriPair(lv(t, '熱血'), lv(t, '沈着'));
  if (hani === 2) return tokukyoriPair(lv(t, '凡庸'), lv(t, '短気'));
  return tokukyoriPair(lv(t, '策士'), lv(t, '中途半端'));
}

// 地形効果の特性倍率の素点 tokunum（battlelib:76-79。toku[0..3]=豪胆/おおらか/冷酷/さわやか）
// wsenjyo: 1=地上(豪胆−int(冷酷/2)), 2=水中(おおらか−int(さわやか/2)), 3=宇宙(冷酷−int(豪胆/2)), 4=空中(さわやか−int(おおらか/2))
// 倍率への変換 (tokunum/20)+1 は battleLogic 側（battlelib:81）
export function terrainTokunum(t: Traits, wsenjyo: number): number {
  if (wsenjyo === 1) return lv(t, '豪胆') - Math.trunc(lv(t, '冷酷') / 2);
  if (wsenjyo === 2) return lv(t, 'おおらか') - Math.trunc(lv(t, 'さわやか') / 2);
  if (wsenjyo === 3) return lv(t, '冷酷') - Math.trunc(lv(t, '豪胆') / 2);
  if (wsenjyo === 4) return lv(t, 'さわやか') - Math.trunc(lv(t, 'おおらか') / 2);
  return 0;
}

// 索敵圏の拡張（battlelib:632 の toku[36]*2 = 注意深い）
export const sensorRangeBonus = (t: Traits): number => lv(t, '注意深い') * 2;

// スキル発動の分母（原作は int(rand(分母))==0。分母は小数のまま使う）
// battlelib:556(格闘)/564(連続射撃)/572(精密射撃)/581(挑発)/588(集中)/1020(反撃)
export function origSkillDenom(t: Traits, skill: TriggerSkill): number {
  switch (skill) {
    case 'melee': return 5 - lv(t, '手が早い') / 5;
    case 'focus_fire': return 5 - lv(t, '機転が利く') / 5;
    case 'snipe': return 5 - lv(t, '冷静') / 5;
    case 'provoke': return 5 - lv(t, '自惚れ屋') / 5;
    case 'focus': return 20 - lv(t, '一途') / 2;
    case 'counter': return 30 - lv(t, '執念深い') / 2;
  }
}

// 特攻の範囲条件 hani <= 1 + int(暴走ぎみ/6)（battlelib:1134）
export const kamikazeRangeGate = (t: Traits): number => 1 + Math.trunc(lv(t, '暴走ぎみ') / 6);
// 回復の範囲条件 hani >= 3 − int(しぶとい/6)（battlelib:1152）
export const recoverRangeGate = (t: Traits): number => 3 - Math.trunc(lv(t, 'しぶとい') / 6);

// --- 戦闘後処理（B3。battle.cgi）---

// バイオセンサー(-17)所持時の戦果乱数補正 (ごうつくばり−ずうずうしい)/10（battle.cgi:151）
export const goldTraitRand = (t: Traits): number => (lv(t, 'ごうつくばり') - lv(t, 'ずうずうしい')) / 10;

// 機体損傷判定に足される特性分 運が悪い＋ごうつくばり＋ずうずうしい（battle.cgi:197）
export const sonsyoTraitBonus = (t: Traits): number =>
  lv(t, '運が悪い') + lv(t, 'ごうつくばり') + lv(t, 'ずうずうしい');

// 機体フェチによる損傷回避 機体フェチ−運が悪い > rand(20)（battle.cgi:213）
export const kitaiFetishSave = (t: Traits): number => lv(t, '機体フェチ') - lv(t, '運が悪い');
