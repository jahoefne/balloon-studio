// Ported from mac/Sources/BalloonStudio/STLImport.swift @ cbda68d (lines 4-16 and 48-238: errors,
// ImportedBalloon, BalloonSTL.open, read, settings, parse, centered, reconstruct). The writing half
// (lines 21-46) is in balloonStl.ts.
import { BalloonMesh } from '../geometry/mesh';
import { add, cross, scale, sub, type Point3, type Triangle } from '../geometry/point3';
import { ExactPointMap } from '../geometry/weld';
import { sha256 } from '../io/sha256';
import { atan2, cos, hypot, sin } from '../swift/dmath';
import { arrayMax, arrayMin, maxBy, swiftMax, swiftMax3, swiftMin } from '../swift/minmax';
import { intTrunc, rounded, strideThrough } from '../swift/rounding';
import { sortedDoubles, stableSorted } from '../swift/sort';
import { isSwiftWhitespace, swiftCharacters } from '../swift/text';
import type { BalloonParameters } from '../types';
import { makeBalloonParameters, normalized } from './balloonParameters';
import { legacySignature, maximumBytes, maximumTriangles, signature } from './balloonStl';

export class STLImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'STLImportError';
  }
}

export interface ImportedBalloon {
  mesh: BalloonMesh;
  parameters: BalloonParameters;
  restoredSettings: boolean;
  notes: string;
}

/** Swift `BalloonSTL.open(_:)` without the file access: the size check, then `read`. */
export function open(data: Uint8Array): ImportedBalloon {
  if (!(data.length <= maximumBytes)) throw new STLImportError('This STL is too large. Open a file smaller than 150 MB with at most 2 million triangles.');
  return read(data);
}

export function read(data: Uint8Array): ImportedBalloon {
  const mesh = parse(data);
  const parameters = settings(data);
  if (parameters !== undefined) {
    return {
      mesh: centered(mesh),
      parameters,
      restoredSettings: true,
      notes: 'Balloon Studio settings were recovered from this file. Walls, attachments, and shape settings are ready to edit. STL does not store filament colors or patterns.',
    };
  }
  return reconstruct(mesh);
}

