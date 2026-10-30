// Compares two 3D/3dmodel.model files whose refinement differs in a few edges (WP-K3). The harness compares
// line by line, so one extra midpoint renumbers every vertex after it and the file is a `mismatch`. This
// matches vertices by position instead and says how much of the mesh really differs.
import { BalloonMesh } from '../../src/core/geometry/mesh';
import { IntKey3Map } from '../../src/core/geometry/weld';

interface ParsedModel {
  /** x, y, z per vertex */
  vertices: Float64Array;
  /** a, b, c, color per triangle */
  triangles: Int32Array;
}

const VERTEX = /<vertex x="([^"]*)" y="([^"]*)" z="([^"]*)"\/>/g;
const TRIANGLE = /<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)" pid="2" p1="(\d)"/g;

function parseModel(bytes: Uint8Array): ParsedModel {
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');
  const coordinates: number[] = [];
  for (let m = VERTEX.exec(text); m !== null; m = VERTEX.exec(text)) coordinates.push(Number(m[1]), Number(m[2]), Number(m[3]));
  const corners: number[] = [];
  for (let m = TRIANGLE.exec(text); m !== null; m = TRIANGLE.exec(text)) corners.push(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]));
  return { vertices: Float64Array.from(coordinates), triangles: Int32Array.from(corners) };
}

function toMesh(model: ParsedModel): BalloonMesh {
  const vertices = [];
  for (let i = 0; i < model.vertices.length; i += 3) vertices.push({ x: model.vertices[i] as number, y: model.vertices[i + 1] as number, z: model.vertices[i + 2] as number });
  const triangles = [];
  for (let i = 0; i < model.triangles.length; i += 4) triangles.push({ a: model.triangles[i] as number, b: model.triangles[i + 1] as number, c: model.triangles[i + 2] as number });
  return new BalloonMesh(vertices, triangles, 0);
}

function signedVolume(model: ParsedModel): number {
  const { vertices: v, triangles: t } = model;
  let volume = 0;
  for (let i = 0; i < t.length; i += 4) {
    const a = 3 * (t[i] as number);
    const b = 3 * (t[i + 1] as number);
    const c = 3 * (t[i + 2] as number);
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
  }
  return volume;
}

export interface RefinementFlipReport {
  vertices: readonly [ts: number, reference: number];
  triangles: readonly [ts: number, reference: number];
  /** Vertices without a partner on the other side. */
  verticesOnlyTs: number;
  verticesOnlyReference: number;
  /** Triangles (with their color) without a partner on the other side. */
  trianglesOnlyTs: number;
  trianglesOnlyReference: number;
  /** Largest distance between matched vertices, mm. */
  maxDistance: number;
  /** Relative volume difference. */
  volumeDifference: number;
}

const CELL = 1e-5; // mm: far below the smallest edge of a refined relief (about 0.03 mm), far above rounding noise.

/** Both models must be closed; throws a MeshError otherwise. */
export function compareRefinedModels(reference: Uint8Array, ts: Uint8Array): RefinementFlipReport {
  const ref = parseModel(reference);
  const own = parseModel(ts);
  toMesh(ref).validate();
  toMesh(own).validate();
  const refCount = ref.vertices.length / 3;
  const ownCount = own.vertices.length / 3;
  // Each reference vertex in a cell, chained; a TS vertex looks in its cell and all neighbors.
  const cells = new IntKey3Map(refCount);
  const next = new Int32Array(refCount);
  const cellOf = (v: number): number => Math.round(v / CELL);
  for (let i = 0; i < refCount; i++) {
    const x = cellOf(ref.vertices[3 * i] as number);
    const y = cellOf(ref.vertices[3 * i + 1] as number);
    const z = cellOf(ref.vertices[3 * i + 2] as number);
    next[i] = cells.has(x, y, z) ? cells.get(x, y, z) : -1;
    cells.set(x, y, z, i);
  }
  const partner = new Int32Array(ownCount).fill(-1);
  const taken = new Uint8Array(refCount);
  let maxDistance = 0;
  for (let i = 0; i < ownCount; i++) {
    const px = own.vertices[3 * i] as number;
    const py = own.vertices[3 * i + 1] as number;
    const pz = own.vertices[3 * i + 2] as number;
    const x = cellOf(px);
    const y = cellOf(py);
    const z = cellOf(pz);
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (!cells.has(x + dx, y + dy, z + dz)) continue;
          for (let j = cells.get(x + dx, y + dy, z + dz); j >= 0; j = next[j] as number) {
            if (taken[j] === 1) continue;
            const ex = (ref.vertices[3 * j] as number) - px;
            const ey = (ref.vertices[3 * j + 1] as number) - py;
            const ez = (ref.vertices[3 * j + 2] as number) - pz;
            const distance = Math.sqrt(ex * ex + ey * ey + ez * ez);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = j;
            }
          }
        }
      }
    }
    if (best >= 0) {
      partner[i] = best;
      taken[best] = 1;
      if (bestDistance > maxDistance) maxDistance = bestDistance;
    }
  }
  const verticesOnlyTs = partner.reduce((sum, p) => sum + (p < 0 ? 1 : 0), 0);
  const verticesOnlyReference = refCount - (ownCount - verticesOnlyTs);
  // Triangles in the reference's numbering, smallest index first, with their color.
  const canonical = (a: number, b: number, c: number): [number, number, number] => (a < b && a < c ? [a, b, c] : b < c ? [b, c, a] : [c, a, b]);
  const refTriangles = new IntKey3Map(ref.triangles.length / 4);
  for (let i = 0; i < ref.triangles.length; i += 4) {
    const [a, b, c] = canonical(ref.triangles[i] as number, ref.triangles[i + 1] as number, ref.triangles[i + 2] as number);
    refTriangles.set(a, b, c, (ref.triangles[i + 3] as number) + 1);
  }
  let shared = 0;
  for (let i = 0; i < own.triangles.length; i += 4) {
    const pa = partner[own.triangles[i] as number] as number;
    const pb = partner[own.triangles[i + 1] as number] as number;
    const pc = partner[own.triangles[i + 2] as number] as number;
    if (pa < 0 || pb < 0 || pc < 0) continue;
    const [a, b, c] = canonical(pa, pb, pc);
    if (refTriangles.has(a, b, c) && refTriangles.get(a, b, c) === (own.triangles[i + 3] as number) + 1) shared++;
  }
  const refVolume = signedVolume(ref);
  return {
    vertices: [ownCount, refCount],
    triangles: [own.triangles.length / 4, ref.triangles.length / 4],
    verticesOnlyTs,
    verticesOnlyReference,
    trianglesOnlyTs: own.triangles.length / 4 - shared,
    trianglesOnlyReference: ref.triangles.length / 4 - shared,
    maxDistance,
    volumeDifference: Math.abs(signedVolume(own) - refVolume) / Math.abs(refVolume),
  };
}
