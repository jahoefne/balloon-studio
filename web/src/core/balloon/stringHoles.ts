// Ported from mac/Sources/BalloonStudio/StringHoles.swift @ cbda68d (whole file).
//
// Diamond openings have sloped roofs and a specified inscribed cord clearance.
// They are cut into a connected wall, not added as intersecting eyelet objects.
import type { BalloonMesh } from '../geometry/mesh';
import type { Point3, Triangle } from '../geometry/point3';
import { atan2, cos, PI, sin } from '../swift/dmath';
import { sortDoubles } from '../swift/sort';

export interface Layout {
  angles: number[];
  centers: number[];
}

export interface Patch {
  center: number;
  bottom: number;
  right: number;
  top: number;
  left: number;
  bottomLeft: number;
  topRight: number;
}

function loop(patch: Patch): number[] {
  return [patch.bottom, patch.right, patch.top, patch.left];
}

export function layout(samples: number, clearance: number, innerRadius: (angle: number) => number): Layout {
  const tau = 2 * PI;
  const half = clearance / Math.sqrt(2);
  const centers = [0, 1, 2, 3].map((i) => (i * PI) / 2);
  const spans = centers.map((center) => {
    let lo = 0.0;
    let hi = PI / 4 - 0.01;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (innerRadius(center + mid) * sin(mid) < half) lo = mid;
      else hi = mid;
    }
    return hi;
  });
  const wrapped = (a: number): number => (a + tau) % tau;
  const difference = (a: number, b: number): number => Math.abs(atan2(sin(a - b), cos(a - b)));
  const nearOpening = (angle: number): boolean => {
    for (let c = 0; c < centers.length; c++) {
      if (difference(angle, centers[c] as number) < (spans[c] as number) + 1e-8) return true;
    }
    return false;
  };
  const angles: number[] = [];
  for (let i = 0; i < samples; i++) {
    const angle = (tau * i) / samples;
    if (!nearOpening(angle)) angles.push(angle);
  }
  for (let c = 0; c < centers.length; c++) {
    const center = centers[c] as number;
    const span = spans[c] as number;
    angles.push(wrapped(center - span), center, wrapped(center + span));
  }
  sortDoubles(angles);
  while (angles.length < samples) {
    let best = -1;
    let bestWidth = 0.0;
    for (let i = 0; i < angles.length; i++) {
      const next = i + 1 < angles.length ? (angles[i + 1] as number) : (angles[0] as number) + tau;
      const mid = wrapped(((angles[i] as number) + next) / 2);
      if (nearOpening(mid)) continue;
      if (next - (angles[i] as number) > bestWidth) {
        best = i;
        bestWidth = next - (angles[i] as number);
      }
    }
    if (!(best >= 0)) break;
    const next = best + 1 < angles.length ? (angles[best + 1] as number) : (angles[0] as number) + tau;
    angles.push(wrapped(((angles[best] as number) + next) / 2));
    sortDoubles(angles);
  }
  return {
    angles,
    centers: centers.map((center) => {
      const index = angles.findIndex((a) => Math.abs(a - center) < 1e-8);
      if (index < 0) throw new RangeError('StringHoles.layout: a hole center lost its column');
      return index;
    }),
  };
}

export function patch(row: number, column: number, columns: number, index: (row: number, column: number) => number): Patch {
  const left = (column + columns - 1) % columns;
  const right = (column + 1) % columns;
  return {
    center: index(row, column),
    bottom: index(row - 1, column),
    right: index(row, right),
    top: index(row + 1, column),
    left: index(row, left),
    bottomLeft: index(row - 1, left),
    topRight: index(row + 1, right),
  };
}

function removeTouching(mesh: BalloonMesh, removed: ReadonlySet<number>): void {
  mesh.triangles = mesh.triangles.filter((t) => !(removed.has(t.a) || removed.has(t.b) || removed.has(t.c)));
}

