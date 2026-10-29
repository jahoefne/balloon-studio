// Tests for rounding.ts against tests/fixtures/swift/arith.txt (probes/arith.swift).
import { describe, expect, it } from 'vitest';
import { doubleToHex, fixtureText, Fnv32, hexToDouble, probeSection, probeValue, SplitMix64 } from '../../../tests/support/swiftProbe';
import { intCeil, intDiv, intFloor, intRem, intRounded, intTrunc, ieeeRemainder, rounded, strideThrough, truncatingRemainder } from './rounding';

const arith = fixtureText('swift/arith.txt');

describe('rounded (x.rounded())', () => {
  it('matches the probe table bit for bit', () => {
    for (const line of probeSection(arith, 'ROUNDED')) {
      const [x, expected] = line.split('\t') as [string, string];
      expect(doubleToHex(rounded(hexToDouble(x)))).toBe(expected);
    }
  });

  it('matches Swift on 1 M generated values (FNV hash)', () => {
    const rng = new SplitMix64(1n);
    const hash = new Fnv32();
    for (let i = 0; i < 1_000_000; i++) {
      const k = rng.mod(3);
      const x = k === 0 ? (rng.unit() * 2 - 1) * 100 : k === 1 ? (rng.mod(2001) - 1000) * 0.5 : rng.rawFinite();
      hash.add(rounded(x));
    }
    expect(String(hash.h)).toBe(probeValue(arith, 'ROUNDED_HASH'));
  });

  it('rounds halves away from zero and keeps -0', () => {
    expect(rounded(-2.5)).toBe(-3);
    expect(rounded(2.5)).toBe(3);
    expect(Object.is(rounded(-0.4), -0)).toBe(true);
    expect(rounded(0.49999999999999994)).toBe(0);
  });
});

describe('ieeeRemainder / truncatingRemainder', () => {
  it('matches the probe table bit for bit', () => {
    for (const line of probeSection(arith, 'REMAINDER')) {
      const [a, b, expected] = line.split('\t') as [string, string, string];
      expect(doubleToHex(ieeeRemainder(hexToDouble(a), hexToDouble(b)))).toBe(expected);
    }
    expect(ieeeRemainder(2.5, 3)).toBe(-0.5);
  });

  it('matches Swift on 1 M generated pairs, ties included (FNV hash)', () => {
    const rng = new SplitMix64(2n);
    const hash = new Fnv32();
    const steps = [0.25, 0.5, 1, 2];
    for (let i = 0; i < 1_000_000; i++) {
      const k = rng.mod(4);
      let a = 0;
      let b = 1;
      if (k === 0) {
        a = (rng.unit() * 2 - 1) * 1000;
        b = (rng.unit() * 2 - 1) * 10;
        if (b === 0) b = 1;
      } else if (k === 1) {
        const kk = rng.mod(2001) - 1000;
        b = (rng.mod(64) + 1) * (steps[rng.mod(4)] as number);
        a = (kk + 0.5) * b;
        if (rng.mod(2) === 0) b = -b;
      } else if (k === 2) {
        a = (rng.unit() * 2 - 1) * 1e6;
        b = rng.unit() * 1e-3 + 1e-9;
      } else {
        a = rng.rawFinite();
        b = rng.rawFinite();
        if (b === 0) b = 1;
      }
      hash.add(ieeeRemainder(a, b));
      hash.add(truncatingRemainder(a, b));
    }
    expect(String(hash.h)).toBe(probeValue(arith, 'REMAINDER_HASH'));
  });
});

describe('floating-point contraction', () => {
  it('a*b+c and a*b-c*d are evaluated without FMA, as in Swift (FNV hash)', () => {
    const rng = new SplitMix64(3n);
    const hash = new Fnv32();
    for (let i = 0; i < 1_000_000; i++) {
      const a = (rng.unit() * 2 - 1) * 1e3;
      const b = (rng.unit() * 2 - 1) * 1e3;
      const c = (rng.unit() * 2 - 1) * 1e6;
      const d = (rng.unit() * 2 - 1) * 1e3;
      hash.add(a * b + c);
      hash.add(a * b - c * d);
      hash.add(a * b + c * d);
    }
    expect(String(hash.h)).toBe(probeValue(arith, 'FMA_HASH'));
  });
});

describe('Int conversions', () => {
  it('truncate, floor, ceil and round without producing -0', () => {
    expect(Object.is(intTrunc(-0.5), 0)).toBe(true);
    expect(Object.is(intCeil(-0.5), 0)).toBe(true);
    expect(Object.is(intFloor(-0), 0)).toBe(true);
    expect(Object.is(intRounded(-0.4), 0)).toBe(true);
    expect(intTrunc(-7.9)).toBe(-7);
    expect(intFloor(-7.1)).toBe(-8);
    expect(intCeil(7.1)).toBe(8);
    expect(intRounded(-7.5)).toBe(-8);
  });

  it('trap like Swift on non-finite input and division by zero', () => {
    expect(() => intTrunc(Number.NaN)).toThrow(RangeError);
    expect(() => intFloor(Infinity)).toThrow(RangeError);
    expect(() => intTrunc(9.3e18)).toThrow(RangeError);
    expect(() => intDiv(1, 0)).toThrow(RangeError);
    expect(() => intRem(1, 0)).toThrow(RangeError);
  });

  it('divide and take remainders truncating toward zero', () => {
    expect(intDiv(7, 2)).toBe(3);
    expect(intDiv(-7, 2)).toBe(-3);
    expect(intDiv(7, -2)).toBe(-3);
    expect(Object.is(intDiv(-1, 2), 0)).toBe(true);
    expect(intRem(-7, 2)).toBe(-1);
    expect(Object.is(intRem(-4, 2), 0)).toBe(true);
    expect(intDiv(9007199254740991, 3)).toBe(3002399751580330);
  });
});

describe('strideThrough (stride(from:through:by:))', () => {
  it('matches the probe element by element', () => {
    const cases: [number, number, number][] = [
      [0, 1, 0.1],
      [0, 0.3, 0.1],
      [1, 0, -0.25],
      [0, 1, 0.7],
      [0, 1, 0.25],
      [2, 2, 1],
      [3, 2, 1],
    ];
    const expected = probeSection(arith, 'STRIDE');
    cases.forEach(([from, through, by], i) => {
      const line = expected[i] as string;
      expect(strideThrough(from, through, by).map(doubleToHex).join(',')).toBe(line);
    });
  });

  it('rejects a zero stride', () => {
    expect(() => strideThrough(0, 1, 0)).toThrow(RangeError);
  });
});
