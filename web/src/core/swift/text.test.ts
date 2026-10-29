// Tests for text.ts against the WS section of tests/fixtures/swift/arith.txt (probes/arith.swift).
import { describe, expect, it } from 'vitest';
import { fixtureText, probeSection, probeValue } from '../../../tests/support/swiftProbe';
import { isSwiftWhitespace, swiftCharacters, swiftCount, swiftPrefix, utf8, utf8Decode } from './text';

const arith = fixtureText('swift/arith.txt');
const scalars = (s: string): string => Array.from(s, (c) => (c.codePointAt(0) as number).toString(16)).join(' ');

describe('isSwiftWhitespace (Character.isWhitespace)', () => {
  it('agrees with Swift on every Unicode scalar', () => {
    const [list] = probeSection(arith, 'WS') as [string];
    const actual: string[] = [];
    for (let v = 0; v <= 0x10ffff; v++) {
      if (v >= 0xd800 && v <= 0xdfff) continue;
      if (isSwiftWhitespace(String.fromCodePoint(v))) actual.push(v.toString(16));
    }
    expect(actual.join(',')).toBe(list);
  });

  it('agrees on multi-scalar characters and counts graphemes like Swift', () => {
    const lines = (probeSection(arith, 'WS') as string[]).slice(1).filter((l) => l !== '');
    expect(lines.length).toBe(12);
    for (const line of lines) {
      const [hex, count, whitespace] = line.split('\t') as [string, string, string];
      const s = String.fromCodePoint(...hex.split(' ').map((h) => Number.parseInt(h, 16)));
      expect(swiftCount(s), hex).toBe(Number(count));
      expect(isSwiftWhitespace(swiftPrefix(s, 1)), hex).toBe(whitespace === 'true');
    }
  });

  it('reproduces PatternSettings.normalized text handling (BalloonPatterns:55)', () => {
    const text = 'Héllo wörld\tTab\nNew 👩‍👩‍👧 é\r\nend  x​y' + 'ab'.repeat(30);
    const normalized = swiftCharacters(text)
      .slice(0, 64)
      .map((c) => (isSwiftWhitespace(c) ? ' ' : c))
      .join('');
    // `print("NORM", scalars, count)`: the last space-separated token is the count.
    const tokens = probeValue(arith, 'NORM').split(' ');
    const expectedCount = tokens.pop() as string;
    expect(scalars(normalized)).toBe(tokens.join(' '));
    expect(swiftCount(normalized)).toBe(Number(expectedCount));
  });
});

describe('utf8', () => {
  it('encodes and decodes like Swift', () => {
    expect(Array.from(utf8('ü/€😀'))).toEqual([0xc3, 0xbc, 0x2f, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80]);
    expect(utf8Decode(new Uint8Array([0x61, 0xff, 0x62]))).toBe('a�b');
    expect(utf8Decode(utf8('﻿x'))).toBe('﻿x');
  });
});
