// WP-K8: the TS basket against the Swift references (references/manifest.json, group `identity`,
// part `basket`). Parameters come from mac/cases/grid.json, which the manifest does not repeat.
//
// The STLs are in the Tier-B pack only (references/pack/refs-v2, `bash mac/scripts/fetch-pack.sh`),
// so without the pack this checks the settings, the filenames and the expected decode error, and
// skips the geometry. The comparison below is the stand-in until the WP-V2 harness replaces it.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { basketCodec, basketDefaults, basketFilename, BasketGenerator, normalizedBasket, type BasketQuality } from '../src/core/basket/basketGeometry';
import type { BalloonMesh } from '../src/core/geometry/mesh';
import { cross, sub, unit, type Point3 } from '../src/core/geometry/point3';
import { IntKey3Map } from '../src/core/geometry/weld';
import { binarySTL } from '../src/core/io/binaryStl';
import { parseSTL } from '../src/core/testing/stl';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packFiles = resolve(repo, 'references/pack/refs-v2/files');
const hasPack = existsSync(packFiles);

interface ManifestCase {
  id: string;
  part: string;
  quality: BasketQuality;
  filename?: string;
  normalized?: string;
  sha256?: string;
  bytes?: number;
  triangles?: number;
  bbox?: { min: [number, number, number]; max: [number, number, number] };
  error?: string;
}
interface GridCase {
  id: string;
  parameters: unknown;
}

const manifest = JSON.parse(readFileSync(resolve(repo, 'references/manifest.json'), 'utf8')) as { cases: ManifestCase[] };
const grid = JSON.parse(readFileSync(resolve(repo, 'mac/cases/grid.json'), 'utf8')) as { cases: GridCase[] };
const cases = manifest.cases.filter((c) => c.part === 'basket');
const parametersOf = (id: string): unknown => grid.cases.find((c) => c.id === id)?.parameters ?? null;

/** Swift `decodeRaw(BasketParameters.self, c.parameters) ?? BasketParameters()`, then `.normalized()`. */
const decodeCase = (id: string) => {
  const raw = parametersOf(id);
  return normalizedBasket(raw === null ? basketDefaults() : basketCodec.decodeValue(raw));
};

const isNegative = (bits: number): boolean => bits >= 0x80000000;

/** The STL criterion of docs/plan.md, WP-V2. Vertices are compared by bits, normals by direction. */
interface StlDiff {
  sameTopology: boolean;
  attributesEqual: boolean;
  /** Vertex coordinates whose bits differ. */
  ulpCount: number;
  /** Largest |Δbits| of a vertex coordinate; a sign change (also +0/-0) counts as infinite. */
  maxUlp: number;
  /** Normal components whose bits differ. Near zero these are last-bit noise of Double vertices. */
  normalComponents: number;
  /** Smallest dot(ours, reference) of the normals; WP-V2 requires ≥ 1 − 1e-6. */
  minNormalDot: number;
}

function weldedIndices(view: DataView, count: number): Int32Array {
  const lookup = new IntKey3Map(count);
  const indices = new Int32Array(count * 3);
  let vertices = 0;
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < 3; j++) {
      const o = 84 + 50 * i + 12 + j * 12;
      const x = view.getUint32(o, true);
      const y = view.getUint32(o + 4, true);
      const z = view.getUint32(o + 8, true);
      let index = lookup.get(x, y, z);
      if (index < 0) {
        index = vertices++;
        lookup.set(x, y, z, index);
      }
      indices[i * 3 + j] = index;
    }
  }
  return indices;
}

function diffSTL(ours: Uint8Array, reference: Uint8Array): StlDiff {
  const a = new DataView(ours.buffer, ours.byteOffset, ours.byteLength);
  const b = new DataView(reference.buffer, reference.byteOffset, reference.byteLength);
  const count = b.getUint32(80, true);
  const diff: StlDiff = { sameTopology: false, attributesEqual: true, ulpCount: 0, maxUlp: 0, normalComponents: 0, minNormalDot: 1 };
  for (let i = 0; i < 84; i++) expect(ours[i], `header byte ${i}`).toBe(reference[i]);
  expect(ours.length).toBe(reference.length);
  for (let i = 0; i < count; i++) {
    const start = 84 + 50 * i;
    let normalDot = 0;
    for (let k = 0; k < 3; k++) {
      const o = start + k * 4;
      if (a.getUint32(o, true) !== b.getUint32(o, true)) diff.normalComponents++;
      normalDot += a.getFloat32(o, true) * b.getFloat32(o, true);
    }
    if (normalDot < diff.minNormalDot) diff.minNormalDot = normalDot;
    for (let k = 3; k < 12; k++) {
      const o = start + k * 4;
      const x = a.getUint32(o, true);
      const y = b.getUint32(o, true);
      if (x === y) continue;
      diff.ulpCount++;
      const distance = isNegative(x) === isNegative(y) ? Math.abs(x - y) : Infinity;
      if (distance > diff.maxUlp) diff.maxUlp = distance;
    }
    if (a.getUint16(start + 48, true) !== b.getUint16(start + 48, true)) diff.attributesEqual = false;
  }
  const weldOurs = weldedIndices(a, count);
  const weldReference = weldedIndices(b, count);
  let same = true;
  for (let i = 0; same && i < weldOurs.length; i++) same = weldOurs[i] === weldReference[i];
  diff.sameTopology = same;
  return diff;
}

