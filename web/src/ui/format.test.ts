import { describe, expect, it } from 'vitest';
import {
  clampToRange,
  formatNumber,
  fractionDigitsForStep,
  number01,
  number02,
  parseDecimal,
  roundHalfAwayFromZero,
} from './format';

describe('fractionDigitsForStep', () => {
  it.each([
    [1, 0],
    [0.5, 1],
    [0.1, 1],
    [0.05, 2],
    [0.01, 2],
    [10, 0],
    [4, 0],
    [0.2, 1],
    [0.001, 3],
  ])('step %s → %s digits', (step, digits) => {
    expect(fractionDigitsForStep(step)).toBe(digits);
  });
});

describe('formatNumber', () => {
  it('formats like Swift fractionLength(0...n), en-US, without grouping', () => {
    expect(number01(133.4)).toBe('133.4');
    expect(number01(230)).toBe('230');
    expect(number02(3.75)).toBe('3.75');
    expect(number02(2)).toBe('2');
    expect(formatNumber(1500, 0)).toBe('1500');
    expect(formatNumber(12345.678, 1)).toBe('12345.7');
    expect(formatNumber(1.3000000000000003, 1)).toBe('1.3');
  });

  it('rounds half to even on the shortest digits, as Foundation does', () => {
    // Values from a Foundation probe run on 2026-10-29.
    expect(formatNumber(0.25, 1)).toBe('0.2');
    expect(formatNumber(0.35, 1)).toBe('0.4');
    expect(formatNumber(0.45, 1)).toBe('0.4');
    expect(formatNumber(2.675, 2)).toBe('2.68');
    expect(formatNumber(1.005, 2)).toBe('1');
    expect(formatNumber(0.125, 2)).toBe('0.12');
    expect(formatNumber(2.5, 0)).toBe('2');
    expect(formatNumber(3.5, 0)).toBe('4');
    expect(formatNumber(-0, 1)).toBe('-0');
    expect(formatNumber(-0.04, 1)).toBe('-0');
  });
});

describe('roundHalfAwayFromZero', () => {
  it('rounds halves away from zero and keeps the sign of zero', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(12.5)).toBe(13);
    expect(roundHalfAwayFromZero(2.4999999999999996)).toBe(2);
    expect(roundHalfAwayFromZero(0.49999999999999994)).toBe(0);
    expect(Object.is(roundHalfAwayFromZero(-0.4), -0)).toBe(true);
    expect(roundHalfAwayFromZero(2 ** 53 + 2)).toBe(2 ** 53 + 2);
  });
});

describe('clampToRange', () => {
  it('clamps like Swift min(upper, max(lower, x))', () => {
    expect(clampToRange(999, 0, 10)).toBe(10);
    expect(clampToRange(-5, 0, 10)).toBe(0);
    expect(clampToRange(4, 0, 10)).toBe(4);
    expect(Object.is(clampToRange(-0, 0, 10), -0)).toBe(true);
  });
});

describe('parseDecimal', () => {
  it('accepts dot and comma decimals with surrounding spaces', () => {
    expect(parseDecimal('1.25')).toBe(1.25);
    expect(parseDecimal(' 1,25 ')).toBe(1.25);
    expect(parseDecimal('-3')).toBe(-3);
    expect(parseDecimal('+3')).toBe(3);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('5.')).toBe(5);
    expect(parseDecimal('1e3')).toBe(1000);
  });

  it('rejects everything else', () => {
    for (const text of ['', ' ', 'abc', '1.2.3', '1,250.5', '12mm', 'Infinity', 'NaN', '1e400', '0x10', '- 3']) {
      expect(parseDecimal(text), text).toBeNull();
    }
  });
});
