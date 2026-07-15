import { expect, test, describe, vi, afterEach } from 'vitest';
import { calcBattleExp, calcBattleGold, applyLevelUp, tryLearnSkillAndNt, MAX_LV } from './battleRewards';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('P47-B3 経験値（battlelib:1317-1331/1383-1400）', () => {
  test('勝利(優勝戦=1): (敵Lv+(敵機体Lv+敵カスタム数)×4)+rand(敵Lv)+連勝×10', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);  // rand項=0
    // 敵Lv50, 機体Lv20, lp4, 連勝3 → 50+(24)*4+0+30 = 176
    expect(calcBattleExp(true, 1, 10, { level: 50, unit_lv: 20, lp: 4 }, 3)).toBe(176);
  });

  test('勝利(シミュ=2): 連勝ボーナスなし', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(calcBattleExp(true, 2, 10, { level: 50, unit_lv: 20, lp: 4 }, 3)).toBe(146);
  });

  test('敗北(1/2): 敵Lv+敵機体Lv×3+連勝', () => {
    expect(calcBattleExp(false, 1, 10, { level: 50, unit_lv: 20 }, 3)).toBe(113);
  });

  test('敗北(NPC=3): rand(5)（battlelib:1398）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(calcBattleExp(false, 3, 10, { level: 50, unit_lv: 20 }, 0)).toBe(4);
  });

  test('レベル上限256では経験値0（battlelib:1331）', () => {
    expect(calcBattleExp(true, 1, MAX_LV, { level: 50, unit_lv: 20 }, 0)).toBe(0);
  });
});

describe('P47-B3 戦果（battle.cgi:143-183）', () => {
  test('勝利の通常式: 最終額は rand(gold)+10+連勝×10、所持金加算は連勝分が二重（原作挙動）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // glv = max(1, 敵50-自10)=40 → gold = 40*6+20-irand(10)=240+20-5=255 → 最終 irand(255)+10+30=167
    const r = calcBattleGold(true, { level: 10, unit_lv: 10, unit_tokusyu: '', traits: '{}' }, { level: 50, unit_lv: 20 }, 3);
    expect(r.bonus2).toBe(30);
    expect(r.gold).toBe(167);
    expect(r.moneyGain).toBe(197);  // battle.cgi:183 の gold+bonus2
  });

  test('敗北: 10+rand(敵機体Lv) を種に rand(gold)+10', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = calcBattleGold(false, { level: 10, unit_lv: 10 }, { level: 50, unit_lv: 20 }, 3);
    expect(r.bonus2).toBe(0);
    expect(r.gold).toBe(10);   // irand(10)+10+0
    expect(r.moneyGain).toBe(10);
  });
});

describe('P47-B3 レベルアップ（battlelib:1456-1485。減算式・1戦1回）', () => {
  test('閾値=熟練度×500。超えたら消費してレベルアップし武器ボーナスで能力が伸びる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const logs: string[] = [];
    // exp 480 + 30 = 510 >= 1*500 → 残10・Lv2。武器hani=1 → 近距離 +irand(5)+1=3
    const r = applyLevelUp({ level: 1, exp: 480 }, 30, 1, 1, 0, logs);
    expect(r.level).toBe(2);
    expect(r.exp).toBe(10);
    expect(r.statGains['status_short_range']).toBe(3);
    expect(logs.some(l => l.includes('熟練度が上がった'))).toBe(true);
    expect(logs.some(l => l.includes('近距離が上がった'))).toBe(true);
  });

  test('装備hani=5は操縦が伸びる。閾値未満は何も起きない', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r1 = applyLevelUp({ level: 10, exp: 0 }, 100, 1, 0, 5, []);
    expect(r1.level).toBe(10);
    expect(Object.keys(r1.statGains).length).toBe(0);

    const r2 = applyLevelUp({ level: 1, exp: 499 }, 1, 1, 0, 5, []);
    expect(r2.level).toBe(2);
    expect(r2.statGains['status_piloting']).toBe(2);  // irand(2)+1 = 2
  });

  test('NPC模擬戦(3)ではランダム能力上昇の抽選が走らない（battlelib:1464）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);  // 抽選があれば必ず全能力ヒットする乱数
    const r = applyLevelUp({ level: 1, exp: 500 }, 0, 3, 0, 0, []);
    expect(r.level).toBe(2);
    expect(Object.keys(r.statGains).length).toBe(0);
  });
});

