export async function recordUnitObtained(db: any, userId: string, unitId: number) {
  if (!userId || !unitId || unitId <= 0) return;
  if (userId.startsWith('npc_') || userId.startsWith('NPC')) return;

  await db.prepare(`
    INSERT INTO user_unit_stats (user_id, unit_id, obtained_count, first_obtained_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id, unit_id) DO UPDATE SET
      obtained_count = obtained_count + 1,
      first_obtained_at = COALESCE(first_obtained_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
  `).bind(userId, unitId).run();
}

export async function recordUnitBattleResult(db: any, params: { userId: string, unitId: number, isWin: boolean }) {
  const { userId, unitId, isWin } = params;
  if (!userId || !unitId || unitId <= 0) return;
  if (userId.startsWith('npc_') || userId.startsWith('NPC')) return;

  if (isWin) {
    await db.prepare(`
      INSERT INTO user_unit_stats (user_id, unit_id, obtained_count, first_obtained_at, total_kills, current_win_streak, max_win_streak)
      VALUES (?, ?, 0, NULL, 1, 1, 1)
      ON CONFLICT (user_id, unit_id) DO UPDATE SET
        total_kills = total_kills + 1,
        current_win_streak = current_win_streak + 1,
        max_win_streak = MAX(max_win_streak, current_win_streak + 1),
        updated_at = CURRENT_TIMESTAMP
    `).bind(userId, unitId).run();
  } else {
    await db.prepare(`
      INSERT INTO user_unit_stats (user_id, unit_id, obtained_count, first_obtained_at)
      VALUES (?, ?, 0, NULL)
      ON CONFLICT (user_id, unit_id) DO UPDATE SET
        current_win_streak = 0,
        updated_at = CURRENT_TIMESTAMP
    `).bind(userId, unitId).run();
  }
}
