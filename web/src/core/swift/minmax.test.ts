// Tests for minmax.ts against tests/fixtures/swift/arith.txt (probes/arith.swift).
import { describe, expect, it } from 'vitest';
import { doubleToHex, fixtureText, hexToDouble, probeSection, probeValue } from '../../../tests/support/swiftProbe';
import { arrayMax, arrayMin, maxBy, minBy, swiftMax, swiftMax3, swiftMin, swiftMin3 } from './minmax';

const arith = fixtureText('swift/arith.txt');

describe('swiftMin / swiftMax', () => {
  it('match Swift min/max bit for bit, including signed zeros and NaN', () => {
    for (const line of probeSection(arith, 'MINMAX')) {
      const [a, b, min, max] = line.split('\t') as [string, string, string, string];
      const x = hexToDouble(a);
      const y = hexToDouble(b);
      expect(doubleToHex(swiftMin(x, y))).toBe(min);
      expect(doubleToHex(swiftMax(x, y))).toBe(max);
    }
    expect(Object.is(swiftMax(0, -0), -0)).toBe(true);
    expect(Object.is(swiftMin(0, -0), 0)).toBe(true);
  });

  it('match the three-argument forms', () => {
    const expected = probeValue(arith, 'MINMAX3').split(' ');
    const actual = [swiftMin3(0, -0, 0), swiftMax3(0, -0, 0), swiftMin3(-0, 0, 0), swiftMax3(-0, 0, -0), swiftMax3(1, 0, -0)].map(doubleToHex);
    expect(actual).toEqual(expected);
  });
});

describe('arrayMin / arrayMax / minBy / maxBy', () => {
  it('keep the first of equal elements, as Sequence.min()/max() do', () => {
    const expected = probeValue(arith, 'SEQ').split(' ');
    const actual = [arrayMin([0, -0]), arrayMax([0, -0]), arrayMin([-0, 0]), arrayMax([-0, 0])].map((x) => doubleToHex(x as number));
    expect(actual).toEqual(expected);
  });

  it('min(by:) and max(by:) pick the first extreme element', () => {
    const tagged: [number, number][] = [
      [1, 0],
      [0, 1],
      [0, 2],
      [1, 3],
    ];
    const lessThan = (a: [number, number], b: [number, number]): boolean => a[0] < b[0];
    const [minId, maxId] = probeValue(arith, 'BY').split(' ').map(Number);
    expect(minBy(tagged, lessThan)?.[1]).toBe(minId);
    expect(maxBy(tagged, lessThan)?.[1]).toBe(maxId);
  });

  it('return undefined for empty input and accept typed arrays', () => {
    expect(arrayMin([])).toBeUndefined();
    expect(arrayMax(new Float64Array(0))).toBeUndefined();
    expect(minBy([], () => true)).toBeUndefined();
    expect(arrayMax(new Float64Array([3, 9, 9, 1]))).toBe(9);
  });
});
