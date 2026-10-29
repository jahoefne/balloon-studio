// Tests for binaryStl.ts, storedZip.ts, crc32.ts and sha256.ts against the Swift outputs in
// tests/fixtures/{stl,zip} (probes/geometry.swift, built with the verbatim Swift sources).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { geodesicSphere, probeTetrahedron } from '../../../tests/support/meshes';
import { fixtureBytes, SplitMix64 } from '../../../tests/support/swiftProbe';
import { MeshError } from '../geometry/mesh';
import { utf8 } from '../swift/text';
import { binarySTL } from './binaryStl';
import { crc32 } from './crc32';
import { sha256 } from './sha256';
import { storedZipArchive, type ZipEntry } from './storedZip';

describe('binarySTL', () => {
  it('writes the tetrahedron byte for byte like Swift (signed zeros included)', () => {
    expect(binarySTL(probeTetrahedron())).toEqual(fixtureBytes('stl/tetra.stl'));
  });

  it('writes a 512-triangle sphere byte for byte like Swift', () => {
    expect(binarySTL(geodesicSphere(3, 23.7, { x: 3.1, y: -2.2, z: 40.5 }))).toEqual(fixtureBytes('stl/sphere3.stl'));
  });

  it('validates first', () => {
    const open = probeTetrahedron();
    open.triangles.pop();
    expect(() => binarySTL(open)).toThrow(MeshError);
  });
});

function probeEntries(): ZipEntry[] {
  const bin = new Uint8Array(256).map((_, i) => i);
  const big = new Uint8Array(70000).map((_, i) => (i * 31 + 7) & 255);
  return [
    ['[Content_Types].xml', utf8('<?xml version="1.0" encoding="UTF-8"?><Types/>')],
    ['dir/b.bin', bin],
    ['empty.txt', new Uint8Array(0)],
    ['ünï/ß.txt', utf8('x')],
    ['big.bin', big],
  ];
}

describe('storedZipArchive', () => {
  it('produces exactly the bytes of Swift StoredZIP.archive', () => {
    expect(storedZipArchive(probeEntries())).toEqual(fixtureBytes('zip/stored.zip'));
    expect(storedZipArchive([])).toEqual(fixtureBytes('zip/empty.zip'));
  });

  it('traps like Swift UInt16 on oversized names', () => {
    expect(() => storedZipArchive([['x'.repeat(70000), new Uint8Array(0)]])).toThrow(RangeError);
  });
});

describe('crc32', () => {
  it('matches the CRC-32 check value and zlib-style results', () => {
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(utf8('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });
});

describe('sha256', () => {
  it('matches node:crypto on random inputs, also in parts', () => {
    const rng = new SplitMix64(7n);
    for (const size of [0, 1, 55, 56, 63, 64, 65, 1000, 100_003]) {
      const data = new Uint8Array(size).map(() => rng.mod(256));
      const expected = new Uint8Array(createHash('sha256').update(data).digest());
      expect(sha256(data)).toEqual(expected);
      const cut = size >> 1;
      expect(sha256(data.subarray(0, cut), data.subarray(cut))).toEqual(expected);
    }
  });
});
