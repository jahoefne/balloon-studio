// Placeholder geometry for the stub core: closed, outward-facing triangle meshes cheap
// enough for every keystroke, plus minimal STL and stored-ZIP writers.
// TODO(WP-K1): the writers give way to core/geometry/mesh.ts (binarySTL) and core/io/storedZip.ts.

import type { MeshBuffers, Vec2 } from '../types';
import { cos, PI, sin } from '../swift/dmath';
import { swiftMax } from './swiftCompat';

/** A mesh under construction, with one color group per triangle. */
export interface StubMesh {
  positions: number[];
  indices: number[];
  colors: number[];
}

export const emptyMesh = (): StubMesh => ({ positions: [], indices: [], colors: [] });

export const vertex = (m: StubMesh, x: number, y: number, z: number): number => {
  m.positions.push(x, y, z);
  return m.positions.length / 3 - 1;
};
export const triangle = (m: StubMesh, a: number, b: number, c: number, color = 0): void => {
  m.indices.push(a, b, c);
  m.colors.push(color);
};

/** Appends `part` to `into`, every face in `color` (or keeping its own colors). */
export const append = (into: StubMesh, part: StubMesh, color?: number): StubMesh => {
  const offset = into.positions.length / 3;
  into.positions.push(...part.positions);
  into.indices.push(...part.indices.map((i) => i + offset));
  into.colors.push(...(color === undefined ? part.colors : part.colors.map(() => color)));
  return into;
};

export const transformed = (m: StubMesh, f: (x: number, y: number, z: number) => [number, number, number]): StubMesh => {
  const positions: number[] = [];
  for (let i = 0; i < m.positions.length; i += 3) positions.push(...f(m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!));
  return { positions, indices: [...m.indices], colors: [...m.colors] };
};
export const translated = (m: StubMesh, dx: number, dy: number, dz: number): StubMesh =>
  transformed(m, (x, y, z) => [x + dx, y + dy, z + dz]);

/**
 * A solid of revolution about Z from a profile of (radius, z) points running from the
 * bottom pole to the top pole (first and last radius 0). `reverse` turns it inside out,
 * for the cavity of a hollow body.
 */
export const lathe = (profile: readonly (readonly [number, number])[], segments: number, reverse = false): StubMesh => {
  const m = emptyMesh();
  const bottom = vertex(m, 0, 0, profile[0]![1]);
  const rings: number[][] = [];
  for (const [r, z] of profile.slice(1, -1)) {
    const ring: number[] = [];
    for (let s = 0; s < segments; s += 1) {
      const a = (2 * PI * s) / segments;
      ring.push(vertex(m, r * cos(a), r * sin(a), z));
    }
    rings.push(ring);
  }
  const top = vertex(m, 0, 0, profile[profile.length - 1]![1]);
  const face = (a: number, b: number, c: number) => (reverse ? triangle(m, a, c, b) : triangle(m, a, b, c));
  for (let s = 0; s < segments; s += 1) {
    const n = (s + 1) % segments;
    face(bottom, rings[0]![n]!, rings[0]![s]!);
    for (let k = 0; k + 1 < rings.length; k += 1) {
      const lo = rings[k]!, hi = rings[k + 1]!;
      face(lo[s]!, lo[n]!, hi[n]!);
      face(lo[s]!, hi[n]!, hi[s]!);
    }
    const last = rings[rings.length - 1]!;
    face(top, last[s]!, last[n]!);
  }
  return m;
};

export const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): StubMesh => {
  const m = emptyMesh();
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ].map(([x, y, z]) => vertex(m, x!, y!, z!));
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  for (const [a, b, c, d] of quads) {
    triangle(m, v[a!]!, v[b!]!, v[c!]!);
    triangle(m, v[a!]!, v[c!]!, v[d!]!);
  }
  return m;
};

/** A torus about Z with an elliptical tube: `a` across the band, `b` in height. */
export const torus = (major: number, a: number, b: number, z: number, segments = 96, sides = 16): StubMesh => {
  const m = emptyMesh();
  const grid: number[][] = [];
  for (let s = 0; s < segments; s += 1) {
    const u = (2 * PI * s) / segments, row: number[] = [];
    for (let k = 0; k < sides; k += 1) {
      const w = (2 * PI * k) / sides, r = major + a * cos(w);
      row.push(vertex(m, r * cos(u), r * sin(u), z + b * sin(w)));
    }
    grid.push(row);
  }
  for (let s = 0; s < segments; s += 1) {
    for (let k = 0; k < sides; k += 1) {
      const s1 = (s + 1) % segments, k1 = (k + 1) % sides;
      triangle(m, grid[s]![k]!, grid[s1]![k]!, grid[s1]![k1]!);
      triangle(m, grid[s]![k]!, grid[s1]![k1]!, grid[s]![k1]!);
    }
  }
  return m;
};

