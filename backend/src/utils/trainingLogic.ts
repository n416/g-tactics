export const getUpOver240 = (sum5: number): number => {
  if (sum5 > 6000) return sum5 * 2 - 6000;
  if (sum5 > 1200) return sum5 - 1000;
  return 0;
};

export const calcNormalCost = (stat: number, lv: number, upOver240: number): number => {
  const safeLv = Math.max(1, lv);
  return Math.max(1, Math.trunc((stat * stat) / (safeLv * 4)) + upOver240);
};

export const calcEnhancedCost = (lv: number): number => {
  const safeLv = Math.max(1, lv);
  return Math.min(safeLv, 10) * 100;
};

export const calcLimit = (stat: number): number => {
  return Math.max(0, 17 - Math.trunc(stat / 10));
};

export const checkNormalSuccess = (rand10: number, upOver240: number, trainingTraitTerm: number): boolean => {
  const threshold = 9 - Math.min(upOver240, 35000) / 5000 + trainingTraitTerm;
  return rand10 < threshold;
};

export const checkEnhancedSuccess = (rand10: number, trainingTraitTerm: number): boolean => {
  const threshold = 8 + trainingTraitTerm;
  return rand10 < threshold;
};
