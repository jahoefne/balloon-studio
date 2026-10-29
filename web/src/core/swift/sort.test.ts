// Tests for sort.ts against tests/fixtures/swift/arith.txt (probes/arith.swift).
import { describe, expect, it } from 'vitest';
import { fixtureText, Fnv32, probeValue, SplitMix64 } from '../../../tests/support/swiftProbe';
import { sortDoubles, sortedDoubles, stableSort, stableSorted, stableSortIndexRange } from './sort';

const arith = fixtureText('swift/arith.txt');

function generateItems(): [number, number][] {
  const rng = new SplitMix64(4n);
  const items: [number, number][] = [];
  for (let i = 0; i < 20000; i++) items.push([rng.mod(50), i]);
  return items;
}

function generateDoubles(): number[] {
  const rng = new SplitMix64(4n);
  for (let i = 0; i < 20000; i++) rng.next();
  const doubles: number[] = [];
  for (let i = 0; i < 20000; i++) {
    const k = rng.mod(3);
    doubles.push(k === 0 ? 0 : k === 1 ? -0 : rng.mod(7) - 3);
  }
  return doubles;
}

describe('stableSorted (sorted(by:))', () => {
  it('reproduces Swift order with 20000 heavily tied keys (FNV hash)', () => {
    const sorted = stableSorted(generateItems(), (a, b) => a[0] < b[0]);
    const hash = new Fnv32();
    for (const item of sorted) hash.add(item[1]);
    expect(String(hash.h)).toBe(probeValue(arith, 'SORT_HASH'));
  });

  it('sorts in place and leaves the input of stableSorted untouched', () => {
    const items = generateItems();
    const copy = items.slice();
    const sorted = stableSorted(items, (a, b) => a[0] < b[0]);
    expect(items).toEqual(copy);
    stableSort(items, (a, b) => a[0] < b[0]);
    expect(items).toEqual(sorted);
  });
});

describe('sortedDoubles ([Double].sorted())', () => {
  it('keeps 0.0 / -0.0 in input order like Swift (FNV hash)', () => {
    const doubles = generateDoubles();
    const hash = new Fnv32();
    for (const d of sortedDoubles(doubles)) hash.add(d);
    expect(String(hash.h)).toBe(probeValue(arith, 'SORTD_HASH'));
    sortDoubles(doubles);
    const again = new Fnv32();
    for (const d of doubles) again.add(d);
    expect(again.h).toBe(hash.h);
  });

  it('sorts numerically, unlike a bare .sort()', () => {
    expect(sortedDoubles([10, 9, 1.5, -2])).toEqual([-2, 1.5, 9, 10]);
  });
});

describe('stableSortIndexRange', () => {
  it('equals stableSorted on sub-ranges with ties, with stride and offset', () => {
    const rng = new SplitMix64(99n);
    for (const n of [0, 1, 2, 15, 16, 17, 100, 1000, 5003]) {
      const keys = new Float64Array(n * 3);
      for (let i = 0; i < keys.length; i++) keys[i] = rng.mod(40) - 20;
      const order = new Int32Array(n);
      for (let i = 0; i < n; i++) order[i] = n - 1 - i;
      const start = n > 10 ? 3 : 0;
      const end = n > 10 ? n - 2 : n;
      for (const axis of [0, 1, 2]) {
        const reference = Array.from(order);
        const middle = stableSorted(reference.slice(start, end), (a, b) => (keys[a * 3 + axis] as number) < (keys[b * 3 + axis] as number));
        const expected = [...reference.slice(0, start), ...middle, ...reference.slice(end)];
        const actual = order.slice();
        stableSortIndexRange(actual, start, end, keys, 3, axis);
        expect(Array.from(actual)).toEqual(expected);
      }
    }
  });
});
