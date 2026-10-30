// WP-K7: every `part: "clip"` case of references/manifest.json (Tier A), decoded with the port's
// codec from mac/cases/grid.json and compared with the Swift export. WP-V2's harness can take this
// over.
//
// Each case is compared twice:
// - With core/swift/dmath as it ships: all corners, attributes and the header must be byte-identical.
//   Normals may differ only in components that are numerical noise around zero: fdlibm and Apple's
//   libm disagree by 1 ULP (in Double) on a few arguments, the walls of the nail hole join rings
//   computed from `-a` and `2π-a`, so their normals carry about 1e-15 of that difference.
// - With Apple's results substituted for exactly those arguments (APPLE_LIBM below, measured with
//   Foundation's sin/cos on every argument the 19 cases use): the file must be byte-identical. This
//   shows that everything apart from libm is an exact port.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const libm = vi.hoisted(() => ({ apple: false, sin: new Map<number, number>(), cos: new Map<number, number>() }));

vi.mock('../src/core/swift/dmath', async (original) => {
  const m = await original<typeof import('../src/core/swift/dmath')>();
  return {
    ...m,
    sin: (x: number): number => (libm.apple ? libm.sin.get(x) : undefined) ?? m.sin(x),
    cos: (x: number): number => (libm.apple ? libm.cos.get(x) : undefined) ?? m.cos(x),
  };
});

import { CableClip, CableClipKit, filename, fromJSON, normalized, toJSON } from '../src/core/clip/cableClip';
import { binarySTL } from '../src/core/io/binaryStl';
import { sha256 } from '../src/core/io/sha256';

/** Function, argument bits, Apple's result bits; dmath differs from Apple by 1 ULP on these 24 of 704 arguments. */
const APPLE_LIBM: readonly (readonly ['sin' | 'cos', string, string])[] = [
  ['sin', '3ff46b9c347764a4', '3fee9f4156c62dda'],
  ['sin', '3fec463abeccb2bb', '3fe8bc806b151741'],
  ['sin', 'c00d524fe24f89f1', '3fdffffffffffffc'],
  ['sin', 'c010c152382d7365', '3febb67ae8584ca8'],
  ['sin', '400d524fe24f89f1', 'bfdffffffffffffc'],
  ['sin', '4010c152382d7365', 'bfebb67ae8584ca8'],
  ['sin', '40158aa9df43a834', 'bfe905a6a578f8f7'],
  ['sin', '40055b9bd4896764', '3fdd1745d1745d17'],
  ['sin', 'bfeb76b7104f7a91', 'bfe836d6a01fdd3a'],
  ['sin', 'bfeaa9ea4382adc4', 'bfe7af05fcc630d1'],
  ['sin', 'bfea061339453d20', 'bfe73fa396eb37d3'],
  ['sin', 'bfe9dd1d76b5e0f7', 'bfe7236b50eb8b26'],
  ['sin', 'bfe939466c787053', 'bfe6b110f1cfe0ea'],
  ['cos', '40104145096e05c1', 'bfe354df52b21807'],
  ['cos', '401689c3de7f1106', '3fe98035c5978259'],
  ['cos', 'c000c152382d7365', 'bfdffffffffffffd'],
  ['cos', '4000c152382d7365', 'bfdffffffffffffd'],
  ['cos', '4014e57dfc168de6', '3fdf56f11694964a'],
  ['cos', '4016779db15ad0b8', '3fe9277a09039dee'],
  ['cos', 'bfec6c799faba387', '3fe42f5438c1cca4'],
  ['cos', 'bfec4383dd1c475e', '3fe44f0c38ed0451'],
  ['cos', 'bfeb76b7104f7a91', '3fe4ebad165c7f87'],
  ['cos', 'bfea80f480f3519b', '3fe5a33419067ef0'],
  ['cos', 'bfe5b427b42684cd', '3fe8eaec6ebd3c98'],
];

const double = (bits: string): number => {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt(`0x${bits}`));
  return view.getFloat64(0);
};
for (const [fn, x, y] of APPLE_LIBM) libm[fn].set(double(x), double(y));

interface ManifestCase {
  id: string;
  part: string;
  quality: string;
  filename: string;
  normalized: string;
  sha256: string;
  bytes: number;
  triangles: number;
  tierA: boolean;
  notes?: { problem?: string; note?: string; appExportDisabled?: boolean };
}
interface GridCase {
  id: string;
  parameters: unknown;
  expect?: Record<string, unknown>;
}

const repo = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('references/manifest.json', repo), 'utf8')) as { cases: ManifestCase[] };
const grid = JSON.parse(readFileSync(new URL('mac/cases/grid.json', repo), 'utf8')) as { cases: GridCase[] };
const cases = manifest.cases.filter((c) => c.part === 'clip');

/** What fdlibm's differences may do to a normal's component. */
const NORMAL_NOISE = 1e-13;

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

function parameters(id: string): GridCase {
  const source = grid.cases.find((c) => c.id === id);
  if (source === undefined) throw new Error(`${id} is missing from grid.json`);
  return source;
}

function exportSTL(entry: ManifestCase, apple: boolean): Uint8Array {
  libm.apple = apple;
  try {
    const quality = entry.quality === 'export' ? 'export' : 'preview';
    return binarySTL(CableClipKit.generate(normalized(fromJSON(parameters(entry.id).parameters)), quality).printView);
  } finally {
    libm.apple = false;
  }
}

