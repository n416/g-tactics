// P32: 戦闘クールダウン（連戦間隔制限）
// 原作は全戦闘入口に「$vtime秒後闘えるようになります」がある
// （battle.cgi:58-62 / vschar.cgi:76-80 / msvs.cgi:100-109 / ps_btlview.cgi:47 / teambattle.cgi）。
// 間隔値の原作定義（$b_time）は init_proc.cgi 未収録のため、リメイク独自値 60秒
// （env.BATTLE_COOLDOWN_SECONDS で上書き可。テストは 0 を指定）。

export const BATTLE_COOLDOWN_DEFAULT = 60;

export function cooldownSeconds(env: any): number {
  const v = Number(env?.BATTLE_COOLDOWN_SECONDS);
  return Number.isFinite(v) ? v : BATTLE_COOLDOWN_DEFAULT;
}

// 戦闘可能なら null、不可なら残り秒数を返す
export async function checkBattleCooldown(db: any, userId: string, env: any): Promise<number | null> {
  const sec = cooldownSeconds(env);
  if (sec <= 0) return null;
  const row: any = await db.prepare(`SELECT last_battle_at FROM characters WHERE id = ?`).bind(userId).first();
  const last = Number(row?.last_battle_at || 0);
  const now = Math.floor(Date.now() / 1000);
  const remain = last + sec - now;
  return remain > 0 ? remain : null;
}

// 戦闘実行後に最終戦闘時刻を記録
export async function touchBattleTime(db: any, userId: string) {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(`UPDATE characters SET last_battle_at = ? WHERE id = ?`).bind(now, userId).run();
}
