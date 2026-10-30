// Ported from mac/Sources/BalloonStudio/BalloonPreview.swift:108-154 (`replaceMesh`).
//
// Pure, no DOM and no Three.js: model-space mesh in, de-indexed Three.js attributes out.
// Three.js draws material groups as contiguous ranges of one vertex buffer, so triangles
// are written group by group, each group in triangle order, as Swift appends to `indices`.

import type { MeshBuffers } from '../core/types';

/** `SCNGeometry.materials` holds four materials: body, detail, accent, hardware. */
export const GROUP_COUNT = 4;

/** Below this model-y a triangle's centroid is cut away (BalloonPreview.swift:113). */
export const CUTAWAY_Y = -0.0001;

export interface DisplayOptions {
  /** Drop triangles behind the y = 0 plane. There is no capping: the inside shows. */
  cutaway?: boolean;
  /** One color group per triangle. Ignored unless the length matches the triangle count (:121). */
  faceColors?: ArrayLike<number> | undefined;
  /** One normal per corner: flat faces unless `smoothAngle` softens them. */
  sharpEdges?: boolean;
  /** Radians. With `sharpEdges`, faces closer than this share their area-weighted normal. */
  smoothAngle?: number;
  /** Model z. With `smoothAngle`, corners below it smooth over all their faces (basket relief). */
  smoothBelowHeight?: number | null | undefined;
}

export interface DisplayGroup {
  /** First vertex, as `BufferGeometry.addGroup` wants for a non-indexed geometry. */
  start: number;
  count: number;
  materialIndex: number;
}

export interface DisplayGeometry {
  /** x,y,z per corner, in Three.js coordinates. */
  positions: Float32Array;
  /** Unit normals per corner; (0,0,0) only on degenerate triangles. */
  normals: Float32Array;
  /** Always `GROUP_COUNT` entries in material order; empty groups have count 0. */
  groups: DisplayGroup[];
}

/**
 * `reuse`: a previous result. When the corner count is unchanged its arrays are overwritten
 * and returned, so the caller can mark existing GPU buffers dirty instead of replacing them.
 */
