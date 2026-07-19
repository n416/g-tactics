// ==========================================
// P47-B1: 原作戦闘エンジンの1:1移植
// 原典: 原作 sub/battlelib.pl (battle_logic) / sub/dmg_calc.pl
//
// 移植原則:
// - 処理順・式・確率は battlelib.pl のセクション順のまま。全式に出典行コメント。
// - Perl の int() は Math.trunc、int(rand(x)) は irand(x)（x は小数のまま）で再現。
// - 特性参照は traitEffects 経由のみ。tokusyu は合流済みリスト（applyEquipmentTokusyu 後）
//   から起こした named flags（initFlags）経由のみ。
// - 側の添字は原作と同じ 0=挑戦側 / 1=防衛側。opp = 1 - i。
// ==========================================

import {
  tacticTraitLv, tokukyoriAtk, tokukyoriDef, terrainTokunum, sensorRangeBonus,
  origSkillDenom, shieldBlockPct, kakusanDrainDivisor, iFieldDrainDivisor,
  kamikazeRangeGate, recoverRangeGate,
} from './traitEffects';
import { TOKUSYU_REGISTRY } from './tokusyuEffects';

// Perl rand(x)（0以上x未満の実数）／ int(rand(x))
const rand = (x: number) => Math.random() * Math.max(0, x);
const irand = (x: number) => Math.floor(rand(x));
const int = Math.trunc;

// 基本反応値（battlelib:153。機熟×2 を含む＝P46台帳§2・ファン解析「基本反応値」と一致）
export const baseReaction = (saku: number, un: number, sou: number, aisyo: number, nt: number): number =>
  (saku + un + sou) * 2 + aisyo * 2 + Math.abs(nt) * 10;

// ------------------------------------------
// 入出力の型
// ------------------------------------------

// 戦闘参加者。battleEngine のアダプタ（prepareLogicFighter）が組み立てる。
export interface LFighter {
  name: string;              // 表示名
  unitName: string;
  hp: number; maxHp: number;         // $tai / $maxtai（保存値そのまま。仕様§2-1）
  en: number; maxEn: number;         // $en / $maxen（装備 tokusyu 適用後）
  sou: number; un: number; saku: number;   // 装甲/運動/索敵（装備 tokusyu 適用後）
  n0: number; n1: number;            // 直感 / 操縦
  n2: number; n3: number; n4: number; // 近/中/遠距離
  terrainSkill: number[];            // n_8..n_11 = [地上,水中,宇宙,空中] スキルLv
  lv: number;                        // 熟練度 $lv
  nt: number;                        // n_13（負=強化人間）
  aisyo: number;                     // 機熟 $aisyo（=kaisyo。battlelib:153）
  unitLv: number; lp: number;        // 最大ダメージcap用（battlelib:1012）
  idouEquip: number;                 // dmg_calc の装備移動補正（-2 で 10）
  tactics: string;                   // 戦術2桁 $senjyutu
  traits: Record<string, number>;
  skills: Record<string, any>;       // melee/focus_fire/snipe/provoke/focus/kamikaze/recover/counter/waza{type,name}/ground...
  flags: LFlags;                     // tokusyu 由来の named flags（initFlags）
  weapon: LWeapon | null;
  shieldCount: number;               // dmg_calc:99-106 の枚数 −相手の-21（battlelib:44-53 相当は呼出し側で減算）
  shieldName: string;
  comments: Record<string, any>;     // 名前付きトリガ + other: string[]
  quotes?: string[];                 // 敵NPCセリフ欄（§4.3 推測配線）: [開始, 撃墜, 攻撃×4, 回避]
  // 継続戦闘の状態（battleLogic が読み書きする。原作 $tturn 相当）
  jyotai: number;                    // >0 麻痺 / <0 連続ダメージ
  tama: number;                      // 残弾 $i_tama
  escaped: boolean;                  // 脱出済み $dasyutu
  escapeTable?: (f: LFighter) => { hp: number, name: string } | null; // 脱出先（battleEngine の ESCAPE_UNITS）
}

export interface LWeapon {
  name: string;
  dmg: number;       // $itm_dmg（威力）
  en: number;        // $itm_en（消費EN）
  short: number;     // $itm_short（最短射程 0-99）
  long: number;      // $itm_long（最長射程 0-99）
  hitnum: number;    // $itm_hitnum（攻撃回数）
  syurui: number;    // 1=ビーム 2=実弾 3=格闘（dmg_calc:286-293, battlelib:894,951）
  syurui2: number;   // 第2装備の種別（battlelib:894 の $i_syurui2）
}

// tokusyu 由来 named flags（戦闘中は生 tokusyu を読まない。仕様§6-6）
export interface LFlags {
  exam: boolean; limitCut: boolean; hyperMode: boolean; zero: boolean;
  smoke: boolean; minovsky: boolean; beamJam: boolean;
  iField: boolean; alice: boolean; kakusan: boolean; avionics: boolean;
  selfRepair: boolean; selfRepair2: boolean; activeCloak: boolean;
  kiraiSelf: boolean; enRecover2: boolean; mirage: boolean; phaseShift: boolean;
  kensei: boolean; paralyzer: boolean; balloon: boolean; balloonCancel: boolean;
  meleeBoost: boolean;    // 4: 近接戦闘強化
  waterBoost: boolean;    // 5: 水中攻撃増
  longBoost: boolean;     // 6: 遠距離強化
  midBoost: boolean;      // 9: 中距離強化
  ntWeapon: boolean;      // -24（ファンネル等）
  ntBeamDef: boolean;     // -46
  beamBarrier: boolean;   // -3
  reflector: boolean;     // 8
  coating: boolean;       // 11
  abcMantle: boolean;     // -30
  reflect: boolean;       // -45
  jibaku: boolean;        // 10
  dgCells: boolean;       // -44
  examEnRecover: boolean; // 3 のEN回復（battlelib:402-407）
  escapeDevice: boolean;  // tokusyu>=100 所持
  shieldPierce: boolean;  // -21
}

export interface LSupport {   // チーム戦のサポーター（battlelib:1068-1090）
  active: boolean;
  healBonus: number;          // $spt_heal（気前がいい−倹約家）
  healAmmo: number;           // $spt_heal_t
}

export interface LOpts {
  maxTurns?: number;          // $turn=30（msvs_ini:586）
  wsenjyo?: number;           // 0=無地形 1=地上 2=水中 3=宇宙 4=空中（5=仮想空間は0扱い）
  senjyoOn?: boolean;         // $senjyo_on
  initialKyori?: number;      // 継続戦闘（原作 $tturn）用
  startTurn?: number;         // 継続戦闘の開始ターン番号
  simdmg?: number;            // シミュ敵威力ブースト。仕様§6-2=0
  snare?: [number, number];   // 慣れ補正。ソロ=0確定（台帳§15）
  atkSen?: [number, number];  // 団体戦術補正【攻撃】。ソロ=1.0確定（台帳§15）
  defSen?: [number, number];  // 団体戦術補正【防御】
  support?: [LSupport | null, LSupport | null];
  levelSa?: number;           // $level_sa=5（msvs_ini:615）
  wazaRitu?: number;          // $waza_ritu=15（msvs_ini:618）
  initLogs?: string[];        // アダプタが集めた開戦前メッセージ（EXAM稼働等）
}

export interface LTurnEvent {  // 仕様§5.1: 1ターン=1イベント
  turn: number;
  kyori: number;
  hani: 1 | 2 | 3;
  messages: string[];
  attacker: LSideSnap;
  defender: LSideSnap;
}
export interface LSideSnap {
  hp: number; maxHp: number; en: number; maxEn: number; ammo: number;
  dmgDealt: number; hit: boolean; hitCount: number; evaded?: boolean;
}

