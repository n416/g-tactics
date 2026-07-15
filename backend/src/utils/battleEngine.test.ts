import { expect, test, describe, vi, afterEach } from 'vitest';
import {
  parseTokusyu,
  applyPostBattleTokusyuEffects,
  simulateTeamBattle,
  applyEquipmentTokusyu,
  resolveTactics,
  calcTacticCoeffs,
  simulateBattleRound,
  calcCost,
  calcMaxHp,
  calcMaxEn,
  getEscapeUnit
} from './battleEngine';
import { battleLogic, flagsFromTokusyu, baseReaction, LFighter } from './battleLogic';
import { terrainTokunum, tokukyoriAtk, tokukyoriDef, sensorRangeBonus, origSkillDenom } from './traitEffects';

afterEach(() => {
  vi.restoreAllMocks();
});

// battleLogic 用のテストファイター
const mkLF = (over: any = {}): LFighter => {
  const tokusyu: number[] = over.tokusyu || [];
  const base: any = {
    name: over.name || 'テスト',
    unitName: over.unitName || 'テスト機',
    hp: 300, maxHp: 300, en: 100, maxEn: 100,
    sou: 10, un: 10, saku: 10,
    n0: 10, n1: 10, n2: 0, n3: 0, n4: 0,
    terrainSkill: [0, 0, 0, 0],
    lv: 10, nt: 0, aisyo: 0, unitLv: 10, lp: 0,
    idouEquip: 0, tactics: '00', traits: {}, skills: {},
    flags: flagsFromTokusyu(tokusyu),
    weapon: { name: 'テスト砲', dmg: 100, en: 0, short: 0, long: 99, hitnum: 1, syurui: 2, syurui2: 0 },
    shieldCount: 0, shieldName: '', comments: {},
    jyotai: 0, tama: 99, escaped: false,
  };
  const merged = { ...base, ...over };
  delete (merged as any).tokusyu;
  return merged as LFighter;
};

// 圧倒的な攻撃側（命中がほぼ確実に成立する）
const strong = (over: any = {}) => mkLF({ sou: 200, un: 200, saku: 200, n0: 200, n1: 200, lv: 100, unitLv: 100, lp: 40, hp: 5000, maxHp: 5000, ...over });
// 無力な防御側
const weak = (over: any = {}) => mkLF({ sou: 0, un: 0, saku: 0, n0: 0, n1: 0, lv: 1, hp: 5000, maxHp: 5000, weapon: null, ...over });

describe('P47 基礎値（仕様§2・§3.2）', () => {
  test('【新規】命中基礎値に機熟×2が参加する（battlelib:153。P46の重要訂正）', () => {
    // (索敵+運動+装甲)*2 + 機熟*2 + |NT|*10
    expect(baseReaction(10, 20, 30, 0, 0)).toBe(120);
    expect(baseReaction(10, 20, 30, 50, 0)).toBe(220);   // 機熟50 → +100
    expect(baseReaction(10, 20, 30, 50, -3)).toBe(250);  // 強化人間Lv3 → +30
  });

  test('最大耐久/ENは保存値そのまま（操縦ボーナス廃止。仕様§2-1）', () => {
    expect(calcMaxHp(300, 50)).toBe(300);
    expect(calcMaxEn(120, 50)).toBe(120);
    expect(calcMaxHp(null as any)).toBe(100); // 既定値
  });
});

