// Ported from mac/Tests/NailInsertTests.swift @ cbda68d (lines 5-19: inside).
import type { BalloonMesh } from '../geometry/mesh';
import { cross, dot, sub, unit, type Point3, type Triangle } from '../geometry/point3';

/** Odd crossings along a slightly skewed ray, which misses edges. */
export function inside(mesh: BalloonMesh, o: Point3): boolean {
  const d = unit({ x: 0.000123, y: 0.000271, z: 1 });
  let count = 0;
  for (const t of mesh.triangles as Triangle[]) {
    const a = mesh.vertices[t.a] as Point3;
    const e1 = sub(mesh.vertices[t.b] as Point3, a);
    const e2 = sub(mesh.vertices[t.c] as Point3, a);
    const h = cross(d, e2);
    const det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const s = sub(o, a);
    const u = dot(s, h) / det;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1);
    const v = dot(d, q) / det;
    if (v < 0 || u + v > 1) continue;
    if (dot(e2, q) / det > 0) count += 1;
  }
  return count % 2 === 1;
}