export interface LResult {
  logs: string[];
  events: LTurnEvent[];
  win: boolean;        // 挑戦側(0)の勝ち（battlelib:1262-1280）
  kyori: number;
  turns: number;
}

// ------------------------------------------
// セリフ（仕様§4）
// ------------------------------------------

// 名前付きトリガのセリフ。未設定なら「その他」プールから1/2で抽選（§4.4。勝敗はフォールバックなし）
function commentOf(f: LFighter, key: string, fallback: boolean): string | null {
  const c = f.comments || {};
  const v = c[key];
  if (typeof v === 'string' && v.length > 0) return `『【${f.name}】「${v}」』`;
  if (Array.isArray(v) && v.length > 0) return `『【${f.name}】「${v[irand(v.length)]}」』`;
  if (fallback && irand(2) === 0) {
    const others = Array.isArray(c.other) ? c.other : [];
    if (others.length > 0) return `『【${f.name}】「${others[irand(others.length)]}」』`;
  }
  return null;
}

// 攻撃時セリフ（battlelib:727-737 の msg[5..] プール = 「その他」§4.1/§4.4。抽選1/2は呼び出し側）
function pickAttackQuip(f: LFighter): string | null {
  const others = Array.isArray(f.comments?.other) ? f.comments.other : [];
  if (others.length > 0) return `『【${f.name}】「${others[irand(others.length)]}」』`;
  return npcQuote(f, 'attack');
}

// 敵NPCセリフ欄（§4.3 推測配線: [0]=開始 [1]=撃墜 [2..5]=攻撃 [6]=回避）
function npcQuote(f: LFighter, slot: 'start' | 'down' | 'attack' | 'evade'): string | null {
  const q = f.quotes;
  if (!q || q.length < 7) return null;
  let text: string | undefined;
  if (slot === 'start') text = q[0];
  else if (slot === 'down') text = q[1];
  else if (slot === 'attack') text = q[2 + irand(4)];
  else text = q[6];
  return text ? `『【${f.name}】「${text}」』` : null;
}

// ------------------------------------------
// 個人戦術の係数（battlelib:786-808）
// P46b の calcTacticCoeffs と同じ式だが、teamCo を含まない純粋版
// （団体戦術補正は atkSen/defSen として原作のスロットに接続する。仕様§6-1）
// ------------------------------------------
function senCoeffs(senIdo: number, senAtk: number, oppSenAtk: number, traits: Record<string, number>) {
  let atkup = 1, kaiup = 1, dmgUp = 1, defUp = 1;
  // 片側だけ攻撃系設定 → 無設定側 ×0.4（battlelib:792）
  if (!senAtk && oppSenAtk) { atkup *= 0.4; kaiup *= 0.4; }
  if (senIdo === 1) { atkup *= 0.8; kaiup *= 1.2; dmgUp *= 0.8; defUp *= 0.8; }  // battlelib:793
  if (senIdo === 3) { atkup *= 1.2; kaiup *= 0.8; dmgUp *= 1.2; defUp *= 1.2; }  // battlelib:795
  const l = tacticTraitLv(traits, senAtk) / 25;
  if (senAtk === 4) { atkup *= 1.1 + l; kaiup *= 0.8 + l; dmgUp *= 1.3 + l; defUp *= 0.8 + l; } // battlelib:796
  if (senAtk === 5) { atkup *= 0.9 + l; kaiup *= 1.3 + l; dmgUp *= 0.8 + l; defUp *= 1.4 + l; } // battlelib:797
  if (senAtk === 6) { atkup *= 1.3 + l; kaiup *= 1.2 + l; dmgUp *= 0.9 + l; defUp *= 0.8 + l; } // battlelib:798
  if (senAtk === 7) { atkup *= 1 + l; kaiup *= 1 + l; dmgUp *= 1 + l; defUp *= 1 + l; }         // battlelib:799
  // じゃんけん負け（battlelib:800-808）
  if ((senAtk === 4 && oppSenAtk === 5) || (senAtk === 5 && oppSenAtk === 6) ||
      (senAtk === 6 && oppSenAtk === 7) || (senAtk === 7 && oppSenAtk === 4)) {
    atkup *= 0.4; kaiup *= 0.4; defUp *= 0.5;
  }
  return { atkup, kaiup, dmgUp, defUp };
}

