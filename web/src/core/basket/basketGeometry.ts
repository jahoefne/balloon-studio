// Ported from mac/Sources/BalloonStudio/BasketGeometry.swift @ cbda68d
//
// BasketStyle (:3-17) with its titles lives in core/types.ts. `layout` and `compact` at the end
// of this file are from StringHoles.swift @ cbda68d, see the SWIFT-DIFF there.
//
// Swift `pow(x, 2)` is written `x * x` (docs/plan.md, Abschnitt 3), through a named local where x
// is an expression; `pow(x, 0.65)` goes through dmath.
import { CoreFailure, type Codec } from '../api';
import { BalloonMesh } from '../geometry/mesh';
import { add, scale, zero, type Point3, type Triangle } from '../geometry/point3';
import { atan, atan2, cos, exp, PI, pow, sin } from '../swift/dmath';
import { encodeJSONCompact } from '../swift/json';
import { swiftMax, swiftMin } from '../swift/minmax';
import { intCeil, intDiv, intRounded, intTrunc, rounded } from '../swift/rounding';
import { sortDoubles } from '../swift/sort';
import { BASKET_STYLES, type BasketParameters, type BasketStyle } from '../types';

/** Swift `BalloonGenerator.Quality`, `.preview` being the default of `generate`. */
export type BasketQuality = 'preview' | 'export';

/** Swift `BasketParameters()` (:20-26). */
export function basketDefaults(): BasketParameters {
  return { style: 'wicker', width: 64, depth: 48, height: 42, wallThickness: 2.4, cordClearance: 3, texture: 0.7 };
}

export function actualDepth(p: BasketParameters): number {
  return p.style === 'ribbed' ? p.width : p.depth;
}

export function floorThickness(p: BasketParameters): number {
  return swiftMax(2.4, p.wallThickness);
}

export function holeCenter(p: BasketParameters): number {
  return p.height - swiftMax(3, p.wallThickness * 1.5) - p.cordClearance / Math.sqrt(2);
}

export function basketFilename(p: BasketParameters): string {
  return `Basket-${p.style}-${intTrunc(p.width)}x${intTrunc(actualDepth(p))}x${intTrunc(p.height)}mm.stl`;
}

/** Swift `BasketParameters.normalized()`. */
export function normalizedBasket(input: BasketParameters): BasketParameters {
  const clamp = (value: number, low: number, high: number, fallback: number): number =>
    Number.isFinite(value) ? swiftMax(low, swiftMin(high, value)) : fallback;
  return {
    style: input.style,
    width: clamp(input.width, 40, 100, 64),
    depth: clamp(input.depth, 30, 90, 48),
    height: clamp(input.height, 24, 70, 42),
    wallThickness: clamp(input.wallThickness, 1.6, 3.2, 2.4),
    cordClearance: clamp(input.cordClearance, 2, 5, 3),
    texture: clamp(input.texture, 0, 1, 0.7),
  };
}

// Synthesized Codable (:19): every key is required. `DecodingError.localizedDescription`, measured
// with JSONDecoder: keyNotFound and valueNotFound (a null value, a null document) give the first
// message, typeMismatch and dataCorrupted (an unknown style, a syntax error) the second.
const MISSING_MESSAGE = 'The data couldn’t be read because it is missing.';
const FORMAT_MESSAGE = 'The data couldn’t be read because it isn’t in the correct format.';

const decodingError = (message: string): CoreFailure => new CoreFailure('invalid-settings', message);

function requiredValue(container: object, key: string): unknown {
  const value: unknown = Object.prototype.hasOwnProperty.call(container, key)
    ? (container as Record<string, unknown>)[key]
    : undefined;
  if (value === undefined || value === null) throw decodingError(MISSING_MESSAGE);
  return value;
}

function requiredDouble(container: object, key: string): number {
  const value = requiredValue(container, key);
  // JSON.parse turns 1e999 into Infinity; JSONDecoder rejects that literal.
  if (typeof value !== 'number' || !Number.isFinite(value)) throw decodingError(FORMAT_MESSAGE);
  return value;
}

function requiredStyle(container: object, key: string): BasketStyle {
  const value = requiredValue(container, key);
  if (typeof value !== 'string' || !(BASKET_STYLES as readonly string[]).includes(value)) throw decodingError(FORMAT_MESSAGE);
  return value as BasketStyle;
}

