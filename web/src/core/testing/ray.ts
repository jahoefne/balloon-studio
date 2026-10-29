// Ported from mac/Tests/GeometryTests.swift @ cbda68d (lines 463-477: ray).
// Ray/triangle queries (Möller–Trumbore) are independent of the swept profile construction.
import type { BalloonMesh } from '../geometry/mesh';
import { cross, dot, sub, unit, type Point3, type Triangle } from '../geometry/point3';

/** Swift `ray(mesh, o, d)`: nearest hit beyond 1e-6 as `[distance, unit face normal]`, or undefined. */
export function ray(mesh: BalloonMesh, o: Point3, d: Point3): [number, Point3] | undefined {
  let nearest: [number, Point3] | undefined;
  for (const t of mesh.triangles as Triangle[]) {
    const a = mesh.vertices[t.a] as Point3;
    const e1 = sub(mesh.vertices[t.b] as Point3, a);
    const e2 = sub(mesh.vertices[t.c] as Point3, a);
    const h = cross(d, e2);
    const det = dot(e1, h);
    if (Math.abs(det) < 1e-10) continue;
    const s = sub(o, a);
    const u = dot(s, h) / det;
    if (u < -1e-8 || u > 1 + 1e-8) continue;
    const q = cross(s, e1);
    const v = dot(d, q) / det;
    if (v < -1e-8 || u + v > 1 + 1e-8) continue;
    const distance = dot(e2, q) / det;
    if (distance > 1e-6 && (nearest === undefined || distance < nearest[0])) nearest = [distance, unit(cross(e1, e2))];
  }
  return nearest;
}
