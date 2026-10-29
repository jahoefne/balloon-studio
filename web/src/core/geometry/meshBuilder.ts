// Ported from the growable `[Point3]` / `[Triangle]` / `[Double]` arrays that the generators in
// mac/Sources/BalloonStudio @ cbda68d append to (e.g. CloudMeshBuilder, CloudGeometry.swift:1033).
// Typed, amortised-doubling buffers for hot paths, plus the BalloonMesh ⇄ flat-buffer
// conversions used at the worker boundary (docs/plan.md, WP-K9).
import { BalloonMesh } from './mesh';
import type { Point3, Triangle } from './point3';

/** Growable Float64Array (Swift `[Double]` with `append`). */
export class F64Buf {
  data: Float64Array;
  length = 0;

  constructor(capacity = 16) {
    this.data = new Float64Array(capacity > 0 ? capacity : 1);
  }

  reserve(capacity: number): void {
    if (capacity <= this.data.length) return;
    let size = this.data.length;
    while (size < capacity) size *= 2;
    const grown = new Float64Array(size);
    grown.set(this.data.subarray(0, this.length));
    this.data = grown;
  }

  push(value: number): number {
    if (this.length === this.data.length) this.reserve(this.length + 1);
    this.data[this.length] = value;
    return this.length++;
  }

  /** Appends three values; returns the index of the first. */
  push3(x: number, y: number, z: number): number {
    if (this.length + 3 > this.data.length) this.reserve(this.length + 3);
    const at = this.length;
    this.data[at] = x;
    this.data[at + 1] = y;
    this.data[at + 2] = z;
    this.length = at + 3;
    return at;
  }

  get(index: number): number {
    return this.data[index] as number;
  }

  /** A trimmed copy of the contents. */
  toArray(): Float64Array {
    return this.data.slice(0, this.length);
  }
}

/** Growable Uint32Array (Swift `[Int]` of indices with `append`). */
export class U32Buf {
  data: Uint32Array;
  length = 0;

  constructor(capacity = 16) {
    this.data = new Uint32Array(capacity > 0 ? capacity : 1);
  }

  reserve(capacity: number): void {
    if (capacity <= this.data.length) return;
    let size = this.data.length;
    while (size < capacity) size *= 2;
    const grown = new Uint32Array(size);
    grown.set(this.data.subarray(0, this.length));
    this.data = grown;
  }

  push(value: number): number {
    if (this.length === this.data.length) this.reserve(this.length + 1);
    this.data[this.length] = value;
    return this.length++;
  }

  push3(a: number, b: number, c: number): number {
    if (this.length + 3 > this.data.length) this.reserve(this.length + 3);
    const at = this.length;
    this.data[at] = a;
    this.data[at + 1] = b;
    this.data[at + 2] = c;
    this.length = at + 3;
    return at;
  }

  get(index: number): number {
    return this.data[index] as number;
  }

  toArray(): Uint32Array {
    return this.data.slice(0, this.length);
  }
}

/** Flat mesh: `positions` = x,y,z per vertex (Double), `indices` = a,b,c per triangle. */
export interface MeshBuffers {
  positions: Float64Array;
  indices: Uint32Array;
}

export function meshToBuffers(mesh: BalloonMesh): MeshBuffers {
  const positions = new Float64Array(mesh.vertices.length * 3);
  mesh.vertices.forEach((p, i) => {
    positions[3 * i] = p.x;
    positions[3 * i + 1] = p.y;
    positions[3 * i + 2] = p.z;
  });
  const indices = new Uint32Array(mesh.triangles.length * 3);
  mesh.triangles.forEach((t, i) => {
    indices[3 * i] = t.a;
    indices[3 * i + 1] = t.b;
    indices[3 * i + 2] = t.c;
  });
  return { positions, indices };
}

export function meshFromBuffers(buffers: MeshBuffers, maxOverhang = 0): BalloonMesh {
  const { positions, indices } = buffers;
  const vertices: Point3[] = new Array<Point3>(positions.length / 3);
  for (let i = 0; i < vertices.length; i++) {
    vertices[i] = { x: positions[3 * i] as number, y: positions[3 * i + 1] as number, z: positions[3 * i + 2] as number };
  }
  const triangles: Triangle[] = new Array<Triangle>(indices.length / 3);
  for (let i = 0; i < triangles.length; i++) {
    triangles[i] = { a: indices[3 * i] as number, b: indices[3 * i + 1] as number, c: indices[3 * i + 2] as number };
  }
  return new BalloonMesh(vertices, triangles, maxOverhang);
}
