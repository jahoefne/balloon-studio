// WP-K2 reference comparison: every `part: "balloon"` case of mac/cases/grid.json against the Swift
// exports in references/manifest.json. The manifest's SHA-256 proves `identical` without the pack;
// only a differing file needs the Swift body (references/pack/refs-v1, see references/PACK.md) to
// tell `ulp` from a real difference. WP-V2's harness replaces this comparison later.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { generate, type Quality } from '../src/core/balloon/balloonGenerator';
import { filename, fromJSON, normalized, toJSON } from '../src/core/balloon/balloonParameters';
import { exportSTL } from '../src/core/balloon/balloonStl';
import { IntKey3Map } from '../src/core/geometry/weld';
import { FULL } from './support/tier';

interface GridCase {
  id: string;
  part: string;
  quality: Quality;
  parameters: unknown;
  expect?: Record<string, unknown>;
}
interface ManifestCase {
  id: string;
  part: string;
  filename: string;
  normalized: string;
  sha256: string;
  bytes: number;
  triangles: number;
  header: string;
  tierA: boolean;
  durationMs: number;
}

/**
 * Cases that are `ulp`, not `identical`, measured against the pack (see the PR report), with the
 * SHA-256 of the TS output: CI has no pack, so it proves the output has not moved.
 */
const KNOWN_ULP: Readonly<Record<string, string>> = {
  'balloon-hanger-small': '1fc7deb6ebf438333fff38ea651046bf157cf8c90d668197c181ae091b92aa1b',
};

const repository = new URL('../../', import.meta.url);
const readJSON = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, repository), 'utf8')) as T;
const grid = readJSON<{ cases: GridCase[] }>('mac/cases/grid.json').cases.filter((c) => c.part === 'balloon');
const manifest = new Map(readJSON<{ cases: ManifestCase[] }>('references/manifest.json').cases.map((c) => [c.id, c]));

function swiftBody(c: ManifestCase): Uint8Array | undefined {
  const tierA = new URL(`references/files/${c.sha256.slice(0, 2)}/${c.sha256}`, repository);
  const pack = new URL(`references/pack/refs-v1/files/${c.id}/${c.filename}`, repository);
  for (const file of [tierA, pack]) {
    if (existsSync(file)) return new Uint8Array(readFileSync(file));
  }
  return undefined;
}

/** Distance of two Float32 bit patterns in representable steps (+0 and -0 are 0 steps apart). */
function ulpDistance(a: number, b: number): number {
  const rank = (bits: number): number => (bits >= 0x80000000 ? -(bits - 0x80000000) : bits);
  return Math.abs(rank(a) - rank(b));
}

/** Exact-bit welding: the vertex indices of every triangle corner, numbered by first use. */
function topology(bytes: Uint8Array): Int32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const lookup = new IntKey3Map(count);
  const out = new Int32Array(count * 3);
  let vertices = 0;
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < 3; j++) {
      const o = 84 + 50 * i + 12 + 12 * j;
      const x = view.getUint32(o, true);
      const y = view.getUint32(o + 4, true);
      const z = view.getUint32(o + 8, true);
      let id = lookup.get(x, y, z);
      if (id < 0) {
        id = vertices++;
        lookup.set(x, y, z, id);
      }
      out[3 * i + j] = id;
    }
  }
  return out;
}

/**
 * A unit normal's component on the noise floor. Doubles of equal Float32 vertices can differ by a few
 * ULP (Apple libm against fdlibm), and where the cross product cancels (a component near 1e-16),
 * that moves the component by binades although nothing visible changes.
 */
const NORMAL_NOISE = 1e-15;

interface Difference {
  triangles: [number, number];
  sameTopology: boolean;
  /** Largest ULP distance over the vertex coordinates. */
  maxVertexUlp: number;
  /** Largest ULP distance over the normals, without components within NORMAL_NOISE. */
  maxNormalUlp: number;
  /** Normal components that differ by more than 1 ULP but less than NORMAL_NOISE. */
  noiseNormals: number;
  differingFloats: number;
  /** Flags, panels and the 13 settings floats; the digest differs along with the body. */
  headerFieldsEqual: boolean;
  digestEqual: boolean;
}