export function punch(mesh: BalloonMesh, pairs: readonly (readonly [Patch, Patch])[]): void {
  const removed = new Set<number>();
  for (const [outer, inner] of pairs) {
    removed.add(outer.center);
    removed.add(inner.center);
  }
  removeTouching(mesh, removed);
  const triangles = mesh.triangles;
  for (const [outer, inner] of pairs) {
    triangles.push(
      { a: outer.bottomLeft, b: outer.bottom, c: outer.left },
      { a: outer.right, b: outer.topRight, c: outer.top },
      { a: inner.bottomLeft, b: inner.left, c: inner.bottom },
      { a: inner.right, b: inner.top, c: inner.topRight },
    );
    const outerLoop = loop(outer);
    const innerLoop = loop(inner);
    for (let j = 0; j < 4; j++) {
      const k = (j + 1) % 4;
      const a = outerLoop[j] as number;
      const b = outerLoop[k] as number;
      const c = innerLoop[k] as number;
      const d = innerLoop[j] as number;
      triangles.push({ a, b, c });
      triangles.push({ a, b: c, c: d });
    }
  }
  compact(mesh);
}

/**
 * Two perpendicular, straight bores through a filled neck. Their shared
 * intersection is stitched explicitly, leaving no internal blocking faces.
 * The bottom cap remains intact; the only openings are the four side mouths.
 */
export function crossBores(mesh: BalloonMesh, patches: readonly Patch[], clearance: number, centerZ: number): void {
  if (patches.length !== 4) throw new RangeError('StringHoles.crossBores: precondition failed');
  removeTouching(mesh, new Set(patches.map((p) => p.center)));
  const half = clearance / Math.sqrt(2);
  const vertices = mesh.vertices;
  const triangles = mesh.triangles;
  const vertex = (x: number, y: number, z: number): number => {
    const index = vertices.length;
    vertices.push({ x, y, z });
    return index;
  };
  const bottom = vertex(0, 0, centerZ - half);
  const top = vertex(0, 0, centerZ + half);
  const corners = [vertex(half, half, centerZ), vertex(-half, half, centerZ), vertex(-half, -half, centerZ), vertex(half, -half, centerZ)];
  patches.forEach((outer, i) => {
    triangles.push({ a: outer.bottomLeft, b: outer.bottom, c: outer.left });
    triangles.push({ a: outer.right, b: outer.topRight, c: outer.top });
    const inner = [bottom, corners[i] as number, top, corners[(i + 3) % 4] as number];
    const outerLoop = loop(outer);
    for (let j = 0; j < 4; j++) {
      const k = (j + 1) % 4;
      const a = outerLoop[j] as number;
      const b = outerLoop[k] as number;
      const c = inner[k] as number;
      const d = inner[j] as number;
      triangles.push({ a, b, c });
      triangles.push({ a, b: c, c: d });
    }
  });
  compact(mesh);
}

export function compact(mesh: BalloonMesh): void {
  const count = mesh.vertices.length;
  const used = new Uint8Array(count);
  const triangles: readonly Triangle[] = mesh.triangles;
  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i] as Triangle;
    used[t.a] = 1;
    used[t.b] = 1;
    used[t.c] = 1;
  }
  const remap = new Int32Array(count);
  const vertices: Point3[] = [];
  for (let i = 0; i < count; i++) {
    if (used[i]) {
      remap[i] = vertices.length;
      vertices.push(mesh.vertices[i] as Point3);
    }
  }
  const range = mesh.innerVertexRange;
  if (range !== undefined) {
    let first = -1;
    let last = -1;
    for (let i = range.lowerBound; i < range.upperBound; i++) {
      if (used[i]) {
        if (first < 0) first = i;
        last = i;
      }
    }
    if (first >= 0) mesh.innerVertexRange = { lowerBound: remap[first] as number, upperBound: (remap[last] as number) + 1 };
  }
  mesh.triangles = triangles.map((t) => ({ a: remap[t.a] as number, b: remap[t.b] as number, c: remap[t.c] as number }));
  mesh.vertices = vertices;
}
