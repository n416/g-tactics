export const POWER_PLANT_RATES = [0, 5, 12, 25, 50, 100]; // pt/h
export const POWER_PLANT_COSTS = [0, 500, 2000, 8000, 20000, 50000];

export const REPAIR_DOCK_DISCOUNTS = [0, 0.1, 0.2, 0.3, 0.4, 0.5]; // 10% to 50%
export const REPAIR_DOCK_COSTS = [0, 1000, 3000, 10000, 25000, 60000];

export const TURRET_COSTS = [0, 800, 2500, 8000, 20000, 50000];
export const TURRET_SHOTS = [0, 1, 1, 2, 2, 3];
export const TURRET_DAMAGE = [0, 20, 35, 35, 50, 50];

export const MUSEUM_COSTS = [0, 2000, 5000, 15000, 30000, 80000];

export const FACTORY_DISCOUNTS = [0, 0.02, 0.05, 0.08, 0.12, 0.15]; // 2% to 15%
export const FACTORY_COSTS = [0, 8000, 15000, 30000, 60000, 120000];

export const MUSEUM_SLOTS = [0, 4, 8, 12, 18, 24];

export function getTurretIntercept(level: number): { shots: number, damage: number } {
  if (level < 1 || level > 5) return { shots: 0, damage: 0 };
  return {
    shots: TURRET_SHOTS[level] || 0,
    damage: TURRET_DAMAGE[level] || 0
  };
}

export function getMuseumSlots(level: number): number {
  if (level < 1 || level > 5) return 0;
  return MUSEUM_SLOTS[level] || 0;
}

export function getFacilityUpgradeCost(facility: string, nextLevel: number): number {
  if (nextLevel < 1 || nextLevel > 5) return Infinity;
  switch (facility) {
    case 'power': return POWER_PLANT_COSTS[nextLevel];
    case 'dock': return REPAIR_DOCK_COSTS[nextLevel];
    case 'turret': return TURRET_COSTS[nextLevel];
    case 'museum': return MUSEUM_COSTS[nextLevel];
    case 'factory': return FACTORY_COSTS[nextLevel];
    default: return Infinity;
  }
}

export async function getFacilityLevel(db: any, userId: string, facility: string): Promise<number> {
  const record: any = await db.prepare('SELECT level FROM user_facilities WHERE user_id = ? AND facility = ?').bind(userId, facility).first();
  return record ? record.level : 0;
}

export async function getFactoryDiscountRate(db: any, userId: string): Promise<number> {
  const level = await getFacilityLevel(db, userId, 'factory');
  return FACTORY_DISCOUNTS[level] || 0;
}

export async function getDockDiscountRate(db: any, userId: string): Promise<number> {
  const level = await getFacilityLevel(db, userId, 'dock');
  return REPAIR_DOCK_DISCOUNTS[level] || 0;
}

export async function getPowerPlantRate(db: any, userId: string): Promise<number> {
  const level = await getFacilityLevel(db, userId, 'power');
  return POWER_PLANT_RATES[level] || 0;
}

export function calcPendingIncome(lastCollectedAtSec: number, nowSec: number, level: number): number {
  if (level < 1 || level > 5) return 0;
  const rate = POWER_PLANT_RATES[level] || 0;
  if (rate === 0) return 0;
  const maxAccumulationSeconds = 12 * 3600;
  const secondsSinceLast = Math.max(0, Math.min(nowSec - lastCollectedAtSec, maxAccumulationSeconds));
  return Math.floor((secondsSinceLast / 3600) * rate);
}
