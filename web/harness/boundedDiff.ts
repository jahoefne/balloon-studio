// The verdict `equivalent-bounded` (docs/plan.md §15): a tie flip that changes a mesh a little,
// so that the vertex sets differ and `equivalent` cannot hold. Two valid meshes are paired and
// measured; what is allowed is stated per entry in equivalentCases.ts.
import { BalloonMesh, MeshError } from '../src/core/geometry/mesh';
import type { Point3, Triangle } from '../src/core/geometry/point3';
import { IntKey3Map } from '../src/core/geometry/weld';
import { NEAR_ZERO_MM, relativeDifference } from './solidDiff';

/** Upper limits, all inclusive. Counts are over both meshes together. */
export interface BoundedLimits {
  /** |triangles(TS) - triangles(reference)|. */
  triangleCountDifference: number;
  /** Vertices without a partner of the same Float32 bits (after the near-zero rule) on the other side. */
  verticesWithoutPartner: number;
  /** Triangles (with their color or attribute) without a partner on the other side. */
  trianglesWithoutPartner: number;
  /** Largest distance between paired vertices, mm. */
  maxDistance: number;
  /** Relative difference of the signed volume. */
  volume: number;
  /** Relative difference of the surface area. */
  area: number;
}

export type BoundedMeasures = BoundedLimits;

export interface BoundedMesh {
  /** x, y, z per vertex. */
  positions: Float64Array;
  /** a, b, c per triangle. */
  triangles: Uint32Array;
  /** One value per triangle: its color in a model, its attribute bytes in an STL. */
  colors: Int32Array;
}

const LIMIT_NAMES: Record<keyof BoundedLimits, string> = {
  triangleCountDifference: 'triangle count difference',
  verticesWithoutPartner: 'vertices without a partner',
  trianglesWithoutPartner: 'triangles without a partner',
  maxDistance: 'largest distance of paired vertices',
  volume: 'relative volume difference',
  area: 'relative area difference',
};

/**
 * Vertices without an exact partner are paired once more if one lies within this many times the
 * limit, so that a vertex that moved a little counts as moved (in `maxDistance`) and an added
 * midpoint does not: the fronts have vertices of a flipped edge 0.097 mm apart, which did not move.
 */
const MOVED_SEARCH = 2;
const MOVED_SEARCH_CAP = 20_000;

function validationProblem(mesh: BoundedMesh): string | null {
  const vertices: Point3[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) vertices.push({ x: mesh.positions[i] as number, y: mesh.positions[i + 1] as number, z: mesh.positions[i + 2] as number });
  const triangles: Triangle[] = [];
  for (let i = 0; i < mesh.triangles.length; i += 3) triangles.push({ a: mesh.triangles[i] as number, b: mesh.triangles[i + 1] as number, c: mesh.triangles[i + 2] as number });
  try {
    new BalloonMesh(vertices, triangles, 0).validate();
    return null;
  } catch (error) {
    if (error instanceof MeshError) return error.message;
    throw error;
  }
}

