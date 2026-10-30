// The corner rule and the `equivalent` check (docs/plan.md §14): two STLs whose triangles differ
// but which describe the same solid. Rounding noise can flip a tie in the generator, and a fan
// then starts one step later: same vertices, same body, other bytes.
import { BalloonMesh, MeshError } from '../src/core/geometry/mesh';
import type { Point3, Triangle } from '../src/core/geometry/point3';
import { IntKey3Map } from '../src/core/geometry/weld';

/**
 * Both values of a coordinate below this (mm) count as equal: a value that should be exactly 0
 * comes out as ±1e-14 with one libm and 0 with the other, which is no distance in Float32 steps.
 * Two exact zeros of opposite sign stay an error; they do not come from rounding noise.
 */
export const NEAR_ZERO_MM = 1e-9;
/** Signed volume and surface area of an `equivalent` pair, relative. */
export const SOLID_TOLERANCE = 1e-9;

const HEADER_BYTES = 80;
const RECORD_BYTES = 50;
const SIGN_BIT = 0x80000000;

/** Float32 bit pattern as a position on the number line: neighbours differ by 1, both zeros are 0. */
export function ordinal(bits: number): number {
  return bits >= SIGN_BIT ? -(bits - SIGN_BIT) : bits;
}

function isNonFinite(bits: number): boolean {
  return (bits & 0x7f800000) === 0x7f800000;
}

export type CornerClass = 'equal' | 'signed zero' | 'near zero' | 'ulp' | 'far';

/** One coordinate of a corner, reference against TS, by its bit patterns and values. */
export function classifyCoordinate(eBits: number, aBits: number, eValue: number, aValue: number): CornerClass {
  if (eBits === aBits) return 'equal';
  const distance = Math.abs(ordinal(eBits) - ordinal(aBits));
  if (distance === 0) return 'signed zero';
  if (Math.abs(aValue) < NEAR_ZERO_MM && Math.abs(eValue) < NEAR_ZERO_MM) return 'near zero';
  // Neighbours of opposite sign exist only around 0, which the line above takes.
  return distance === 1 && !isNonFinite(eBits) && !isNonFinite(aBits) ? 'ulp' : 'far';
}

export interface Welded {
  /** Three unique-vertex indices per triangle. */
  indices: Uint32Array;
  /** The bit patterns of the unique vertices, three per vertex, in first-seen order. */
  bits: Uint32Array;
}

/** Exact-bit weld in first-seen order; +0 and -0 stay distinct, as in `parseSTL`. */
export function weld(data: DataView, triangles: number): Welded {
  const lookup = new IntKey3Map(triangles);
  const indices = new Uint32Array(triangles * 3);
  const bits = new Uint32Array(triangles * 9);
  let next = 0;
  for (let i = 0; i < triangles; i++) {
    const start = HEADER_BYTES + 4 + RECORD_BYTES * i + 12;
    for (let j = 0; j < 3; j++) {
      const o = start + j * 12;
      const x = data.getUint32(o, true);
      const y = data.getUint32(o + 4, true);
      const z = data.getUint32(o + 8, true);
      let index = lookup.get(x, y, z);
      if (index < 0) {
        index = next;
        lookup.set(x, y, z, index);
        bits[next * 3] = x;
        bits[next * 3 + 1] = y;
        bits[next * 3 + 2] = z;
        next++;
      }
      indices[i * 3 + j] = index;
    }
  }
  return { indices, bits: bits.subarray(0, next * 3) };
}

function floats(bits: Uint32Array): Float32Array {
  return new Float32Array(bits.buffer, bits.byteOffset, bits.length);
}

/** Vertex order for the pairwise comparison, with near-zero noise sorted as 0. */
function sortedVertices(values: Float32Array): Uint32Array {
  const key = (v: number): number => (Math.abs(v) < NEAR_ZERO_MM ? 0 : v);
  const order = Uint32Array.from({ length: values.length / 3 }, (_, i) => i);
  return order.sort((p, q) => {
    for (let axis = 0; axis < 3; axis++) {
      const difference = key(values[p * 3 + axis] as number) - key(values[q * 3 + axis] as number);
      if (difference !== 0) return difference;
    }
    return 0;
  });
}

function validationProblem(welded: Welded): string | null {
  const values = floats(welded.bits);
  const vertices: Point3[] = [];
  for (let i = 0; i < values.length; i += 3) vertices.push({ x: values[i] as number, y: values[i + 1] as number, z: values[i + 2] as number });
  const triangles: Triangle[] = [];
  for (let i = 0; i < welded.indices.length; i += 3) triangles.push({ a: welded.indices[i] as number, b: welded.indices[i + 1] as number, c: welded.indices[i + 2] as number });
  try {
    new BalloonMesh(vertices, triangles, 0).validate();
    return null;
  } catch (error) {
    if (error instanceof MeshError) return error.message;
    throw error;
  }
}

