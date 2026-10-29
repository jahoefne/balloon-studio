// Ported from mac/Sources/BalloonStudio/BalloonGeometry.swift @ cbda68d (lines 118-188:
// MeshError, BalloonMesh.dimensions, BalloonMesh.validate). binarySTL (:190-208) lives in
// core/io/binaryStl.ts.
import { swiftMax, swiftMin } from '../swift/minmax';
import type { Point3, Triangle } from './point3';

/** Swift `MeshError.invalid(reason)`; `message` is its `errorDescription`. */
export class MeshError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`The model could not be exported: ${reason}`);
    this.name = 'MeshError';
    this.reason = reason;
  }
}

/** Swift `Range<Int>`: `lowerBound..<upperBound`. */
export interface IntRange {
  lowerBound: number;
  upperBound: number;
}

/**
 * Swift `struct BalloonMesh`. Swift copies structs on assignment; call `copy()` where the Swift
 * code relies on that (`var damaged = mesh; damaged.triangles.removeLast()`).
 */
export class BalloonMesh {
  vertices: Point3[];
  triangles: Triangle[];
  maxOverhang: number;
  /** Contiguous inner-envelope vertices, retained for wall-clearance verification. */
  innerVertexRange: IntRange | undefined;

  constructor(vertices: Point3[], triangles: Triangle[], maxOverhang: number, innerVertexRange?: IntRange) {
    this.vertices = vertices;
    this.triangles = triangles;
    this.maxOverhang = maxOverhang;
    this.innerVertexRange = innerVertexRange;
  }

  /** A deep copy with Swift value semantics. */
  copy(): BalloonMesh {
    return new BalloonMesh(
      this.vertices.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      this.triangles.map((t) => ({ a: t.a, b: t.b, c: t.c })),
      this.maxOverhang,
      this.innerVertexRange === undefined ? undefined : { ...this.innerVertexRange },
    );
  }

  /** Swift `var dimensions: Point3`: extent of the vertices (zero for an empty mesh). */
  get dimensions(): Point3 {
    const vertices = this.vertices;
    const first = vertices[0] ?? { x: 0, y: 0, z: 0 };
    let loX = first.x;
    let loY = first.y;
    let loZ = first.z;
    let hiX = first.x;
    let hiY = first.y;
    let hiZ = first.z;
    for (let i = 0; i < vertices.length; i++) {
      const p = vertices[i] as Point3;
      loX = swiftMin(loX, p.x);
      loY = swiftMin(loY, p.y);
      loZ = swiftMin(loZ, p.z);
      hiX = swiftMax(hiX, p.x);
      hiY = swiftMax(hiY, p.y);
      hiZ = swiftMax(hiZ, p.z);
    }
    return { x: hiX - loX, y: hiY - loY, z: hiZ - loZ };
  }

  /**
   * Swift `validate()`: independent topological checks protect every exported mesh. Throws a
   * MeshError with Swift's reason strings, in Swift's order of checks.
   */
  validate(): void {
    validateMesh(this.vertices, this.triangles);
  }
}

function hashEdge(lo: number, hi: number, mask: number): number {
  return (Math.imul(lo, 0x9e3779b1) ^ Math.imul(hi, 0x85ebca77)) & mask;
}

/** The body of BalloonMesh.validate on plain arrays (typed-array union-find and edge table). */
export function validateMesh(vertices: readonly Point3[], triangles: readonly Triangle[]): void {
  const vertexCount = vertices.length;
  if (!(vertexCount > 3) || triangles.length === 0) throw new MeshError('empty geometry');
  for (let i = 0; i < vertexCount; i++) {
    const p = vertices[i] as Point3;
    if (!(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) throw new MeshError('non-finite coordinates');
  }
  // Swift: [Edge: Uses] with Edge(lo, hi), Uses(count, direction). Open addressing on (lo, hi).
  // A closed mesh has exactly 1.5·F edges, each used twice; beyond that the surface cannot be
  // closed, so further edges are not stored (the table stays at most half full) and the
  // closed-surface failure is reported after the loop, where Swift reports it.
  const edgeLimit = triangles.length * 1.5;
  let overflow = false;
  let capacity = 16;
  while (capacity < triangles.length * 3) capacity *= 2;
  const mask = capacity - 1;
  const edgeLo = new Int32Array(capacity).fill(-1);
  const edgeHi = new Int32Array(capacity);
  const edgeCount = new Int32Array(capacity);
  const edgeDirection = new Int32Array(capacity);
  let edges = 0;
  let volume = 0.0;
  const parents = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) parents[i] = i;
  const root = (value: number): number => {
    let i = value;
    while (parents[i] !== i) {
      parents[i] = parents[parents[i] as number] as number;
      i = parents[i] as number;
    }
    return i;
  };
  const isIndex = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < vertexCount;
  const use = (i: number, j: number): void => {
    const lo = i < j ? i : j;
    const hi = i < j ? j : i;
    let slot = hashEdge(lo, hi, mask);
    for (;;) {
      const stored = edgeLo[slot] as number;
      if (stored === -1) {
        if (edges + 1 > edgeLimit) {
          overflow = true;
          return;
        }
        edgeLo[slot] = lo;
        edgeHi[slot] = hi;
        edges++;
        break;
      }
      if (stored === lo && edgeHi[slot] === hi) break;
      slot = (slot + 1) & mask;
    }
    edgeCount[slot] = (edgeCount[slot] as number) + 1;
    edgeDirection[slot] = (edgeDirection[slot] as number) + (i < j ? 1 : -1);
  };
  for (let f = 0; f < triangles.length; f++) {
    const t = triangles[f] as Triangle;
    if (!(isIndex(t.a) && isIndex(t.b) && isIndex(t.c))) throw new MeshError('invalid face indices');
    const a = vertices[t.a] as Point3;
    const b = vertices[t.b] as Point3;
    const c = vertices[t.c] as Point3;
    const ra = root(t.a);
    const rb = root(t.b);
    const rc = root(t.c);
    parents[rb] = ra;
    parents[rc] = ra;
    // (b-a).cross(c-a).length > 1e-9
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    if (!(Math.sqrt(nx * nx + ny * ny + nz * nz) > 1e-9)) throw new MeshError('collapsed face');
    // volume += a.dot(b.cross(c))/6
    const bcx = b.y * c.z - b.z * c.y;
    const bcy = b.z * c.x - b.x * c.z;
    const bcz = b.x * c.y - b.y * c.x;
    volume += (a.x * bcx + a.y * bcy + a.z * bcz) / 6;
    use(t.a, t.b);
    use(t.b, t.c);
    use(t.c, t.a);
  }
  if (overflow) throw new MeshError('the surface is not consistently closed');
  for (let slot = 0; slot < capacity; slot++) {
    if (edgeLo[slot] !== -1 && (edgeCount[slot] !== 2 || edgeDirection[slot] !== 0)) {
      throw new MeshError('the surface is not consistently closed');
    }
  }
  const euler = vertexCount - edges + triangles.length;
  const component = root(0);
  let connected = true;
  for (let i = 0; i < vertexCount; i++) {
    if (root(i) !== component) {
      connected = false;
      break;
    }
  }
  if (!(connected && euler <= 2 && (2 - euler) % 2 === 0 && volume > 0)) {
    throw new MeshError('unexpected topology or orientation');
  }
}