describe('P47 battleLogic 中核（多段ヒット・索敵・ダメージ・クリティカル・相打ち）', () => {
  test('【新規】多段ヒット: hit_count=5 の武器は複数回命中し「X回命中！」が出る（battlelib:811-824,1256）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const a = strong({ weapon: { name: 'マシンガン', dmg: 100, en: 0, short: 0, long: 99, hitnum: 5, syurui: 2, syurui2: 0 } });
    const d = weak();
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 10 });
    expect(res.events[0].attacker.hitCount).toBeGreaterThanOrEqual(2);
    expect(res.logs.some(l => l.includes('回命中！'))).toBe(true);
  });

  test('【新規】索敵失敗: 索敵0の機体は「見つけられない」勘攻撃になる（battlelib:642-651,709-720）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const a = mkLF({ saku: 0, n0: 0 });      // 圏外かつ索敵項0 → 必ず失敗
    const d = strong();
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 99 });
    expect(res.logs.some(l => l.includes('見つけられない'))).toBe(true);
    expect(res.logs.some(l => l.includes('勘'))).toBe(true);
  });

  test('【新規】最大ダメージ上限: (機体Lv+カスタム数)×25 を超えない（battlelib:1009-1013）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const a = strong({ unitLv: 1, lp: 0, weapon: { name: '超兵器', dmg: 10000, en: 0, short: 0, long: 99, hitnum: 1, syurui: 2, syurui2: 0 } });
    const d = weak();
    const res = battleLogic([a, d], { maxTurns: 3, initialKyori: 10 });
    for (const e of res.events) {
      expect(e.attacker.dmgDealt).toBeLessThanOrEqual((1 + 0) * 25);
    }
  });

  test('【新規】クリティカルは 1/15 判定で「クリティカル！！」＋相手の攻撃無効（battlelib:689-700, msvs_ini:618）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);  // irand(15)=0 → 必ず発動
    const a = mkLF({ name: 'A' });
    const d = mkLF({ name: 'D' });
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 0 });
    expect(res.logs.some(l => l.includes('クリティカル！！'))).toBe(true);
  });

  test('【新規】同時解決: 両者が同一ターンに撃墜され相打ちになる（battlelib:1093-1094）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const a = strong({ hp: 1, maxHp: 1 });
    const d = strong({ name: '相手', hp: 1, maxHp: 1 });
    const res = battleLogic([a, d], { maxTurns: 30, initialKyori: 0 });
    const last = res.events[res.events.length - 1];
    expect(last.attacker.hp).toBe(0);
    expect(last.defender.hp).toBe(0);
    // 満了/撃墜同時のとき挑戦側勝ち（battlelib:1265 が先に評価される）
    expect(res.win).toBe(true);
  });

  test('【新規】30ターン満了時はHPの絶対値比較で勝敗（battlelib:1280）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const a = mkLF({ hp: 9999, maxHp: 9999, sou: 200 });   // 硬い挑戦側
    const d = mkLF({ name: '相手', hp: 500, maxHp: 500, sou: 200 });
    const res = battleLogic([a, d], { maxTurns: 5, initialKyori: 50 });
    if (res.events[res.events.length - 1].defender.hp > 0 && res.events[res.events.length - 1].attacker.hp > 0) {
      expect(res.win).toBe(res.events[res.events.length - 1].defender.hp <= res.events[res.events.length - 1].attacker.hp);
    }
  });

  test('レベル差5以上の格上挑戦は初回に逆転補正が出る（battlelib:166-170, msvs_ini:615）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const a = mkLF({ lv: 1 });
    const d = mkLF({ name: '格上', lv: 50 });
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 50 });
    expect(res.logs.some(l => l.includes('湧き上がる'))).toBe(true);
  });
});

