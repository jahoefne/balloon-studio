// Tests for the ported Swift test utilities (GeometryTests, NailInsertTests, WickerTests,
// PatternTests helpers) on meshes whose answers are known analytically.
import { describe, expect, it } from 'vitest';
import { geodesicSphere, probeTetrahedron } from '../../../tests/support/meshes';
import { fixtureBytes } from '../../../tests/support/swiftProbe';
import { BalloonMesh } from '../geometry/mesh';
import { binarySTL } from '../io/binaryStl';
import { storedZipArchive } from '../io/storedZip';
import { utf8 } from '../swift/text';
import { basketRadius, basketSection } from './basket';
import { check, CheckError } from './check';
import { lateralHits, verticalHits } from './hits';
import { inside } from './inside';
import { motifCount } from './motifs';
import { ray } from './ray';
import { parseSTL } from './stl';
import { zipEntries } from './zipReader';

/** Axis-aligned box [x0,x1]×[y0,y1]×[z0,z1], outward-facing, 12 triangles. */
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): BalloonMesh {
  const v = [
    { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x0, y: y1, z: z0 },
    { x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 },
  ];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const t = quads.flatMap(([a, b, c, d]) => [
    { a: a as number, b: b as number, c: c as number },
    { a: a as number, b: c as number, c: d as number },
  ]);
  return new BalloonMesh(v, t, 0);
}

describe('check', () => {
  it('throws the message on failure', () => {
    expect(() => check(false, 'Missing face was accepted')).toThrow(new CheckError('Missing face was accepted'));
    expect(() => check(true, 'never')).not.toThrow();
  });
});

describe('parseSTL', () => {
  it('reads Swift-written STLs back, welding by exact Float32 bits', () => {
    const sphere = parseSTL(fixtureBytes('stl/sphere3.stl'));
    expect(sphere.vertices.length).toBe(258);
    expect(sphere.triangles.length).toBe(512);
    sphere.validate();
    // +0 and -0 are different bit patterns, so the tetrahedron keeps its 4 vertices but the
    // signed zeros survive the round trip.
    const tetra = parseSTL(fixtureBytes('stl/tetra.stl'));
    expect(tetra.vertices.length).toBe(4);
    expect(Object.is(tetra.vertices[0]?.y, -0)).toBe(true);
    // Re-exporting keeps the Float32 vertices (the normals are recomputed from them).
    expect(parseSTL(binarySTL(tetra)).vertices).toEqual(tetra.vertices);
  });

  it('rejects wrong lengths and normals that disagree with the vertices', () => {
    const bytes = binarySTL(probeTetrahedron());
    expect(() => parseSTL(bytes.subarray(0, bytes.length - 1))).toThrow('Incorrect binary STL length');
    const flipped = bytes.slice();
    new DataView(flipped.buffer).setFloat32(84, -new DataView(flipped.buffer).getFloat32(84, true), true);
    new DataView(flipped.buffer).setFloat32(88, -new DataView(flipped.buffer).getFloat32(88, true), true);
    new DataView(flipped.buffer).setFloat32(92, -new DataView(flipped.buffer).getFloat32(92, true), true);
    expect(() => parseSTL(flipped)).toThrow(/STL face normal does not match its vertices \(face 0, dot -/);
  });
});

describe('hits, ray and inside', () => {
  const cube = box(-5, 5, -2, 3, 0, 10);

  it('lateralHits and verticalHits find both walls once', () => {
    expect(lateralHits(cube, 1.25, 4.5)).toEqual([-2, 3]);
    expect(verticalHits(cube, 1.25, 0.5)).toEqual([0, 10]);
    expect(verticalHits(cube, 7, 0)).toEqual([]);
  });

  it('ray returns the nearest wall and its outward normal', () => {
    const hit = ray(cube, { x: 0, y: 0, z: 5 }, { x: 1, y: 0, z: 0 });
    expect(hit?.[0]).toBeCloseTo(5, 12);
    expect(hit?.[1]).toEqual({ x: 1, y: 0, z: 0 });
    expect(ray(cube, { x: 20, y: 0, z: 5 }, { x: 1, y: 0, z: 0 })).toBeUndefined();
  });

  it('inside counts crossings of a skewed ray', () => {
    expect(inside(cube, { x: 0, y: 0, z: 5 })).toBe(true);
    expect(inside(cube, { x: 0, y: 0, z: 11 })).toBe(false);
    expect(inside(cube, { x: 6, y: 0, z: 5 })).toBe(false);
    const sphere = geodesicSphere(3, 10, { x: 0, y: 0, z: 0 });
    expect(inside(sphere, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(inside(sphere, { x: 0, y: 0, z: 10.5 })).toBe(false);
  });
});

describe('basketSection / basketRadius', () => {
  it('measures the section of a box', () => {
    const section = basketSection(box(-5, 5, -5, 5, 0, 10), 4);
    expect(section.length).toBe(8);
    expect(basketRadius(section, 0)).toBeCloseTo(5, 12);
    expect(basketRadius(section, Math.PI / 4)).toBeCloseTo(5 * Math.SQRT2, 12);
    expect(() => basketRadius([], 0)).toThrow('Missing basket section');
  });
});

describe('motifCount', () => {
  it('counts connected detail-colour regions', () => {
    const sphere = geodesicSphere(1, 10, { x: 0, y: 0, z: 0 });
    const colors = sphere.triangles.map(() => 0);
    expect(motifCount({ mesh: sphere, colors })).toBe(0);
    colors[0] = 1;
    colors[1] = 1; // shares vertex/edge with face 0 within the same subdivided octant
    colors[31] = 1; // a face in the opposite octant
    expect(motifCount({ mesh: sphere, colors })).toBe(2);
  });
});

describe('zipEntries', () => {
  it('reads the Swift StoredZIP fixture and verifies CRCs', () => {
    const entries = zipEntries(fixtureBytes('zip/stored.zip'));
    expect(entries.map((e) => e.name)).toEqual(['[Content_Types].xml', 'dir/b.bin', 'empty.txt', 'ünï/ß.txt', 'big.bin']);
    expect(entries.every((e) => e.version === 20 && e.flags === 0 && e.method === 0 && e.time === 0 && e.date === 33)).toBe(true);
    expect(entries[4]?.data.length).toBe(70000);
    expect(zipEntries(fixtureBytes('zip/empty.zip'))).toEqual([]);
  });

  it('rejects corrupted archives', () => {
    const zip = storedZipArchive([['a.txt', utf8('hello')]]);
    const corrupted = zip.slice();
    corrupted[30 + 5] = 0x48; // 'h' → 'H' in the data
    expect(() => zipEntries(corrupted)).toThrow('CRC mismatch in a.txt');
    expect(() => zipEntries(zip.subarray(0, zip.length - 1))).toThrow();
  });
});
