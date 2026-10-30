// WP-K6: the TS figures against the Swift references (references/manifest.json), the 9 cases
// `part: "figure"` and the 2 cases `part: "figureSet"`.
//
// Without WP-V2's harness on main this file compares by the rules of docs/plan.md §8 (WP-V2):
// (1) SHA-256 equal to the manifest: `identical`.
// (2) Otherwise, with the Tier B pack (references/pack/refs-v1/files/<id>/<filename>): same triangle
//     count and order, every corner's Float32 equal or 1 ULP away with the same sign (a +0/-0 flip is
//     an error), same welded index arrays, same attribute bytes, and `dot(ts, ref) >= 1-1e-6` for the
//     normals. A normal component close to 0 is rounding noise of the cross product (1e-15), millions
//     of ULP away while the normal itself is the same, so normals are compared by direction.
// (3) Without the pack (CI so far): the output must have the SHA-256 pinned in PINNED below, which
//     step (2) verified on a machine with the pack; with the pack the pin is checked as well.
// `normalized`, `filename`, bytes, triangles, bounding box and every text and JSON entry are checked
// from the manifest and Tier A in every run.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { figureCodec, figureFilename, figureSetArchive, figureSetFilename, generateFigure, normalizedFigure } from '../src/core/figures/figureGeometry';
import { binarySTL } from '../src/core/io/binaryStl';
import { crc32 } from '../src/core/io/crc32';
import { sha256 } from '../src/core/io/sha256';
import { parseSTL } from '../src/core/testing/stl';
import { zipEntries } from '../src/core/testing/zipReader';
import type { FigureParameters } from '../src/core/types';

const root = resolve(import.meta.dirname, '../..');

/**
 * SHA-256 of the TS output where it is not the Swift file's: every corner is bit-identical to Swift
 * and only near-zero normal components differ (see the report in the PR). Key: `<case id>/<name>`.
 */
const PINNED: Readonly<Record<string, string>> = {
  'figure-cloud-default/Mobile-Figure-cloud-60mm.stl': '9e9d18c551e141aaafcc781959474aab9d28e4972bd487f06484883f0fea61f6',
  'figure-heart-flat/Mobile-Figure-heart-60mm-flat.stl': '109a71eaf9f6b4340fcbc4c41fd80d539b2924dc4c5cfef5c3c3c5202625b1b4',
  'figure-raindrop-puffy-chain/Mobile-Figure-raindrop-60mm-puffy-chain.stl': '1d299e19c410d9d1781ac84671e462626bae9bea602358c217ac31264cd2a8d7',
  'figure-sun-two-sided/Mobile-Figure-sun-60mm-two-sided.stl': '0b2d0e2fcf8c78b2059e80b6b9a7181fbd3ed97c1a1bc632ab59baccb9253620',
  'figure-moon-partial/Mobile-Figure-moon-75mm.stl': 'f2fa2c1c6f2ec00746d301c39fb94f50a14da63069db632e5267d01d2d0c7433',
  'figureset-defaults/Mobile-Figure-cloud-60mm.stl': '9e9d18c551e141aaafcc781959474aab9d28e4972bd487f06484883f0fea61f6',
  'figureset-defaults/Mobile-Figure-moon-60mm.stl': '80e6aa1af192dc3540ba1e923907fb46c003001cfb02899316f4f0b097e5998c',
  'figureset-defaults/Mobile-Figure-sun-60mm.stl': 'da44efe407b9d7f5a130d861e0c435c51d93f4cf81c92bb5c1cff5024a859ede',
  'figureset-defaults/Mobile-Figure-heart-60mm.stl': '8ffccaf60cd5ccdd0e435b00b7d4f88d21f775b40e42fedf4cd4e2f476d9c267',
  'figureset-defaults/Mobile-Figure-raindrop-60mm.stl': 'fca95af8f3ffac268c778ce045347476e78a82b71f67b63a05d062030d30292c',
  'figureset-two-sided/Mobile-Figure-cloud-60mm-two-sided.stl': 'b78bc3e1bfdbab57735c140a5060f8bd0cf90956fa13ef50e4b34d23d9b03f09',
  'figureset-two-sided/Mobile-Figure-moon-60mm-two-sided.stl': 'e6a29d2e07163c2c3b47a138d0e754992a7192743dd2324d72bbaa56e41d5975',
  'figureset-two-sided/Mobile-Figure-sun-60mm-two-sided.stl': '0b2d0e2fcf8c78b2059e80b6b9a7181fbd3ed97c1a1bc632ab59baccb9253620',
  'figureset-two-sided/Mobile-Figure-heart-60mm-two-sided.stl': 'd806d51b26b8a492379a140717c0f975a6d962307f45883703514d8b95df3e6e',
  'figureset-two-sided/Mobile-Figure-raindrop-60mm-two-sided.stl': '453eed47f4ed782a18459ba636dcc932e182429eba4ddbb563b557e5547787d5',
};

