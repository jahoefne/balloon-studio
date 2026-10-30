// WP-K5: the TS ring core against the Swift references of the 14 `part: "ring"` cases in
// references/manifest.json. Own comparison until the WP-V2 harness (web/harness) replaces it.
//
// Every output is held against the manifest's SHA-256, so byte identity is proven without the pack.
// Tier A bodies (kit-manifest.json, ASSEMBLY.md, small STLs) are also compared byte for byte, for a
// useful failure message. A large STL that misses its hash needs the pack for the ≤ 1 ULP verdict.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { binarySTL } from '../src/core/io/binaryStl';
import { sha256 } from '../src/core/io/sha256';
import { decodeRingParameters, encodeRingParameters, filename, normalized, RING_SOLID, RingGenerator } from '../src/core/ring/ringGeometry';
import { SegmentedRingKit } from '../src/core/ring/segmentedRing';
import { zipEntries } from '../src/core/testing/zipReader';
import type { RingParameters } from '../src/core/types';

const root = resolve(import.meta.dirname, '../..');

interface ManifestEntry {
  name: string;
  bytes: number;
  crc32: number | string;
  sha256: string;
  localHeaderOffset: number;
  tierA: boolean;
}
interface ManifestCase {
  id: string;
  part: string;
  quality: 'preview' | 'export';
  filename: string;
  kind: 'stl' | 'zip';
  bytes: number;
  sha256: string;
  normalized: string;
  triangles?: number;
  entries?: ManifestEntry[];
}
interface GridCase {
  id: string;
  parameters: Record<string, unknown> | null;
}

const manifest = JSON.parse(readFileSync(resolve(root, 'references/manifest.json'), 'utf8')) as { cases: ManifestCase[] };
const grid = JSON.parse(readFileSync(resolve(root, 'mac/cases/grid.json'), 'utf8')) as { cases: GridCase[] };
const cases = manifest.cases.filter((c) => c.part === 'ring');

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const tierAPath = (digest: string): string => resolve(root, 'references/files', digest.slice(0, 2), digest);

type Verdict = 'identical' | 'ulp';

/** Largest Float32 ULP distance between two binary STLs of the same topology, or the first structural difference. */
function stlDistance(actual: Uint8Array, expected: Uint8Array): { ulp: number; differentValues: number } | string {
  if (actual.length !== expected.length) return `length ${actual.length} vs ${expected.length}`;
  for (let i = 0; i < 84; i++) if (actual[i] !== expected[i]) return `header byte ${i}`;
  const a = new DataView(actual.buffer, actual.byteOffset, actual.byteLength);
  const e = new DataView(expected.buffer, expected.byteOffset, expected.byteLength);
  const lattice = (bits: number): number => (bits >= 0x80000000 ? 0x80000000 - bits : bits);
  let ulp = 0;
  let differentValues = 0;
  const count = a.getUint32(80, true);
  for (let f = 0; f < count; f++) {
    const start = 84 + 50 * f;
    for (let k = 0; k < 12; k++) {
      const x = a.getUint32(start + 4 * k, true);
      const y = e.getUint32(start + 4 * k, true);
      if (x !== y) {
        differentValues++;
        const d = Math.abs(lattice(x) - lattice(y));
        if (d > ulp) ulp = d;
      }
    }
    if (a.getUint16(start + 48, true) !== e.getUint16(start + 48, true)) return `attribute of face ${f}`;
  }
  return { ulp, differentValues };
}

/** The Swift bytes of a pack STL (a stored ZIP entry at its local header offset), or undefined without the pack. */
function packBytes(c: ManifestCase, entry?: ManifestEntry): Uint8Array | undefined {
  const path = resolve(root, 'references/pack/refs-v1/files', c.id, c.filename);
  if (!existsSync(path)) return undefined;
  const file = new Uint8Array(readFileSync(path));
  if (entry === undefined) return file;
  const found = zipEntries(file).find((z) => z.name === entry.name);
  return found?.data;
}