function hasPrefix(data: Uint8Array, text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (data[i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function settings(data: Uint8Array): BalloonParameters | undefined {
  if (!(data.length >= 84)) return undefined;
  const legacy = hasPrefix(data, legacySignature);
  if (!(legacy || hasPrefix(data, signature))) return undefined;
  const settingsEnd = legacy ? 46 : 62;
  const digestLength = legacy ? 32 : 16;
  const digest = sha256(data.subarray(0, settingsEnd), data.subarray(80));
  for (let i = 0; i < digestLength; i++) {
    if (digest[i] !== data[settingsEnd + i]) return undefined;
  }
  if (!((data[8] as number) <= 7)) return undefined;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const values: number[] = [];
  for (let i = 0; i < (legacy ? 9 : 13); i++) values.push(view.getFloat32(10 + i * 4, true));
  if (!values.every((v) => Number.isFinite(v))) return undefined;
  const flags = data[8] as number;
  const p = makeBalloonParameters({
    height: values[0] as number,
    diameter: values[1] as number,
    panels: data[9] as number,
    panelDepth: values[2] as number,
    neckDiameter: values[3] as number,
    neckHeight: values[4] as number,
    shoulder: values[5] as number,
    hollow: (flags & 1) !== 0,
    wallThickness: values[6] as number,
    stringHoles: (flags & 2) !== 0,
    cordClearance: values[7] as number,
    hangingLoop: (flags & 4) !== 0,
    hangingClearance: values[8] as number,
  });
  if (!legacy) {
    p.hangingThickness = values[9] as number;
    p.hangingWall = values[10] as number;
    p.hangingFillet = values[11] as number;
    p.hangingCrownThickness = values[12] as number;
  }
  return normalized(p);
}

const malformedASCII = (): STLImportError => new STLImportError('The file is not a complete ASCII or binary STL. Try exporting it as STL again.');

function validPoint(x: number, y: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && swiftMax3(Math.abs(x), Math.abs(y), Math.abs(z)) < 1e7;
}

export function parse(data: Uint8Array): BalloonMesh {
  if (!(data.length !== 0 && data.length <= maximumBytes)) throw new STLImportError('The STL is empty or exceeds the 150 MB limit.');
  const vertices: Point3[] = [];
  const triangles: Triangle[] = [];
  const lookup = new ExactPointMap(1024);
  const id = (x: number, y: number, z: number): number => {
    const known = lookup.get(x, y, z);
    if (known >= 0) return known;
    const created = vertices.length;
    lookup.set(x, y, z, created);
    vertices.push({ x, y, z });
    return created;
  };
  const addTriangle = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): void => {
    if (!(triangles.length < maximumTriangles)) throw new STLImportError('The STL exceeds the limit of 2 million triangles.');
    let valid = validPoint(ax, ay, az) && validPoint(bx, by, bz) && validPoint(cx, cy, cz);
    if (valid) {
      // (points[1]-points[0]).cross(points[2]-points[0]).length > 1e-9
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const vx = cx - ax;
      const vy = cy - ay;
      const vz = cz - az;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      valid = Math.sqrt(nx * nx + ny * ny + nz * nz) > 1e-9;
    }
    if (!valid) throw new STLImportError('The STL contains invalid coordinates or collapsed triangles.');
    const a = id(ax, ay, az);
    const b = id(bx, by, bz);
    const c = id(cx, cy, cz);
    triangles.push({ a, b, c });
  };
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // A binary STL may also start with "solid". Its exact length is authoritative.
  const count = data.length >= 84 ? view.getUint32(80, true) : 0;
  if (data.length >= 84 && count <= maximumTriangles && data.length === 84 + count * 50) {
    for (let i = 0; i < count; i++) {
      const start = 84 + i * 50 + 12;
      addTriangle(
        view.getFloat32(start, true), view.getFloat32(start + 4, true), view.getFloat32(start + 8, true),
        view.getFloat32(start + 12, true), view.getFloat32(start + 16, true), view.getFloat32(start + 20, true),
        view.getFloat32(start + 24, true), view.getFloat32(start + 28, true), view.getFloat32(start + 32, true),
      );
    }
  } else {
    let source: string;
    try {
      // Like `String(data:encoding:.utf8)`: nil on invalid UTF-8, one leading BOM dropped.
      source = new TextDecoder('utf-8', { fatal: true }).decode(data);
    } catch {
      throw new STLImportError('The binary STL is truncated or has an invalid triangle count.');
    }
    let state = 0;
    let points: Point3[] = [];
    let solids = 0;
    forEachLine(source, (words) => {
      const first = (words[0] as string).toLowerCase();
      if (state === 0 && first === 'solid') {
        solids += 1;
        state = 1;
      } else if (state === 1 && first === 'facet') {
        if (!(words.length === 5 && (words[1] as string).toLowerCase() === 'normal')) throw malformedASCII();
        for (let i = 2; i < 5; i++) {
          const v = swiftDouble(words[i] as string);
          if (v === undefined || !Number.isFinite(v)) throw malformedASCII();
        }
        points = [];
        state = 2;
      } else if (state === 2 && first === 'outer') {
        if (!(words.length === 2 && (words[1] as string).toLowerCase() === 'loop')) throw malformedASCII();
        state = 3;
      } else if (state === 3 && first === 'vertex') {
        if (words.length !== 4) throw malformedASCII();
        const x = swiftDouble(words[1] as string);
        const y = swiftDouble(words[2] as string);
        const z = swiftDouble(words[3] as string);
        if (x === undefined || y === undefined || z === undefined) throw malformedASCII();
        points.push({ x, y, z });
        if (points.length === 3) state = 4;
      } else if (state === 4 && first === 'endloop') {
        state = 5;
      } else if (state === 5 && first === 'endfacet') {
        const [a, b, c] = points as [Point3, Point3, Point3];
        addTriangle(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        state = 1;
      } else if (state === 1 && first === 'endsolid') {
        state = 0;
      } else throw malformedASCII();
    });
    if (!(state === 0 && solids > 0)) throw malformedASCII();
  }
  if (triangles.length === 0) throw new STLImportError('The STL has no triangles.');
  return new BalloonMesh(vertices, triangles, 0);
}

/**
 * `source.split(whereSeparator: {$0.isNewline})`, then each line split at `isWhitespace`; lines
 * without words are skipped. Characters are grapheme clusters (a space with a combining mark is one
 * whitespace Character), but LF always starts a new cluster, so only chunks with non-ASCII text
 * need the segmenter.
 */
function forEachLine(source: string, body: (words: string[]) => void): void {
  let start = 0;
  while (start < source.length) {
    let end = source.indexOf('\n', start);
    if (end < 0) end = source.length;
    let ascii = true;
    for (let i = start; i < end && ascii; i++) ascii = source.charCodeAt(i) < 0x80;
    if (ascii) forEachASCIILine(source, start, end, body);
    else forEachUnicodeLine(source.slice(start, end), body);
    start = end + 1;
  }
}

function forEachASCIILine(source: string, start: number, end: number, body: (words: string[]) => void): void {
  let words: string[] = [];
  let wordStart = -1;
  for (let i = start; i < end; i++) {
    const c = source.charCodeAt(i);
    const newline = c >= 0x0a && c <= 0x0d;
    if (newline || c === 0x20 || c === 0x09) {
      if (wordStart >= 0) {
        words.push(source.slice(wordStart, i));
        wordStart = -1;
      }
      if (newline && words.length > 0) {
        body(words);
        words = [];
      }
    } else if (wordStart < 0) wordStart = i;
  }
  if (wordStart >= 0) words.push(source.slice(wordStart, end));
  if (words.length > 0) body(words);
}

/** Swift `Character.isNewline`: looks at the first scalar. */
function isSwiftNewline(character: string): boolean {
  const c = character.codePointAt(0) as number;
  return (c >= 0x0a && c <= 0x0d) || c === 0x85 || c === 0x2028 || c === 0x2029;
}

function forEachUnicodeLine(chunk: string, body: (words: string[]) => void): void {
  let words: string[] = [];
  let word = '';
  for (const character of swiftCharacters(chunk)) {
    if (isSwiftNewline(character)) {
      if (word !== '') words.push(word);
      word = '';
      if (words.length > 0) body(words);
      words = [];
    } else if (isSwiftWhitespace(character)) {
      if (word !== '') words.push(word);
      word = '';
    } else word += character;
  }
  if (word !== '') words.push(word);
  if (words.length > 0) body(words);
}

const isDigit = (c: number): boolean => c >= 0x30 && c <= 0x39;
const isHexDigit = (c: number): boolean => isDigit(c) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);

/**
 * Swift `Double(_: Substring)` (measured, web/tests/fixtures/swift/balloonDecode.txt): an optional
 * sign, then a decimal or hexadecimal float, `inf`/`infinity`, `nan`, `nan(…)` or `snan`, the words
 * in any case. Out-of-range literals become ±∞ or ±0. Undefined stands for nil.
 */
export function swiftDouble(word: string): number | undefined {
  let i = 0;
  const first = word.charCodeAt(0);
  const negative = first === 0x2d;
  if (negative || first === 0x2b) i = 1;
  const c = word.charCodeAt(i);
  if (c === 0x30 && (word.charCodeAt(i + 1) | 0x20) === 0x78) return hexDouble(word, i + 2, negative);
  if (isDigit(c) || c === 0x2e) {
    let digits = 0;
    let at = i;
    while (isDigit(word.charCodeAt(at))) {
      at++;
      digits++;
    }
    if (word.charCodeAt(at) === 0x2e) {
      at++;
      while (isDigit(word.charCodeAt(at))) {
        at++;
        digits++;
      }
    }
    if (digits === 0) return undefined;
    if ((word.charCodeAt(at) | 0x20) === 0x65) {
      at++;
      const sign = word.charCodeAt(at);
      if (sign === 0x2b || sign === 0x2d) at++;
      const exponentStart = at;
      while (isDigit(word.charCodeAt(at))) at++;
      if (at === exponentStart) return undefined;
    }
    return at === word.length ? Number(word) : undefined;
  }
  const rest = word.slice(i).toLowerCase();
  if (rest === 'inf' || rest === 'infinity') return negative ? -Infinity : Infinity;
  if (rest === 'nan' || rest === 'snan') return NaN;
  if (rest.startsWith('nan(') && rest.endsWith(')') && !/[()]/.test(rest.slice(4, -1))) return NaN;
  return undefined;
}

function hexDouble(word: string, from: number, negative: boolean): number | undefined {
  let at = from;
  let digits = '';
  let fraction = 0;
  while (isHexDigit(word.charCodeAt(at))) digits += word[at++];
  if (word.charCodeAt(at) === 0x2e) {
    at++;
    while (isHexDigit(word.charCodeAt(at))) {
      digits += word[at++];
      fraction++;
    }
  }
  if (digits === '') return undefined;
  let exponent = 0;
  if ((word.charCodeAt(at) | 0x20) === 0x70) {
    at++;
    const sign = word.charCodeAt(at);
    if (sign === 0x2b || sign === 0x2d) at++;
    const exponentStart = at;
    while (isDigit(word.charCodeAt(at))) {
      // Saturates; anything this large is ±∞ or ±0 already.
      if (exponent < 1e9) exponent = exponent * 10 + (word.charCodeAt(at) - 0x30);
      at++;
    }
    if (at === exponentStart) return undefined;
    if (sign === 0x2d) exponent = -exponent;
  }
  if (at !== word.length) return undefined;
  const value = scaledBinary(BigInt(`0x${digits}`), exponent - 4 * fraction);
  return negative ? -value : value;
}

/** `mantissa · 2^exponent`, correctly rounded to Double (half to even, subnormals included). */
function scaledBinary(mantissa: bigint, exponent: number): number {
  if (mantissa === 0n) return 0;
  const bits = mantissa.toString(2).length;
  const top = bits - 1 + exponent;
  if (top > 1023) return Infinity;
  const precision = swiftMin(53, top + 1075);
  if (precision < 0) return 0;
  let kept = mantissa;
  let scale2 = exponent;
  const drop = bits - precision;
  if (drop > 0) {
    const shift = BigInt(drop);
    kept = mantissa >> shift;
    const remainder = mantissa & ((1n << shift) - 1n);
    const half = 1n << (shift - 1n);
    if (remainder > half || (remainder === half && (kept & 1n) === 1n)) kept += 1n;
    scale2 += drop;
  }
  let value = Number(kept);
  // Exact at every step: the final value is representable and the steps approach it monotonically.
  for (; scale2 > 0; scale2--) value *= 2;
  for (; scale2 < 0; scale2++) value /= 2;
  return value;
}

export function centered(mesh: BalloonMesh): BalloonMesh {
  const first = mesh.vertices[0] as Point3;
  let loX = first.x;
  let loY = first.y;
  let loZ = first.z;
  let hiX = first.x;
  let hiY = first.y;
  for (const p of mesh.vertices) {
    loX = swiftMin(loX, p.x);
    loY = swiftMin(loY, p.y);
    loZ = swiftMin(loZ, p.z);
    hiX = swiftMax(hiX, p.x);
    hiY = swiftMax(hiY, p.y);
  }
  const offset: Point3 = { x: (loX + hiX) / 2, y: (loY + hiY) / 2, z: loZ };
  return new BalloonMesh(mesh.vertices.map((p) => sub(p, offset)), mesh.triangles, mesh.maxOverhang, mesh.innerVertexRange);
}

const unsupported = (): STLImportError =>
  new STLImportError('This STL could not be reconstructed as an editable balloon. Use an upright balloon envelope in millimetres (60–240 mm wide, 80–256 mm tall). Arbitrary meshes, baskets, and rotated models cannot be converted to balloon settings.');

function reconstruct(source: BalloonMesh): ImportedBalloon {
  const mesh = centered(source);
  const dims = mesh.dimensions;
  if (!(dims.z >= 79.9 && dims.z <= 256.1 && dims.x >= 59.9 && dims.x <= 240.1 && Math.abs(dims.x - dims.y) < swiftMax(0.2, dims.x * 0.01))) throw unsupported();
  // The existing generator and the original Blender model use horizontal rings.
  // Keep the outermost radius at each height, ignoring cavity vertices.
  const outerIDs = new Uint8Array(mesh.vertices.length);
  for (const t of mesh.triangles) {
    const a = mesh.vertices[t.a] as Point3;
    const b = mesh.vertices[t.b] as Point3;
    const c = mesh.vertices[t.c] as Point3;
    const normal = cross(sub(b, a), sub(c, a));
    const center = scale(add(add(a, b), c), 1.0 / 3);
    if (normal.x * center.x + normal.y * center.y > 1e-8) {
      outerIDs[t.a] = 1;
      outerIDs[t.b] = 1;
      outerIDs[t.c] = 1;
    }
  }
  // SWIFT-DIFF: Swift iterates a Set<Int> here, in an order that changes per process; the points of
  // a ring only feed estimates (docs/plan.md §3). Ascending ids keep the result reproducible.
  const rings = new Map<number, Point3[]>();
  for (let id = 0; id < outerIDs.length; id++) {
    if (outerIDs[id] === 0) continue;
    const p = mesh.vertices[id] as Point3;
    const key = intTrunc(rounded(p.z * 1000));
    const ring = rings.get(key);
    if (ring === undefined) rings.set(key, [p]);
    else ring.push(p);
  }
  const profile = stableSorted([...rings.entries()], (a, b) => a[0] < b[0]).map(([key, points]) => ({
    z: key / 1000,
    r: arrayMax(points.map((p) => hypot(p.x, p.y))) ?? 0,
    points,
  }));
  const widest = maxBy(profile, (a, b) => a.r < b.r);
  const base = profile[0];
  if (!(profile.length >= 20 && widest !== undefined && widest.z / dims.z > 0.45 && widest.z / dims.z < 0.78 && base !== undefined && base.r >= 5.9 && base.r < widest.r * 0.61)) throw unsupported();
  let neckHeight = 0;
  for (const row of profile) {
    if (!(row.r <= base.r + 0.025 && row.z < dims.z * 0.16)) break;
    neckHeight = row.z;
  }
  if (!(neckHeight >= 2.9 && neckHeight <= 20.1)) throw unsupported();
  // Fit the upper Bezier crown, excluding the small crown patch used by a hanger.
  const upper = profile.filter((row) => row.z > widest.z && row.r > widest.r * 0.22 && row.r < widest.r * 0.95);
  if (!(upper.length >= 8)) throw unsupported();
  const upperT = (ratio: number): number => {
    let lo = 0.0;
    let hi = 1.0;
    for (let i = 0; i < 25; i++) {
      const t = (lo + hi) / 2;
      const s = 1 - t;
      const radius = s * s * s + 3 * s * s * t + (3 * s * t * t * 48) / 90;
      if (radius > ratio) lo = t;
      else hi = t;
    }
    return (lo + hi) / 2;
  };
  const heights = sortedDoubles(
    upper.map((row) => {
      const t = upperT(row.r / widest.r);
      const s = 1 - t;
      const fraction = (3 * s * s * t * 42) / 78 + 3 * s * t * t + t * t * t;
      return widest.z + (row.z - widest.z) / fraction;
    }),
  );
  const height = heights[Math.trunc(heights.length / 2)] as number;
  if (!(height >= 79.9 && height <= 250.1 && heights.every((h) => Math.abs(h - height) < 1.5))) throw unsupported();
  const shoulder = (widest.z / height) * 100;
  if (!(shoulder >= 49.9 && shoulder <= 75.1)) throw unsupported();
  const outer = stableSorted(
    widest.points.filter((p) => hypot(p.x, p.y) >= widest.r * 0.915),
    (a, b) => atan2(a.y, a.x) < atan2(b.y, b.x),
  );
  const minRadius = arrayMin(outer.map((p) => hypot(p.x, p.y))) ?? widest.r;
  // Count periodic radial peaks using a Fourier fit; cavity rings don't share this Z.
  const candidates = strideThrough(8, 32, 4).map((panels): [number, number] => {
    let sum = 0.0;
    for (const point of outer) sum = sum + hypot(point.x, point.y);
    const mean = sum / outer.length;
    let c = 0.0;
    let s = 0.0;
    for (const point of outer) {
      const angle = atan2(point.y, point.x) * panels;
      const r = hypot(point.x, point.y) - mean;
      c += r * cos(angle);
      s += r * sin(angle);
    }
    return [panels, hypot(c, s)];
  });
  const depth = (1 - minRadius / widest.r) * 100;
  const panels = depth < 0.1 ? 20 : (maxBy(candidates, (a, b) => a[1] < b[1])?.[0] ?? 20);
  const baseRadii: number[] = [];
  for (const p of mesh.vertices) {
    if (p.z < 0.001) baseRadii.push(hypot(p.x, p.y));
  }
  const inside = arrayMin(baseRadii) ?? 0;
  // A filled cap may be triangulated without a center vertex; test its actual faces.
  const edge = (p: Point3, q: Point3): number => p.x * q.y - p.y * q.x;
  const filled = mesh.triangles.some((t) => {
    const a = mesh.vertices[t.a] as Point3;
    const b = mesh.vertices[t.b] as Point3;
    const c = mesh.vertices[t.c] as Point3;
    if (!(swiftMax3(a.z, b.z, c.z) < 0.001)) return false;
    const signs = [edge(a, b), edge(b, c), edge(c, a)];
    return signs.every((v) => v >= -1e-8) || signs.every((v) => v <= 1e-8);
  });
  const p = normalized(
    makeBalloonParameters({
      height,
      diameter: widest.r * 2,
      panels,
      panelDepth: depth,
      neckDiameter: base.r * 2,
      neckHeight,
      shoulder,
      hollow: !filled,
      wallThickness: !filled ? swiftMin(2.4, swiftMax(0.8, base.r - inside)) : 1.2,
    }),
  );
  return {
    mesh,
    parameters: p,
    restoredSettings: false,
    notes: 'These shape settings are estimates. Editing rebuilds the balloon and may change its surface. Existing holes, hangers, and other custom details are not preserved; add them again under Attachments. Check hollow mode and wall thickness before export. STL has no pattern or color settings.',
  };
}
