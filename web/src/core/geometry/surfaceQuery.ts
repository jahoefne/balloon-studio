// Ported from mac/Sources/BalloonStudio/SurfaceQuery.swift @ cbda68d (whole file).
//
// A triangle BVH for distance queries. Used to hollow the actual fluted surface, rather than
// scaling a duplicate (which makes the neck and sloping walls thin).
// Typed-array layout (WP-K9): faces are 12 doubles (a, b, c, center), nodes are parallel typed
// arrays. Build order, split axis rule, stable sort and query arithmetic follow Swift exactly.
import { IndexSortScratch, stableSortIndexRange } from '../swift/sort';
import { swiftMax, swiftMin } from '../swift/minmax';
import type { Point3, Triangle } from './point3';

const FACE = 12;
const THIRD = 1.0 / 3.0; // Swift Double(1.0/3.0)

export class SurfaceQuery {
  private readonly faces: Float64Array;
  private readonly order: Int32Array;
  private readonly boxes: Float64Array; // lo.x lo.y lo.z hi.x hi.y hi.z per node
  private readonly starts: Int32Array;
  private readonly counts: Int32Array;
  private readonly lefts: Int32Array;
  private readonly rights: Int32Array;
  private nodeCount = 0;
  private readonly scratch: IndexSortScratch;

  constructor(vertices: readonly Point3[], triangles: readonly Triangle[]) {
    const count = triangles.length;
    const faces = new Float64Array(count * FACE);
    for (let i = 0; i < count; i++) {
      const t = triangles[i] as Triangle;
      const a = vertices[t.a] as Point3;
      const b = vertices[t.b] as Point3;
      const c = vertices[t.c] as Point3;
      const o = i * FACE;
      faces[o] = a.x;
      faces[o + 1] = a.y;
      faces[o + 2] = a.z;
      faces[o + 3] = b.x;
      faces[o + 4] = b.y;
      faces[o + 5] = b.z;
      faces[o + 6] = c.x;
      faces[o + 7] = c.y;
      faces[o + 8] = c.z;
      // (a+b+c)*Double(1.0/3.0)
      faces[o + 9] = (a.x + b.x + c.x) * THIRD;
      faces[o + 10] = (a.y + b.y + c.y) * THIRD;
      faces[o + 11] = (a.z + b.z + c.z) * THIRD;
    }
    this.faces = faces;
    this.order = new Int32Array(count);
    for (let i = 0; i < count; i++) this.order[i] = i;
    // A node splits only above 12 faces, into halves of at least 6, so leaves ≤ count/6 + 1.
    const capacity = 2 * (Math.floor(count / 6) + 1);
    this.boxes = new Float64Array(capacity * 6);
    this.starts = new Int32Array(capacity);
    this.counts = new Int32Array(capacity);
    this.lefts = new Int32Array(capacity);
    this.rights = new Int32Array(capacity);
    this.scratch = new IndexSortScratch(count);
    if (count > 0) this.build(0, count);
  }

  private build(start: number, end: number): number {
    const faces = this.faces;
    let loX = Infinity;
    let loY = Infinity;
    let loZ = Infinity;
    let hiX = -Infinity;
    let hiY = -Infinity;
    let hiZ = -Infinity;
    for (let i = start; i < end; i++) {
      const o = (this.order[i] as number) * FACE;
      // box.include(f.a); box.include(f.b); box.include(f.c)
      for (let v = o; v < o + 9; v += 3) {
        const x = faces[v] as number;
        const y = faces[v + 1] as number;
        const z = faces[v + 2] as number;
        loX = swiftMin(loX, x);
        loY = swiftMin(loY, y);
        loZ = swiftMin(loZ, z);
        hiX = swiftMax(hiX, x);
        hiY = swiftMax(hiY, y);
        hiZ = swiftMax(hiZ, z);
      }
    }
    const index = this.nodeCount++;
    const b = index * 6;
    this.boxes[b] = loX;
    this.boxes[b + 1] = loY;
    this.boxes[b + 2] = loZ;
    this.boxes[b + 3] = hiX;
    this.boxes[b + 4] = hiY;
    this.boxes[b + 5] = hiZ;
    this.starts[index] = start;
    this.counts[index] = end - start;
    this.lefts[index] = -1;
    this.rights[index] = -1;
    if (end - start > 12) {
      const ex = hiX - loX;
      const ey = hiY - loY;
      const ez = hiZ - loZ;
      const axis = ex > ey ? (ex > ez ? 0 : 2) : ey > ez ? 1 : 2;
      stableSortIndexRange(this.order, start, end, faces, FACE, 9 + axis, this.scratch);
      const middle = (start + end) >> 1;
      const left = this.build(start, middle);
      const right = this.build(middle, end);
      this.lefts[index] = left;
      this.rights[index] = right;
    }
    return index;
  }