/** Swift `JSONDecoder().decode(BasketParameters.self, …)`: keys in declaration order, the first failure wins. */
function decodeBasketValue(value: unknown): BasketParameters {
  if (value === null) throw decodingError(MISSING_MESSAGE);
  if (typeof value !== 'object' || Array.isArray(value)) throw decodingError(FORMAT_MESSAGE);
  return {
    style: requiredStyle(value, 'style'),
    width: requiredDouble(value, 'width'),
    depth: requiredDouble(value, 'depth'),
    height: requiredDouble(value, 'height'),
    wallThickness: requiredDouble(value, 'wallThickness'),
    cordClearance: requiredDouble(value, 'cordClearance'),
    texture: requiredDouble(value, 'texture'),
  };
}

/**
 * Decode without normalizing, encode with sorted keys. Failures are
 * `CoreFailure('invalid-settings', <Swift's localizedDescription>)`.
 *
 * SWIFT-DIFF: the text goes through JSON.parse, whose grammar differs from JSONDecoder in three
 * corners no saved settings reach: a trailing comma in an object (JSONDecoder accepts it), a
 * repeated key (JSONDecoder keeps the first, JSON.parse the last) and an underflowing literal
 * like 1e-999 (JSONDecoder rejects it, JSON.parse gives 0).
 */
export const basketCodec: Codec<BasketParameters> = {
  decode(text) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw decodingError(FORMAT_MESSAGE);
    }
    return decodeBasketValue(value);
  },
  decodeValue: decodeBasketValue,
  encode: (value) => encodeJSONCompact({ ...value }),
};

/**
 * Distance along the rounded outline, so reeds retain their spacing on
 * flat faces and around corners. An angular texture stretches on rectangles.
 */
function wickerDistance(theta: number, a: number, b: number): number {
  const tau = 2 * PI;
  const angle = ((theta % tau) + tau) % tau;
  const quadrant = swiftMin(3, intTrunc(angle / (PI / 2)));
  const local = angle - quadrant * PI / 2;
  const aa = quadrant % 2 === 0 ? a : b;
  const bb = quadrant % 2 === 0 ? b : a;
  const corner = swiftMin(a, b) * 0.32;
  const cx = aa - corner;
  const cy = bb - corner;
  const quarter = a + b - 2 * corner + PI * corner / 2;
  const r = radius(local, aa, bb, 0, 'wicker');
  const x = r * cos(local);
  const y = r * sin(local);
  let distance: number;
  if (y <= cy) distance = y;
  else if (x <= cx) distance = cy + PI * corner / 2 + cx - x;
  else distance = cy + corner * atan2(y - cy, x - cx);
  return quadrant * quarter + distance;
}

function wickerRelief(distance: number, z: number, perimeter: number): number {
  // A multiple of four closes the alternating over/under weave at the
  // seam and keeps the same phase on opposite faces at every basket size.
  const strands = swiftMax(4, intRounded(perimeter / 3.6 / 4) * 4);
  const u = distance / perimeter * strands;
  const v = z / 2.4;
  const across = u - rounded(u);
  const up = v - rounded(v);
  const ribbon = (offset: number): number => {
    const t = swiftMin(1, Math.abs(offset) / 0.46);
    return pow(swiftMax(0, 0.5 + 0.5 * cos(PI * t)), 0.65);
  };
  const over = 0.5 + 0.5 * cos(PI * u) * cos(PI * v);
  // Rounded reed edges, alternating crossings, and a shallow lengthwise
  // groove are real surface geometry in both the preview and the STL.
  const upGroove = up * 2.4 / 0.20;
  const horizontal = ribbon(up) * (0.38 + 0.64 * over - 0.08 * exp(-(upGroove * upGroove)));
  const acrossGroove = across * perimeter / strands / 0.20;
  const vertical = ribbon(across) * (1.02 - 0.64 * over - 0.08 * exp(-(acrossGroove * acrossGroove)));
  return swiftMax(horizontal, vertical);
}