describe('P47-B3 スキル取得の8枠制・排他（battlelib:1333-1358）', () => {
  test('挑発系5種は1枠排他: 新規習得で前のものを忘れる', () => {
    // irand(learnDenom)=0 で習得、pos=7（挑発系枠）、group=irand(5)=0 → kamikaze
    vi.spyOn(Math, 'random').mockReturnValueOnce(0)      // 習得判定
      .mockReturnValueOnce(7 / 8)                        // pos=7
      .mockReturnValueOnce(0);                           // group→kamikaze
    const logs: string[] = [];
    const r = tryLearnSkillAndNt('{"provoke":1,"melee":2}', true, 0, logs, 1, false);
    const skills = JSON.parse(r.newSkillsJson);
    expect(skills.kamikaze).toBe(1);
    expect(skills.provoke).toBeUndefined();              // 忘れた
    expect(skills.melee).toBe(2);                        // 他枠は無傷
    expect(logs.some(l => l.includes('挑発を忘れて特攻を身に付けた'))).toBe(true);
  });

  test('格闘系は上限2で頭打ち', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);  // 習得判定・pos=0(melee)
    const r = tryLearnSkillAndNt('{"melee":2}', true, 0, [], 1, false);
    expect(JSON.parse(r.newSkillsJson).melee).toBe(2);   // 増えない（battlelib:1340）
  });

  test('Q7 skill_max=12 は特殊(skill_12)を数えない（msvs.cgi:838・msvs_ini:363）', () => {
    // 学習/NT判定を無効化（irand が 0 にならないよう 0.5 固定）＝入力スキルの合算のみ検証
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // 7系統で合計12（melee2+focus_fire2+snipe2+ground3+water3）＋特殊provoke1
    const r = tryLearnSkillAndNt('{"melee":2,"focus_fire":2,"snipe":2,"ground":3,"water":3,"provoke":1}', true, 0, [], 1, false);
    expect(r.requiresSkillForget).toBe(false); // 特殊は数えない→12でセーフ（旧実装は13で誤発動）

    // 7系統だけで13ならば超過
    const r2 = tryLearnSkillAndNt('{"melee":2,"focus_fire":2,"snipe":2,"ground":3,"water":3,"space":1}', true, 0, [], 1, false);
    expect(r2.requiresSkillForget).toBe(true);
  });

  test('NT覚醒: 一般人0→1・最大10。強化人間(負)は戦闘では変化しない（battlelib:1355-1356）', () => {
    // 習得判定は外し（irand(50)≠0）、NT判定 irand(500)=0
    const seq = [0.5, 0];
    vi.spyOn(Math, 'random').mockImplementation(() => seq.length ? seq.shift()! : 0.5);
    const r = tryLearnSkillAndNt('{}', true, 0, [], 1, false);
    expect(r.newNtLevel).toBe(1);

    const seq2 = [0.5, 0];
    vi.spyOn(Math, 'random').mockImplementation(() => seq2.length ? seq2.shift()! : 0.5);
    const r2 = tryLearnSkillAndNt('{}', true, -3, [], 1, false);
    expect(r2.newNtLevel).toBe(-3);  // 負（強化人間）は不変

    const seq3 = [0.5, 0];
    vi.spyOn(Math, 'random').mockImplementation(() => seq3.length ? seq3.shift()! : 0.5);
    const r3 = tryLearnSkillAndNt('{}', true, 10, [], 1, false);
    expect(r3.newNtLevel).toBe(10);  // 上限10で不変
  });
});
