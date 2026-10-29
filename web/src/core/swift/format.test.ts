// Tests for format.ts against tests/fixtures/swift/format.tsv.gz (probes/format.swift) and
// the boundary section of tests/fixtures/swift/arith.txt (probes/arith.swift).
import { describe, expect, it } from 'vitest';
import { fixtureText, hexToDouble, probeSection } from '../../../tests/support/swiftProbe';
import { formatFixed, formatG, printfFixed, printfG, swiftDescription } from './format';

// Columns written by probes/format.swift.
const COLUMNS = {
  hex: 0,
  description: 1,
  fixed0: 2,
  fixed1: 3,
  fixed2: 4,
  fixed3: 5,
  g: 6,
  g17: 7,
  cG: 8,
  cFixed1: 9,
  cG17: 10,
  cFixed2: 11,
  cFixed3: 12,
  cFixed0: 13,
} as const;

const rows = fixtureText('swift/format.tsv.gz')
  .trimEnd()
  .split('\n')
  .map((line) => line.split('\t'));
const arith = fixtureText('swift/arith.txt');

function check(format: (x: number) => string, column: number): void {
  const failures: string[] = [];
  for (const row of rows) {
    const x = hexToDouble(row[COLUMNS.hex] as string);
    const actual = format(x);
    if (actual !== row[column]) failures.push(`${row[COLUMNS.description]}: expected ${row[column]}, got ${actual}`);
  }
  expect(failures.slice(0, 10)).toEqual([]);
}

describe('swiftDescription ("\\(x)")', () => {
  it('matches Swift on the probe sample', () => {
    expect(rows.length).toBe(2708);
    check(swiftDescription, COLUMNS.description);
  });

  it('switches to exponent form above 2^53 and below 1e-4', () => {
    for (const line of probeSection(arith, 'DESC')) {
      const [hex, expected] = line.split('\t') as [string, string];
      expect(swiftDescription(hexToDouble(hex))).toBe(expected);
    }
    expect(swiftDescription(25)).toBe('25.0');
    expect(swiftDescription(-0)).toBe('-0.0');
    expect(swiftDescription(1e-5)).toBe('1e-05');
    expect(swiftDescription(1e16)).toBe('1e+16');
    expect(swiftDescription(1e15)).toBe('1000000000000000.0');
    expect(swiftDescription(123456789012345680)).toBe('1.2345678901234568e+17');
    expect(swiftDescription(Number.NaN)).toBe('nan');
    expect(swiftDescription(-Infinity)).toBe('-inf');
  });
});

describe('formatFixed (String(format: "%.nf", locale: en_US_POSIX))', () => {
  it('matches Swift for 0–3 fraction digits', () => {
    check((x) => formatFixed(x, 0), COLUMNS.fixed0);
    check((x) => formatFixed(x, 1), COLUMNS.fixed1);
    check((x) => formatFixed(x, 2), COLUMNS.fixed2);
    check((x) => formatFixed(x, 3), COLUMNS.fixed3);
  });

  it('rounds the shortest digits half to even (ICU), not the binary value', () => {
    expect(formatFixed(0.25, 1)).toBe('0.2');
    expect(formatFixed(0.35, 1)).toBe('0.4');
    expect(formatFixed(0.45, 1)).toBe('0.4');
    expect(formatFixed(2.675, 2)).toBe('2.68');
    expect(formatFixed(2.25, 1)).toBe('2.2');
    expect(formatFixed(0.95, 1)).toBe('1.0');
    expect(formatFixed(-0.04, 1)).toBe('-0.0');
    expect(formatFixed(-0, 1)).toBe('-0.0');
    expect(formatFixed(Number.NaN, 1)).toBe('NaN');
    expect(formatFixed(Infinity, 2)).toBe('INF');
  });
});

describe('formatG (String(format: "%g", locale: en_US_POSIX))', () => {
  it('matches Swift on the probe sample (precision 6 and 17)', () => {
    check((x) => formatG(x), COLUMNS.g);
    check((x) => formatG(x, 17), COLUMNS.g17);
  });

  it('matches the exponent-switch boundaries', () => {
    for (const line of probeSection(arith, 'GBOUND')) {
      const [hex, g] = line.split('\t') as [string, string];
      expect(formatG(hexToDouble(hex))).toBe(g);
    }
    expect(formatG(8)).toBe('8');
    expect(formatG(3.75)).toBe('3.75');
    expect(formatG(1e-5)).toBe('1E-05');
    expect(formatG(1e6)).toBe('1000000');
    expect(formatG(1234567)).toBe('1.23457E+06');
  });
});

describe('printfFixed / printfG (C printf on the exact value)', () => {
  it('matches Swift String(format:) without a locale', () => {
    check((x) => printfFixed(x, 0), COLUMNS.cFixed0);
    check((x) => printfFixed(x, 1), COLUMNS.cFixed1);
    check((x) => printfFixed(x, 2), COLUMNS.cFixed2);
    check((x) => printfFixed(x, 3), COLUMNS.cFixed3);
    check((x) => printfG(x), COLUMNS.cG);
    check((x) => printfG(x, 17), COLUMNS.cG17);
  });

  it('matches the %g / %.17g boundaries', () => {
    for (const line of probeSection(arith, 'GBOUND')) {
      const [hex, , , cg, cg17] = line.split('\t') as [string, string, string, string, string];
      expect(printfG(hexToDouble(hex))).toBe(cg);
      expect(printfG(hexToDouble(hex), 17)).toBe(cg17);
    }
  });

  it('breaks exact ties to even', () => {
    expect(printfFixed(0.125, 2)).toBe('0.12');
    expect(printfFixed(0.375, 2)).toBe('0.38');
    expect(printfFixed(2.5, 0)).toBe('2');
    expect(printfFixed(0.35, 1)).toBe('0.3');
    // 2251799813685247.75 has 18 significant digits; the 17-digit tie goes to the even 8.
    expect(printfG(2251799813685247.75, 17)).toBe('2251799813685247.8');
    expect(printfG(2251799813685246.25, 17)).toBe('2251799813685246.2');
    expect(printfG(0.3, 17)).toBe('0.29999999999999999');
    expect(printfG(5e-324, 17)).toBe('4.9406564584124654e-324');
    expect(printfG(1e16, 17)).toBe('10000000000000000');
    expect(printfG(1e17, 17)).toBe('1e+17');
  });
});