/** Radial intersection with circles, rounded rectangles, or chamfered rectangles. */
function radius(angle: number, a: number, b: number, inset: number, style: BasketStyle): number {
  const x = Math.abs(cos(angle));
  const y = Math.abs(sin(angle));
  if (style === 'ribbed') return a - inset;
  const ai = a - inset;
  const bi = b - inset;
  const flat = swiftMin(ai / swiftMax(x, 1e-12), bi / swiftMax(y, 1e-12));
  if (style === 'voyager') {
    const diagonal = a + b - swiftMin(a, b) * 0.30 - Math.sqrt(2) * inset;
    return swiftMin(flat, diagonal / (x + y));
  }
  const corner = swiftMax(0.1, swiftMin(a, b) * 0.32 - inset);
  const cx = ai - corner;
  const cy = bi - corner;
  if (flat * x <= cx + 1e-9 || flat * y <= cy + 1e-9) return flat;
  const projection = x * cx + y * cy;
  return projection + Math.sqrt(swiftMax(0, projection * projection - cx * cx - cy * cy + corner * corner));
}

function generate(input: BasketParameters, quality: BasketQuality = 'preview'): BalloonMesh {
  const p = normalizedBasket(input);
  const pHoleCenter = holeCenter(p);
  const pFloorThickness = floorThickness(p);
  // Leave a surface patch around the circular mouth and its 0.35 mm bevel.
  const halfHole = swiftMax(p.cordClearance / Math.sqrt(2), p.cordClearance / 2 + 0.85);
  const a = p.width / 2;
  const b = actualDepth(p) / 2;
  const taper = (z: number): number => 0.86 + 0.14 * z / p.height;
  // Compensate for the wall's outward taper when applying a horizontal inset.
  const slope = swiftMax(a, b) * 0.14 / p.height;
  const wall = p.wallThickness * Math.sqrt(1 + slope * slope);
  const baseRadius = (theta: number, z: number, inside: boolean): number =>
    radius(theta, a * taper(z), b * taper(z), inside ? wall : 0, p.style);
  const stringLayout = layout(quality === 'export' ? 384 : 240, halfHole * Math.sqrt(2), (angle) =>
    baseRadius(angle, pHoleCenter - halfHole, true),
  );
  const angles = stringLayout.angles;
  const n = angles.length;
  const zBottom = pHoleCenter - halfHole;
  const zTop = pHoleCenter + halfHole;
  const woven = p.style === 'wicker' && p.texture > 0;
  const spacing = quality === 'export' ? 0.20 : 0.32;
  const perimeter = 4 * (a + b - 2 * swiftMin(a, b) * 0.32 + PI * swiftMin(a, b) * 0.32 / 2);
  let detailedAngles: number[] = [];
  if (woven) {
    // Fill even the wide angular spans reserved for the cord holes.
    // The reinforced hole band keeps the original layout.
    for (let i = 0; i < n; i++) {
      const start = angles[i] as number;
      const end = i + 1 < n ? (angles[i + 1] as number) : 2 * PI;
      const length = wickerDistance(end === 2 * PI ? 0 : end, a, b) - wickerDistance(start, a, b);
      const count = swiftMax(1, intCeil((length < 0 ? length + perimeter : length) / spacing));
      for (let j = 0; j < count; j++) detailedAngles.push(start + (end - start) * j / count);
    }
  } else {
    detailedAngles = angles;
  }
  const steps = intCeil(p.height / (woven ? spacing : quality === 'export' ? 0.40 : 0.65));
  const levels: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const z = p.height * i / steps;
    if (!(z > zBottom - 0.00000001 && z < zTop + 0.00000001) && Math.abs(z - pFloorThickness) > 0.00000001) levels.push(z);
  }
  levels.push(pFloorThickness, zBottom, pHoleCenter, zTop);
  sortDoubles(levels);
  const floorRow = levels.findIndex((z) => Math.abs(z - pFloorThickness) < 1e-8);
  const holeRow = levels.findIndex((z) => Math.abs(z - pHoleCenter) < 1e-8);
  const smooth = (t: number): number => {
    const s = swiftMax(0, swiftMin(1, t));
    return s * s * (3 - 2 * s);
  };
  const relief = (theta: number, z: number): number => {
    const fade = smooth(z / 2) * smooth((zBottom - 1 - z) / 2);
    let detail: number;
    switch (p.style) {
      case 'wicker':
        detail = wickerRelief(wickerDistance(theta, a, b), z, perimeter);
        break;
      case 'ribbed': {
        const flute = 0.5 + 0.5 * cos(24 * theta);
        detail = 0.9 * (flute * flute);
        break;
      }
      case 'voyager': {
        const lower = (z - p.height * 0.25) / 0.9;
        const first = exp(-(lower * lower));
        const upper = (z - p.height * 0.53) / 0.9;
        const second = exp(-(upper * upper));
        detail = 0.85 * swiftMax(first, second);
        break;
      }
    }
    // A continuous broad top band reinforces the cord holes.
    const rim = 0.65 * smooth((z - zBottom + 2) / 2) * smooth((p.height - z) / 1.2);
    return detail * p.texture * fade + rim;
  };
  const vertices: Point3[] = [];
  const triangles: Triangle[] = [];
  const rowAngles = levels.map((z) => (z < zBottom - 1e-8 ? detailedAngles : angles));
  const outerStarts: number[] = [];
  for (let row = 0; row < levels.length; row++) {
    const z = levels[row] as number;
    outerStarts.push(vertices.length);
    for (const theta of rowAngles[row] as number[]) {
      const maximum = radius(theta, a, b, 0, p.style);
      const r = swiftMin(maximum, baseRadius(theta, z, false) + relief(theta, z));
      vertices.push({ x: r * cos(theta), y: r * sin(theta), z });
    }
  }
  const innerStart = vertices.length;
  for (let row = floorRow; row < levels.length; row++) {
    const z = levels[row] as number;
    for (const theta of angles) {
      const r = baseRadius(theta, z, true);
      vertices.push({ x: r * cos(theta), y: r * sin(theta), z });
    }
  }
  const outer = (row: number, col: number): number => (outerStarts[row] as number) + col;
  const inner = (row: number, col: number): number => innerStart + (row - floorRow) * n + col;
  for (let row = 0; row < levels.length - 1; row++) {
    // Stitch the fine woven wall into the coarser reinforced hole band
    // without T-junctions, preserving the opening patches' boundaries.
    const lower = rowAngles[row] as number[];
    const upper = rowAngles[row + 1] as number[];
    let i = 0;
    let j = 0;
    while (i < lower.length || j < upper.length) {
      const nextLower = i + 1 < lower.length ? (lower[i + 1] as number) : 2 * PI;
      const nextUpper = j + 1 < upper.length ? (upper[j + 1] as number) : 2 * PI;
      const a = outer(row, i % lower.length);
      const d = outer(row + 1, j % upper.length);
      if (Math.abs(nextLower - nextUpper) < 1e-10) {
        const b = outer(row, (i + 1) % lower.length);
        const c = outer(row + 1, (j + 1) % upper.length);
        triangles.push({ a, b, c }, { a, b: c, c: d });
        i += 1;
        j += 1;
      } else if (nextLower < nextUpper) {
        triangles.push({ a, b: outer(row, (i + 1) % lower.length), c: d });
        i += 1;
      } else {
        triangles.push({ a, b: outer(row + 1, (j + 1) % upper.length), c: d });
        j += 1;
      }
    }
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      if (row >= floorRow) {
        const a = inner(row, j);
        const b = inner(row, k);
        const c = inner(row + 1, k);
        const d = inner(row + 1, j);
        triangles.push({ a, b: c, c: b }, { a, b: d, c });
      }
    }
  }
  const bottom = vertices.length;
  vertices.push(zero());
  const floor = vertices.length;
  vertices.push({ x: 0, y: 0, z: pFloorThickness });
  const top = levels.length - 1;
  const firstRowCount = (rowAngles[0] as number[]).length;
  for (let j = 0; j < firstRowCount; j++) {
    triangles.push({ a: bottom, b: outer(0, (j + 1) % firstRowCount), c: outer(0, j) });
  }
  for (let j = 0; j < n; j++) {
    const k = (j + 1) % n;
    triangles.push({ a: floor, b: inner(floorRow, j), c: inner(floorRow, k) });
    triangles.push({ a: outer(top, j), b: outer(top, k), c: inner(top, k) });
    triangles.push({ a: outer(top, j), b: inner(top, k), c: inner(top, j) });
  }
  const mesh = new BalloonMesh(vertices, triangles, atan(swiftMax(a, b) * 0.14 / p.height) * 180 / PI);
  roundCordHoles(mesh, p, holeRow, stringLayout, outer, inner, (theta, z, inside) => {
    if (inside) return baseRadius(theta, z, true);
    return swiftMin(radius(theta, a, b, 0, p.style), baseRadius(theta, z, false) + relief(theta, z));
  });
  return mesh;
}

