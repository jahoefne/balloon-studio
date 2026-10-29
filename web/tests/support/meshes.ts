// Test meshes built exactly like tests/fixtures/swift/probes/geometry.swift (only +, -, *, /
// and sqrt, so the vertices are bit-identical to Swift's).
import { BalloonMesh } from '../../src/core/geometry/mesh';
import { add, length, scale, type Point3, type Triangle } from '../../src/core/geometry/point3';

/** Swift `sphere(levels:radius:offset:)`: a subdivided octahedron, outward-facing. */
export function geodesicSphere(levels: number, radius: number, offset: Point3): BalloonMesh {
  const v: Point3[] = [
    { x: radius, y: 0, z: 0 },
    { x: -radius, y: 0, z: 0 },
    { x: 0, y: radius, z: 0 },
    { x: 0, y: -radius, z: 0 },
    { x: 0, y: 0, z: radius },
    { x: 0, y: 0, z: -radius },
  ];
  let t: Triangle[] = [
    [0, 2, 4],
    [2, 1, 4],
    [1, 3, 4],
    [3, 0, 4],
    [2, 0, 5],
    [1, 2, 5],
    [3, 1, 5],
    [0, 3, 5],
  ].map(([a, b, c]) => ({ a: a as number, b: b as number, c: c as number }));
  for (let level = 0; level < levels; level++) {
    const cache = new Map<string, number>();
    const mid = (i: number, j: number): number => {
      const key = `${i < j ? i : j},${i < j ? j : i}`;
      const k = cache.get(key);
      if (k !== undefined) return k;
      const m = scale(add(v[i] as Point3, v[j] as Point3), 0.5);
      const p = scale(m, radius / length(m));
      cache.set(key, v.length);
      v.push(p);
      return v.length - 1;
    };
    const next: Triangle[] = [];
    for (const f of t) {
      const ab = mid(f.a, f.b);
      const bc = mid(f.b, f.c);
      const ca = mid(f.c, f.a);
      next.push({ a: f.a, b: ab, c: ca }, { a: ab, b: f.b, c: bc }, { a: ca, b: bc, c: f.c }, { a: ab, b: bc, c: ca });
    }
    t = next;
  }
  return new BalloonMesh(
    v.map((p) => add(p, offset)),
    t,
    0,
  );
}

/** The probe's tetrahedron (with signed zeros). */
export function probeTetrahedron(): BalloonMesh {
  return new BalloonMesh(
    [
      { x: 0, y: -0, z: 0 },
      { x: 10.1, y: 0, z: -0 },
      { x: 0.3, y: 20.3, z: 0.1 },
      { x: 1.7, y: 2.9, z: 7.7 },
    ],
    [
      { a: 0, b: 2, c: 1 },
      { a: 0, b: 1, c: 3 },
      { a: 1, b: 2, c: 3 },
      { a: 0, b: 3, c: 2 },
    ],
    0,
  );
}