function diff(ours: Uint8Array, swift: Uint8Array): Difference {
  const a = new DataView(ours.buffer, ours.byteOffset, ours.byteLength);
  const b = new DataView(swift.buffer, swift.byteOffset, swift.byteLength);
  const triangles: [number, number] = [a.getUint32(80, true), b.getUint32(80, true)];
  let headerFieldsEqual = true;
  for (let i = 0; i < 62; i++) if (ours[i] !== swift[i]) headerFieldsEqual = false;
  let digestEqual = true;
  for (let i = 62; i < 80; i++) if (ours[i] !== swift[i]) digestEqual = false;
  let maxVertexUlp = 0;
  let maxNormalUlp = 0;
  let noiseNormals = 0;
  let differingFloats = 0;
  if (triangles[0] === triangles[1] && ours.length === swift.length) {
    for (let i = 0; i < triangles[0]; i++) {
      for (let k = 0; k < 12; k++) {
        const o = 84 + 50 * i + 4 * k;
        const x = a.getUint32(o, true);
        const y = b.getUint32(o, true);
        if (x === y) continue;
        const d = ulpDistance(x, y);
        differingFloats++;
        if (k >= 3) maxVertexUlp = Math.max(maxVertexUlp, d);
        else if (d > 1 && Math.abs(a.getFloat32(o, true) - b.getFloat32(o, true)) < NORMAL_NOISE) noiseNormals++;
        else maxNormalUlp = Math.max(maxNormalUlp, d);
      }
      if (ours[84 + 50 * i + 48] !== swift[84 + 50 * i + 48] || ours[84 + 50 * i + 49] !== swift[84 + 50 * i + 49]) differingFloats++;
    }
  } else {
    maxVertexUlp = Infinity;
    maxNormalUlp = Infinity;
  }
  let sameTopology = false;
  if (triangles[0] === triangles[1]) {
    const p = topology(ours);
    const q = topology(swift);
    sameTopology = p.every((v, i) => v === q[i]);
  }
  return { triangles, sameTopology, maxVertexUlp, maxNormalUlp, noiseNormals, differingFloats, headerFieldsEqual, digestEqual };
}

const report: string[] = [];

describe('balloon references', () => {
  it('covers the 21 balloon cases', () => {
    expect(grid.length).toBe(21);
    expect(grid.filter((c) => c.quality === 'export').length).toBe(8);
  });

  for (const c of grid) {
    it(
      c.id,
      () => {
        const m = manifest.get(c.id);
        if (m === undefined) throw new Error(`${c.id} is not in the manifest`);
        const p = normalized(fromJSON(JSON.stringify(c.parameters)));
        expect(toJSON(p)).toBe(m.normalized);
        expect(filename(p)).toBe(m.filename);
        for (const [key, value] of Object.entries(c.expect ?? {})) {
          expect((p as unknown as Record<string, unknown>)[key.replace('parameters.', '')]).toBe(value);
        }
        // The `fast` tier exports the default only; the settings above hold for every case.
        if (!FULL && c.quality === 'export' && c.id !== 'balloon-classic') return;
        const started = performance.now();
        const bytes = exportSTL(generate(p, c.quality), p);
        const ms = performance.now() - started;
        expect(bytes.length).toBe(m.bytes);
        const sha = createHash('sha256').update(bytes).digest('hex');
        const timing = `${ms.toFixed(0)} ms (Swift ${m.durationMs} ms)`;
        if (sha === m.sha256) {
          report.push(`${c.id}: identical, ${timing}`);
          return;
        }
        const swift = swiftBody(m);
        if (swift === undefined) {
          expect(sha, `${c.id} differs from Swift and the reference pack is missing (bash mac/scripts/fetch-pack.sh)`).toBe(KNOWN_ULP[c.id]);
          report.push(`${c.id}: ulp (pinned, pack not available), ${timing}`);
          return;
        }
        const d = diff(bytes, swift);
        report.push(`${c.id}: ulp ${JSON.stringify(d)}, TS SHA-256 ${sha}, ${timing}`);
        expect(d.triangles[0]).toBe(d.triangles[1]);
        expect(d.sameTopology).toBe(true);
        expect(d.headerFieldsEqual).toBe(true);
        expect(d.digestEqual).toBe(false);
        expect(d.maxVertexUlp).toBeLessThanOrEqual(1);
        expect(d.maxNormalUlp).toBeLessThanOrEqual(1);
        expect(sha).toBe(KNOWN_ULP[c.id]);
      },
      900_000,
    );
  }

  afterAll(() => {
    const file = process.env.BALLOON_REFERENCE_REPORT;
    if (file !== undefined) writeFileSync(file, `${report.join('\n')}\n`);
  });
});