// ------------------------------------------
// 戦闘本体（battlelib.pl:17-1281 battle_logic の戦闘判定部）
// ------------------------------------------
export function battleLogic(f: [LFighter, LFighter], opts: LOpts = {}): LResult {
  const maxTurns = opts.maxTurns ?? 30;                       // msvs_ini:586
  const wsenjyoRaw = opts.wsenjyo ?? 0;
  const wsenjyo = (wsenjyoRaw >= 1 && wsenjyoRaw <= 4) ? wsenjyoRaw : 0; // 5=仮想空間は無地形扱い（仕様§3.8注）
  const senjyoOn = opts.senjyoOn ?? (wsenjyo > 0);
  const levelSa = opts.levelSa ?? 5;                          // msvs_ini:615
  const wazaRitu = opts.wazaRitu ?? 15;                       // msvs_ini:618
  const simdmg = opts.simdmg ?? 0;
  const snare = opts.snare ?? [0, 0];
  const atkSen = opts.atkSen ?? [1, 1];                       // 団体戦術補正・ソロ=1（台帳§15）
  const defSen = opts.defSen ?? [1, 1];
  const support = opts.support ?? [null, null];

  const logs: string[] = [...(opts.initLogs ?? [])];
  const events: LTurnEvent[] = [];

  // ===== 戦闘前変数修正（battlelib:21-91） =====
  const hp = [f[0].hp, f[1].hp];                              // $hp_flg（battlelib:25）
  const en = [f[0].en, f[1].en];
  const maxen = [f[0].maxEn, f[1].maxEn];
  const maxtai = [f[0].maxHp, f[1].maxHp];
  const tama = [f[0].tama, f[1].tama];
  const bakDmg = [f[0].weapon?.dmg ?? 10, f[1].weapon?.dmg ?? 10];  // $bak_dmg（武器なし=10。dmg_calc:50）
  const bakHitnum = [f[0].weapon?.hitnum || 1, f[1].weapon?.hitnum || 1];
  const iEn = [f[0].weapon?.en ?? 0, f[1].weapon?.en ?? 0];
  const iShort = [f[0].weapon?.short ?? 0, f[1].weapon?.short ?? 0];
  const iLong = [f[0].weapon?.long ?? 0, f[1].weapon?.long ?? 0];
  const hasItem = [!!f[0].weapon, !!f[1].weapon];
  const iName = [f[0].weapon?.name ?? 'なし', f[1].weapon?.name ?? 'なし'];
  const wazaName = (i: number) => f[i].skills?.waza?.name || '技';

  // 移動力 = 装備補正 + int(運動/6 + 操縦/100 + 1)（battlelib:56）
  const idouBak = [0, 0];
  const senIdo = [0, 0];
  const senAtk = [0, 0];
  const tikeikoka = [0, 0];
  for (const i of [0, 1]) {
    let idou = f[i].idouEquip + int(f[i].un / 6 + f[i].n1 / 100 + 1);

    // 戦術の確定（battlelib:57-68。8=おまかせ）
    const t = String(f[i].tactics ?? '00').padStart(2, '0');
    let ido = parseInt(t[0], 10) || 0;
    let atk = parseInt(t[1], 10) || 0;
    if (ido === 8) { ido = irand(3) + 1; if (ido > 3) ido = 3; }
    if (atk === 8) { atk = irand(4) + 1 + 3; if (atk > 7) atk = 7; }
    senIdo[i] = ido; senAtk[i] = atk;

    // 地形効果（battlelib:72-82）: キャラ地形スキル×50 + 機体地形×75(dmg_calc:274は呼出し側で加算済みのtikeiKoka)
    if (senjyoOn && wsenjyo >= 1) {
      const tikeinum = f[i].terrainSkill[wsenjyo - 1] || 0;
      const tokunum = terrainTokunum(f[i].traits, wsenjyo);
      const machine = (f[i] as any).tikeiKoka ?? 0;           // dmg_calc:274 の $tikei_koka
      tikeikoka[i] = tikeinum * 50 + machine;
      if (tikeikoka[i] > 0) tikeikoka[i] = int((tikeinum * 50 + machine) * ((tokunum / 20) + 1)); // battlelib:81
    }

    // 戦術での移動力修正（battlelib:85-88）
    if (senIdo[i] === 1) idou = int(idou * 0.3) + 1;
    else if (senIdo[i] === 2) idou = int(idou * 1) + 1;
    else if (senIdo[i] === 3) idou = int(idou * 0.5) + 1;
    else if (senIdo[1 - i] >= 1 && senIdo[1 - i] <= 3) idou = int(idou * 0.1) + 1;
    idouBak[i] = idou;
  }

  // ===== 初期化（battlelib:94-136） =====
  let kyori = opts.initialKyori ?? irand(99);                 // battlelib:97
  const jyotai = [f[0].jyotai || 0, f[1].jyotai || 0];
  const exam: number[] = [-2, -2];
  const frstAtk = [!opts.startTurn, !opts.startTurn];         // 継続戦闘では初回発動をスキップ（battlelib:119-136）
  let srdmgflg = 0, lrdmgflg = 0, beamdmgflg = 0;
  let win = hp[1] <= hp[0];                                   // battlelib:1280 の毎ターン評価に合わせた初期値

  let turnNo = opts.startTurn ?? 1;
  let turnsDone = 0;

  // ===== 戦闘判定ループ（battlelib:140-1281） =====
  for (let loop = 1; loop <= maxTurns; loop++) {
    const msg: string[] = [];                                  // そのターンの表示列（imsg/com/clit/kawasi合成）
    const imsg: string[] = ['', ''];
    const com: string[] = ['', ''];
    const clit: string[] = ['', ''];
    const kawasi: string[] = ['', ''];
    const skl: string[] = ['', ''];
    const wazaon = [false, false];
    const sakuon = [1, 1];
    const pson = [1, 1];
    const iDmg = [bakDmg[0], bakDmg[1] + simdmg];              // battlelib:143-144
    const iHitnum = [bakHitnum[0], bakHitnum[1]];
    const dmg = [0, 0];                                        // 命中基礎（この変数名は原作準拠）
    const sakuKeka = [1, 1];
    const tokukyori = [1, 1, 1, 1];                            // [攻0,攻1,防0,防1]
    const dmgUpArr = [1, 1]; const defUpArr = [1, 1];
    const senAtkupArr = [1, 1]; const senKaiupArr = [1, 1];
    const idou = [idouBak[0], idouBak[1]];

    // ##### ターン毎初期（battlelib:149-266） #####
    for (const i of [0, 1]) {
      // 命中基本セット: (索敵+運動+装甲)*2 + 機熟*2 + |NT|*10（battlelib:153）
      dmg[i] = baseReaction(f[i].saku, f[i].un, f[i].sou, f[i].aisyo, f[i].nt);

      // ミラージュコロイドの pson 判定（battlelib:157-161）
      if (f[i].flags.mirage) pson[i] = en[i] >= int(maxen[i] / 4 * 3) ? 0 : 1;

      if (frstAtk[i]) {
        // レベル差逆転（battlelib:166-170）
        if (f[1 - i].lv - f[i].lv >= levelSa && !opts.startTurn) {
          imsg[i] += `${f[i].name}の体から鬨が炎のようなものが湧き上がる・・・。`;
          dmg[i] = dmg[i] * 10;
        }
        // 地形効果メッセージ（battlelib:172-182。形容詞は仕様§4.5の創作）
        if (tikeikoka[i] > 0) imsg[i] += `この戦場では${f[i].unitName}の動きが${tikeiKeiyo(tikeikoka[i])}軽い！`;
        else if (tikeikoka[i] < 0) imsg[i] += `この戦場では${f[i].unitName}の動きが${tikeiKeiyo(tikeikoka[i])}鈍い！`;

        // 機体発動（battlelib:184-251）
        let exlimit = 0;
        if (f[i].flags.smoke) { imsg[i] += `${f[i].name}はスモークを焚いた！`; srdmgflg += 4; }
        if (f[i].flags.minovsky) { imsg[i] += `${f[i].name}はミノフスキー粒子を散布した！`; lrdmgflg += 4; }
        if (f[i].flags.beamJam) { imsg[i] += `${f[i].name}はビーム撹乱幕を散布した！`; beamdmgflg += 4; }
        if (f[i].flags.limitCut) { imsg[i] += `${f[i].name}はリミッターを解除した！`; exam[i] = 3; exlimit++; }
        if (f[i].flags.hyperMode) { imsg[i] += `${f[i].name}の機体が金色に輝く！`; exam[i] = 0.5; }
        if (f[i].flags.zero) { imsg[i] += `－－ゼロシステム発動－－`; }
        if (f[i].flags.exam) { imsg[i] += `－－ＥＸＡＭシステム稼動－－`; exam[i] = 1; exlimit++; }
        if (exlimit >= 2) exam[i] = 5;                          // battlelib:248-251
        // 開始セリフ（§4.2 推測配線）
        const sc = commentOf(f[i], 'start', true) ?? npcQuote(f[i], 'start');
        if (sc) imsg[i] += sc;
      } else {
        // ＥＸＡＭ停止チェック（battlelib:255-262）
        if (irand(100) <= exam[i] * 10 && exam[i] > 0) {
          imsg[i] += `${f[i].name}の機体がオーバーヒートした！？`;
          exam[i] = -1;
        }
      }
      frstAtk[i] = false;
    }

    // ##### 移動（battlelib:268-386） #####
    // 移動力の低い方が先（battlelib:269）
    const order = idouBak[0] <= idouBak[1] ? [0, 1] : [1, 0];
    for (const i of order) {
      idou[i] = idouBak[i];
      let tomemuko = false;
      // バルーン効果（battlelib:277-287）
      if (f[i].flags.balloon && en[i] > iEn[i] + int(maxen[i] / 20)) {
        tomemuko = true;
        en[i] -= int(maxen[i] / 20);
        imsg[i] += `ダミーバルーン射出。`;
        if (!irand(5)) { com[i] += `ダミーバルーンの影に隠れて${f[1 - i].name}を確認できない！`; sakuon[i] = 0; }
      }
      // 機雷効果（battlelib:290-306）
      if (f[1 - i].flags.kiraiSelf && en[1 - i] > iEn[1 - i] + int(maxen[1 - i] / 20)) {
        en[1 - i] -= int(maxen[1 - i] / 20);
        imsg[1 - i] += `機雷射出。`;
        if (tomemuko) imsg[i] += `機雷はダミーで暴発して役に立たない。`;
        else if (irand(8)) { imsg[i] += `機雷のせいで身動きできない。`; idou[i] = 0; }
        else imsg[i] += `機雷を避けた。`;
      }
      // 足止め（battlelib:308-346）
      if (idou[i] && senIdo[1 - i] === 1) {
        if (senIdo[i] === 3 && jyotai[1 - i] <= 0) {
          imsg[i] += `${f[1 - i].name}は足止めしようとしたが、${f[i].name}には通じなかった。`;
          tomemuko = true;
        } else if (tomemuko && jyotai[1 - i] <= 0) {
          if (f[1 - i].flags.balloonCancel) tomemuko = false;   // battlelib:317-321
          if (tomemuko) {
            if (irand(8)) imsg[i] += `${f[1 - i].name}の足止めの攻撃はダミーに当たった。`;
            else imsg[i] += `${f[i].name}は足止めされた。`;
          } else imsg[i] += `${f[1 - i].name}の偵察装置のせいでダミーが役に立たない。`;
        } else tomemuko = false;
        if (!tomemuko) {
          const idook = senIdo[i] !== 1 ? 6 : 2;                // battlelib:334
          if (irand(10) <= idook && jyotai[1 - i] <= 0) {
            imsg[i] += `${f[i].name}は${f[1 - i].name}の攻撃で足止めされてしまっている。`;
            idou[i] = 0;
          } else {
            imsg[i] += `${f[1 - i].name}の足止めの攻撃をかわして`;
            idou[i] = int(idou[i] / 7 * 5) + 1;
          }
        }
      }
      // 移動実行（battlelib:348-385。武器レンジ i_short〜i_long に寄せる・行きすぎ補正）
      if (idou[i] && jyotai[i] <= 0) {
        let pre = '';
        if (senIdo[i] === 2) pre = '思い切り';                  // battlelib:350（原文復元）
        if (senIdo[i] === 3) pre = 'ゆっくりと';                // battlelib:351（原文復元）
        if (kyori < iShort[i]) {
          kyori = int(kyori + idou[i]);
          imsg[i] += `${f[i].name}は${pre}離れた。`;
          if (kyori > iLong[i]) kyori = iLong[i];               // battlelib:360-365
          if (kyori > 99) kyori = 99;
        } else if (kyori > iLong[i]) {
          kyori = int(kyori - idou[i]);
          imsg[i] += `${f[i].name}は${pre}接近した。`;
          if (kyori < iShort[i]) kyori = iShort[i];             // battlelib:376-381
          if (kyori < 0) kyori = 0;
        }
      }
    }

    // 距離と範囲設定（battlelib:388-393）
    if (kyori < 0) kyori = 0;
    if (kyori > 99) kyori = 99;
    const hani: 1 | 2 | 3 = kyori <= 33 ? 1 : kyori <= 66 ? 2 : 3;

    // 武器が使える状態か（battlelib:711 等で頻出する共通条件）
    const weaponOk = (i: number) =>
      hasItem[i] && tama[i] > 0 && en[i] >= iEn[i] && kyori >= iShort[i] && kyori <= iLong[i];

    // ##### 機体修正（battlelib:396-550） #####
    for (const i of [0, 1]) {
      const fl = f[i].flags;
      if (fl.examEnRecover) {                                   // 3: EN回復（battlelib:402-407）
        en[i] = int(en[i] * 1.1);
        if (en[i] >= maxen[i]) en[i] = maxen[i];
        imsg[i] += `　ＥＮ回復！`;
      }
      if (fl.meleeBoost && hani === 1) dmg[i] *= 1.7;           // 4: 近接強化（battlelib:409-412）
      if (fl.waterBoost && wsenjyo === 2) iDmg[i] *= 1.25;      // 5: 水中攻撃増（battlelib:414-417）
      if (fl.longBoost && hani === 3) dmg[i] *= 1.7;            // 6: 遠距離強化（battlelib:419-422）
      if (fl.midBoost && hani === 2) dmg[i] *= 1.7;             // 9: 中距離強化（battlelib:424-427）
      if (fl.iField && en[i] > 60 + int(maxen[i] / iFieldDrainDivisor(f[i].traits))) {  // 7:（battlelib:429-434）
        en[i] -= int(maxen[i] / iFieldDrainDivisor(f[i].traits));
        if (en[i] <= 0) en[i] = 0;
        imsg[i] += `　Ｉフィールド装備のためＥＮ消費。`;
      }
      if (fl.alice && hp[i] < int(maxtai[i] * 0.25) && !irand(4)) {  // 12: ALICE（battlelib:436-440）
        imsg[i] += `ＡＬＩＣＥに機体を操作された！`;
        dmg[i] *= 8;
      }
      if (fl.kakusan && hani === 1 && en[i] > int(maxen[i] / kakusanDrainDivisor(f[i].traits))) { // -8（battlelib:442-448）
        en[i] -= int(maxen[i] / kakusanDrainDivisor(f[i].traits));
        if (en[i] <= 0) en[i] = 0;
        dmg[1 - i] = 0;
        imsg[i] += `${f[i].name}は拡散ビームで${f[1 - i].name}を牽制した。`;
      }
      if (fl.avionics) dmg[i] *= 1.5;                           // -11（battlelib:450-453）
      if (fl.selfRepair) {                                      // -29（battlelib:455-472）
        if (!irand(20)) {
          const wk = irand(maxtai[i] / 2);
          hp[i] = Math.max(0, hp[i] - wk);
          imsg[i] += `　回復機能が暴走！${wk} のダメージ！`;
        } else {
          hp[i] = Math.min(maxtai[i], hp[i] + irand(10) + 1);
          en[i] = Math.min(maxen[i], en[i] + irand(10) + 1);
          imsg[i] += `　耐久力・ＥＮ回復！`;
        }
      }
      if (fl.selfRepair2) {                                     // -35（battlelib:474-481）
        hp[i] = Math.min(maxtai[i], hp[i] + irand(5) + 1);
        en[i] = Math.min(maxen[i], en[i] + irand(10) + 1);
        imsg[i] += `　耐久力・ＥＮ回復！`;
      }
      if (fl.activeCloak && hani === 3) {                       // -34（battlelib:483-487）
        dmg[1 - i] = int(dmg[1 - i] * 0.1);
        imsg[1 - i] += `　索敵が難しい！`;
      }
      if (fl.kiraiSelf && en[i] > iEn[i] + int(maxen[i] / 20)) { // -37 自爆（battlelib:489-498）
        if (!irand(10)) {
          const wk = irand(maxtai[i] / 5);
          hp[i] = Math.max(0, hp[i] - wk);
          imsg[i] += `　機雷に触れてしまった！${wk} のダメージ！`;
        }
      }
      if (fl.enRecover2 && iEn[i] > en[i]) {                    // -38（battlelib:500-505）
        en[i] = Math.min(maxen[i], en[i] + int(maxen[i] / 20));
        imsg[i] += `　ＥＮチャージ中！`;
      }
      if (fl.mirage) {                                          // -40（battlelib:507-519）
        if (en[i] >= int(maxen[i] / 4 * 3) && en[i] >= 4) {
          en[i] = Math.max(0, en[i] - int(maxen[i] / 20) - 1);
          imsg[i] += `　ミラージュコロイド発動のためＥＮ消費。`;
          sakuon[1 - i] = 0;
        } else {
          sakuon[1 - i] = 1;
        }
      }
      if (fl.phaseShift && en[i] >= int(maxen[i] / 4) && pson[i] && en[i] >= 4) { // -39（battlelib:521-526）
        en[i] = Math.max(0, en[i] - 10);
        imsg[i] += `　フェイズシフト発動のためＥＮ消費。`;
      }
      if (fl.kensei && !jyotai[i] && weaponOk(i)) {             // -47 牽制（battlelib:528-532）
        dmg[1 - i] = dmg[1 - i] / 2;
        imsg[1 - i] += `${f[i].name}の攻撃のせいで狙いづらい！`;
      }
      // TODO(P47): tokusyu ≤-100 の特殊メッセージ（battlelib:543-548）と ≤-500 の画像変化（battlelib:240-246）は
      // メッセージ定義ファイル（$itemmsg_file）と画像規約が入手資料に未収録のため未実装。
      if (fl.paralyzer && !jyotai[1 - i] && en[i] >= int(maxen[i] / 2) + 1 && !irand(30)) { // -48 麻痺（battlelib:534-542）
        en[i] = Math.max(0, en[i] - int(maxen[i] / 10));
        clit[i] += `${f[i].name}は${iName[i]}で${f[1 - i].name}の電子機器を麻痺させた！`;
        jyotai[1 - i] = irand(2) + 1;
        dmg[1 - i] = 0;
        iHitnum[i] = 1;
      }
    }

    // ##### スキル判定（１）（battlelib:552-624） #####
    for (const i of [0, 1]) {
      const sk = f[i].skills || {};
      const tr = f[i].traits;
      // 格闘（battlelib:556-562）
      if ((sk.melee || 0) > 0 && hani === 1 && !irand(origSkillDenom(tr, 'melee'))) {
        dmg[i] *= sk.melee * 4;
        dmg[1 - i] /= sk.melee + 1;
        iHitnum[i] *= sk.melee;
        imsg[i] += `格闘戦に持ち込んだ！`;
        const c = commentOf(f[i], 'melee', true); if (c) imsg[i] += c;   // §4.2 推測配線
      }
      // 連続射撃（battlelib:564-570。hitnum が n_5(格闘)を参照するのは原作のバグごと移植）
      if ((sk.focus_fire || 0) > 0 && hani === 2 && !irand(origSkillDenom(tr, 'focus_fire'))) {
        dmg[i] *= sk.focus_fire * 3;
        dmg[1 - i] /= sk.focus_fire + 1;
        iHitnum[i] *= (sk.melee || 0) + 2;
        imsg[i] += `連続射撃を行った！`;
        const c = commentOf(f[i], 'rensha', true); if (c) imsg[i] += c;
      }
      // 精密射撃（battlelib:572-579）
      if ((sk.snipe || 0) > 0 && hani === 3 && !irand(origSkillDenom(tr, 'snipe'))) {
        dmg[i] *= sk.snipe * 3;
        iDmg[i] *= 2;
        dmg[1 - i] /= sk.snipe + 1;
        iHitnum[i] = 1;
        imsg[i] += `精密射撃を行った！`;
        const c = commentOf(f[i], 'seimitsu', true); if (c) imsg[i] += c;
      }
      // 挑発（battlelib:581-586）
      if (sk.provoke && !irand(origSkillDenom(tr, 'provoke'))) {
        dmg[1 - i] = 0;
        iDmg[1 - i] = 0;
        imsg[i] += `${f[1 - i].name}に挑発した！`;
      }
      // 集中（battlelib:588-593）
      if (sk.focus && !irand(origSkillDenom(tr, 'focus'))) {
        dmg[i] *= 8;
        iDmg[i] *= 4;
        imsg[i] += `集中した！`;
      }
      // 強化人間効果（battlelib:595-609）
      if (f[i].nt < 0 && !irand(7)) {
        if (irand(10) - 5 > 0) {
          dmg[i] *= 8; iDmg[i] *= 4;
          imsg[i] += `突発的に力が湧いた！`;
        } else {
          dmg[i] = int(dmg[i] / 8); iDmg[i] = int(iDmg[i] / 4);
          imsg[i] += `突然、力が抜けた！`;
        }
      }
      // 技術（耐久力回復）（battlelib:611-616）
      if (f[i].nt === 0 && f[i].skills?.waza?.type === 4 && !irand(15)) {
        hp[i] = Math.min(maxtai[i], hp[i] + irand(f[i].lv / 5 + 10) + 2);
        imsg[i] += `　${f[i].name}は${wazaName(i)}で耐久を回復した！`;
      }
      // 技術（ＥＮ回復）（battlelib:617-623）
      if (f[i].nt === 0 && f[i].skills?.waza?.type === 5 && !irand(7)) {
        en[i] = Math.min(maxen[i], en[i] + irand(f[i].lv / 3 + 10) + 5);
        imsg[i] += `　${f[i].name}は${wazaName(i)}でＥＮを回復した！`;
      }
    }

    // ##### 索敵（battlelib:627-652） #####
    const sakudwn = srdmgflg + lrdmgflg;                        // battlelib:628
    for (const i of [0, 1]) {
      if (kyori + sakudwn <= f[i].saku + sensorRangeBonus(f[i].traits)) {   // 圏内（battlelib:632）
        if ((Math.abs(f[i].nt) * 10 + f[i].saku * 2 + rand(f[i].n0 * (f[i].saku + 1) / (f[1 - i].un + 1))) * sakuon[i]
            <= rand(f[1 - i].un + rand(f[1 - i].n1 * (f[i].un + 1) / (f[1 - i].un + 1)))) {   // battlelib:634
          sakuKeka[i] = 0;
          com[i] += `${f[1 - i].unitName}の動きを追いきれない！！`;
        }
      } else {                                                  // 圏外（battlelib:642-651）
        if (rand(Math.abs(f[i].nt) * 10 + f[i].n0 * (f[i].saku + 1) / (f[1 - i].un + 1)) * sakuon[i]
            <= rand(f[1 - i].un + rand(f[1 - i].n1 * (f[i].un + 1) / (f[1 - i].un + 1)))) {   // battlelib:644
          sakuKeka[i] = 0;
          com[i] += `${f[1 - i].unitName}を見つけられない！！`;
        }
      }
    }

    // ##### 攻撃（battlelib:655-782） #####
    for (const i of [0, 1]) {
      const isOld = f[i].nt === 0;
      const waza = f[i].skills?.waza;
      if (isOld && waza?.type === 0 && !irand(20)) {
        // 技術（攻撃）＝必殺技（battlelib:658-667）
        dmg[i] *= int(f[i].lv / 50 + 1);
        clit[i] += `${f[i].name}は${wazaName(i)}を放った！`;
        iDmg[i] = f[i].lv + 50;
        if (iDmg[i] > 350) iDmg[i] = 350;
        wazaon[i] = true;
        iHitnum[i] = 1;
      } else {
        if (isOld && waza?.type === 2 && !jyotai[1 - i] && en[i] >= int(maxen[i] / 10) && !irand(20)) {
          // 技術（麻痺）（battlelib:671-680）
          en[i] = Math.max(0, en[i] - int(maxen[i] / 10));
          clit[i] += `${f[i].name}は${wazaName(i)}で${f[1 - i].name}の電子機器を麻痺させた！`;
          jyotai[1 - i] = irand(2) + 2;
          dmg[1 - i] = 0;
          iHitnum[i] = 1;
        } else if (isOld && waza?.type === 3 && !jyotai[1 - i] && !irand(15)) {
          // 技術（連続ダメージ）（battlelib:681-686）
          clit[i] += `${f[i].name}は${wazaName(i)}を仕掛けた！`;
          jyotai[1 - i] -= irand(3) + 2;
        } else {
          // クリティカル判定 1/15（battlelib:689-700）
          if (!irand(wazaRitu)) {
            const cc = commentOf(f[i], 'critical', true);
            if (cc) clit[i] += cc;
            clit[i] += `クリティカル！！`;
            dmg[i] *= 6;
            iDmg[i] *= 3;
            dmg[1 - i] = 0;
          }
        }

        if (hasItem[i] && (tama[i] <= 0 || en[i] < iEn[i])) {
          com[i] += `弾切れで武装が使えない！！`;               // battlelib:703-706
        }

        // 命中判定修正（battlelib:708-746）
        if (sakuKeka[i] === 0) {
          if (weaponOk(i)) com[i] += `${f[i].name}は勘を頼りに${iName[i]}で攻撃した！！`;
          else com[i] += `${f[i].name}は勘で攻撃した！！`;
          iDmg[i] = iDmg[i] / 50;
          dmg[i] = dmg[i] / 10;
        } else {
          // 攻撃時セリフ: プールあり・クリティカルでない時 1/2（battlelib:727-737）
          if (!clit[i] && irand(2) === 0) {
            const c = pickAttackQuip(f[i]);
            if (c) com[i] += c;
          }
          if (weaponOk(i)) {
            com[i] += `${f[i].name}は${iName[i]}で${senMes(senIdo[i])}${senMes(senAtk[i])}攻撃した！！`;
          } else {
            com[i] += `${f[i].name}は${senMes(senIdo[i])}${senMes(senAtk[i])}攻撃した！！`;
            iDmg[i] = iDmg[i] / 20;                              // battlelib:741-744
            dmg[i] = dmg[i] / 8;
            iHitnum[i] = int(iHitnum[i] / 2);
            if (iHitnum[i] < 1) iHitnum[i] = 1;
          }
        }

        // 距離による命中率修正（battlelib:749-769）
        if (hani === 1) dmg[i] += f[i].n2 * 1.5;
        else if (hani === 2) dmg[i] += f[i].n3 * 1.5;
        else dmg[i] += f[i].n4 * 1.5;
        tokukyori[i] = tokukyoriAtk(f[i].traits, hani);
        tokukyori[2 + i] = tokukyoriDef(f[i].traits, hani);

        // EXAM他効果（battlelib:771-781）
        if (exam[i] > 0) {
          dmg[i] *= irand(f[i].un / 20) + 1;
          iDmg[i] *= 2;
        } else if (exam[i] === -1) {
          iDmg[i] = 0;
          dmg[i] = 0;
          exam[i] = -2;
        }
      }
    }

    // ##### 戦術による修正（battlelib:785-809） #####
    for (const i of [0, 1]) {
      const co = senCoeffs(senIdo[i], senAtk[i], senAtk[1 - i], f[i].traits);
      senAtkupArr[i] = co.atkup; senKaiupArr[i] = co.kaiup;
      dmgUpArr[i] = co.dmgUp; defUpArr[i] = co.defUp;
    }
    const dmg1 = dmg[0], dmg2 = dmg[1];                          // battlelib:787-788

    // ##### 命中判定・多段（battlelib:811-824） #####
    dmg[0] = 0; dmg[1] = 0;
    const hitnum = [0, 0];
    for (let h = 1; h <= iHitnum[0]; h++) {                      // battlelib:812-816
      const wk = ((irand(dmg1 + f[0].lv + f[0].n1 / 4) + tikeikoka[0] + snare[0]) * senAtkupArr[0] * atkSen[0] * tokukyori[0])
        - ((irand(dmg2 + f[1].lv + f[1].n0 / 4) / 2 + tikeikoka[1] + snare[1]) * senKaiupArr[1] * defSen[1] * tokukyori[3] * (1 + (h - 1) / 5));
      if (wk > 0) hitnum[0]++;
    }
    for (let h = 1; h <= iHitnum[1]; h++) {                      // battlelib:817-821
      const wk = ((irand(dmg2 + f[1].lv + f[1].n1 / 4) + tikeikoka[1] + snare[1]) * senAtkupArr[1] * atkSen[1] * tokukyori[1])
        - ((irand(dmg1 + f[0].lv + f[0].n0 / 4) / 2 + tikeikoka[0] + snare[0]) * senKaiupArr[0] * defSen[0] * tokukyori[2] * (1 + (h - 1) / 5));
      if (wk > 0) hitnum[1]++;
    }
    if (hitnum[0] > 0) dmg[0] = 1;                               // battlelib:823
    if (hitnum[1] > 0) dmg[1] = 1;

    // ##### ダメージ軽減・ダメージ判定（battlelib:826-1007） #####
    for (const i of [0, 1]) {
      // スモーク/ミノフスキーの威力減衰（battlelib:829-830）
      if (hani === 1 && srdmgflg > 0) iDmg[1 - i] = int(iDmg[1 - i] / (srdmgflg + 1));
      else if (hani === 3 && lrdmgflg > 0) iDmg[1 - i] = int(iDmg[1 - i] / (lrdmgflg + 1));

      if (dmg[1 - i] > 0) {
        // 盾防御判定（battlelib:838-845）
        const shield = Math.max(0, f[i].shieldCount - (f[1 - i].flags.shieldPierce ? 1 : 0));
        if (shield >= 1 && irand(100) <= shieldBlockPct(f[i].traits)) {
          dmg[1 - i] = 0;
          kawasi[i] += `${f[i].name}は${f[i].shieldName || '盾'}で攻撃を防いだ！！`;
        }
        // ＮＴ切り払い（battlelib:849-857。攻撃側の武器が使用可能であること）
        if (dmg[1 - i] > 0 && !wazaon[1 - i] &&
            f[1 - i].flags.ntWeapon && irand(16) < Math.abs(f[i].nt) && weaponOk(1 - i)) {
          dmg[1 - i] = 0;
          kawasi[i] += `${f[i].name}は${iName[1 - i]}を切り払ってかわした！！`;
        }
        // 技術（回避）（battlelib:860-870。相手がNT武器でないとき）
        if (dmg[1 - i] > 0 && !wazaon[1 - i] &&
            f[i].nt === 0 && f[i].skills?.waza?.type === 1 && !irand(4) && !f[1 - i].flags.ntWeapon) {
          dmg[1 - i] = 0;
          kawasi[i] += `${f[i].name}は${wazaName(i)}で攻撃をかわした！！`;
        }
        // ゼロシステム回避（battlelib:873-888）
        if (dmg[1 - i] > 0 && !wazaon[1 - i] && f[i].flags.zero) {
          if (!irand(5)) {
            dmg[1 - i] = 0;
            kawasi[i] += `ゼロシステムの未来予測で${f[i].name}は攻撃をかわした！！`;
          } else if (!irand(4)) {
            kawasi[i] += `${f[i].name}はゼロシステムによる幻覚に惑わされ動けない！！`;
          }
        }
        // ビーム防御（battlelib:891-950）: 攻撃側の武器がビーム(syurui==1)かつ使用可能なとき
        if (dmg[1 - i] > 0 && !wazaon[1 - i]) {
          const aw = f[1 - i].weapon;
          const isBeam = aw ? (aw.syurui === 1 || aw.syurui2 === 1) : false;
          if (isBeam && weaponOk(1 - i)) {
            if (beamdmgflg > 0) iDmg[1 - i] = int(iDmg[1 - i] / beamdmgflg);   // battlelib:898-901
            const fl = f[i].flags;
            if (fl.beamBarrier && en[i] >= 100 && dmg[1 - i] > 0) {            // -3（battlelib:904-910）
              en[i] -= 20;
              if (dmg[1 - i] < en[i]) { dmg[1 - i] = 0; kawasi[i] += `${f[i].name}はビームバリアを展開した！！`; }
              else { dmg[1 - i] = int(dmg[1 - i] / 2); kawasi[i] += `${f[i].name}はビームバリアを展開したが防ぎきれなかった！！`; }
            }
            if (fl.iField && en[i] > 60 && dmg[1 - i] > 0) {                   // 7（battlelib:911-916）
              dmg[1 - i] = 0; en[i] -= 30;
              kawasi[i] += `${f[i].name}はＩフィールドを展開した！！`;
            }
            if (fl.reflector && en[i] >= 150 && dmg[1 - i] > 0) {              // 8（battlelib:917-922）
              dmg[1 - i] = 0; en[i] -= 30;
              kawasi[i] += `${f[i].name}はリフレクターシールドで攻撃を防いだ！！`;
            }
            if (fl.coating && en[i] > 10 && dmg[1 - i] > 0) {                  // 11（battlelib:923-928）
              dmg[1 - i] = int(dmg[1 - i] / 4 * 3) + 1; en[i] -= 10;
              kawasi[i] += `${f[i].name}はビームコーティングで威力を減殺している。`;
            }
            if (fl.abcMantle && en[i] >= int(maxen[i] / 10) && en[i] >= 10 && dmg[1 - i] > 0) { // -30（battlelib:929-934）
              dmg[1 - i] = 0; en[i] -= int(maxen[i] / 10);
              kawasi[i] += `${f[i].name}はＡＢＣマントで攻撃を防いだ！`;
            }
            if (fl.activeCloak && en[i] >= int(maxen[i] / 5) && en[i] >= 5 && dmg[1 - i] > 0) { // -34（battlelib:935-940）
              dmg[1 - i] = 0; en[i] -= int(maxen[i] / 5);
              kawasi[i] += `${f[i].name}はアクティブクロークで攻撃を防いだ！`;
            }
            if (fl.ntBeamDef && en[i] >= 100 && dmg[1 - i] > 0 && irand(16) < Math.abs(f[i].nt)) { // -46（battlelib:941-947）
              en[i] -= 20;
              if (rand(dmg[1 - i] / 2) < en[i]) { dmg[1 - i] = 0; kawasi[i] += `${f[i].name}はビームを防いだ！！`; }
              else { dmg[1 - i] = int(dmg[1 - i] / 2); kawasi[i] += `${f[i].name}はビームを防ごうとしたが防ぎきれなかった！！`; }
            }
          } else if (aw && aw.syurui !== 3 && aw.syurui2 !== 3 && pson[i]) {
            // フェイズシフト装甲（battlelib:951-971。非ビーム・非格闘）
            if (weaponOk(1 - i) && f[i].flags.phaseShift && dmg[1 - i] > 0 && en[i] >= int(maxen[i] / 4)) {
              kawasi[i] += `${f[i].name}のフェイズシフト`;
              if (en[i] >= iDmg[1 - i]) {
                en[i] -= int(iDmg[1 - i] / 2) + 1;
                kawasi[i] += `には実弾攻撃が効かない？！`;
                dmg[1 - i] = 0;
              } else kawasi[i] += `を貫いた！！`;
            }
          }
        }

        // 最終ダメージ（battlelib:974-1000）
        if (dmg[1 - i]) {
          let dmgpls = int(f[1 - i].lv / 4) + 20;               // battlelib:976
          if (dmgpls > 50) dmgpls = 50;
          let atkSenEff = atkSen[1 - i];
          let dmgUpEff = dmgUpArr[1 - i];
          if (kyori < iShort[1 - i] || kyori > iLong[1 - i]) {   // 射程外（battlelib:978-985）
            if (dmgpls > 30) dmgpls = 30;
            iDmg[1 - i] = int(bakDmg[1 - i] / 10) + 1;
            if (iDmg[1 - i] > 10) iDmg[1 - i] = 10;
            if (dmgUpEff > 1) dmgUpEff = 1;
            if (atkSenEff > 1) atkSenEff = 1;
          }
          let dmgSyu = (f[i].sou * (int(f[i].sou / 10) + 1) * defUpArr[i]) / 4000;  // battlelib:987
          if (dmgSyu < 0) dmgSyu = 0;
          if (dmgSyu > 0.8) dmgSyu = 0.8;
          dmgSyu = 1 - dmgSyu;
          dmg[1 - i] = int(rand(iDmg[1 - i] * dmgSyu + dmgpls) * dmgUpEff * atkSenEff * hitnum[1 - i] / iHitnum[1 - i]);  // battlelib:991
          if (dmg[1 - i] < 10 && atkSenEff) {                    // battlelib:992-999
            dmg[1 - i] = irand(dmgpls / 2 + 10) + 1;
            kawasi[i] += `${f[i].name}の装甲に攻撃が阻まれた！！`;
          }
        }
      } else {
        dmg[1 - i] = 0;
        kawasi[i] += `${f[i].name}は攻撃をかわした！！`;          // battlelib:1002-1006
        const c = commentOf(f[i], 'evade', true) ?? npcQuote(f[i], 'evade');   // §4.2/§4.3 推測配線
        if (c) kawasi[i] += c;
      }
    }

    // ##### 最大ダメージ判定（battlelib:1009-1013） #####
    for (const i of [0, 1]) {
      const cap = (f[i].unitLv + f[i].lp) * 25;
      if (dmg[i] > cap) dmg[i] = cap;
    }

    // ##### スキル判定（２）反撃・攻撃反射（battlelib:1015-1043） #####
    for (const i of [0, 1]) {
      const dmgbak = [dmg[0], dmg[1]];
      if (dmgbak[1 - i] && f[i].skills?.counter && !irand(origSkillDenom(f[i].traits, 'counter'))) {  // battlelib:1020-1026
        dmg[i] = dmgbak[1 - i];
        dmg[1 - i] = 0;
        skl[i] = `反撃で`;
        kawasi[i] += `${f[i].name}は反撃で攻撃を返した！`;
      }
      if (!jyotai[i]) {                                          // 攻撃反射 -45（battlelib:1028-1042）
        const aw = f[1 - i].weapon;
        const isBeam = aw ? (aw.syurui === 1 || aw.syurui2 === 1) : false;
        if (isBeam && dmgbak[1 - i] && f[i].flags.reflect && !irand(10)) {
          dmg[i] = dmgbak[1 - i];
          dmg[1 - i] = 0;
          skl[i] = `${f[1 - i].name}のビームで`;
          kawasi[i] += `${f[i].name}はビームを跳ね返した！`;
        }
      }
    }

    // ##### 技術判定＝麻痺・連続ダメージの実行（battlelib:1045-1066） #####
    for (const i of [0, 1]) {
      if (jyotai[i]) {
        if (jyotai[i] > 0) {
          imsg[i] = ''; com[i] = ''; kawasi[1 - i] = '';         // battlelib:1052-1054（表示消し）
          clit[i] += `${f[i].name}は麻痺している。`;
          dmg[i] = 0;
          jyotai[i]--;
        } else {
          imsg[i] += `　連続ダメージを受けている！`;
          dmg[1 - i] += irand(f[1 - i].lv / 4) + 1;              // battlelib:1062
          jyotai[i]++;
        }
      }
    }

    // ##### サポートボーナス（battlelib:1068-1090） #####
    for (const i of [0, 1]) {
      const spt = support[i];
      if (spt?.active && hasItem[i] && spt.healBonus && irand(4)) {   // EN補給 3/4（battlelib:1072-1077）
        kawasi[1 - i] += `サポーターよりＥＮの補給を受けた。`;
        en[i] = Math.min(maxen[i], en[i] + irand(50) + 20 + spt.healBonus);
      }
      if (spt?.active && hasItem[i] && spt.healAmmo && irand(4)) {                  // 弾補給 3/4（battlelib:1078-1083）
        kawasi[1 - i] += `サポーターより弾薬の補給を受けた。`;
        tama[i] += int(spt.healAmmo);
      }
      if (spt?.active && atkSen[i] && !irand(5)) {                                  // 援護射撃 1/5（battlelib:1084-1089）
        kawasi[1 - i] += `援護射撃が当たった！`;
        dmg[i] += irand(f[1 - i].lv / 4) + 1;
      }
    }

    // HP適用（battlelib:1093-1094。同時適用＝相打ちあり）
    const hpWk = [int(hp[0] - dmg[1]), int(hp[1] - dmg[0])];

    // ##### 死亡時判定（battlelib:1096-1169） #####
    for (const i of [0, 1]) {
      if (hpWk[i] <= 0) {
        // 脱出（battlelib:1104-1126）
        if (!f[i].escaped && f[i].flags.escapeDevice && f[i].escapeTable) {
          const esc = f[i].escapeTable(f[i]);
          if (esc && hpWk[i] > -1 * esc.hp) {
            imsg[i] += `${f[i].name}は${esc.name}で脱出した！！`;
            const dq = npcQuote(f[i], 'down');
            if (dq) imsg[i] += dq;
            f[i].escaped = true;
            hpWk[i] += esc.hp;
            f[i].weapon = null;
            hasItem[i] = false;
            iName[i] = 'なし';
            f[i].unitName = esc.name;
            f[i].flags = emptyFlags();                           // battlelib:1121（特殊能力を失う）
            exam[i] = -2;
            bakDmg[i] = 10;                                      // battlelib:1123
            continue;
          }
        }
        if (!f[i].escaped) {
          const jibaku = f[i].flags.jibaku;                      // battlelib:1128
          const dgkaifuku = f[i].flags.dgCells;                  // battlelib:1130
          // 特攻（battlelib:1132-1150）
          if (((f[i].skills?.kamikaze && hani <= kamikazeRangeGate(f[i].traits)) || jibaku) && !irand(3)) {
            imsg[i] = ''; com[i] = ''; kawasi[1 - i] = '';
            if (jibaku) clit[i] += `${f[i].name}は自爆した！！`;
            else clit[i] += `${f[i].name}は${f[1 - i].name}に特攻をしかけた！！`;
            const dmgplus = irand(iDmg[i] + f[i].lv / 2);        // battlelib:1147（自分の武器威力基準）
            dmg[i] += dmgplus;
            hpWk[1 - i] -= dmgplus;
          }
          // 回復（battlelib:1151-1166）
          if (((f[i].skills?.recover && hani >= recoverRangeGate(f[i].traits)) || dgkaifuku) && !irand(4)) {
            imsg[i] = ''; com[i] = ''; kawasi[1 - i] = '';
            if (dgkaifuku) clit[i] += `${f[i].name}は自己再生した！！`;
            else clit[i] += `${f[i].name}は回復した！！`;
            hpWk[i] = irand(f[i].lv) + 1;                        // battlelib:1165
          }
        }
      }
    }

    // ##### 戦闘内容セット（battlelib:1176-1260 → 新イベントIF 仕様§5.1） #####
    msg.push(`【ターン ${turnNo}】 現在距離 ${kyori}`);          // battlelib:1213
    for (const i of [0, 1]) {
      const line = `${imsg[i]} ${com[i]} ${clit[i]} ${kawasi[1 - i]}`.trim();  // battlelib:1253 の合成順
      if (line) msg.push(line);
      if (dmg[i] > 0) {
        const hitmsg = hitnum[i] > 1 ? `${hitnum[i]}回命中！　` : '';           // battlelib:1256
        msg.push(`${hitmsg}${f[1 - i].name} に${skl[i]} ${dmg[i]} のダメージを与えた。`);
      }
    }

    events.push({
      turn: turnNo,
      kyori,
      hani,
      messages: msg,
      attacker: { hp: Math.max(0, hpWk[0]), maxHp: maxtai[0], en: en[0], maxEn: maxen[0], ammo: tama[0], dmgDealt: dmg[0], hit: hitnum[0] > 0, hitCount: hitnum[0] },
      defender: { hp: Math.max(0, hpWk[1]), maxHp: maxtai[1], en: en[1], maxEn: maxen[1], ammo: tama[1], dmgDealt: dmg[1], hit: hitnum[1] > 0, hitCount: hitnum[1] },
    });
    logs.push(...msg);

    // ##### 勝敗判定（battlelib:1262-1266） #####
    hp[0] = hpWk[0];
    hp[1] = hpWk[1];
    turnsDone = loop;
    if (hp[1] <= 0) { win = true; break; }
    if (hp[0] <= 0) { win = false; break; }

    turnNo++;

    // 消費計算（battlelib:1271-1278。ターン末・使用可能だった場合のみ）
    for (const i of [0, 1]) {
      if (tama[i] > 0 && en[i] >= iEn[i] && kyori >= iShort[i] && kyori <= iLong[i] && !wazaon[i] && jyotai[i] < 1) {
        tama[i] -= 1;
        en[i] -= iEn[i];
      }
    }

    win = hp[1] <= hp[0];                                        // battlelib:1280
  }

  // 勝敗セリフ（battlelib:1301-1381。勝者 msg[0]・敗者 msg[1]。フォールバックなし=仕様§4.4）
  const winner = win ? 0 : 1;
  const loser = 1 - winner;
  const lc = commentOf(f[loser], 'lose', false) ?? npcQuote(f[loser], 'down');
  if (lc) logs.push(lc);
  const wc = commentOf(f[winner], 'win', false);
  if (wc) logs.push(wc);
  logs.push(win ? `${f[0].name}は、戦闘に勝利した！！` : `${f[0].name}は、戦闘に負けた・・・。`);  // battlelib:1315,1375

  // 状態の書き戻し（継続戦闘用）
  for (const i of [0, 1]) {
    f[i].hp = hp[i];
    f[i].en = en[i];
    f[i].tama = tama[i];
    f[i].jyotai = jyotai[i];
  }

  return { logs, events, win, kyori, turns: turnsDone };
}

