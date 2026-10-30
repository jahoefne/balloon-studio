// The two sculpted clouds, whose fronts cannot pass the harness on core/swift/dmath as it ships.
//
// A cell of the mesher's grid is often symmetric, so `refine` meets exact ties: two equal edges in
// `longest` (LampSurface.swift:237), two equal diagonals (:281). The input vertices then decide, and
// they carry libm noise. In these kits the noise of one `atan2` (classic: the outlet's angle,
// CableSeal.swift) or two (billow-min) is enough to split another edge there. The front then differs
// in a few vertices, and the shell above them follows that surface (about 0.01 mm).
//
// So each kit is held to two things:
// - With Apple's value for exactly those arguments it passes the harness with every corner
//   bit-identical. This shows that everything apart from libm is an exact port.
// - As it ships, its front is the same body within the limits below (measured: 4 triangles and 12
//   vertices of 70,000 for classic, none and 4 for billow-min; volume 4.5e-8 and area 8.7e-9 relative at
//   most), and its hash is pinned, so it stays the same on a machine without the pack.
// Found by replaying every libm argument of the four sculpted kits with Foundation, then by
// bisecting the arguments that differ (6534 and 5166 `atan2`s) down to these three.
import { describe, expect, it, vi } from 'vitest';

const apple = vi.hoisted(() => ({ on: false }));

vi.mock('../src/core/swift/dmath', async (original) => {
  const real = await original<typeof import('../src/core/swift/dmath')>();
  const table = new Map<string, number>([
    ['0.11,0.28', 0.37433361600758386],
    ['28.6,-3.582091887506008e-15', 1.5707963267948968],
    ['-3.6770320088189274,-3.3135231410269412', -2.304241283631431],
  ]);
  return { ...real, atan2: (y: number, x: number): number => (apple.on ? table.get(`${y},${x}`) : undefined) ?? real.atan2(y, x) };
});

import { expectReference, getCase, hasPack, isExported, loadEntryBody, type ReferenceCase } from '../harness';
import { sha256Hex } from '../harness/refs';
import type { BalloonMesh } from '../src/core/geometry/mesh';
import { cross, dot, length, sub, type Point3 } from '../src/core/geometry/point3';
import { binarySTL } from '../src/core/io/binaryStl';
import { normalized } from '../src/core/lamp/cloudGeometry';
import { CloudKit } from '../src/core/lamp/cloudKit';
import { wallLampDefaults } from '../src/core/lamp/sunGeometry';
import { check } from '../src/core/testing/check';
import { parseSTL } from '../src/core/testing/stl';
import { decodedCase, LIBM_FLIPPED_FRONTS, type GridCase } from './support/lamp';

/** SHA-256 of the front as it ships. */
const PINNED: Readonly<Record<string, string>> = {
  'cloud-sculpted-classic': '2102a5b14dfcdfa41e37cc80212a735f3c08ff415aad6bb54249ced14a746ddb',
  'cloud-sculpted-billow-min': '6f8db7aa94c016baccf0aef24f9a42f85d8eb7da48df0373f62b7b0ad86c9e2d',
};

const kitOf = (id: string): CloudKit => {
  const c = getCase(id) as ReferenceCase;
  return new CloudKit(normalized(decodedCase(c as unknown as GridCase, wallLampDefaults)), c.quality);
};

const measure = (mesh: BalloonMesh): { volume: number; area: number } => {
  let volume = 0, area = 0;
  for (const t of mesh.triangles) {
    const a = mesh.vertices[t.a]!, b = mesh.vertices[t.b]!, c = mesh.vertices[t.c]!;
    volume += dot(a, cross(b, c)) / 6;
    area += length(cross(sub(b, a), sub(c, a))) / 2;
  }
  return { volume, area };
};

// Coordinates that should be 0 come out as ±1e-14 mm with one libm and 0 with the other (harness rule).
const key = (v: Point3): string => [v.x, v.y, v.z].map((q) => (Math.abs(q) < 1e-9 ? 0 : q)).join();

describe.each(Object.keys(LIBM_FLIPPED_FRONTS))('%s', (id) => {
  it('as it ships, has the pinned front', () => {
    apple.on = false;
    expect(sha256Hex(binarySTL(kitOf(id).front))).toBe(PINNED[id]);
  }, 120_000);

  it.skipIf(!hasPack())('with Apple\'s atan2 for three arguments, has Swift\'s corners in every entry', () => {
    apple.on = true;
    try {
      // An empty allowlist: under Apple's values no entry may need `equivalent`.
      const result = expectReference(id, kitOf(id).archive(), { equivalentCases: [] });
      check(result.status === 'ulp' || result.status === 'identical', `${id}: ${result.status}`);
      check(result.ulpCount === 0, `${id}: ${result.ulpCount} corners differ in the last bit`);
    } finally {
      apple.on = false;
    }
  }, 120_000);

  it.skipIf(!hasPack())('as it ships, has the same body as Swift\'s front', () => {
    apple.on = false;
    const c = getCase(id);
    if (!isExported(c)) throw new Error(`${id} has no output`);
    const entry = c.entries!.find((candidate) => candidate.name === LIBM_FLIPPED_FRONTS[id]);
    const reference = parseSTL(loadEntryBody(c, entry!)!), actual = parseSTL(binarySTL(kitOf(id).front));
    reference.validate();
    actual.validate();
    check(Math.abs(actual.triangles.length - reference.triangles.length) <= 8, `${id}: ${actual.triangles.length} triangles, Swift ${reference.triangles.length}`);
    const inReference = new Set(reference.vertices.map(key)), inActual = new Set(actual.vertices.map(key));
    const differing = actual.vertices.filter((v) => !inReference.has(key(v))).length + reference.vertices.filter((v) => !inActual.has(key(v))).length;
    check(differing <= 16, `${id}: ${differing} vertices differ`);
    const a = measure(actual), b = measure(reference);
    check(Math.abs(a.volume - b.volume) <= 1e-7 * b.volume, `${id}: volume ${a.volume}, Swift ${b.volume}`);
    check(Math.abs(a.area - b.area) <= 1e-7 * b.area, `${id}: area ${a.area}, Swift ${b.area}`);
    const da = actual.dimensions, db = reference.dimensions;
    check(da.x === db.x && da.y === db.y && da.z === db.z, `${id}: dimensions`);
  }, 120_000);
});