  /** Swift `isCloser(than: distance, to: point)`. */
  isCloser(distance: number, point: Point3): boolean {
    return this.nodeCount > 0 && this.visit(0, point.x, point.y, point.z, distance * distance);
  }

  /** Allocation-free form of isCloser for hot loops. */
  isCloserXYZ(distance: number, x: number, y: number, z: number): boolean {
    return this.nodeCount > 0 && this.visit(0, x, y, z, distance * distance);
  }

  private visit(index: number, px: number, py: number, pz: number, limit: number): boolean {
    const b = index * 6;
    const boxes = this.boxes;
    // Box.distanceSquared
    const x = swiftMax((boxes[b] as number) - px, swiftMax(0, px - (boxes[b + 3] as number)));
    const y = swiftMax((boxes[b + 1] as number) - py, swiftMax(0, py - (boxes[b + 4] as number)));
    const z = swiftMax((boxes[b + 2] as number) - pz, swiftMax(0, pz - (boxes[b + 5] as number)));
    if (x * x + y * y + z * z >= limit) return false;
    const left = this.lefts[index] as number;
    if (left >= 0) {
      return this.visit(left, px, py, pz, limit) || this.visit(this.rights[index] as number, px, py, pz, limit);
    }
    const faces = this.faces;
    const start = this.starts[index] as number;
    const end = start + (this.counts[index] as number);
    for (let i = start; i < end; i++) {
      const o = (this.order[i] as number) * FACE;
      const d = distanceSquaredXYZ(
        px, py, pz,
        faces[o] as number, faces[o + 1] as number, faces[o + 2] as number,
        faces[o + 3] as number, faces[o + 4] as number, faces[o + 5] as number,
        faces[o + 6] as number, faces[o + 7] as number, faces[o + 8] as number,
      );
      if (d < limit) return true;
    }
    return false;
  }

  /** Swift `SurfaceQuery.distanceSquared(p, a, b, c)`. */
  static distanceSquared(p: Point3, a: Point3, b: Point3, c: Point3): number {
    return distanceSquaredXYZ(p.x, p.y, p.z, a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
}

/**
 * Closest point on a triangle, including edge and vertex Voronoi regions; squared distance.
 * Scalar transcription of SurfaceQuery.swift:86-112 in Swift's evaluation order.
 */
export function distanceSquaredXYZ(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    // p-(a+ab*(d1/(d1-d3)))
    const t = d1 / (d1 - d3);
    const dx = px - (ax + abx * t);
    const dy = py - (ay + aby * t);
    const dz = pz - (az + abz * t);
    return dx * dx + dy * dy + dz * dz;
  }
  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    // p-(a+ac*(d2/(d2-d6)))
    const t = d2 / (d2 - d6);
    const dx = px - (ax + acx * t);
    const dy = py - (ay + acy * t);
    const dz = pz - (az + acz * t);
    return dx * dx + dy * dy + dz * dz;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    // p-(b+(c-b)*((d4-d3)/((d4-d3)+(d5-d6))))
    const t = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const dx = px - (bx + (cx - bx) * t);
    const dy = py - (by + (cy - by) * t);
    const dz = pz - (bz + (cz - bz) * t);
    return dx * dx + dy * dy + dz * dz;
  }
  const denominator = 1 / (va + vb + vc);
  // p-(a+ab*(vb*denominator)+ac*(vc*denominator))
  const v = vb * denominator;
  const w = vc * denominator;
  const dx = px - (ax + abx * v + acx * w);
  const dy = py - (ay + aby * v + acy * w);
  const dz = pz - (az + abz * v + acz * w);
  return dx * dx + dy * dy + dz * dz;
}