const signedArea = (loop: readonly Vec2[]): number =>
  loop.reduce((sum, a, i) => {
    const b = loop[(i + 1) % loop.length]!;
    return sum + a.x * b.y - b.x * a.y;
  }, 0) / 2;

/** Ear clipping of a simple counter-clockwise polygon; O(n²), fine for a few hundred points. */
const earClip = (loop: readonly Vec2[]): [number, number, number][] => {
  const remaining = loop.map((_, i) => i);
  const out: [number, number, number][] = [];
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const inside = (p: Vec2, a: Vec2, b: Vec2, c: Vec2) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (remaining.length > 3 && guard < loop.length * loop.length) {
    guard += 1;
    let clipped = false;
    for (let i = 0; i < remaining.length; i += 1) {
      const ia = remaining[(i + remaining.length - 1) % remaining.length]!, ib = remaining[i]!, ic = remaining[(i + 1) % remaining.length]!;
      const a = loop[ia]!, b = loop[ib]!, c = loop[ic]!;
      if (cross(a, b, c) <= 1e-12) continue;
      if (remaining.some((j) => j !== ia && j !== ib && j !== ic && inside(loop[j]!, a, b, c))) continue;
      out.push([ia, ib, ic]);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  // Whatever is left (degenerate input) is fanned so the solid still closes.
  for (let i = 1; i + 1 < remaining.length; i += 1) out.push([remaining[0]!, remaining[i]!, remaining[i + 1]!]);
  return out;
};

/** A prism from a simple outline in the XY plane, from z0 up to z1. */
export const extrude = (outline: readonly Vec2[], z0: number, z1: number): StubMesh => {
  const loop = signedArea(outline) < 0 ? [...outline].reverse() : [...outline];
  const m = emptyMesh();
  const low = loop.map((q) => vertex(m, q.x, q.y, z0));
  const high = loop.map((q) => vertex(m, q.x, q.y, z1));
  for (const [a, b, c] of earClip(loop)) {
    triangle(m, high[a]!, high[b]!, high[c]!);
    triangle(m, low[a]!, low[c]!, low[b]!);
  }
  loop.forEach((_, i) => {
    const j = (i + 1) % loop.length;
    triangle(m, low[i]!, low[j]!, high[j]!);
    triangle(m, low[i]!, high[j]!, high[i]!);
  });
  return m;
};

/** The model frame's extent, in Double, like `BalloonMesh.dimensions`. */
const dimensionsOf = (positions: readonly number[]) => {
  if (positions.length === 0) return { x: 0, y: 0, z: 0 };
  const lo = [positions[0]!, positions[1]!, positions[2]!], hi = [...lo];
  for (let i = 0; i < positions.length; i += 1) {
    const axis = i % 3, value = positions[i]!;
    if (value < lo[axis]!) lo[axis] = value;
    if (value > hi[axis]!) hi[axis] = value;
  }
  return { x: hi[0]! - lo[0]!, y: hi[1]! - lo[1]!, z: hi[2]! - lo[2]! };
};

export const toBuffers = (m: StubMesh, withColors = true): MeshBuffers => {
  const buffers: MeshBuffers = {
    positions: Float32Array.from(m.positions),
    indices: Uint32Array.from(m.indices),
    maxOverhang: 0,
    dimensions: dimensionsOf(m.positions),
  };
  if (withColors) buffers.faceColors = Uint8Array.from(m.colors);
  return buffers;
};

// --- Writers ----------------------------------------------------------------------

const STL_HEADER = 'Balloon Studio | millimetres | watertight material | Z up';

/** Binary STL like `BalloonMesh.binarySTL` (without validation). */
export const binarySTL = (m: StubMesh): Uint8Array => {
  const count = m.indices.length / 3;
  const bytes = new Uint8Array(84 + count * 50);
  bytes.set(new TextEncoder().encode(STL_HEADER), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, count, true);
  const p = (i: number) => [m.positions[3 * i]!, m.positions[3 * i + 1]!, m.positions[3 * i + 2]!] as const;
  for (let t = 0; t < count; t += 1) {
    const a = p(m.indices[3 * t]!), b = p(m.indices[3 * t + 1]!), c = p(m.indices[3 * t + 2]!);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    const length = swiftMax(Math.sqrt(n[0]! * n[0]! + n[1]! * n[1]! + n[2]! * n[2]!), 1e-30);
    const values = [n[0]! / length, n[1]! / length, n[2]! / length, ...a, ...b, ...c];
    values.forEach((value, k) => view.setFloat32(84 + t * 50 + k * 4, value, true));
  }
  return bytes;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (data: Uint8Array): number => {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Stored (uncompressed) ZIP with the Swift `StoredZIP` header fields (version 20, time 0, date 33). */
export const storedZip = (entries: readonly { name: string; bytes: Uint8Array }[]): Uint8Array => {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [], centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name), crc = crc32(entry.bytes), size = entry.bytes.length;
    const local = new Uint8Array(30 + name.length + size), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(12, 33, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(entry.bytes, 30 + name.length);
    const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(14, 33, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