/** `normalFrom(tsVertices) === tsNormal` bitwise, from the Double vertices the writer saw. */
function checkWriterNormals(mesh: BalloonMesh, ours: Uint8Array): void {
  const view = new DataView(ours.buffer, ours.byteOffset, ours.byteLength);
  mesh.triangles.forEach((t, i) => {
    const p = mesh.vertices[t.a] as Point3;
    const n = unit(cross(sub(mesh.vertices[t.b] as Point3, p), sub(mesh.vertices[t.c] as Point3, p)));
    const o = 84 + 50 * i;
    if (!(Object.is(view.getFloat32(o, true), Math.fround(n.x)) && Object.is(view.getFloat32(o + 4, true), Math.fround(n.y)) && Object.is(view.getFloat32(o + 8, true), Math.fround(n.z)))) {
      throw new Error(`Face ${i}: the written normal does not follow from its vertices`);
    }
  });
}

const report: string[] = [];
afterAll(() => {
  if (report.length > 0) console.log(`Basket references\n${report.join('\n')}`);
});

describe('basket references', () => {
  it('the comparison flags a shifted coordinate, a sign flip and a moved vertex', () => {
    const mesh = BasketGenerator.generate(basketDefaults(), 'preview');
    const ours = binarySTL(mesh);
    const changed = (edit: (view: DataView) => void): StlDiff => {
      const copy = ours.slice();
      edit(new DataView(copy.buffer));
      return diffSTL(copy, ours);
    };
    const firstCoordinate = 84 + 12;
    expect(diffSTL(ours, ours)).toMatchObject({ sameTopology: true, attributesEqual: true, ulpCount: 0, maxUlp: 0, normalComponents: 0, minNormalDot: expect.closeTo(1, 5) });
    const plusOne = changed((view) => view.setUint32(firstCoordinate, view.getUint32(firstCoordinate, true) + 1, true));
    expect(plusOne.maxUlp).toBe(1);
    expect(plusOne.sameTopology).toBe(false); // Only this corner moved, so the weld splits the vertex.
    const plusTwo = changed((view) => view.setUint32(firstCoordinate, view.getUint32(firstCoordinate, true) + 2, true));
    expect(plusTwo.maxUlp).toBe(2);
    const flipped = changed((view) => view.setUint32(firstCoordinate, (view.getUint32(firstCoordinate, true) ^ 0x80000000) >>> 0, true));
    expect(flipped.maxUlp).toBe(Infinity);
    const attribute = changed((view) => view.setUint16(84 + 48, 1, true));
    expect(attribute.attributesEqual).toBe(false);
  });

  it('has the eleven basket cases', () => {
    expect(cases.length).toBe(11);
    expect(cases.filter((c) => c.error !== undefined).map((c) => c.id)).toEqual(['basket-partial-settings']);
  });

  for (const c of cases) {
    if (c.error !== undefined) {
      it(`${c.id}: decoding fails like JSONDecoder`, () => {
        expect(() => basketCodec.decodeValue(parametersOf(c.id))).toThrow(c.error);
        report.push(`${c.id}: expected error`);
      });
      continue;
    }

    it(`${c.id}: normalized settings and filename`, () => {
      const p = decodeCase(c.id);
      expect(basketCodec.encode(p)).toBe(c.normalized);
      expect(basketFilename(p)).toBe(c.filename);
    });

    it.skipIf(!hasPack)(
      `${c.id}: STL against the pack`,
      () => {
        const start = performance.now();
        const mesh = BasketGenerator.generate(decodeCase(c.id), c.quality);
        const generated = performance.now() - start;
        const ours = binarySTL(mesh);
        const total = performance.now() - start;
        const timing = `${generated.toFixed(0)} ms generate, ${total.toFixed(0)} ms with STL`;
        const sha256 = createHash('sha256').update(ours).digest('hex');
        if (sha256 === c.sha256) {
          report.push(`${c.id}: identical (${timing})`);
          return;
        }
        const reference = new Uint8Array(readFileSync(resolve(packFiles, c.id, c.filename as string)));
        parseSTL(reference); // Sanity: every reference normal follows from its vertices (dot > 0.999).
        checkWriterNormals(mesh, ours);
        const diff = diffSTL(ours, reference);
        report.push(`${c.id}: ulp ${JSON.stringify(diff)} of ${c.triangles} triangles (${timing})`);
        expect(diff.sameTopology).toBe(true);
        expect(diff.attributesEqual).toBe(true);
        expect(diff.maxUlp).toBeLessThanOrEqual(1);
        expect(diff.minNormalDot).toBeGreaterThanOrEqual(1 - 1e-6);
      },
      120_000,
    );
  }
});
