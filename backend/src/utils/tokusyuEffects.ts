// ==========================================
// 特殊能力（tokusyu）コードの面別投影レイヤ
//
// tokusyu はドメイン上「数値コード1つ」だが、その意味は複数の面に散らばる:
//   - displayName: 発動特殊能力欄の表示名（auth.ts /api/me）
//   - battleFlag : 戦闘中の named flags（battleLogic.flagsFromTokusyu）
//   - statMods   : 装備適用時のステータス修正（battleEngine.applyEquipmentTokusyu）
//   - postBattle : 戦闘後効果の種別（battleEngine.applyPostBattleTokusyuEffects / battleRewards）
//
// 同じコードでも面ごとに意味が違う（例: -24 は battleFlag=NT用武器フラグ /
// statMods=威力倍率 / displayName=「NT用武器」）。本モジュールが「コード → 各面の投影」の
// 唯一のカタログで、消費側は自分の面だけを投影する（1つのフラグ集合に潰さない）。
// traitEffects.ts の tokusyu 版。新コードの追加はこの表を1箇所直すだけで済む。
//
// 【不変条件】facet の分布・数式は既存4消費点と1:1（挙動不変の集約）。
// 出典行は各 statMods / battleFlag のコメント（battlelib.pl / battle.cgi）。
// ==========================================

// statMods 適用時に消費側（applyEquipmentTokusyu）から渡す文脈。
// 同関数のローカル変数（nt / ntmem / maxEn0）をそのまま面へ渡す。
export interface TokusyuStatContext {
  fighter: any;
  nt: number;
  ntmem: boolean;
  maxEn0: number;
}

// 戦闘後効果の種別タグ。適用の条件（isWin / battle_syurui）と数式は
// 面ごとのポリシーとして消費側が保持する（ここは「どのコードがどの効果か」だけ）。
export type PostBattleTag = 'biosensorGold' | 'expBoostOnLoss' | 'enDrain' | 'hpEnRestore';

export interface TokusyuEntry {
  displayName?: string;                          // 発動特殊能力欄の表示名
  battleFlag?: string[];                         // LFlags のキー名（複数可）
  statMods?: (ctx: TokusyuStatContext) => void;  // 装備適用時のステータス修正
  postBattle?: PostBattleTag;                    // 戦闘後効果の種別
  support?: { healAmmo: number };                // チーム戦サポーター面（supportOf）。healAmmo=弾薬補給の発数
}

const floor = Math.floor;
const abs = Math.abs;