/** Signed volume and surface area, from the stored Float32 vertices. */
function measure(welded: Welded): { volume: number; area: number } {
  const v = floats(welded.bits);
  let volume = 0;
  let area = 0;
  for (let t = 0; t < welded.indices.length; t += 3) {
    const a = (welded.indices[t] as number) * 3;
    const b = (welded.indices[t + 1] as number) * 3;
    const c = (welded.indices[t + 2] as number) * 3;
    const ax = v[a] as number;
    const ay = v[a + 1] as number;
    const az = v[a + 2] as number;
    const bx = v[b] as number;
    const by = v[b + 1] as number;
    const bz = v[b + 2] as number;
    const cx = v[c] as number;
    const cy = v[c + 1] as number;
    const cz = v[c + 2] as number;
    volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const wx = cx - ax;
    const wy = cy - ay;
    const wz = cz - az;
    area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }
  return { volume, area };
}

export function relativeDifference(a: number, b: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale === 0 ? 0 : Math.abs(a - b) / scale;
}

/** Triangles whose corners break the corner rule at the same position in the file. */
function countDifferingTriangles(e: DataView, a: DataView, triangles: number): number {
  let count = 0;
  for (let i = 0; i < triangles; i++) {
    const o = HEADER_BYTES + 4 + RECORD_BYTES * i;
    for (let k = 12; k < 48; k += 4) {
      const kind = classifyCoordinate(e.getUint32(o + k, true), a.getUint32(o + k, true), e.getFloat32(o + k, true), a.getFloat32(o + k, true));
      if (kind === 'far' || kind === 'signed zero') {
        count++;
        break;
      }
    }
  }
  return count;
}

export type SolidCheck =
  | { same: true; differingTriangles: number; ulpCount: number; nearZeroCorners: number; volumes: [number, number]; areas: [number, number] }
  | { same: false; problem: string };

/**
 * Rules (2) to (5) of plan §14, for two well-formed STLs with the same triangle count: the unique
 * vertices agree pairwise after a lexicographic sort, both meshes pass `validate`, and signed
 * volume and surface area agree. Rule (1) is up to the caller.
 */
export function solidEquivalence(e: DataView, a: DataView, triangles: number): SolidCheck {
  const expected = weld(e, triangles);
  const actual = weld(a, triangles);
  if (expected.bits.length !== actual.bits.length) {
    return { same: false, problem: `${actual.bits.length / 3} unique vertices, reference has ${expected.bits.length / 3}` };
  }
  const eValues = floats(expected.bits);
  const aValues = floats(actual.bits);
  const eOrder = sortedVertices(eValues);
  const aOrder = sortedVertices(aValues);
  let ulpCount = 0;
  let nearZeroCorners = 0;
  for (let i = 0; i < eOrder.length; i++) {
    const p = (eOrder[i] as number) * 3;
    const q = (aOrder[i] as number) * 3;
    for (let axis = 0; axis < 3; axis++) {
      const kind = classifyCoordinate(expected.bits[p + axis] as number, actual.bits[q + axis] as number, eValues[p + axis] as number, aValues[q + axis] as number);
      if (kind === 'ulp') ulpCount++;
      else if (kind === 'near zero') nearZeroCorners++;
      else if (kind !== 'equal') {
        return {
          same: false,
          problem: `sorted vertex ${i} differs (${kind}): (${aValues[q]}, ${aValues[q + 1]}, ${aValues[q + 2]}) vs (${eValues[p]}, ${eValues[p + 1]}, ${eValues[p + 2]})`,
        };
      }
    }
  }
  const eInvalid = validationProblem(expected);
  if (eInvalid !== null) return { same: false, problem: `reference mesh is invalid: ${eInvalid}` };
  const aInvalid = validationProblem(actual);
  if (aInvalid !== null) return { same: false, problem: `TS mesh is invalid: ${aInvalid}` };
  const eSize = measure(expected);
  const aSize = measure(actual);
  if (relativeDifference(eSize.volume, aSize.volume) > SOLID_TOLERANCE) return { same: false, problem: `signed volume ${aSize.volume} vs ${eSize.volume}` };
  if (relativeDifference(eSize.area, aSize.area) > SOLID_TOLERANCE) return { same: false, problem: `surface area ${aSize.area} vs ${eSize.area}` };
  return {
    same: true,
    differingTriangles: countDifferingTriangles(e, a, triangles),
    ulpCount,
    nearZeroCorners,
    volumes: [aSize.volume, eSize.volume],
    areas: [aSize.area, eSize.area],
  };
}
