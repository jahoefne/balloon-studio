// STL comparison (docs/plan.md, WP-V2): same triangle count and order, every vertex coordinate
// equal or one Float32 step apart, attributes equal, same welded topology, consistent normals
// and a consistent BSTL0002 header.
//
// Normals deviate from the plan on measured grounds. The writer (core/io/binaryStl.ts, like
// Swift's binarySTL) computes a normal from the Float64 vertices and only then rounds both to
// Float32, so recomputing it from the stored Float32 vertices cannot reproduce it bit for bit:
// across all 14.2 million triangles of refs-v1 that holds for 42 %. The worst deviation was
// 1 - dot < 1e-5, hence WRITER_NORMAL_DOT.
import { sha256Hex } from './refs';
import type { StlFacts } from './manifest';
import { NoteList, mismatch, type DiffResult } from './result';
import { NEAR_ZERO_MM, classifyCoordinate, ordinal, solidEquivalence, weld } from './solidDiff';

/** Stored normal against the normal of the stored vertices (writer check, both files). */
export const WRITER_NORMAL_DOT = 1 - 1e-4;
/** TS normal against Swift normal. */
export const NORMAL_DOT = 1 - 1e-6;
/** Below this smallest angle a triangle is a sliver: a failed normal check is reported, not fatal. */
export const SLIVER_DEGREES = 1;

const HEADER_BYTES = 80;
const RECORD_BYTES = 50;
const BSTL_SIGNED_BYTES = 62;
const BSTL_DIGEST_END = 78;
const AXES = ['x', 'y', 'z'] as const;

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Null when the bytes are a well-formed binary STL, else what is wrong. */
function formatProblem(bytes: Uint8Array): string | null {
  if (bytes.length < HEADER_BYTES + 4) return `only ${bytes.length} bytes`;
  const count = view(bytes).getUint32(HEADER_BYTES, true);
  const expected = HEADER_BYTES + 4 + RECORD_BYTES * count;
  return bytes.length === expected ? null : `${bytes.length} bytes, but ${count} triangles need ${expected}`;
}

const SIGN_BIT = 0x80000000;

/** dot(normal of the stored vertices, stored normal); null for a triangle without area. */
function writerDot(data: DataView, o: number): number | null {
  const ax = data.getFloat32(o + 12, true);
  const ay = data.getFloat32(o + 16, true);
  const az = data.getFloat32(o + 20, true);
  const ux = data.getFloat32(o + 24, true) - ax;
  const uy = data.getFloat32(o + 28, true) - ay;
  const uz = data.getFloat32(o + 32, true) - az;
  const vx = data.getFloat32(o + 36, true) - ax;
  const vy = data.getFloat32(o + 40, true) - ay;
  const vz = data.getFloat32(o + 44, true) - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (!(length > 0)) return null;
  return (nx * data.getFloat32(o, true) + ny * data.getFloat32(o + 4, true) + nz * data.getFloat32(o + 8, true)) / length;
}

/** Smallest angle of a stored triangle in degrees: opposite its shortest edge. */
function minimumAngle(data: DataView, o: number): number {
  const point = (k: number): [number, number, number] => [data.getFloat32(o + k, true), data.getFloat32(o + k + 4, true), data.getFloat32(o + k + 8, true)];
  const a = point(12);
  const b = point(24);
  const c = point(36);
  const edge = (p: number[], q: number[]): number => Math.hypot((p[0] ?? 0) - (q[0] ?? 0), (p[1] ?? 0) - (q[1] ?? 0), (p[2] ?? 0) - (q[2] ?? 0));
  const [, long1, long2] = [edge(a, b), edge(b, c), edge(c, a)].sort((p, q) => p - q) as [number, number, number];
  if (!(long1 > 0 && long2 > 0)) return 0;
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  return (Math.asin(Math.min(1, area2 / (long1 * long2))) * 180) / Math.PI;
}

function equalRange(a: Uint8Array, b: Uint8Array, start: number, end: number): boolean {
  for (let i = start; i < end; i++) if (a[i] !== b[i]) return false;
  return true;
}

