import { describe, expect, it } from 'vitest';
import {
  getUpOver240,
  calcNormalCost,
  calcEnhancedCost,
  calcLimit,
  checkNormalSuccess,
  checkEnhancedSuccess
} from '../src/utils/trainingLogic';
import { parseTraits } from '../src/utils/traits';
import { trainingSuccessTraitTerm, baimeiFameRandMax } from '../src/utils/traitEffects';

describe('P48 Training Logic (Pure Functions)', () => {
  it('getUpOver240', () => {
    expect(getUpOver240(1200)).toBe(0);
    expect(getUpOver240(1201)).toBe(201);
    expect(getUpOver240(6000)).toBe(5000);
    expect(getUpOver240(6001)).toBe(6002);
  });

  it('calcNormalCost', () => {
    expect(calcNormalCost(10, 1, 0)).toBe(25);
    expect(calcNormalCost(1, 10, 0)).toBe(1);
    expect(calcNormalCost(10, 1, 100)).toBe(125);
  });

  it('calcEnhancedCost', () => {
    expect(calcEnhancedCost(1)).toBe(100);
    expect(calcEnhancedCost(5)).toBe(500);
    expect(calcEnhancedCost(10)).toBe(1000);
    expect(calcEnhancedCost(20)).toBe(1000);
  });

  it('calcLimit', () => {
    expect(calcLimit(0)).toBe(17);
    expect(calcLimit(100)).toBe(7);
    expect(calcLimit(170)).toBe(0);
  });

  it('checkNormalSuccess', () => {
    expect(checkNormalSuccess(8.9, 0, 0)).toBe(true);
    expect(checkNormalSuccess(9.0, 0, 0)).toBe(false);

    expect(checkNormalSuccess(7.9, 5000, 0)).toBe(true);
    expect(checkNormalSuccess(8.0, 5000, 0)).toBe(false);

    expect(checkNormalSuccess(1.9, 40000, 0)).toBe(true);
    expect(checkNormalSuccess(2.0, 40000, 0)).toBe(false);

    expect(checkNormalSuccess(9.4, 0, 0.5)).toBe(true);
  });

  it('checkEnhancedSuccess', () => {
    expect(checkEnhancedSuccess(7.9, 0)).toBe(true);
    expect(checkEnhancedSuccess(8.0, 0)).toBe(false);
    expect(checkEnhancedSuccess(8.4, 0.5)).toBe(true);
  });

  it('trainingSuccessTraitTerm', () => {
    let traits = parseTraits('{"ナルシスト":10,"運が悪い":5}');
    expect(trainingSuccessTraitTerm(traits)).toBe(0);

    traits = parseTraits('{"ナルシスト":20}');
    expect(trainingSuccessTraitTerm(traits)).toBe(2);

    traits = parseTraits('{"運が悪い":10}');
    expect(trainingSuccessTraitTerm(traits)).toBe(-2);
  });

  it('baimeiFameRandMax', () => {
    let traits = parseTraits('');
    expect(baimeiFameRandMax(traits)).toBe(5);

    traits = parseTraits('{"ずうずうしい":10}');
    expect(baimeiFameRandMax(traits)).toBe(7);

    // 特性項は小数のまま（原作 rand(5 + 3/5)=rand(5.6)。int は rand 結果に掛かる）
    traits = parseTraits('{"ずうずうしい":3}');
    expect(baimeiFameRandMax(traits)).toBe(5.6);
  });
});