/**
 * Replace each rectangular wall patch with a circular annulus, a bevel on
 * each mouth, and a coaxial bore. Shared angular columns would instead make
 * the outside opening wider than the inside and distort the tunnel.
 */
function roundCordHoles(
  mesh: BalloonMesh,
  p: BasketParameters,
  row: number,
  stringLayout: StringHolesLayout,
  outer: (row: number, col: number) => number,
  inner: (row: number, col: number) => number,
  surface: (theta: number, z: number, inside: boolean) => number,
): void {
  const count = 64;
  const bevel = 0.35;
  const n = stringLayout.angles.length;
  const pHoleCenter = holeCenter(p);
  // Circumscribe the requested clearance, including between polygon edges.
  const bore = p.cordClearance / 2 / cos(PI / count);
  const mouth = bore + bevel;
  const patchVertices = new Set<number>();
  const frames: [number[], number[]][] = [];
  for (const column of stringLayout.centers) {
    const frame = (index: (row: number, col: number) => number): number[] => {
      const left = (column + n - 1) % n;
      const right = (column + 1) % n;
      const boundary = [
        index(row - 1, column),
        index(row - 1, right),
        index(row, right),
        index(row + 1, right),
        index(row + 1, column),
        index(row + 1, left),
        index(row, left),
        index(row - 1, left),
      ];
      for (const vertex of boundary) patchVertices.add(vertex);
      patchVertices.add(index(row, column));
      return boundary;
    };
    frames.push([frame(outer), frame(inner)]);
  }
  mesh.triangles = mesh.triangles.filter((t) => !(patchVertices.has(t.a) && patchVertices.has(t.b) && patchVertices.has(t.c)));
  const face = (a: number, b: number, c: number, reverse = false): void => {
    mesh.triangles.push(reverse ? { a, b: c, c: b } : { a, b, c });
  };
  for (let side = 0; side < frames.length; side++) {
    const sideFrames = frames[side] as [number[], number[]];
    const center = side * PI / 2;
    const normal: Point3 = { x: cos(center), y: sin(center), z: 0 };
    const tangent: Point3 = { x: -sin(center), y: cos(center), z: 0 };
    const ring = (ringRadius: number, inside: boolean, inset: number): number[] => {
      const indices: number[] = [];
      for (let i = 0; i < count; i++) {
        const phase = 2 * PI * i / count;
        const u = ringRadius * sin(phase);
        const z = pHoleCenter - ringRadius * cos(phase);
        // Intersect the actual tapered/curved surface at a fixed
        // tangential coordinate. Both bore ends share the same u,z.
        let low = -PI / 4;
        let high = PI / 4;
        for (let step = 0; step < 40; step++) {
          const mid = (low + high) / 2;
          if (surface(center + mid, z, inside) * sin(mid) < u) low = mid;
          else high = mid;
        }
        const angle = (low + high) / 2;
        const depth = surface(center + angle, z, inside) * cos(angle) + inset;
        const index = mesh.vertices.length;
        mesh.vertices.push(add(add(scale(normal, depth), scale(tangent, u)), { x: 0, y: 0, z }));
        indices.push(index);
      }
      return indices;
    };
    const outside = ring(mouth, false, 0);
    const outerBore = ring(bore, false, -bevel);
    const innerBore = ring(bore, true, bevel);
    const inside = ring(mouth, true, 0);
    const openings: [number[], number[], boolean][] = [
      [sideFrames[0], outside, false],
      [sideFrames[1], inside, true],
    ];
    for (const [frame, hole, reverse] of openings) {
      for (let sector = 0; sector < 8; sector++) {
        const first = intDiv(sector * count, 8);
        const last = intDiv((sector + 1) * count, 8);
        const a = frame[sector] as number;
        const b = frame[(sector + 1) % 8] as number;
        face(a, b, hole[last % count] as number, reverse);
        for (let j = first; j < last; j++) face(a, hole[(j + 1) % count] as number, hole[j] as number, reverse);
      }
    }
    const tunnels: [number[], number[]][] = [
      [outside, outerBore],
      [outerBore, innerBore],
      [innerBore, inside],
    ];
    for (const [start, end] of tunnels) {
      for (let j = 0; j < count; j++) {
        const k = (j + 1) % count;
        face(start[j] as number, start[k] as number, end[k] as number);
        face(start[j] as number, end[k] as number, end[j] as number);
      }
    }
  }
  compact(mesh);
}