export const TOKUSYU_REGISTRY: Record<number, TokusyuEntry> = {
  // --- 正コード（機体内蔵。battleFlag / statMods 系）---
  1: { displayName: 'シールド装備' }, // 盾の実効果は applyEquipmentTokusyu の item ループ（dmg_calc:99-106）
  2: {
    displayName: 'NT専用機',
    // NTメンバー機の威力倍率（applyEquipmentTokusyu case 2）
    statMods: ({ fighter, nt, ntmem }) => {
      if (nt !== 0 && ntmem) fighter.weapon_power = floor((fighter.weapon_power || 0) * (1 + abs(nt) / 20));
    },
  },
  3: { displayName: 'EXAMシステム', battleFlag: ['exam', 'examEnRecover'] },
  4: { battleFlag: ['meleeBoost'] },
  5: { battleFlag: ['waterBoost'] },
  6: { battleFlag: ['longBoost'] },
  7: { displayName: 'Iフィールド', battleFlag: ['iField'] },
  8: { displayName: 'リフレクターシールド', battleFlag: ['reflector'] },
  9: { battleFlag: ['midBoost'] },
  10: { displayName: '自爆装置', battleFlag: ['jibaku'] },
  11: { displayName: 'ビームコーティング', battleFlag: ['coating'] },
  12: { displayName: 'ALICEシステム', battleFlag: ['alice'] },

  // --- 負コード（装備由来。displayName ＋ statMods / battleFlag / postBattle）---
  [-2]: { displayName: '移動能力アップ', statMods: ({ fighter }) => { fighter.idouBonus = (fighter.idouBonus || 0) + 10; } },
  [-3]: { displayName: 'ビームバリア', battleFlag: ['beamBarrier'] },
  [-4]: { displayName: 'スモーク・ディスチャージャー', battleFlag: ['smoke'] },
  [-5]: { displayName: '運動性アップ', statMods: ({ fighter }) => { fighter.mobility = (fighter.mobility || 0) + 20; } },
  [-6]: { displayName: 'ミノフスキー粒子散布', battleFlag: ['minovsky'] },
  [-7]: { displayName: 'ビーム撹乱幕', battleFlag: ['beamJam'] },
  [-8]: { displayName: '拡散ビーム', battleFlag: ['kakusan'] },
  [-9]: { displayName: 'アーマー装備', statMods: ({ fighter }) => { fighter.armor = (fighter.armor || 0) + 30; fighter.mobility = (fighter.mobility || 0) - 25; } },
  [-10]: {
    displayName: 'EN最大値アップ',
    statMods: ({ fighter, maxEn0 }) => { fighter.unit_base_en = 2 * (fighter.unit_base_en || 0); fighter.en = (fighter.en ?? maxEn0) + maxEn0; },
    postBattle: 'enDrain',
  },
  [-11]: { displayName: '新型アビオニクス', battleFlag: ['avionics'] },
  [-12]: { displayName: 'リミッター解除', battleFlag: ['limitCut'] },
  [-13]: { displayName: 'ジェネレーター強化', statMods: ({ fighter }) => { fighter.weapon_en_cost = floor((fighter.weapon_en_cost || 0) * 0.75); fighter.weapon_power = floor((fighter.weapon_power || 0) * 1.5); } },
  [-14]: { displayName: '運動性向上', statMods: ({ fighter }) => { fighter.mobility = floor((fighter.mobility || 0) * 1.25); } },
  [-15]: { displayName: '索敵向上', battleFlag: ['balloonCancel'], statMods: ({ fighter }) => { fighter.sensor = (fighter.sensor || 0) + 30; } },
  // -16/-17/-18 は表示なし（発動特殊能力欄には出さない）＝ postBattle 面のみ
  [-16]: { postBattle: 'expBoostOnLoss' },
  [-17]: { postBattle: 'biosensorGold' },
  [-18]: { postBattle: 'hpEnRestore' },
  [-19]: { displayName: '弾数アップ', statMods: ({ fighter }) => { fighter.ammoMultiplier = 4; } },
  [-20]: { displayName: 'ハイパーモード', battleFlag: ['hyperMode'] },
  [-21]: { displayName: '敵シールド無効', battleFlag: ['shieldPierce'], statMods: ({ fighter }) => { fighter.shieldPiercing = true; } },
  [-22]: { displayName: '運動性アップ(大)', statMods: ({ fighter }) => { fighter.mobility = (fighter.mobility || 0) + 40; } },
  [-23]: { displayName: 'アーマー装備(大)', statMods: ({ fighter }) => { fighter.armor = (fighter.armor || 0) + 60; fighter.mobility = (fighter.mobility || 0) - 15; } },
  [-24]: {
    displayName: 'NT用武器',
    battleFlag: ['ntWeapon'],
    statMods: ({ fighter, nt }) => { if (nt !== 0) fighter.weapon_power = floor((fighter.weapon_power || 0) * (1 + abs(nt) / 10)); },
  },
  [-25]: { displayName: '地上適性アップ', statMods: ({ fighter }) => { fighter.terrain_ground = (fighter.terrain_ground || 0) + 2; } },
  [-26]: { displayName: '水中適性アップ', statMods: ({ fighter }) => { fighter.terrain_water = (fighter.terrain_water || 0) + 2; } },
  [-27]: { displayName: '宇宙適性アップ', statMods: ({ fighter }) => { fighter.terrain_space = (fighter.terrain_space || 0) + 2; } },
  [-28]: { displayName: '空中適性アップ', statMods: ({ fighter }) => { fighter.terrain_air = (fighter.terrain_air || 0) + 2; } },
  [-29]: { displayName: '耐久・EN自動回復', battleFlag: ['selfRepair'] },
  [-30]: { displayName: 'ABCマント', battleFlag: ['abcMantle'] },
  [-31]: { displayName: '運動性向上(大)', statMods: ({ fighter }) => { fighter.mobility = floor((fighter.mobility || 0) * 1.5); } },
  [-32]: { displayName: '弾数アップ(大)', statMods: ({ fighter }) => { fighter.ammoMultiplier = 6; } },
  [-33]: { displayName: '索敵向上(大)', battleFlag: ['balloonCancel'], statMods: ({ fighter }) => { fighter.sensor = (fighter.sensor || 0) * 2; } },
  [-34]: { displayName: 'アクティブクローク', battleFlag: ['activeCloak'] },
  [-35]: { displayName: '耐久・EN自動回復2', battleFlag: ['selfRepair2'] },
  [-36]: { displayName: 'ダミーバルーン', battleFlag: ['balloon'] },
  [-37]: { displayName: '機雷散布', battleFlag: ['kiraiSelf'] },
  [-38]: { displayName: 'EN自動回復2', battleFlag: ['enRecover2'] },
  [-39]: { displayName: 'フェイズシフト装甲', battleFlag: ['phaseShift'] },
  [-40]: { displayName: 'ミラージュコロイド', battleFlag: ['mirage'] },
  // -41/-42 は表示なし（発動特殊能力欄には出さない）＝ support 面のみ。
  // healAmmo は台帳§15の仮定（-42 所持で弾薬5発補給 / -41 は回復のみで弾薬補給なし）。
  [-41]: { support: { healAmmo: 0 } },
  [-42]: { support: { healAmmo: 5 } },
  [-43]: { displayName: 'ゼロシステム', battleFlag: ['zero'] },
  [-44]: { displayName: 'DG細胞', battleFlag: ['dgCells'] },
  [-45]: { displayName: '攻撃反射', battleFlag: ['reflect'] },
  [-46]: { displayName: 'NTビーム防御', battleFlag: ['ntBeamDef'] },
  [-47]: { displayName: '牽制', battleFlag: ['kensei'] },
  [-48]: { displayName: '電磁パルス/マヒ', battleFlag: ['paralyzer'] },
};