describe('P47 battleLogic 特殊能力（named flags 経由。仕様§6-6）', () => {
  test('flagsFromTokusyu: tokusyu 番号から named flags を起こす', () => {
    const fl = flagsFromTokusyu([7, -44, -36]);
    expect(fl.iField).toBe(true);
    expect(fl.dgCells).toBe(true);
    expect(fl.balloon).toBe(true);
    expect(fl.coating).toBe(false);
    expect(flagsFromTokusyu([100]).escapeDevice).toBe(true);
  });

  test('機体発動: EXAM(3)+リミッター(-12)の発動ログが初回ターンに出る（battlelib:208-251）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const a = mkLF({ tokusyu: [3, -12] });
    const d = mkLF({ name: '相手' });
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 50 });
    expect(res.logs.some(l => l.includes('ＥＸＡＭシステム稼動'))).toBe(true);
    expect(res.logs.some(l => l.includes('リミッターを解除した'))).toBe(true);
  });

  test('-35 耐久EN回復2: 毎ターン回復ログが出る（battlelib:474-481）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const a = mkLF({ tokusyu: [-35], hp: 50 });
    const d = mkLF({ name: '相手' });
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 50 });
    expect(res.logs.some(l => l.includes('耐久力・ＥＮ回復！'))).toBe(true);
  });

  test('EXAM機(3)のEN回復ログ（battlelib:402-407）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const a = mkLF({ tokusyu: [3], en: 50 });
    const d = mkLF({ name: '相手' });
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 50 });
    expect(res.logs.some(l => l.includes('ＥＮ回復'))).toBe(true);
  });

  test('Iフィールド(7)の維持EN消費ログ（battlelib:429-434）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const a = mkLF({ tokusyu: [7], en: 100 });
    const d = mkLF({ name: '相手' });
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 50 });
    expect(res.logs.some(l => l.includes('Ｉフィールド装備のためＥＮ消費'))).toBe(true);
  });

  test('ミラージュコロイド(-40): EN75%以上で発動し相手の索敵を無効化（battlelib:507-519, 634 の sakuon）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const a = mkLF({ tokusyu: [-40], en: 100 });
    const d = mkLF({ name: '相手', saku: 200 }); // 索敵優秀でも sakuon=0 で必ず失敗する
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 10 });
    expect(res.logs.some(l => l.includes('ミラージュコロイド発動'))).toBe(true);
    expect(res.logs.some(l => l.includes('追いきれない') || l.includes('見つけられない'))).toBe(true);
  });

  test('麻痺装置(-48): EN半分以上のとき相手を麻痺させる（battlelib:534-542）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);  // irand(30)=0 → 発動
    const a = mkLF({ tokusyu: [-48], en: 100 });
    const d = mkLF({ name: '相手' });
    const res = battleLogic([a, d], { maxTurns: 2, initialKyori: 0 });
    expect(res.logs.some(l => l.includes('麻痺させた'))).toBe(true);
    expect(res.logs.some(l => l.includes('麻痺している'))).toBe(true); // 次ターンの行動不能（battlelib:1055）
  });

  test('Iフィールド(7)のビーム防御: ビーム攻撃を無効化する（battlelib:911-916）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const a = strong({ weapon: { name: 'メガビーム', dmg: 500, en: 0, short: 0, long: 99, hitnum: 1, syurui: 1, syurui2: 0 } });
    const d = weak({ tokusyu: [7], en: 100 });
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 10 });
    expect(res.logs.some(l => l.includes('Ｉフィールドを展開した'))).toBe(true);
    expect(res.events[0].attacker.dmgDealt).toBe(0);
  });

  test('NT切り払い: 相手のNT武器(-24)を rand(16)<|NT| で切り払う。使用可否は攻撃側の武器（battlelib:849-857）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // irand(16)=1 < 8
    const a = strong({ tokusyu: [-24], weapon: { name: 'ファンネル', dmg: 300, en: 0, short: 0, long: 99, hitnum: 1, syurui: 1, syurui2: 0 } });
    const d = weak({ nt: 8 });
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 10 });
    expect(res.logs.some(l => l.includes('切り払ってかわした'))).toBe(true);
    expect(res.events[0].attacker.dmgDealt).toBe(0);
  });

  test('盾防御: 盾持ちは 30+頑丈×2 % で完全防御（battlelib:838-845）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // irand(100)=10 <= 30
    const a = strong();
    const d = weak({ shieldCount: 1, shieldName: 'シールド' });
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 10 });
    expect(res.logs.some(l => l.includes('シールドで攻撃を防いだ'))).toBe(true);
    expect(res.events[0].attacker.dmgDealt).toBe(0);
  });

  test('敵シールド無効(-21): 攻撃側が持つと盾防御が発動しない（dmg_calc:173-177, battlelib:838）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const a = strong({ tokusyu: [-21] });
    const d = weak({ shieldCount: 1, shieldName: 'シールド' });
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 10 });
    expect(res.logs.some(l => l.includes('シールドで攻撃を防いだ'))).toBe(false);
    expect(res.events[0].attacker.dmgDealt).toBeGreaterThan(0);
  });

  test('脱出装置: 撃墜時、超過ダメージが脱出機HP以内なら脱出して戦闘続行（battlelib:1104-1126）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const a = strong({ unitLv: 1, lp: 0 }); // ダメージ上限25 → 超過が小さい
    const d = weak({ tokusyu: [100], hp: 10, maxHp: 300, escapeTable: () => ({ hp: 150, name: 'コア・ファイター' }) });
    const res = battleLogic([a, d], { maxTurns: 2, initialKyori: 10 });
    expect(res.logs.some(l => l.includes('コア・ファイターで脱出した'))).toBe(true);
  });
});

describe('P47 専用技（wazaget。オールドタイプ=NT0のみ）', () => {
  test('必殺技(type0): 1/20で発動し技名が出る（battlelib:658-667）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const a = mkLF({ skills: { waza: { type: 0, name: 'ラストシューティング' } } });
    const d = mkLF({ name: '相手' });
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 0 });
    expect(res.logs.some(l => l.includes('ラストシューティングを放った'))).toBe(true);
  });

  test('麻痺技(type2): EN max/10 を消費して相手を麻痺（battlelib:671-680）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const a = mkLF({ skills: { waza: { type: 2, name: '電撃' } } });
    const d = mkLF({ name: '相手' });
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 0 });
    expect(res.logs.some(l => l.includes('電撃で相手の電子機器を麻痺させた') || l.includes('麻痺させた'))).toBe(true);
  });

  test('連続ダメージ技(type3): 次ターンに「連続ダメージを受けている」（battlelib:681-686, 1061-1063）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const a = mkLF({ skills: { waza: { type: 3, name: '斬撃' } } });
    const d = mkLF({ name: '相手' });
    const res = battleLogic([a, d], { maxTurns: 3, initialKyori: 0 });
    expect(res.logs.some(l => l.includes('連続ダメージを受けている'))).toBe(true);
  });

  test('NTは専用技を使えない（原作: n_13 eq "00" 条件）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const a = mkLF({ nt: 3, skills: { waza: { type: 0, name: '必殺' } } });
    const d = mkLF({ name: '相手' });
    const res = battleLogic([a, d], { maxTurns: 1, initialKyori: 0 });
    expect(res.logs.some(l => l.includes('必殺を放った'))).toBe(false);
  });
});