function startsWithBstl(bytes: Uint8Array): boolean {
  return String.fromCharCode(...bytes.subarray(0, 7)) === 'BSTL000';
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function digestProblem(bytes: Uint8Array): boolean {
  // sha256(header[0..<62] ‖ data from byte 80)[0..<16]
  const joined = new Uint8Array(BSTL_SIGNED_BYTES + bytes.length - HEADER_BYTES);
  joined.set(bytes.subarray(0, BSTL_SIGNED_BYTES));
  joined.set(bytes.subarray(HEADER_BYTES), BSTL_SIGNED_BYTES);
  return sha256Hex(joined).slice(0, 32) !== hex(bytes.subarray(BSTL_SIGNED_BYTES, BSTL_DIGEST_END));
}

/** Header rules; `bodyDiffers` = the bytes from 80 on differ. */
function headerProblems(expected: Uint8Array, actual: Uint8Array, bodyDiffers: boolean, tags: string[], notes: NoteList): void {
  if (!startsWithBstl(expected) && !startsWithBstl(actual)) {
    if (!equalRange(expected, actual, 0, HEADER_BYTES)) {
      tags.push('header');
      notes.add(`STL header differs: ${hex(expected.subarray(0, HEADER_BYTES))} vs ${hex(actual.subarray(0, HEADER_BYTES))}`);
    }
    return;
  }
  if (!equalRange(expected, actual, 0, BSTL_SIGNED_BYTES) || !equalRange(expected, actual, BSTL_DIGEST_END, HEADER_BYTES)) {
    tags.push('header');
    notes.add(`BSTL header differs (signature, flags, panels or settings): ${hex(expected.subarray(0, BSTL_SIGNED_BYTES))} vs ${hex(actual.subarray(0, BSTL_SIGNED_BYTES))}`);
  }
  if (digestProblem(actual)) {
    tags.push('digest');
    notes.add('BSTL digest of the TS file does not match its own header and body');
  }
  const digestDiffers = !equalRange(expected, actual, BSTL_SIGNED_BYTES, BSTL_DIGEST_END);
  if (digestDiffers !== bodyDiffers) {
    if (!tags.includes('digest')) tags.push('digest');
    notes.add(bodyDiffers ? 'BSTL digest is unchanged although the body differs' : 'BSTL digest differs although the body is identical');
  }
}

/** `allowEquivalent`: this STL is on the allowlist, so the same solid in other triangles may pass as `equivalent`. */
export function diffStl(expected: Uint8Array, actual: Uint8Array, allowEquivalent = false): DiffResult {
  const referenceProblem = formatProblem(expected);
  if (referenceProblem !== null) throw new Error(`The reference is not a binary STL: ${referenceProblem}`);
  const actualProblem = formatProblem(actual);
  if (actualProblem !== null) return mismatch('stl format', `Not a binary STL: ${actualProblem}`);
  const e = view(expected);
  const a = view(actual);
  const triangles = e.getUint32(HEADER_BYTES, true);
  const actualTriangles = a.getUint32(HEADER_BYTES, true);
  if (triangles !== actualTriangles) return mismatch('triangle count', `${actualTriangles} triangles, reference has ${triangles}`);

  const notes = new NoteList();
  let ulpCount = 0;
  let nearZeroCorners = 0;
  let far = 0;
  let signedZeros = 0;
  let maxUlp = 0;
  let attributes = 0;
  let normalDiffs = 0;
  let badNormals = 0;
  let sliverNormals = 0;
  let minimumDot = 1;
  let maxNormalUlp = 0;
  for (let i = 0; i < triangles; i++) {
    const o = HEADER_BYTES + 4 + RECORD_BYTES * i;
    let normalDiffers = false;
    for (let k = 0; k < 48; k += 4) {
      const eb = e.getUint32(o + k, true);
      const ab = a.getUint32(o + k, true);
      if (eb === ab) continue;
      const distance = Math.abs(ordinal(eb) - ordinal(ab));
      if (k < 12) {
        normalDiffers = true;
        if (distance > maxNormalUlp) maxNormalUlp = distance;
        continue;
      }
      const kind = classifyCoordinate(eb, ab, e.getFloat32(o + k, true), a.getFloat32(o + k, true));
      if (kind === 'near zero') {
        nearZeroCorners++;
      } else if (kind === 'ulp') {
        ulpCount++;
        if (maxUlp < 1) maxUlp = 1;
      } else {
        const where = `triangle ${i} vertex ${Math.floor((k - 12) / 12)} ${AXES[((k - 12) / 4) % 3]}: ${a.getFloat32(o + k, true)} vs ${e.getFloat32(o + k, true)}`;
        if (kind === 'signed zero') {
          signedZeros++;
          notes.add(`${where}: signed zero`);
        } else {
          far++;
          if (distance > maxUlp) maxUlp = distance;
          notes.add(`${where}: ${distance} ULP`);
        }
      }
    }
    if (e.getUint16(o + 48, true) !== a.getUint16(o + 48, true)) {
      attributes++;
      notes.add(`triangle ${i}: attribute bytes ${a.getUint16(o + 48, true)} vs ${e.getUint16(o + 48, true)}`);
    }
    if (normalDiffers) {
      normalDiffs++;
      const dot =
        e.getFloat32(o, true) * a.getFloat32(o, true) + e.getFloat32(o + 4, true) * a.getFloat32(o + 4, true) + e.getFloat32(o + 8, true) * a.getFloat32(o + 8, true);
      if (dot < minimumDot) minimumDot = dot;
      if (dot < NORMAL_DOT) {
        const angle = minimumAngle(a, o);
        if (angle < SLIVER_DEGREES) {
          sliverNormals++;
          notes.add(`triangle ${i}: sliver (smallest angle ${angle.toExponential(2)}°), normals differ, dot ${dot}`);
        } else {
          badNormals++;
          notes.add(`triangle ${i}: normal differs from the reference, dot ${dot}, smallest angle ${angle.toFixed(2)}°`);
        }
      }
    }
  }

  const tags: string[] = [];
  const topologyEqual = (() => {
    const eIndices = weld(e, triangles).indices;
    const aIndices = weld(a, triangles).indices;
    for (let i = 0; i < eIndices.length; i++) {
      if (eIndices[i] !== aIndices[i]) {
        notes.add(`Welded topology differs at triangle ${Math.floor(i / 3)} corner ${i % 3}: vertex ${aIndices[i]} vs ${eIndices[i]}`);
        return false;
      }
    }
    return true;
  })();
  // Reordered triangles make the coordinate-by-coordinate numbers meaningless, so `ulp` only
  // counts as a cause while the topology agrees.
  if (signedZeros > 0 && (topologyEqual || far === 0)) tags.push('signed zero');
  if (!topologyEqual) tags.push('topology');
  else if (far > 0) tags.push('ulp');
  if (attributes > 0) tags.push('attribute');
  if (badNormals > 0 && topologyEqual) tags.push('normal');

  for (const [data, who, tag] of [[a, 'TS', 'normal'], [e, 'reference', 'reference normal']] as const) {
    let failures = 0;
    for (let i = 0; i < triangles; i++) {
      const o = HEADER_BYTES + 4 + RECORD_BYTES * i;
      const dot = writerDot(data, o);
      if (dot === null || dot >= WRITER_NORMAL_DOT) continue;
      const angle = minimumAngle(data, o);
      if (angle < SLIVER_DEGREES) {
        notes.add(`triangle ${i} (${who}): sliver (smallest angle ${angle.toExponential(2)}°), stored normal off by dot ${dot}`);
        continue;
      }
      failures++;
      notes.add(`triangle ${i} (${who}): stored normal does not fit its vertices, dot ${dot}`);
    }
    if (failures > 0 && !tags.includes(tag)) tags.push(tag);
  }

  const bodyDiffers = !equalRange(expected, actual, HEADER_BYTES, expected.length);
  headerProblems(expected, actual, bodyDiffers, tags, notes);

  // Topology is the only complaint: rule (1) of plan §14 holds, so check the rest of the rule.
  let solidNote: string | null = null;
  if (tags.length === 1 && tags[0] === 'topology') {
    const solid = solidEquivalence(e, a, triangles);
    if (solid.same) {
      const description = `${solid.differingTriangles} triangles differ, same solid (volume ${solid.volumes[0]} vs ${solid.volumes[1]}, area ${solid.areas[0]} vs ${solid.areas[1]})`;
      if (allowEquivalent) {
        return {
          status: 'equivalent',
          tags: [],
          maxUlp: solid.ulpCount > 0 ? 1 : 0,
          ulpCount: solid.ulpCount,
          normalDiffs: 0,
          nearZeroCorners: solid.nearZeroCorners,
          differingTriangles: solid.differingTriangles,
          notes: [description],
        };
      }
      solidNote = `${description}; not on the allowlist (harness/equivalentCases.ts)`;
    } else {
      solidNote = `Not the same solid: ${solid.problem}`;
    }
  }

  const summary: string[] = [];
  if (ulpCount > 0) summary.push(`${ulpCount} coordinates 1 ULP apart`);
  if (nearZeroCorners > 0) summary.push(`${nearZeroCorners} coordinates differ below ${NEAR_ZERO_MM} mm`);
  if (normalDiffs > 0) summary.push(`${normalDiffs} normals differ (max ${maxNormalUlp} ULP, min dot ${minimumDot})`);
  if (sliverNormals > 0) summary.push(`${sliverNormals} of them on slivers`);
  return {
    status: tags.length > 0 ? 'mismatch' : 'ulp',
    tags,
    maxUlp,
    ulpCount,
    normalDiffs,
    nearZeroCorners,
    differingTriangles: 0,
    notes: tags.length > 0 ? [...(solidNote === null ? [] : [solidNote]), ...notes.all()] : [...(summary.length > 0 ? [summary.join(', ')] : []), ...notes.all()],
  };
}

function ulpApart(a: number, b: number): boolean {
  if (a === b || (Math.abs(a) < NEAR_ZERO_MM && Math.abs(b) < NEAR_ZERO_MM)) return true;
  const buffer = new DataView(new ArrayBuffer(8));
  buffer.setFloat32(0, a, true);
  buffer.setFloat32(4, b, true);
  const first = buffer.getUint32(0, true);
  const second = buffer.getUint32(4, true);
  return first >= SIGN_BIT === second >= SIGN_BIT && Math.abs(first - second) <= 1;
}

/** What the manifest can disprove without the reference body. Null = nothing wrong (yet). */
export function stlFactsProblem(facts: StlFacts, actual: Uint8Array): DiffResult | null {
  const problem = formatProblem(actual);
  if (problem !== null) return mismatch('stl format', `Not a binary STL: ${problem}`);
  const data = view(actual);
  const triangles = data.getUint32(HEADER_BYTES, true);
  if (facts.triangles !== undefined && facts.triangles !== triangles) {
    return mismatch('triangle count', `${triangles} triangles, reference has ${facts.triangles}`);
  }
  if (facts.header !== undefined) {
    const signed = facts.header.slice(0, BSTL_SIGNED_BYTES * 2);
    const own = hex(actual.subarray(0, BSTL_SIGNED_BYTES));
    if (signed !== own) return mismatch('header', `BSTL header differs: ${own} vs ${signed}`);
    if (digestProblem(actual)) return mismatch('digest', 'BSTL digest of the TS file does not match its own header and body');
  }
  if (facts.bbox !== undefined && triangles > 0) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < triangles; i++) {
      const o = HEADER_BYTES + 4 + RECORD_BYTES * i + 12;
      for (let k = 0; k < 9; k++) {
        const value = data.getFloat32(o + k * 4, true);
        const axis = k % 3;
        if (value < (min[axis] as number)) min[axis] = value;
        if (value > (max[axis] as number)) max[axis] = value;
      }
    }
    for (let axis = 0; axis < 3; axis++) {
      const boxMin = facts.bbox.min[axis] as number;
      const boxMax = facts.bbox.max[axis] as number;
      if (!ulpApart(min[axis] as number, boxMin) || !ulpApart(max[axis] as number, boxMax)) {
        return mismatch('bbox', `${AXES[axis]} range ${min[axis]}…${max[axis]}, reference has ${boxMin}…${boxMax}`);
      }
    }
  }
  return null;
}