interface Bbox {
  min: [number, number, number];
  max: [number, number, number];
}
interface StlFacts {
  bytes: number;
  triangles?: number;
  bbox?: Bbox;
}
interface ManifestEntry extends StlFacts {
  name: string;
  kind: string;
  sha256: string;
  crc32: number;
  localHeaderOffset: number;
}
interface ManifestCase extends StlFacts {
  id: string;
  part: string;
  quality: string;
  filename: string;
  sha256: string;
  normalized: string;
  entries?: ManifestEntry[];
}
interface GridCase {
  id: string;
  parameters: Record<string, unknown>;
}

const manifest = JSON.parse(readFileSync(resolve(root, 'references/manifest.json'), 'utf8')) as { cases: ManifestCase[] };
const grid = JSON.parse(readFileSync(resolve(root, 'mac/cases/grid.json'), 'utf8')) as { cases: GridCase[] };
const figureCases = manifest.cases.filter((c) => c.part === 'figure');
const setCases = manifest.cases.filter((c) => c.part === 'figureSet');

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const shaOf = (bytes: Uint8Array): string => hex(sha256(bytes));

function parametersOf(c: ManifestCase): FigureParameters {
  const entry = grid.cases.find((g) => g.id === c.id);
  if (entry === undefined) throw new Error(`${c.id} is not in the grid`);
  return normalizedFigure(figureCodec.decodeValue(entry.parameters));
}

interface Comparison {
  corners: number;
  maxCornerUlp: number;
  normalWords: number;
  largestNormalDelta: number;
  smallestDot: number;
}

/** docs/plan.md §8, STL. Throws on anything worse than `ulp`. */
function compareSTL(name: string, actual: Uint8Array, expected: Uint8Array): Comparison {
  expect(actual.length, `${name}: length`).toBe(expected.length);
  expect(hex(actual.subarray(0, 84)), `${name}: header and triangle count`).toBe(hex(expected.subarray(0, 84)));
  const a = new DataView(actual.buffer, actual.byteOffset, actual.byteLength);
  const b = new DataView(expected.buffer, expected.byteOffset, expected.byteLength);
  const result: Comparison = { corners: 0, maxCornerUlp: 0, normalWords: 0, largestNormalDelta: 0, smallestDot: 1 };
  for (let at = 84; at < actual.length; at += 50) {
    const triangle = (at - 84) / 50;
    for (let word = 3; word < 12; word++) {
      const x = a.getUint32(at + word * 4, true);
      const y = b.getUint32(at + word * 4, true);
      if (x === y) continue;
      result.corners++;
      if (x >>> 31 !== y >>> 31) throw new Error(`${name}: triangle ${triangle}, word ${word}: the sign differs (signed zero or more)`);
      const ulp = Math.abs(x - y);
      if (ulp > 1) throw new Error(`${name}: triangle ${triangle}, word ${word}: ${ulp} ULP`);
      if (ulp > result.maxCornerUlp) result.maxCornerUlp = ulp;
    }
    let dot = 0;
    let differs = false;
    for (let word = 0; word < 3; word++) {
      const x = a.getFloat32(at + word * 4, true);
      const y = b.getFloat32(at + word * 4, true);
      dot += x * y;
      if (a.getUint32(at + word * 4, true) === b.getUint32(at + word * 4, true)) continue;
      differs = true;
      result.normalWords++;
      if (Math.abs(x - y) > result.largestNormalDelta) result.largestNormalDelta = Math.abs(x - y);
    }
    if (differs) {
      if (!(dot >= 1 - 1e-6)) throw new Error(`${name}: triangle ${triangle}: normals disagree, dot ${dot}`);
      if (dot < result.smallestDot) result.smallestDot = dot;
    }
    expect(a.getUint16(at + 48, true), `${name}: attribute`).toBe(b.getUint16(at + 48, true));
  }
  // A 1 ULP shift must not merge or split vertices.
  if (result.corners > 0) {
    const weldedActual = parseSTL(actual);
    const weldedExpected = parseSTL(expected);
    expect(weldedActual.vertices.length, `${name}: welded vertices`).toBe(weldedExpected.vertices.length);
    expect(weldedActual.triangles, `${name}: topology`).toEqual(weldedExpected.triangles);
  }
  return result;
}

function referenceFile(id: string, filename: string): Uint8Array | null {
  const path = resolve(root, 'references/pack/refs-v1/files', id, filename);
  return existsSync(path) ? new Uint8Array(readFileSync(path)) : null;
}

/** The facts the manifest knows about an STL, without the pack. */
function checkManifestFacts(name: string, actual: Uint8Array, facts: StlFacts): void {
  expect(actual.length, `${name}: bytes`).toBe(facts.bytes);
  const view = new DataView(actual.buffer, actual.byteOffset, actual.byteLength);
  expect(view.getUint32(80, true), `${name}: triangles`).toBe(facts.triangles);
  const bbox = facts.bbox as Bbox;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let at = 84; at < actual.length; at += 50) {
    for (let corner = 0; corner < 3; corner++) {
      for (let axis = 0; axis < 3; axis++) {
        const value = view.getFloat32(at + 12 + corner * 12 + axis * 4, true);
        if (value < min[axis]!) min[axis] = value;
        if (value > max[axis]!) max[axis] = value;
      }
    }
  }
  expect(min, `${name}: bbox min`).toEqual(bbox.min);
  expect(max, `${name}: bbox max`).toEqual(bbox.max);
}