function reference(entry: ManifestCase): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`references/files/${entry.sha256.slice(0, 2)}/${entry.sha256}`, repo)));
}

/** Distance of two Float32 bit patterns on the number line, so -0 and +0 are one apart. */
function ulps(a: number, b: number): number {
  const line = (bits: number): number => (bits >= 0x80000000 ? 0x80000000 - (bits - 0x80000000) : 0x80000000 + bits);
  return Math.abs(line(a) - line(b));
}

interface Difference {
  /** Triangle count, header, corners or attributes differ: a port error. */
  structural: string[];
  /** Normal components that differ. */
  normals: number;
  largestNormalComponent: number;
  maxNormalUlp: number;
}

/** The comparison WP-K7 asks for: triangle count, first differing corner, largest Float32 ULP distance. */
function compare(actual: Uint8Array, expected: Uint8Array): Difference {
  const a = new DataView(actual.buffer, actual.byteOffset, actual.byteLength);
  const r = new DataView(expected.buffer, expected.byteOffset, expected.byteLength);
  const result: Difference = { structural: [], normals: 0, largestNormalComponent: 0, maxNormalUlp: 0 };
  if (actual.length !== expected.length) {
    result.structural.push(`${actual.length} bytes instead of ${expected.length}, ${a.getUint32(80, true)} triangles instead of ${r.getUint32(80, true)}`);
    return result;
  }
  for (let i = 0; i < 84; i++) {
    if (actual[i] !== expected[i]) {
      result.structural.push(`header or count differs at byte ${i}`);
      break;
    }
  }
  const facets = (expected.length - 84) / 50;
  let cornerUlp = 0;
  let corners = 0;
  for (let f = 0; f < facets; f++) {
    const start = 84 + 50 * f;
    for (let word = 0; word < 12; word++) {
      const o = start + 4 * word;
      const x = a.getUint32(o, true), y = r.getUint32(o, true);
      if (x === y) continue;
      if (word < 3) {
        result.normals++;
        result.maxNormalUlp = Math.max(result.maxNormalUlp, ulps(x, y));
        result.largestNormalComponent = Math.max(result.largestNormalComponent, Math.abs(a.getFloat32(o, true)), Math.abs(r.getFloat32(o, true)));
      } else {
        corners++;
        cornerUlp = Math.max(cornerUlp, ulps(x, y));
        if (corners === 1) result.structural.push(`first corner difference at triangle ${f}, corner ${Math.floor((word - 3) / 3)}, axis ${(word - 3) % 3}: ${a.getFloat32(o, true)} instead of ${r.getFloat32(o, true)}`);
      }
    }
    if (a.getUint16(start + 48, true) !== r.getUint16(start + 48, true)) result.structural.push(`attribute of triangle ${f}`);
  }
  if (corners > 0) result.structural.push(`${corners} corner floats differ, at most ${cornerUlp} ULP`);
  return result;
}

describe('cable clip references', () => {
  it('has the 19 clip cases, all in Tier A', () => {
    expect(cases.map((c) => c.id)).toHaveLength(19);
    expect(cases.every((c) => c.tierA && c.quality === 'export')).toBe(true);
  });

  describe('settings', () => {
    it.each(cases)('$id', (entry) => {
      const source = parameters(entry.id);
      const decoded = fromJSON(source.parameters);
      const p = normalized(decoded);
      expect(toJSON(p)).toBe(entry.normalized);
      expect(filename(p)).toBe(entry.filename);
      for (const [key, value] of Object.entries(source.expect ?? {})) {
        if (key === 'filename') expect(filename(p)).toBe(value);
        else expect(p[key.replace('parameters.', '') as keyof typeof p], key).toBe(value);
      }
      const clip = new CableClip(decoded);
      expect(clip.problem).toBe(entry.notes?.problem ?? null);
      expect(clip.note).toBe(entry.notes?.note ?? null);
    });
  });

  describe('STL with dmath: corners byte-identical, normals within noise', () => {
    it.each(cases)('$id', (entry) => {
      const data = exportSTL(entry, false);
      if (hex(sha256(data)) === entry.sha256) return;
      const difference = compare(data, reference(entry));
      expect(difference.structural).toEqual([]);
      expect(difference.largestNormalComponent).toBeLessThan(NORMAL_NOISE);
    });

    it('leaves six cases byte-identical even so', () => {
      const identical = cases.filter((entry) => hex(sha256(exportSTL(entry, false))) === entry.sha256).map((c) => c.id);
      expect(identical).toEqual(['clip-adhesive', 'clip-big', 'clip-thin-adhesive', 'clip-big-flat', 'clip-thin-deep', 'clip-small-head']);
    });
  });

  describe("STL with Apple's sin and cos: byte-identical", () => {
    it.each(cases)('$id', (entry) => {
      const data = exportSTL(entry, true);
      if (hex(sha256(data)) !== entry.sha256) {
        expect.fail(`${entry.id}: ${JSON.stringify(compare(data, reference(entry)))}`);
      }
      expect(data.length).toBe(entry.bytes);
    });
  });
});
