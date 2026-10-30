// Synthetic STLs and manipulations for the harness self-tests.
import { sha256Hex } from './refs';

type Vec3 = readonly [number, number, number];
export type Tri = readonly [Vec3, Vec3, Vec3];

const TEXT = 'Balloon Studio | millimetres | watertight material | Z up';

/** A binary STL, written the way core/io/binaryStl.ts writes one. */
export function stl(triangles: readonly Tri[]): Uint8Array {
  const out = new Uint8Array(84 + 50 * triangles.length);
  for (let i = 0; i < TEXT.length; i++) out[i] = TEXT.charCodeAt(i);
  const view = new DataView(out.buffer);
  view.setUint32(80, triangles.length, true);
  triangles.forEach(([a, b, c], t) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const d = Math.max(Math.hypot(nx, ny, nz), 1e-30);
    const o = 84 + 50 * t;
    [nx / d, ny / d, nz / d, ...a, ...b, ...c].forEach((value, k) => view.setFloat32(o + k * 4, value, true));
  });
  return out;
}

/** A closed tetrahedron (vertices shared) plus one triangle whose vertices nothing else uses. */
export const TETRA_AND_LONE: readonly Tri[] = [
  [[0, 0, 0], [10, 10, 0], [10, 0, 0]],
  [[0, 0, 0], [10, 0, 0], [0, 0, 10]],
  [[10, 0, 0], [10, 10, 0], [0, 0, 10]],
  [[10, 10, 0], [0, 0, 0], [0, 0, 10]],
  [[0, 20, 30], [1, 20, 30], [0, 21, 30]],
];

/** Offset of a vertex coordinate in the file. */
export function at(triangle: number, vertex: number, axis: number): number {
  return 84 + 50 * triangle + 12 + 12 * vertex + 4 * axis;
}

/** Offset of a component of a stored normal. */
export function normalAt(triangle: number, axis: number): number {
  return 84 + 50 * triangle + 4 * axis;
}

export function copy(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(bytes);
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Moves the Float32 at `offset` by `steps` positions of its bit pattern. */
export function bump(bytes: Uint8Array, offset: number, steps = 1): Uint8Array {
  const out = copy(bytes);
  const view = viewOf(out);
  view.setUint32(offset, view.getUint32(offset, true) + steps, true);
  return out;
}

/** Flips the sign bit of the Float32 at `offset`. */
export function flipSign(bytes: Uint8Array, offset: number): Uint8Array {
  const out = copy(bytes);
  const view = viewOf(out);
  view.setUint32(offset, (view.getUint32(offset, true) ^ 0x80000000) >>> 0, true);
  return out;
}

export function setFloat(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  const out = copy(bytes);
  viewOf(out).setFloat32(offset, value, true);
  return out;
}

/** Bumps one coordinate of a vertex wherever that vertex occurs, so the topology stays. Returns the occurrences. */
export function bumpVertexEverywhere(bytes: Uint8Array, triangle: number, vertex: number, axis: number): { bytes: Uint8Array; occurrences: number } {
  const out = copy(bytes);
  const view = viewOf(out);
  const o = at(triangle, vertex, 0);
  const key = [view.getUint32(o, true), view.getUint32(o + 4, true), view.getUint32(o + 8, true)];
  const triangles = view.getUint32(80, true);
  let occurrences = 0;
  for (let t = 0; t < triangles; t++) {
    for (let v = 0; v < 3; v++) {
      const p = at(t, v, 0);
      if (view.getUint32(p, true) === key[0] && view.getUint32(p + 4, true) === key[1] && view.getUint32(p + 8, true) === key[2]) {
        view.setUint32(p + axis * 4, view.getUint32(p + axis * 4, true) + 1, true);
        occurrences++;
      }
    }
  }
  return { bytes: out, occurrences };
}

export function swapTriangles(bytes: Uint8Array, a: number, b: number): Uint8Array {
  const out = copy(bytes);
  const first = 84 + 50 * a;
  const second = 84 + 50 * b;
  out.set(bytes.subarray(second, second + 50), first);
  out.set(bytes.subarray(first, first + 50), second);
  return out;
}

/** Writes the `BSTL0002` header (flags, panels, 13 settings, digest over the rest). */
export function withBstlHeader(bytes: Uint8Array, settings: readonly number[] = Array.from({ length: 13 }, (_, i) => i + 0.5)): Uint8Array {
  const out = copy(bytes);
  out.fill(0, 0, 80);
  for (let i = 0; i < 8; i++) out[i] = 'BSTL0002'.charCodeAt(i);
  const view = viewOf(out);
  view.setUint8(8, 0);
  view.setUint8(9, 20);
  settings.forEach((value, i) => view.setFloat32(10 + i * 4, value, true));
  return resealBstl(out);
}

/** Recomputes the digest, as a correct writer would. */
export function resealBstl(bytes: Uint8Array): Uint8Array {
  const out = copy(bytes);
  const joined = new Uint8Array(62 + out.length - 80);
  joined.set(out.subarray(0, 62));
  joined.set(out.subarray(80), 62);
  const digest = sha256Hex(joined).slice(0, 32);
  for (let i = 0; i < 16; i++) out[62 + i] = parseInt(digest.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