// 地形効果の形容詞（battlelib:173-181 の $tikei_keiyo。原典欠落のため創作=仕様§4.5）
function tikeiKeiyo(koka: number): string {
  const n = Math.min(3, int(Math.abs(koka) / 100));
  return ['', '少し', 'かなり', '圧倒的に'][n];
}

// 戦術メッセージ（battlelib:713 の $sen_mes。移動系は battlelib:350-351 の原文から復元、
// 攻撃系4種は原典欠落のため創作=仕様§4.5）
function senMes(v: number): string {
  switch (v) {
    case 2: return '思い切り';
    case 3: return 'ゆっくりと';
    case 4: return '果敢に';
    case 5: return '身をかわしながら';
    case 6: return '幻惑するように';
    case 7: return '冷静に';
    default: return '';
  }
}

export function emptyFlags(): LFlags {
  return {
    exam: false, limitCut: false, hyperMode: false, zero: false,
    smoke: false, minovsky: false, beamJam: false,
    iField: false, alice: false, kakusan: false, avionics: false,
    selfRepair: false, selfRepair2: false, activeCloak: false,
    kiraiSelf: false, enRecover2: false, mirage: false, phaseShift: false,
    kensei: false, paralyzer: false, balloon: false, balloonCancel: false,
    ntWeapon: false, ntBeamDef: false, beamBarrier: false, reflector: false,
    coating: false, abcMantle: false, reflect: false, jibaku: false, dgCells: false,
    examEnRecover: false, escapeDevice: false, shieldPierce: false,
    meleeBoost: false, waterBoost: false, longBoost: false, midBoost: false,
  } as LFlags;
}

// tokusyu（合流済み）→ named flags（battlelib の各分岐に対応。仕様§6-6）
// コード→フラグの対応は tokusyuEffects の battleFlag 面が唯一の正。ここは投影のみ。
export function flagsFromTokusyu(tokusyu: number[]): LFlags {
  const fl = emptyFlags() as any;
  for (const code of tokusyu) {
    const names = TOKUSYU_REGISTRY[code]?.battleFlag;
    if (names) for (const n of names) fl[n] = true;
  }
  // 固定コードを持たない特例（脱出機構=100以上の任意コード。battlelib の tokusyu 判定）
  fl.escapeDevice = tokusyu.some(t => t >= 100);
  return fl as LFlags;
}