/** Steps (1) to (3) of the header comment; returns the verdict for the report. */
function verdictOf(id: string, name: string, actual: Uint8Array, expectedSha: string, reference: () => Uint8Array | null): string {
  const sha = shaOf(actual);
  if (sha === expectedSha) return 'identical';
  const expected = reference();
  const pin = PINNED[`${id}/${name}`];
  if (expected === null) {
    expect(sha, `${name}: differs from Swift (${sha}), is not pinned, and the reference pack is not available`).toBe(pin);
    return 'ulp (pinned, pack not available)';
  }
  expect(shaOf(expected), `${name}: the pack's file does not match the manifest`).toBe(expectedSha);
  const c = compareSTL(name, actual, expected);
  expect(sha, `${name}: comparison passed; pin this hash in PINNED (${JSON.stringify(c)})`).toBe(pin);
  return `ulp (corners differing ${c.corners}, max ${c.maxCornerUlp} ULP; normal words ${c.normalWords}, largest delta ${c.largestNormalDelta.toExponential(2)}, smallest dot ${c.smallestDot})`;
}

const results: string[] = [];

describe('figures against the Swift references', () => {
  it('has the 9 figure and 2 set cases', () => {
    expect(figureCases.length).toBe(9);
    expect(setCases.length).toBe(2);
  });

  describe.each(figureCases)('$id', (c) => {
    const p = parametersOf(c);

    it('normalizes and names as Swift does', () => {
      expect(figureCodec.encode(p)).toBe(c.normalized);
      expect(figureFilename(p)).toBe(c.filename);
      expect(c.quality).toBe('export');
    });

    it('writes the same STL', { timeout: 60_000 }, () => {
      const actual = binarySTL(generateFigure(p, 'export').mesh);
      checkManifestFacts(c.id, actual, c);
      results.push(`${c.id}: ${verdictOf(c.id, c.filename, actual, c.sha256, () => referenceFile(c.id, c.filename))}`);
    });
  });

  describe.each(setCases)('$id', (c) => {
    const p = parametersOf(c);

    it('normalizes and names as Swift does', () => {
      expect(figureCodec.encode(p)).toBe(c.normalized);
      expect(figureSetFilename(p)).toBe(c.filename);
    });

    it('writes the same ZIP', { timeout: 120_000 }, () => {
      const started = performance.now();
      const archive = figureSetArchive(p);
      const elapsed = performance.now() - started;
      expect(archive.length, 'archive bytes').toBe(c.bytes);
      const entries = zipEntries(archive);
      const expectedEntries = c.entries as ManifestEntry[];
      expect(entries.map((e) => e.name)).toEqual(expectedEntries.map((e) => e.name));
      const pack = referenceFile(c.id, c.filename);
      const packEntries = pack === null ? null : zipEntries(pack);
      let allIdentical = true;
      expectedEntries.forEach((expected, index) => {
        const entry = entries[index]!;
        expect(entry.data.length, `${expected.name}: bytes`).toBe(expected.bytes);
        expect(entry.offset, `${expected.name}: local header offset`).toBe(expected.localHeaderOffset);
        expect([entry.version, entry.flags, entry.method, entry.time, entry.date], `${expected.name}: ZIP header`).toEqual([20, 0, 0, 0, 33]);
        if (expected.kind === 'stl') {
          checkManifestFacts(expected.name, entry.data, expected);
          const verdict = verdictOf(c.id, expected.name, entry.data, expected.sha256, () => packEntries?.[index]?.data ?? null);
          if (verdict !== 'identical') allIdentical = false;
          results.push(`${c.id} ${expected.name}: ${verdict}`);
        } else {
          // FIGURES.md and figure-settings.json are Tier A: byte for byte, always.
          expect(shaOf(entry.data), `${expected.name}: SHA-256`).toBe(expected.sha256);
          expect(crc32(entry.data), `${expected.name}: CRC-32`).toBe(expected.crc32);
          const committed = readFileSync(resolve(root, 'references/files', expected.sha256.slice(0, 2), expected.sha256));
          expect(Buffer.from(entry.data).equals(committed), `${expected.name}: bytes`).toBe(true);
          results.push(`${c.id} ${expected.name}: identical`);
        }
      });
      if (allIdentical) expect(shaOf(archive), 'archive SHA-256').toBe(c.sha256);
      results.push(`${c.id}: ${allIdentical ? 'identical' : 'ulp'}, built in ${Math.round(elapsed)} ms`);
    });
  });

  it('reports every case', () => {
    process.stderr.write(`${results.map((line) => `[figures.reference] ${line}`).join('\n')}\n`);
    expect(results.length).toBe(figureCases.length + setCases.reduce((sum, c) => sum + (c.entries as ManifestEntry[]).length + 1, 0));
  });
});