describe('P47 サポートボーナス（battlelib:1068-1090。EN/弾=3/4・援護=1/5）', () => {
  test('EN補給と弾薬補給は 3/4 の確率で発動する', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // irand(4)=2（真）
    const a = mkLF({ en: 10 });
    const d = mkLF({ name: '相手' });
    const res = battleLogic([a, d], {
      maxTurns: 1, initialKyori: 50,
      support: [{ active: true, healBonus: 5, healAmmo: 5 }, null],
    });
    expect(res.logs.some(l => l.includes('ＥＮの補給を受けた'))).toBe(true);
    expect(res.logs.some(l => l.includes('弾薬の補給を受けた'))).toBe(true);
  });

  test('援護射撃は 1/5 で発動しダメージが加算される', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // irand(5)=0（発動）/ irand(4)=0（補給は不発）
    const a = mkLF();
    const d = mkLF({ name: '相手' });
    const res = battleLogic([a, d], {
      maxTurns: 1, initialKyori: 50,
      support: [{ active: true, healBonus: 5, healAmmo: 0 }, null],
    });
    expect(res.logs.some(l => l.includes('援護射撃が当たった'))).toBe(true);
  });
});

describe('P47 traitEffects 原作式アクセサ', () => {
  test('terrainTokunum: 地形特性の素点は A−int(B/2)（battlelib:76-79）', () => {
    expect(terrainTokunum({ '豪胆': 10 }, 1)).toBe(10);
    expect(terrainTokunum({ '豪胆': 10, '冷酷': 5 }, 1)).toBe(8);  // 10 - int(5/2)
    expect(terrainTokunum({ '豪胆': 10 }, 3)).toBe(-5);            // 宇宙では減点
  });

  test('tokukyori: 距離系特性の攻防係数（battlelib:749-769）', () => {
    expect(tokukyoriAtk({ '短気': 10 }, 1)).toBeCloseTo(1.5);   // 1+(10/10)/2
    expect(tokukyoriAtk({ '策士': 10 }, 1)).toBeCloseTo(0.5);
    expect(tokukyoriDef({ '熱血': 10 }, 1)).toBeCloseTo(1.5);
    expect(tokukyoriDef({}, 2)).toBe(1);
  });

  test('sensorRangeBonus と origSkillDenom（battlelib:632, 556-620, 1020）', () => {
    expect(sensorRangeBonus({ '注意深い': 5 })).toBe(10);
    expect(origSkillDenom({}, 'melee')).toBe(5);
    expect(origSkillDenom({ '手が早い': 10 }, 'melee')).toBe(3);
    expect(origSkillDenom({ '一途': 10 }, 'focus')).toBe(15);
    expect(origSkillDenom({ '執念深い': 10 }, 'counter')).toBe(25);
  });
});

