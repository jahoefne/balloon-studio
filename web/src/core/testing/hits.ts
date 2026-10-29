// Ported from mac/Tests/GeometryTests.swift @ cbda68d (lines 242-273: lateralHits, verticalHits).
import type { BalloonMesh } from '../geometry/mesh';
import type { Point3, Triangle } from '../geometry/point3';
import { swiftMin } from '../swift/minmax';
import { sortedDoubles } from '../swift/sort';

/** `hits.sorted().reduce(into: [])`, keeping a value only if it is more than 1e-4 from the last kept one. */
function distinctSorted(hits: number[]): number[] {
  const result: number[] = [];
  for (const value of sortedDoubles(hits)) {
    const last = result[result.length - 1];
    if (last === undefined || Math.abs(last - value) > 1e-4) result.push(value);
  }
  return result;
}

/** Intersect a line parallel to Y, for the crown eyelet's bore and thickness. */
export function lateralHits(mesh: BalloonMesh, x: number, z: number): number[] {
  const hits: number[] = [];
  for (const t of mesh.triangles as Triangle[]) {
    const a = mesh.vertices[t.a] as Point3;
    const b = mesh.vertices[t.b] as Point3;
    const c = mesh.vertices[t.c] as Point3;
    const determinant = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (Math.abs(determinant) < 1e-10) continue;
    const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / determinant;
    const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / determinant;
    const w = 1 - u - v;
    if (swiftMin(u, swiftMin(v, w)) >= -1e-8) hits.push(u * a.y + v * b.y + w * c.y);
  }
  return distinctSorted(hits);
}

/**
 * Intersect a vertical line using XY barycentric coordinates, independently of the
 * generator's polar grid and topology checks.
 */
export function verticalHits(mesh: BalloonMesh, x: number, y: number): number[] {
  const hits: number[] = [];
  for (const t of mesh.triangles as Triangle[]) {
    const a = mesh.vertices[t.a] as Point3;
    const b = mesh.vertices[t.b] as Point3;
    const c = mesh.vertices[t.c] as Point3;
    const determinant = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(determinant) < 1e-10) continue;
    const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / determinant;
    const v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / determinant;
    const w = 1 - u - v;
    if (swiftMin(u, swiftMin(v, w)) >= -1e-8) hits.push(u * a.z + v * b.z + w * c.z);
  }
  return distinctSorted(hits);
}
