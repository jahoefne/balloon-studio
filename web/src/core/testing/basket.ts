// Ported from mac/Tests/WickerTests.swift @ cbda68d (lines 6-30: basketSection, basketRadius).
import type { BalloonMesh } from '../geometry/mesh';
import { add, scale, sub, type Point3, type Triangle } from '../geometry/point3';
import { cos, sin } from '../swift/dmath';
import { swiftMax } from '../swift/minmax';
import { check } from './check';

/**
 * Intersect the actual triangulated surface, including interpolation between vertices.
 * This catches lost detail beneath holes and preview undersampling.
 */
export function basketSection(mesh: BalloonMesh, z: number): [Point3, Point3][] {
  const section: [Point3, Point3][] = [];
  for (const t of mesh.triangles as Triangle[]) {
    const points = [mesh.vertices[t.a] as Point3, mesh.vertices[t.b] as Point3, mesh.vertices[t.c] as Point3];
    const hits: Point3[] = [];
    for (let i = 0; i < 3; i++) {
      const a = points[i] as Point3;
      const b = points[(i + 1) % 3] as Point3;
      if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) {
        hits.push(add(a, scale(sub(b, a), (z - a.z) / (b.z - a.z))));
      }
    }
    if (hits.length === 2) section.push([hits[0] as Point3, hits[1] as Point3]);
  }
  return section;
}

export function basketRadius(section: readonly [Point3, Point3][], theta: number): number {
  const direction: Point3 = { x: cos(theta), y: sin(theta), z: 0 };
  const cross2 = (a: Point3, b: Point3): number => a.x * b.y - a.y * b.x;
  let result = 0.0;
  for (const [a, b] of section) {
    const edge = sub(b, a);
    const denominator = cross2(direction, edge);
    if (Math.abs(denominator) < 1e-12) continue;
    const t = cross2(a, edge) / denominator;
    const s = cross2(a, direction) / denominator;
    if (s >= 0 && s <= 1) result = swiftMax(result, t);
  }
  check(result > 0, 'Missing basket section');
  return result;
}