/** Swift `enum BasketGenerator`. */
export const BasketGenerator = { wickerDistance, wickerRelief, radius, generate };

// SWIFT-DIFF: StringHoles.layout (StringHoles.swift:20-54) and compact (:106-117) stay private here
// because core/balloon/stringHoles.ts belongs to WP-K2 and is not on main yet; this port does not
// depend on the merge order. Swap to that module once it has landed.
interface StringHolesLayout {
  angles: number[];
  centers: number[];
}

function layout(samples: number, clearance: number, innerRadius: (angle: number) => number): StringHolesLayout {
  const tau = 2 * PI;
  const half = clearance / Math.sqrt(2);
  const centers: number[] = [];
  for (let i = 0; i < 4; i++) centers.push(i * PI / 2);
  const spans = centers.map((center) => {
    let lo = 0.0;
    let hi = PI / 4 - 0.01;
    for (let step = 0; step < 40; step++) {
      const mid = (lo + hi) / 2;
      if (innerRadius(center + mid) * sin(mid) < half) lo = mid;
      else hi = mid;
    }
    return hi;
  });
  const wrapped = (a: number): number => (a + tau) % tau;
  const difference = (a: number, b: number): number => Math.abs(atan2(sin(a - b), cos(a - b)));
  const isReserved = (angle: number): boolean => {
    for (let c = 0; c < centers.length; c++) {
      if (difference(angle, centers[c] as number) < (spans[c] as number) + 1e-8) return true;
    }
    return false;
  };
  const angles: number[] = [];
  for (let i = 0; i < samples; i++) {
    const angle = tau * i / samples;
    if (!isReserved(angle)) angles.push(angle);
  }
  for (let c = 0; c < centers.length; c++) {
    const center = centers[c] as number;
    const span = spans[c] as number;
    angles.push(wrapped(center - span), center, wrapped(center + span));
  }
  sortDoubles(angles);
  while (angles.length < samples) {
    let best = -1;
    let bestWidth = 0.0;
    for (let i = 0; i < angles.length; i++) {
      const next = i + 1 < angles.length ? (angles[i + 1] as number) : (angles[0] as number) + tau;
      const mid = wrapped(((angles[i] as number) + next) / 2);
      if (isReserved(mid)) continue;
      if (next - (angles[i] as number) > bestWidth) {
        best = i;
        bestWidth = next - (angles[i] as number);
      }
    }
    if (!(best >= 0)) break;
    const next = best + 1 < angles.length ? (angles[best + 1] as number) : (angles[0] as number) + tau;
    angles.push(wrapped(((angles[best] as number) + next) / 2));
    sortDoubles(angles);
  }
  return { angles, centers: centers.map((center) => angles.findIndex((angle) => Math.abs(angle - center) < 1e-8)) };
}

function compact(mesh: BalloonMesh): void {
  const used = new Uint8Array(mesh.vertices.length);
  for (const t of mesh.triangles) {
    used[t.a] = 1;
    used[t.b] = 1;
    used[t.c] = 1;
  }
  const remap = new Int32Array(used.length);
  const vertices: Point3[] = [];
  for (let i = 0; i < used.length; i++) {
    if (used[i] === 1) {
      remap[i] = vertices.length;
      vertices.push(mesh.vertices[i] as Point3);
    }
  }
  const range = mesh.innerVertexRange;
  if (range !== undefined) {
    let first = -1;
    let last = -1;
    for (let i = range.lowerBound; i < range.upperBound; i++) {
      if (used[i] === 1) {
        if (first < 0) first = i;
        last = i;
      }
    }
    if (first >= 0) mesh.innerVertexRange = { lowerBound: remap[first] as number, upperBound: (remap[last] as number) + 1 };
  }
  mesh.triangles = mesh.triangles.map((t) => ({ a: remap[t.a] as number, b: remap[t.b] as number, c: remap[t.c] as number }));
  mesh.vertices = vertices;
}