// --- 面別アクセサ（消費側はこれだけを使い、生の数値コードを知らない）---

// displayName 面: 発動特殊能力欄の表示名（該当が無ければ undefined）。
export const tokusyuDisplayName = (code: number): string | undefined => TOKUSYU_REGISTRY[code]?.displayName;

// postBattle 面: いずれかのコードが指定の戦闘後効果を持つか。
// parseTokusyu は (number|string)[] を返すため両方受ける（非数値は該当なし＝false 側）。
export function hasPostBattleEffect(codes: (number | string)[], tag: PostBattleTag): boolean {
  return codes.some(c => TOKUSYU_REGISTRY[c as number]?.postBattle === tag);
}

// support 面: いずれかのコードがサポーター能力（-41/-42）を持つか。
export function hasSupportTokusyu(codes: (number | string)[]): boolean {
  return codes.some(c => TOKUSYU_REGISTRY[c as number]?.support !== undefined);
}

// support 面: 弾薬補給の発数（サポーター各コードの最大＝原作は -42 所持で5・非所持で0）。
export function supportHealAmmo(codes: (number | string)[]): number {
  return codes.reduce<number>((max, c) => Math.max(max, TOKUSYU_REGISTRY[c as number]?.support?.healAmmo ?? 0), 0);
}