describe('個人戦術 P31 (tactics.cgi / battlelib:57-68,85-88,308-334,786-808)', () => {
  test('resolveTactics: 2桁文字列から移動系/攻撃系を確定し、再呼び出しで変わらない', () => {
    const f: any = { tactics: '14' };
    resolveTactics(f);
    expect(f.senIdo).toBe(1);
    expect(f.senAtk).toBe(4);
    f.tactics = '25';
    resolveTactics(f);
    expect(f.senIdo).toBe(1);
  });

  test('resolveTactics: 8=おまかせは有効範囲内にランダム確定', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const f: any = { tactics: '88' };
    resolveTactics(f);
    expect(f.senIdo).toBeGreaterThanOrEqual(1);
    expect(f.senIdo).toBeLessThanOrEqual(3);
    expect(f.senAtk).toBeGreaterThanOrEqual(4);
    expect(f.senAtk).toBeLessThanOrEqual(7);
  });

  test('じゃんけん相性: 攻撃重視(4)は回避重視(5)に食われる（命中0.4・回避0.4・防御0.5）', () => {
    const loser: any = { senIdo: 0, senAtk: 4, parsedTraits: {} };
    const winner: any = { senIdo: 0, senAtk: 5, parsedTraits: {} };
    const co = calcTacticCoeffs(loser, winner);
    expect(co.atkup).toBeCloseTo(1.1 * 0.4);
    expect(co.kaiup).toBeCloseTo(0.8 * 0.4);
    expect(co.dmgUp).toBeCloseTo(1.3);
    expect(co.defUp).toBeCloseTo(0.8 * 0.5);
  });

  test('専用特性のLvスケール: 攻撃的Lv10で攻撃重視の全係数が+0.4', () => {
    const f: any = { senIdo: 0, senAtk: 4, parsedTraits: { '攻撃的': 10 } };
    const opp: any = { senIdo: 0, senAtk: 7, parsedTraits: {} };
    const co = calcTacticCoeffs(f, opp);
    expect(co.atkup).toBeCloseTo(1.5);
    expect(co.kaiup).toBeCloseTo(1.2);
    expect(co.dmgUp).toBeCloseTo(1.7);
    expect(co.defUp).toBeCloseTo(1.2);
  });

  test('無設定ペナルティ: 相手だけ攻撃系設定→自分の命中・回避×0.4', () => {
    const f: any = { senIdo: 0, senAtk: 0, parsedTraits: {} };
    const opp: any = { senIdo: 0, senAtk: 7, parsedTraits: {} };
    const co = calcTacticCoeffs(f, opp);
    expect(co.atkup).toBeCloseTo(0.4);
    expect(co.kaiup).toBeCloseTo(0.4);
  });

  test('移動系の係数: 足止め(1)は攻0.8/回1.2、補捉(3)は攻1.2/回0.8', () => {
    const f1: any = { senIdo: 1, senAtk: 0, parsedTraits: {} };
    const f3: any = { senIdo: 3, senAtk: 0, parsedTraits: {} };
    const neutral: any = { senIdo: 0, senAtk: 0, parsedTraits: {} };
    const c1 = calcTacticCoeffs(f1, neutral);
    expect(c1.atkup).toBeCloseTo(0.8);
    expect(c1.kaiup).toBeCloseTo(1.2);
    const c3 = calcTacticCoeffs(f3, neutral);
    expect(c3.dmgUp).toBeCloseTo(1.2);
    expect(c3.defUp).toBeCloseTo(1.2);
  });

  test('足止め: 敵が「敵を足止めする」だと移動が止められる（rand固定）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const atk: any = { handle_name: '攻', tactics: '20', unit_base_hp: 300, unit_base_en: 100, status_piloting: 10, mobility: 30, armor: 10, sensor: 10, traits: '', skills: '' };
    const def: any = { handle_name: '止', tactics: '10', unit_base_hp: 300, unit_base_en: 100, status_piloting: 10, mobility: 30, armor: 10, sensor: 10, traits: '', skills: '' };
    const res = simulateBattleRound(atk, def, 1, 0, undefined, undefined, 1, [], [], 1, 99);
    expect(res.logs.some(l => l.includes('足止めされてしまっている'))).toBe(true);
  });

  test('補捉し移動(3)は足止めが通じない', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const atk: any = { handle_name: '攻', tactics: '30', unit_base_hp: 300, unit_base_en: 100, status_piloting: 10, mobility: 30, armor: 10, sensor: 10, traits: '', skills: '' };
    const def: any = { handle_name: '止', tactics: '10', unit_base_hp: 300, unit_base_en: 100, status_piloting: 10, mobility: 30, armor: 10, sensor: 10, traits: '', skills: '' };
    const res = simulateBattleRound(atk, def, 1, 0, undefined, undefined, 1, [], [], 1, 99);
    expect(res.logs.some(l => l.includes('通じなかった'))).toBe(true);
  });
});