function compareStl(actual: Uint8Array, digest: string, reference: () => Uint8Array | undefined, label: string): Verdict {
  if (hex(sha256(actual)) === digest) return 'identical';
  const expected = reference();
  if (expected === undefined) throw new Error(`${label}: SHA-256 differs and the pack is not available for the ULP check`);
  const distance = stlDistance(actual, expected);
  if (typeof distance === 'string') throw new Error(`${label}: ${distance}`);
  if (distance.ulp > 1) throw new Error(`${label}: ${distance.differentValues} values differ, up to ${distance.ulp} ULP`);
  return 'ulp';
}

function inputOf(id: string): RingParameters {
  const gridCase = grid.cases.find((c) => c.id === id);
  if (gridCase === undefined) throw new Error(`${id} is not in the grid`);
  // `parameters: null` is the model default (RingParameters.solid, as RingModel starts).
  return gridCase.parameters === null ? { ...RING_SOLID } : decodeRingParameters(gridCase.parameters);
}

const verdicts = new Map<string, string>();

describe('ring references', () => {
  it('covers the 14 ring cases', () => {
    expect(cases.length).toBe(14);
  });

  for (const c of cases) {
    it(c.id, () => {
      const p = normalized(inputOf(c.id));
      expect(encodeRingParameters(p)).toBe(c.normalized);
      expect(filename(p)).toBe(c.filename);
      if (c.kind === 'stl') {
        const actual = binarySTL(RingGenerator.generate(p, c.quality));
        expect(actual.length).toBe(c.bytes);
        const verdict = compareStl(actual, c.sha256, () => packBytes(c), c.id);
        verdicts.set(c.id, verdict);
        return;
      }
      const kit = new SegmentedRingKit(p, c.quality);
      const archive = kit.archive();
      const entries = c.entries as ManifestEntry[];
      const actual = zipEntries(archive);
      expect(actual.map((e) => e.name)).toEqual(entries.map((e) => e.name));
      const report: string[] = [];
      entries.forEach((entry, i) => {
        const got = actual[i] as (typeof actual)[number];
        expect(got.data.length, entry.name).toBe(entry.bytes);
        expect(got.offset, entry.name).toBe(entry.localHeaderOffset);
        // An STL within 1 ULP has another CRC; its verdict comes from compareStl below.
        if (hex(sha256(got.data)) === entry.sha256) expect(got.crc32, entry.name).toBe(Number(entry.crc32));
        if (entry.tierA) {
          const reference = new Uint8Array(readFileSync(tierAPath(entry.sha256)));
          if (!entry.name.endsWith('.stl')) {
            // JSON and text are always byte-identical.
            expect(new TextDecoder().decode(got.data), entry.name).toBe(new TextDecoder().decode(reference));
            report.push(`${entry.name}: identical`);
            return;
          }
          report.push(`${entry.name}: ${compareStl(got.data, entry.sha256, () => reference, `${c.id}/${entry.name}`)}`);
          return;
        }
        report.push(`${entry.name}: ${compareStl(got.data, entry.sha256, () => packBytes(c, entry), `${c.id}/${entry.name}`)}`);
      });
      const allIdentical = report.every((line) => line.endsWith('identical'));
      // With every entry identical, the whole archive must be too (headers, central directory, EOCD).
      if (allIdentical) expect(hex(sha256(archive)), 'archive').toBe(c.sha256);
      verdicts.set(c.id, allIdentical ? 'identical' : `ulp (${report.filter((line) => !line.endsWith('identical')).join(', ')})`);
    });
  }

  it('reports every case identical or within 1 ULP', () => {
    console.log(`ring references:\n${cases.map((c) => `  ${c.id}: ${verdicts.get(c.id) ?? 'missing'}`).join('\n')}`);
    expect(cases.every((c) => verdicts.has(c.id))).toBe(true);
  });
});