export function buildDisplayGeometry(
  mesh: Pick<MeshBuffers, 'positions' | 'indices'>,
  options: DisplayOptions = {},
  reuse?: DisplayGeometry | null,
): DisplayGeometry {
  const { positions, indices } = mesh;
  const { cutaway = false, faceColors, sharpEdges = false, smoothAngle = 0, smoothBelowHeight = null } = options;
  const triangles = indices.length / 3;
  const colored = faceColors !== undefined && faceColors.length === triangles;
  const smoothing = sharpEdges && smoothAngle > 0;

  // Pass 1: the kept triangles, their area-weighted normals and how the groups fill up.
  const groupOf = new Int8Array(triangles);
  const faceNormals = new Float64Array(triangles * 3);
  const vertexNormals = sharpEdges ? null : new Float64Array(positions.length);
  const groupCounts = new Array<number>(GROUP_COUNT).fill(0);
  const incidence = smoothing ? new Int32Array(positions.length / 3 + 1) : null;
  for (let i = 0; i < triangles; i++) {
    const a = indices[i * 3]! * 3;
    const b = indices[i * 3 + 1]! * 3;
    const c = indices[i * 3 + 2]! * 3;
    if (cutaway && (positions[a + 1]! + positions[b + 1]! + positions[c + 1]!) / 3 < CUTAWAY_Y) {
      groupOf[i] = -1;
      continue;
    }
    const group = colored ? faceColors[i]! : 0;
    // A Swift array index out of range traps; this is the same programming error.
    if (group < 0 || group >= GROUP_COUNT) throw new RangeError(`Face color ${group} of triangle ${i} is not a material group`);
    groupOf[i] = group;
    groupCounts[group]! += 1;
    const ux = positions[b]! - positions[a]!;
    const uy = positions[b + 1]! - positions[a + 1]!;
    const uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!;
    const vy = positions[c + 1]! - positions[a + 1]!;
    const vz = positions[c + 2]! - positions[a + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    faceNormals[i * 3] = nx;
    faceNormals[i * 3 + 1] = ny;
    faceNormals[i * 3 + 2] = nz;
    if (vertexNormals) {
      for (const corner of [a, b, c]) {
        vertexNormals[corner] = vertexNormals[corner]! + nx;
        vertexNormals[corner + 1] = vertexNormals[corner + 1]! + ny;
        vertexNormals[corner + 2] = vertexNormals[corner + 2]! + nz;
      }
    }
    if (incidence) for (const corner of [a, b, c]) incidence[corner / 3 + 1]! += 1;
  }

  // `incident` (:110): the faces around each vertex, packed instead of one array per vertex.
  let incidentFaces: Int32Array | null = null;
  if (incidence) {
    for (let v = 1; v < incidence.length; v++) incidence[v]! += incidence[v - 1]!;
    incidentFaces = new Int32Array(incidence[incidence.length - 1]!);
    const fill = incidence.slice(0, -1);
    for (let i = 0; i < triangles; i++) {
      if (groupOf[i] === -1) continue;
      for (let corner = 0; corner < 3; corner++) incidentFaces[fill[indices[i * 3 + corner]!]!++] = i;
    }
  }

  const kept = groupCounts.reduce((sum, count) => sum + count, 0);
  const corners = kept * 3;
  const reusable = reuse?.positions.length === corners * 3 && reuse.normals.length === corners * 3;
  const out: Float32Array = reusable ? reuse.positions : new Float32Array(corners * 3);
  const outNormals: Float32Array = reusable ? reuse.normals : new Float32Array(corners * 3);

  const groups: DisplayGroup[] = [];
  const cursor = new Array<number>(GROUP_COUNT).fill(0);
  let start = 0;
  for (let materialIndex = 0; materialIndex < GROUP_COUNT; materialIndex++) {
    const count = groupCounts[materialIndex]! * 3;
    groups.push({ start, count, materialIndex });
    cursor[materialIndex] = start * 3;
    start += count;
  }

  // Pass 2: write the corners. The mapping (x,y,z) → (x,z,−y) is a rotation (:123), so the
  // winding stays counter-clockwise seen from outside.
  const cosSmooth = Math.cos(smoothAngle);
  for (let i = 0; i < triangles; i++) {
    const group = groupOf[i]!;
    if (group === -1) continue;
    const fx = faceNormals[i * 3]!;
    const fy = faceNormals[i * 3 + 1]!;
    const fz = faceNormals[i * 3 + 2]!;
    const fd = Math.max(Math.hypot(fx, fy, fz), 1e-30);
    for (let corner = 0; corner < 3; corner++) {
      const vertex = indices[i * 3 + corner]!;
      const p = vertex * 3;
      const x = positions[p]!;
      const y = positions[p + 1]!;
      const z = positions[p + 2]!;
      let nx: number;
      let ny: number;
      let nz: number;
      if (vertexNormals) {
        nx = vertexNormals[p]!;
        ny = vertexNormals[p + 1]!;
        nz = vertexNormals[p + 2]!;
      } else if (incidentFaces && incidence) {
        // :139-142 Keep mechanical rims crisp, but let sculpted surfaces read as round.
        const continuous = smoothBelowHeight !== null && z < smoothBelowHeight;
        nx = ny = nz = 0;
        for (let k = incidence[vertex]!; k < incidence[vertex + 1]!; k++) {
          const face = incidentFaces[k]! * 3;
          const ax = faceNormals[face]!;
          const ay = faceNormals[face + 1]!;
          const az = faceNormals[face + 2]!;
          const ad = Math.max(Math.hypot(ax, ay, az), 1e-30);
          if (continuous || (ax * fx + ay * fy + az * fz) / (ad * fd) >= cosSmooth) {
            nx += ax;
            ny += ay;
            nz += az;
          }
        }
      } else {
        nx = fx;
        ny = fy;
        nz = fz;
      }
      const d = Math.max(Math.hypot(nx, ny, nz), 1e-30);
      const at = cursor[group]!;
      out[at] = x;
      out[at + 1] = z;
      out[at + 2] = -y;
      outNormals[at] = nx / d;
      outNormals[at + 1] = nz / d;
      outNormals[at + 2] = -ny / d;
      cursor[group] = at + 3;
    }
  }
  return { positions: out, normals: outNormals, groups };
}