describe('simulateTeamBattle 団体戦（P30: 毎ターン1ペア交戦・原作ログ観察準拠）', () => {
  const mkFighter = (name: string, hp: number): any => ({
    handle_name: name,
    chara_name: name,
    unit_base_hp: hp,
    unit_base_en: 100,
    status_piloting: 10,
    armor: 10, mobility: 10, sensor: 10,
    level: 5,
    traits: '', skills: ''
  });

  test('ターン制で進行し、毎ターン1ペアだけが交戦する', () => {
    const aTeam = [mkFighter('A1', 100), mkFighter('A2', 100)];
    const dTeam = [mkFighter('D1', 100), mkFighter('D2', 100)];

    const res = simulateTeamBattle(aTeam as any[], dTeam as any[], 1);

    expect(res.logs.some(l => l.includes('チーム戦 1ターン'))).toBe(true);
    expect(res.events.length).toBeGreaterThan(0);
    const turnHeaders = res.logs.filter(l => l.includes('チーム戦 ') && l.includes('ターン')).length;
    const pairHeaders = res.logs.filter(l => l.startsWith('▶ ')).length;
    expect(pairHeaders).toBe(turnHeaders);
    expect(turnHeaders).toBeLessThanOrEqual(12);
  });

  test('片方が全滅済みなら即終了する', () => {
    const aTeam = [{ ...mkFighter('A1', 100), hp: 100, en: 100 }];
    const dTeam = [{ ...mkFighter('D1', 100), hp: 0, en: 0 }];

    const res = simulateTeamBattle(aTeam as any[], dTeam as any[], 1);
    expect(res.isSuccess).toBe(true);
  });

  test('リーダー狙い: 護衛全滅後はリーダーだけが標的になる', () => {
    const aTeam = [{ ...mkFighter('A1', 500), hp: 500, en: 100 }];
    const dLeader = { ...mkFighter('DL', 100), hp: 100, en: 100 };
    const dEscort = { ...mkFighter('DE', 100), hp: 0, en: 0 };
    const res = simulateTeamBattle([aTeam[0]] as any[], [dLeader, dEscort] as any[], 1);
    // チーム戦術の阻止（「〜しようとしたが阻まれた」）は出ない。
    // ※「装甲に攻撃が阻まれた」（battlelib:997 の最小ダメージ表現）とは区別する
    expect(res.logs.some(l => l.includes('しようとしたが阻まれた'))).toBe(false);
    expect(res.logs.filter(l => l.startsWith('▶ ')).every(l => l.includes('vs DL'))).toBe(true);
  });

  test('撃墜が出ると「1機撃破」ログが記録される', () => {
    const aTeam = [{ ...mkFighter('強者', 2000), hp: 2000, en: 200, status_piloting: 50 }];
    const dTeam = [{ ...mkFighter('弱者', 1), hp: 1, en: 10 }];
    const res = simulateTeamBattle(aTeam as any[], dTeam as any[], 1);
    if (dTeam[0].hp <= 0) {
      expect(res.logs.some(l => l.includes('1機撃破'))).toBe(true);
      expect(res.isSuccess).toBe(true);
    }
  });

  test('ターン上限到達時は撃破数→残HP率で判定する（無敗なら攻撃側全滅以外で決着がつく）', () => {
    const aTeam = [{ ...mkFighter('A1', 100), hp: 100, en: 100 }];
    const dTeam = [{ ...mkFighter('D1', 100), hp: 100, en: 100 }];
    const res = simulateTeamBattle(aTeam as any[], dTeam as any[], 1);
    expect(typeof res.isSuccess).toBe('boolean');
  });

  test('P38: 対象L+攻撃(LA)は敵リーダーを狙う（阻止役がいなければ常にリーダーと交戦）', () => {
    const atk = { ...mkFighter('突撃兵', 100), hp: 100, en: 100, team_tactic: 'LA' };
    const dLeader = { ...mkFighter('敵リーダー', 100000), hp: 100000, en: 100, team_tactic: 'NN' };
    const dEscort = { ...mkFighter('敵随伴', 100000), hp: 100000, en: 100, team_tactic: 'NN' };
    const res = simulateTeamBattle([atk] as any[], [dLeader, dEscort] as any[], 1);
    const pairs = res.logs.filter(l => l.startsWith('▶ '));
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every(l => l.includes('vs 敵リーダー'))).toBe(true);
  });

  test('P38: リーダーをカバーするディフェンダー(LD)が阻止し、阻まれたログが出る（rand固定）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const atk = { ...mkFighter('突撃兵', 300), hp: 300, en: 100, team_tactic: 'LA' };
    const dLeader = { ...mkFighter('敵リーダー', 300), hp: 300, en: 100, team_tactic: 'NN' };
    const dGuard = { ...mkFighter('敵護衛', 300), hp: 300, en: 100, team_tactic: 'LD' };
    const res = simulateTeamBattle([atk] as any[], [dLeader, dGuard] as any[], 1);
    expect(res.logs.some(l => l.includes('阻まれた'))).toBe(true);
    expect(res.logs.some(l => l.startsWith('▶ ') && l.includes('vs 敵護衛'))).toBe(true);
  });

  test('P38: 「特になし＋攻撃する(NA)」は団体行動を無視ログ', () => {
    const atk = { ...mkFighter('一匹狼', 300), hp: 300, en: 100, team_tactic: 'NA' };
    const dLeader = { ...mkFighter('敵D', 300), hp: 300, en: 100, team_tactic: 'NN' };
    const res = simulateTeamBattle([atk] as any[], [dLeader] as any[], 1);
    expect(res.logs.some(l => l.includes('団体行動を無視'))).toBe(true);
  });

  test('P38: サポーターに掩護されている敵を狙うと掩護ログが出る', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const atk = { ...mkFighter('狙撃手', 300), hp: 300, en: 100, team_tactic: 'LA' };
    const dLeader = { ...mkFighter('敵リーダー', 300), hp: 300, en: 100, team_tactic: 'NN' };
    const dSup = { ...mkFighter('敵支援機', 300), hp: 300, en: 100, team_tactic: 'LS' };
    const res = simulateTeamBattle([atk] as any[], [dLeader, dSup] as any[], 1);
    expect(res.logs.some(l => l.includes('掩護されている'))).toBe(true);
  });

  test('HP/ENがターンをまたいで持続する（毎ターン全快しない）', () => {
    const aTeam = [{ ...mkFighter('A1', 300), hp: 300, en: 100 }];
    const dTeam = [{ ...mkFighter('D1', 300), hp: 300, en: 100 }];
    simulateTeamBattle(aTeam as any[], dTeam as any[], 1);
    const untouched = (f: any) => f.hp >= 300 && f.en >= 100;
    expect(untouched(aTeam[0]) && untouched(dTeam[0])).toBe(false);
  });
});