function size(mesh: BoundedMesh): { volume: number; area: number } {
  const v = mesh.positions;
  const t = mesh.triangles;
  let volume = 0;
  let area = 0;
  for (let i = 0; i < t.length; i += 3) {
    const a = (t[i] as number) * 3;
    const b = (t[i + 1] as number) * 3;
    const c = (t[i + 2] as number) * 3;
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

const f32 = new Float32Array(1);
const f32Bits = new Uint32Array(f32.buffer);

/** Float32 bits of a coordinate after the near-zero rule; both zeros are one key. */
function coordinateKey(value: number): number {
  if (Math.abs(value) < NEAR_ZERO_MM) return 0;
  f32[0] = value;
  return f32Bits[0] as number;
}

function distance(a: Float64Array, i: number, b: Float64Array, j: number): number {
  const dx = (a[i * 3] as number) - (b[j * 3] as number);
  const dy = (a[i * 3 + 1] as number) - (b[j * 3 + 1] as number);
  const dz = (a[i * 3 + 2] as number) - (b[j * 3 + 2] as number);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Partner in the reference per TS vertex (or -1), and the numbers that come out of the pairing. */
function pair(reference: Float64Array, own: Float64Array, movedRadius: number): { partner: Int32Array; withoutPartner: number; maxDistance: number } {
  const referenceCount = reference.length / 3;
  const ownCount = own.length / 3;
  const lookup = new IntKey3Map(referenceCount);
  const next = new Int32Array(referenceCount);
  for (let i = 0; i < referenceCount; i++) {
    const x = coordinateKey(reference[i * 3] as number);
    const y = coordinateKey(reference[i * 3 + 1] as number);
    const z = coordinateKey(reference[i * 3 + 2] as number);
    const head = lookup.get(x, y, z);
    next[i] = head;
    lookup.set(x, y, z, i);
  }
  const partner = new Int32Array(ownCount).fill(-1);
  const taken = new Uint8Array(referenceCount);
  let maxDistance = 0;
  let paired = 0;
  for (let i = 0; i < ownCount; i++) {
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    const head = lookup.get(coordinateKey(own[i * 3] as number), coordinateKey(own[i * 3 + 1] as number), coordinateKey(own[i * 3 + 2] as number));
    for (let j = head; j >= 0; j = next[j] as number) {
      if (taken[j] === 1) continue;
      const d = distance(reference, j, own, i);
      if (d < bestDistance) {
        bestDistance = d;
        best = j;
      }
    }
    if (best >= 0) {
      partner[i] = best;
      taken[best] = 1;
      paired++;
      if (bestDistance > maxDistance) maxDistance = bestDistance;
    }
  }
  const withoutPartner = ownCount - paired + (referenceCount - paired);
  // Few by now, or the limit on them fails anyway: then a quadratic search would be wasted.
  if (withoutPartner <= MOVED_SEARCH_CAP) {
    const free: number[] = [];
    for (let j = 0; j < referenceCount; j++) if (taken[j] === 0) free.push(j);
    for (let i = 0; i < ownCount; i++) {
      if (partner[i] !== -1) continue;
      let best = -1;
      let bestDistance = movedRadius;
      for (const j of free) {
        if (taken[j] === 1) continue;
        const d = distance(reference, j, own, i);
        if (d <= bestDistance) {
          bestDistance = d;
          best = j;
        }
      }
      if (best >= 0) {
        partner[i] = best;
        taken[best] = 1;
        if (bestDistance > maxDistance) maxDistance = bestDistance;
      }
    }
  }
  return { partner, withoutPartner, maxDistance };
}


/** Triangles in the reference's numbering, turned so the smallest index comes first; the color goes with them. */
function trianglesWithoutPartner(reference: BoundedMesh, own: BoundedMesh, partner: Int32Array): number {
  const canonical = (a: number, b: number, c: number): [number, number, number] => (a < b && a < c ? [a, b, c] : b < c ? [b, c, a] : [c, a, b]);
  const referenceCount = reference.triangles.length / 3;
  const ownCount = own.triangles.length / 3;
  const lookup = new IntKey3Map(referenceCount);
  for (let i = 0; i < referenceCount; i++) {
    const [a, b, c] = canonical(reference.triangles[i * 3] as number, reference.triangles[i * 3 + 1] as number, reference.triangles[i * 3 + 2] as number);
    lookup.set(a, b, c, reference.colors[i] as number);
  }
  let shared = 0;
  for (let i = 0; i < ownCount; i++) {
    const pa = partner[own.triangles[i * 3] as number] as number;
    const pb = partner[own.triangles[i * 3 + 1] as number] as number;
    const pc = partner[own.triangles[i * 3 + 2] as number] as number;
    if (pa < 0 || pb < 0 || pc < 0) continue;
    const [a, b, c] = canonical(pa, pb, pc);
    if (lookup.has(a, b, c) && lookup.get(a, b, c) === own.colors[i]) shared++;
  }
  return ownCount - shared + (referenceCount - shared);
}

export type BoundedCheck = { invalid: string } | { invalid: null; measures: BoundedMeasures; exceeded: string[] };

/** Rules (1) and (2) of plan §15. */
export function checkBounds(reference: BoundedMesh, own: BoundedMesh, limits: BoundedLimits): BoundedCheck {
  const referenceProblem = validationProblem(reference);
  if (referenceProblem !== null) return { invalid: `reference mesh is invalid: ${referenceProblem}` };
  const ownProblem = validationProblem(own);
  if (ownProblem !== null) return { invalid: `TS mesh is invalid: ${ownProblem}` };
  const { partner, withoutPartner, maxDistance } = pair(reference.positions, own.positions, limits.maxDistance * MOVED_SEARCH);
  const referenceSize = size(reference);
  const ownSize = size(own);
  const measures: BoundedMeasures = {
    triangleCountDifference: Math.abs(own.triangles.length - reference.triangles.length) / 3,
    verticesWithoutPartner: withoutPartner,
    trianglesWithoutPartner: trianglesWithoutPartner(reference, own, partner),
    maxDistance,
    volume: relativeDifference(referenceSize.volume, ownSize.volume),
    area: relativeDifference(referenceSize.area, ownSize.area),
  };
  const exceeded = (Object.keys(LIMIT_NAMES) as (keyof BoundedLimits)[])
    .filter((name) => !(measures[name] <= limits[name]))
    .map((name) => `${LIMIT_NAMES[name]} ${measures[name]} over the limit of ${limits[name]}`);
  return { invalid: null, measures, exceeded };
}

export function describeMeasures(measures: BoundedMeasures): string {
  return `${measures.verticesWithoutPartner} vertices and ${measures.trianglesWithoutPartner} triangles without a partner, ${measures.triangleCountDifference} triangles more or fewer, paired vertices up to ${measures.maxDistance} mm apart, volume ${measures.volume} and area ${measures.area} relative`;
}
