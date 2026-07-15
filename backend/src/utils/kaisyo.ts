// 機体熟練度（機熟=原作 kaisyo）の計算。出典: msvs.cgi:404-405, battlelib.pl:1538-1542
export function calcMapl(unitCustomLp: number, unitCustomMobility: number): number {
  return (200 + (unitCustomLp || 0) * 10) - (unitCustomMobility || 0);
}

export function calcTul(unitLv: number, unitCustomMobility: number): number {
  return (200 + (150 - (unitLv || 1)) * 5) - (unitCustomMobility || 0);
}

// 戦闘後の機熟増加（battlelib.pl:1538-1542）。
// certain=true: 優勝戦・個別戦闘（原作 battle_syurui=1）＝必ず+1
// certain=false: 対人/NPCシミュレーター（同 2）＝ rand(キャラLv) < 10 のとき+1
// MAPL未満のときのみ増加し、TULでクランプ。チーム戦・大会では呼ばないこと（原作に増加分岐なし）。
export function gainKaisyo(current: number, mapl: number, tul: number, certain: boolean, charaLevel: number, rand: () => number = Math.random): number {
  let kaisyo = current || 0;
  if (kaisyo < mapl) {
    if (certain) {
      kaisyo++;
    } else if (Math.floor(rand() * Math.max(1, charaLevel || 1)) < 10) {
      kaisyo++;
    }
    if (kaisyo > tul) kaisyo = tul;
  }
  return kaisyo;
}