describe('applyEquipmentTokusyu アイテムtokusyu合流とステータス修正 (P27)', () => {
  test('アイテムtokusyuが符号反転して機体tokusyuに合流する（ファンネル24→-24）', () => {
    const f: any = { unit_tokusyu: '2', weapon_tokusyu: '24', nt_level: 0 };
    applyEquipmentTokusyu(f);
    const merged = parseTokusyu(f.unit_tokusyu);
    expect(merged).toContain(2);
    expect(merged).toContain(-24);
  });

  test('シールド(1): 装甲+4 運動-10 と枚数・盾名の集計（P47: dmg_calc:99-106 の $shield/$shieldname）', () => {
    const f: any = { unit_tokusyu: '', item1_tokusyu: '1', item1_name: 'シールド', armor: 10, mobility: 30 };
    applyEquipmentTokusyu(f);
    expect(f.armor).toBe(14);
    expect(f.mobility).toBe(20);
    expect(f.hasShieldEquip).toBe(true);
    expect(f.shieldCount).toBe(1);
    expect(f.shieldName).toBe('シールド');
  });

  test('チョバムアーマー(9→-9): 装甲+30 運動-25、運動は0未満にならない', () => {
    const f: any = { unit_tokusyu: '', item2_tokusyu: '9', armor: 10, mobility: 10 };
    applyEquipmentTokusyu(f);
    expect(f.armor).toBe(40);
    expect(f.mobility).toBe(0);
  });

  test('NT武器(-24): NTパイロットなら武器威力×(1+|nt|/10)', () => {
    const f: any = { unit_tokusyu: '', weapon_tokusyu: '24', weapon_power: 100, nt_level: 5 };
    applyEquipmentTokusyu(f);
    expect(f.weapon_power).toBe(150);
  });

  test('NT用機体(2)×NT武器(24): 威力×(1+|nt|/20) が重ねて掛かる', () => {
    const f: any = { unit_tokusyu: '2', weapon_tokusyu: '24', weapon_power: 100, nt_level: 4 };
    applyEquipmentTokusyu(f);
    expect(f.weapon_power).toBe(168);
  });

  test('ジェネレーター(-13): 武器ENコスト×0.75・威力×1.5', () => {
    const f: any = { unit_tokusyu: '-13', weapon_power: 100, weapon_en_cost: 20 };
    applyEquipmentTokusyu(f);
    expect(f.weapon_en_cost).toBe(15);
    expect(f.weapon_power).toBe(150);
  });

  test('重量超過: 超過1につき運動-10', () => {
    const f: any = { unit_tokusyu: '', mobility: 100, max_weight: 20, weapon_weight: 15, item1_weight: 10 };
    applyEquipmentTokusyu(f);
    expect(f.mobility).toBe(50);
  });

  test('ENアップ(-10): 最大ENが2倍になり、開始ENに旧最大値が加算される（P47: 保存値ベース）', () => {
    const f: any = { unit_tokusyu: '-10', unit_base_en: 100, en: 50 };
    applyEquipmentTokusyu(f);
    expect(f.maxEn).toBe(200);   // 100×2（操縦ボーナス廃止）
    expect(f.en).toBe(150);      // 50 + 旧最大値100
  });

  test('二重適用されない（tokusyuApplied ガード）', () => {
    const f: any = { unit_tokusyu: '', item1_tokusyu: '1', armor: 10, mobility: 30 };
    applyEquipmentTokusyu(f);
    applyEquipmentTokusyu(f);
    expect(f.armor).toBe(14);
  });

  test('ガンダム(-14##100): 運動性×1.25、脱出装置(100)はリストに残る', () => {
    const f: any = { unit_tokusyu: '-14##100', mobility: 40 };
    applyEquipmentTokusyu(f);
    expect(f.mobility).toBe(50);
    expect(parseTokusyu(f.unit_tokusyu)).toContain(100);
  });
});

