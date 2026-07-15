// ============================================================
// 機体種類コード（unit_ini 第27欄 = units.syurui）の凡例と判定。
//
// コードは「1文字 = 1カテゴリ」の membership 文字列（例 '48Aj'）。
// 凡例の定義元（原作 unit_syurui.cgi の @ms_syurui/@ms_syuruimei）は入手できた原作資料に
// 含まれていないため、大会設置フィルタの選択肢表示（1文字コード＝カテゴリ名の対応）から復元した。
// 判定は原作 trmt_jyoken.pl:43-48 と同じ「コードに指定文字が含まれるか」。
// ============================================================

export const SYURUI_LEGEND: Record<string, string> = {
  '1': 'MS系', '2': 'MA系', '3': '戦艦系', '4': 'その他の機体', 'p': '車輛・航空機',
  '5': 'ザク系', '6': 'ガンダム系', '7': 'GM系', 'a': 'グフ系', 'b': 'ゲルググ系',
  'c': 'ドム系', 'd': 'ギャン系', 'e': '専用機', 'i': '非公式系他',
  '8': '連邦軍/ティターンズ', '9': 'ジオン/ネオ・ジオン軍', '0': 'エゥーゴ/カラバ',
  'g': 'リガ・ミリティア', 'h': 'ザンスカール帝国',
  'A': '機動戦士ガンダム', 'B': 'ポケットの中の戦争', 'C': '第08MS小隊', 'D': 'MSV/MSV-R',
  'E': 'MS-X(ペズン)', 'F': 'CROSS DIMENSION', 'G': 'THE BLUE DESTINY',
  'f': 'コロニーの落ちた地で', 'j': 'MS IGLOO', 'H': '0083 STARDUST MEMORY',
  'I': '機動戦士Ζガンダム', 'J': 'Ζ-MSV', 'K': '機動戦士ガンダムΖΖ',
  'L': '逆襲のシャア', 'M': 'ΖΖ-MSV/CCA-MSV', 'N': '閃光のハサウェイ',
  'O': 'ガンダムセンチネル', 'P': 'エコール・デュ・シエル', 'Q': 'M-MSV',
  'R': '機動戦士ガンダムF90', 'S': '機動戦士ガンダムF91', 'T': 'シルエットフォーミュラ',
  'U': '機動戦士Vガンダム', 'V': '機動武闘伝Gガンダム', 'W': '新機動戦記ガンダムW',
  'X': 'G-UNIT', 'Y': '機動新世紀ガンダムX', 'Z': 'ターンAガンダム',
  'k': 'G-SAVIOUR', 'l': '機動戦士クロスボーンガンダム', 'm': '機動戦士ガンダムSEED',
  'n': 'SEED ASTRAY/MSV/CE73', 'o': '機動戦士ガンダムSEED DESTINY',
  'q': 'ADVANCE OF Ζ', 'r': '機動戦士ガンダムUC', 's': 'ガイア・ギア', 't': '機動戦士ガンダム00',
};

// UI のグループ分け（原作設置画面の 種類1/種類2 構成を4軸に整理）
export const SYURUI_GROUPS: { label: string; chars: string[] }[] = [
  { label: '機体種類', chars: ['1', '2', '3', '4', 'p'] },
  { label: '系統', chars: ['5', '6', '7', 'a', 'b', 'c', 'd', 'e', 'i'] },
  { label: '勢力', chars: ['8', '9', '0', 'g', 'h'] },
  { label: '作品', chars: [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'f', 'j', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    'k', 'l', 'm', 'n', 'o', 'q', 'r', 's', 't',
  ] },
];

// 機体のコードが指定カテゴリ文字を含むか（原作 trmt_jyoken 準拠）
export function unitHasSyurui(syurui: string | null | undefined, char: string): boolean {
  return !!syurui && syurui.includes(char);
}

// 機体のコードを表示名リストに展開（凡例に無い文字は無視＝表示名なしフラグ扱い）
export function syuruiNames(syurui: string | null | undefined): string[] {
  if (!syurui) return [];
  const names: string[] = [];
  for (const ch of syurui) {
    const name = SYURUI_LEGEND[ch];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}