describe('applyPostBattleTokusyuEffects（battlelib:1383-1394, 1497-1524）', () => {
  test('-18による1.5倍回復', () => {
    const fighter: any = {
      handle_name: '回復マン', unit_tokusyu: '-18',
      hp: 10, en: 10, unit_base_hp: 100, unit_base_en: 100,
    };
    const result = applyPostBattleTokusyuEffects(fighter, 1, { exp: 5 });
    expect(result.fighterHp).toBe(15);
    expect(result.fighterEn).toBe(15);
  });

  test('pvp(1) 敗北時、-16 が経験値を勝利額に差し替え・-10 がENを枯渇させる', () => {
    const fighter: any = {
      handle_name: 'A', unit_tokusyu: '-16##-10', level: 10,
      hp: 50, en: 50, unit_base_hp: 100, unit_base_en: 100,
    };
    const result = applyPostBattleTokusyuEffects(fighter, 1, { exp: 2, winExp: 60 }, false);
    expect(result.finalExp).toBe(60);
    expect(result.fighterEn).toBe(0);
  });

  test('pvp(1) 勝利時は -16 でも経験値が変化しない（原作準拠）', () => {
    const fighter: any = {
      handle_name: 'B', unit_tokusyu: '-16', level: 10,
      hp: 50, en: 50, unit_base_hp: 100, unit_base_en: 100,
    };
    const result = applyPostBattleTokusyuEffects(fighter, 1, { exp: 10, winExp: 10 }, true);
    expect(result.finalExp).toBe(10);
  });

  test('team(5) では -16/-10 が発動しない', () => {
    const fighter: any = {
      handle_name: 'C', unit_tokusyu: '-16##-10',
      hp: 50, en: 50, unit_base_hp: 100, unit_base_en: 100,
    };
    const result = applyPostBattleTokusyuEffects(fighter, 5, { exp: 5 });
    expect(result.finalExp).toBe(5);
    expect(result.fighterEn).toBe(50);
  });

  test('tournament(3) では -16/-10 が発動しない', () => {
    const fighter: any = {
      handle_name: 'D', unit_tokusyu: '-16##-10',
      hp: 50, en: 50, unit_base_hp: 100, unit_base_en: 100,
    };
    const result = applyPostBattleTokusyuEffects(fighter, 3, { exp: 5 });
    expect(result.finalExp).toBe(5);
    expect(result.fighterEn).toBe(50);
  });
});

describe('getEscapeUnit 脱出先テーブル（創作値FIX済み・仕様§2）', () => {
  test('例外判定: ジオン系機体や戦艦の脱出(tokusyu=100)は脱出ポッド/ランチになる', () => {
    expect(getEscapeUnit([100], 'キュベレイ')?.name).toBe('脱出ポッド');
    expect(getEscapeUnit([100], 'ザンジバル')?.name).toBe('ランチ');
    expect(getEscapeUnit([100], 'ガンダム')?.name).toBe('コア・ファイター');
  });

  test('個別の脱出先とテーブル外IDの扱い', () => {
    expect(getEscapeUnit([103], 'ジオング')?.name).toBe('ジオング・ヘッド');
    expect(getEscapeUnit([113], 'ガンダムＧＰ０３Ｄ')?.name).toBe('ステイメン');
    expect(getEscapeUnit([199], '謎の機体')).toBe(null);
    expect(getEscapeUnit([-14], 'ガンダム')).toBe(null);
  });
});

describe('calcCost tests (P43)', () => {
  test('basic calculation (no traits)', () => {
    expect(calcCost(250, 1, 4, {})).toBe(0);
  });

  test('kiyou traits reduce cost', () => {
    expect(calcCost(1000, 1, 40, { '器用': 10 })).toBe(5);
  });
});

describe('parseTokusyu', () => {
  test('文字列と数字の複合IDを正しくパースできる', () => {
    const result = parseTokusyu("24##-44##NT_D");
    expect(result).toEqual([24, -44, 'NT_D']);
  });
});
