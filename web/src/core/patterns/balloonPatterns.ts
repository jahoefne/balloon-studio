// Ported from mac/Sources/BalloonStudio/BalloonPatterns.swift @ cbda68d (lines 26-122: PatternSettings,
// 124-252: PaintedBalloon, 254-315: PurgeSettings and PurgeEstimate). The enums (:3-24) are in core/types.ts.
import { BalloonMesh } from '../geometry/mesh';
import type { Point3, Triangle } from '../geometry/point3';
import { atan2, hypot, PI } from '../swift/dmath';
import { encodeJSONCompact, JSONKeyedContainer } from '../swift/json';
import { arrayMax, arrayMin, swiftMax, swiftMin, swiftMin3 } from '../swift/minmax';
import { intCeil, intFloor, rounded } from '../swift/rounding';
import { stableSorted } from '../swift/sort';
import { isSwiftWhitespace, swiftCharacters } from '../swift/text';
import { BALLOON_PATTERNS, BALLOON_TEXT_FONTS, FILAMENT_COLORS, patternHasRelief } from '../types';
import type { BalloonParameters, FilamentColor, PatternSettings, PurgeEstimate, PurgeSettings } from '../types';
import { NightFlightRelief } from './nightFlightRelief';
import type { PatternRasterizers } from './raster';
import { BalloonTextLayout, highest, lowest } from './textLayout';

// MARK: PatternSettings

/** Swift `PatternSettings()`. */
export const PATTERN_DEFAULTS: Readonly<PatternSettings> = Object.freeze({
  style: 'Solid',
  bands: 6,
  repeats: 8,
  rows: 2,
  size: 18,
  base: 'Saffron',
  detail: 'Cream',
  text: 'Hello',
  textFont: 'Rounded',
  textRepeats: 3,
  textHeight: 24,
  flightCompositionVersion: 3,
  reliefDepth: 2.4,
  capHeight: 18,
  flightBody: 'Cream',
  flightCap: 'Midnight blue',
});

export function makePatternSettings(overrides: Partial<PatternSettings> = {}): PatternSettings {
  return { ...PATTERN_DEFAULTS, ...overrides };
}

export function baseColor(s: PatternSettings): FilamentColor {
  return patternHasRelief(s.style) ? s.flightBody : s.base;
}
export function detailColor(s: PatternSettings): FilamentColor {
  return patternHasRelief(s.style) ? s.flightCap : s.detail;
}
export function multicolor(s: PatternSettings): boolean {
  return s.style !== 'Solid' && baseColor(s) !== detailColor(s);
}
export function capBoundary(s: PatternSettings, p: BalloonParameters): number {
  return p.height * (1 - s.capHeight / 100);
}
export function maximumTextHeight(_s: PatternSettings, p: BalloonParameters): number {
  return swiftMin(60, (p.height - p.neckHeight) * 0.28);
}
export function maximumSize(s: PatternSettings, p: BalloonParameters): number {
  return swiftMin3(40, ((p.height - p.neckHeight) * 0.5) / swiftMax(1, s.rows), ((PI * p.diameter * 0.55) / swiftMax(1, s.repeats)) * 0.75);
}

export function normalized(input: PatternSettings, p: BalloonParameters): PatternSettings {
  const s = { ...input };
  s.bands = swiftMin(24, swiftMax(2, input.bands));
  s.repeats = swiftMin(24, swiftMax(1, input.repeats));
  s.rows = swiftMin(6, swiftMax(1, input.rows));
  s.size = swiftMin(maximumSize(s, p), swiftMax(3, Number.isFinite(input.size) ? input.size : 18));
  s.text = swiftCharacters(input.text)
    .slice(0, 64)
    .map((character) => (isSwiftWhitespace(character) ? ' ' : character))
    .join('');
  s.textRepeats = swiftMin(24, swiftMax(1, input.textRepeats));
  s.textHeight = swiftMin(maximumTextHeight(s, p), swiftMax(3, Number.isFinite(input.textHeight) ? input.textHeight : 24));
  s.flightCompositionVersion = 3;
  s.reliefDepth = swiftMin(4, swiftMax(1.2, Number.isFinite(input.reliefDepth) ? input.reliefDepth : 2.4));
  s.capHeight = swiftMin(28, swiftMax(10, Number.isFinite(input.capHeight) ? input.capHeight : 18));
  return s;
}

/** Swift `color(at:normal:parameters:)`. */
export function color(s: PatternSettings, v: Point3, normal: Point3, p: BalloonParameters): number {
  if (!multicolor(s)) return 0;
  // The whole upper cross section, including the cavity and hanger, uses the cap filament.
  if (patternHasRelief(s.style)) return v.z >= capBoundary(s, p) ? 1 : 0;
  if (s.style === 'Horizontal stripes') {
    return swiftMin(s.bands - 1, swiftMax(0, intFloor((v.z / p.height) * s.bands))) % 2;
  }
  // Paint only the outside envelope; cavities and attachments remain the base color.
  if (!(v.z > p.neckHeight && v.z < p.height * 0.9 && normal.x * v.x + normal.y * v.y > 0)) return 0;
  const step = (2 * PI) / s.repeats;
  const rows = s.rows;
  for (let row = 0; row < rows; row++) {
    const center = p.neckHeight + (p.height - p.neckHeight) * (rows === 1 ? 0.55 : 0.3 + (0.5 * row) / (rows - 1));
    const y = (v.z - center) / (s.size / 2);
    if (!(Math.abs(y) < 1.3)) continue;
    const angle = atan2(v.y, v.x) - (row % 2 === 0 ? 0 : step / 2);
    const delta = angle - step * rounded(angle / step);
    const x = (delta * hypot(v.x, v.y)) / (s.size / 2);
    if (!(Math.abs(x) < 1.3)) continue;
    switch (s.style) {
      case 'Polka dots':
        if (x * x + y * y <= 1) return 1;
        break;
      case 'Diamonds':
        if (Math.abs(x) + Math.abs(y) <= 1) return 1;
        break;
      case 'Hearts': {
        const hx = x * 1.2;
        const hy = y * 1.2 + 0.1;
        const q = hx * hx + hy * hy - 1;
        if (q * q * q - hx * hx * hy * hy * hy <= 0) return 1;
        break;
      }
      default:
        break;
    }
  }
  return 0;
}

/** The `init(from:)` body, :100-121. */
function decodePatternFields(c: JSONKeyedContainer): PatternSettings {
  const s = makePatternSettings();
  s.style = c.enumerationIfPresent('style', BALLOON_PATTERNS) ?? s.style;
  s.bands = c.intIfPresent('bands') ?? s.bands;
  s.repeats = c.intIfPresent('repeats') ?? s.repeats;
  s.rows = c.intIfPresent('rows') ?? s.rows;
  s.size = c.doubleIfPresent('size') ?? s.size;
  s.base = c.enumerationIfPresent('base', FILAMENT_COLORS) ?? s.base;
  s.detail = c.enumerationIfPresent('detail', FILAMENT_COLORS) ?? s.detail;
  s.text = c.stringIfPresent('text') ?? s.text;
  s.textFont = c.enumerationIfPresent('textFont', BALLOON_TEXT_FONTS) ?? s.textFont;
  s.textRepeats = c.intIfPresent('textRepeats') ?? s.textRepeats;
  s.textHeight = c.doubleIfPresent('textHeight') ?? s.textHeight;
  s.reliefDepth = c.doubleIfPresent('reliefDepth') ?? s.reliefDepth;
  if (c.intIfPresent('flightCompositionVersion') === undefined) {
    s.reliefDepth = swiftMax(2.4, s.reliefDepth);
  }
  s.capHeight = c.doubleIfPresent('capHeight') ?? s.capHeight;
  s.flightBody = c.enumerationIfPresent('flightBody', FILAMENT_COLORS) ?? s.flightBody;
  s.flightCap = c.enumerationIfPresent('flightCap', FILAMENT_COLORS) ?? s.flightCap;
  return s;
}

/** The same decoder for a value that JSON.parse (or the app) already produced. */
export function patternFromValue(value: unknown): PatternSettings {
  return decodePatternFields(JSONKeyedContainer.fromValue(value));
}

/** Swift `JSONDecoder().decode(PatternSettings.self, from:)`. */
export function patternFromJSON(text: string): PatternSettings {
  return decodePatternFields(JSONKeyedContainer.fromJSON(text));
}

/** Swift `StableJSON.encode(settings)`. */
export function patternToJSON(s: PatternSettings): string {
  return encodeJSONCompact({ ...s });
}

// MARK: PaintedBalloon

/** SWIFT-DIFF: `Set<Edge>` and `[Edge: Int]` of refine and split, as open addressing on the canonical (lo, hi); neither is iterated unsorted. */
class EdgeTable {
  private lo: Int32Array;
  private hi: Int32Array;
  private values: Int32Array;
  private mask: number;
  size = 0;

  constructor(capacity = 1 << 12) {
    this.lo = new Int32Array(capacity).fill(-1);
    this.hi = new Int32Array(capacity);
    this.values = new Int32Array(capacity);
    this.mask = capacity - 1;
  }

  private slot(lo: number, hi: number): number {
    const { lo: los, hi: his, mask } = this;
    let slot = (Math.imul(lo, 0x9e3779b1) ^ Math.imul(hi, 0x85ebca77)) & mask;
    for (;;) {
      const stored = los[slot] as number;
      if (stored === -1 || (stored === lo && his[slot] === hi)) return slot;
      slot = (slot + 1) & mask;
    }
  }

  /** Inserts the edge unless present. */
  insert(x: number, y: number): void {
    const lo = swiftMin(x, y);
    const hi = swiftMax(x, y);
    const slot = this.slot(lo, hi);
    if (this.lo[slot] !== -1) return;
    this.lo[slot] = lo;
    this.hi[slot] = hi;
    this.values[slot] = -1;
    this.size++;
    if (this.size * 2 > this.mask) this.grow();
  }

  /** The stored value of the edge, or -1. */
  get(x: number, y: number): number {
    const slot = this.slot(swiftMin(x, y), swiftMax(x, y));
    return this.lo[slot] === -1 ? -1 : (this.values[slot] as number);
  }

  /** `self[Edge(x, y)] = value`. */
  set(x: number, y: number, value: number): void {
    this.insert(x, y);
    this.values[this.slot(swiftMin(x, y), swiftMax(x, y))] = value;
  }

  /** `sorted(by: {$0.a == $1.a ? $0.b < $1.b : $0.a < $1.a})` as `[a0, b0, a1, b1, …]`. */
  sortedEdges(): Int32Array {
    const { lo, hi } = this;
    // A key a·2³¹ + b is exact (a, b < 2²²) and orders like the predicate.
    const keys = new Float64Array(this.size);
    let n = 0;
    for (let slot = 0; slot < lo.length; slot++) {
      if (lo[slot] !== -1) keys[n++] = (lo[slot] as number) * 2147483648 + (hi[slot] as number);
    }
    keys.sort((a, b) => a - b);
    const out = new Int32Array(this.size * 2);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i] as number;
      const a = Math.floor(key / 2147483648);
      out[2 * i] = a;
      out[2 * i + 1] = key - a * 2147483648;
    }
    return out;
  }

  private grow(): void {
    const { lo, hi, values } = this;
    const capacity = lo.length * 2;
    this.lo = new Int32Array(capacity).fill(-1);
    this.hi = new Int32Array(capacity);
    this.values = new Int32Array(capacity);
    this.mask = capacity - 1;
    for (let i = 0; i < lo.length; i++) {
      if (lo[i] === -1) continue;
      const slot = this.slot(lo[i] as number, hi[i] as number);
      this.lo[slot] = lo[i] as number;
      this.hi[slot] = hi[i] as number;
      this.values[slot] = values[i] as number;
    }
  }
}

/** Swift `struct PaintedBalloon`. SWIFT-DIFF: `colors` is a Uint8Array (`[Int]`), holding 0 or 1 per triangle. */
export class PaintedBalloon {
  readonly mesh: BalloonMesh;
  readonly colors: Uint8Array;

  constructor(mesh: BalloonMesh, colors: Uint8Array) {
    this.mesh = mesh;
    this.colors = colors;
  }

  static make(original: BalloonMesh, parameters: BalloonParameters, settings: PatternSettings, rasterizers: PatternRasterizers): PaintedBalloon {
    const s = normalized(settings, parameters);
    const lettering = multicolor(s) && s.style === 'Text' ? BalloonTextLayout.create(s, parameters, rasterizers.textRasterizer) : null;
    // SWIFT-DIFF: `var mesh = original` copies the struct. Point3 values are never changed in place, so copying the arrays will do.
    const mesh = new BalloonMesh(original.vertices.slice(), original.triangles.slice(), original.maxOverhang, original.innerVertexRange);
    if (patternHasRelief(s.style)) {
      const relief = new NightFlightRelief(s, parameters, original, rasterizers);
      for (let i = 0; i < 7; i++) {
        if (!refine(mesh, parameters, s, null, relief)) break;
      }
      relief.apply(mesh);
      if (multicolor(s)) split(mesh, capBoundary(s, parameters));
    }
    // Shared intersections preserve watertight topology and put stripe edges on exact Z planes.
    if (multicolor(s) && s.style === 'Horizontal stripes') {
      for (let band = 1; band < s.bands; band++) split(mesh, (parameters.height * band) / s.bands);
    }
    if (multicolor(s) && s.style === 'Text' && lettering !== null) {
      // Inspect glyph bounds too: sampling only corners can miss a thin stroke entirely.
      for (let i = 0; i < 7; i++) {
        if (!refine(mesh, parameters, s, lettering, null)) break;
      }
    } else if (multicolor(s) && s.style !== 'Horizontal stripes' && s.style !== 'Text' && !patternHasRelief(s.style)) {
      // Refine only color boundaries, sharing every new edge vertex with adjacent faces.
      for (let i = 0; i < 2; i++) refine(mesh, parameters, s, null, null);
    }
    const third = 1.0 / 3;
    const vertices = mesh.vertices;
    const triangles = mesh.triangles;
    const colors = new Uint8Array(triangles.length);
    for (let f = 0; f < triangles.length; f++) {
      const t = triangles[f] as Triangle;
      const a = vertices[t.a] as Point3;
      const b = vertices[t.b] as Point3;
      const c = vertices[t.c] as Point3;
      const point = { x: (a.x + b.x + c.x) * third, y: (a.y + b.y + c.y) * third, z: (a.z + b.z + c.z) * third };
      const normal = faceNormal(a, b, c);
      colors[f] = s.style === 'Text' ? (lettering?.color(point, normal) ?? 0) : color(s, point, normal, parameters);
    }
    return new PaintedBalloon(mesh, colors);
  }
}

/** `(b-a).cross(c-a)` */
function faceNormal(a: Point3, b: Point3, c: Point3): Point3 {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const abZ = b.z - a.z;
  const acX = c.x - a.x;
  const acY = c.y - a.y;
  const acZ = c.z - a.z;
  return { x: abY * acZ - abZ * acY, y: abZ * acX - abX * acZ, z: abX * acY - abY * acX };
}

/** `(a+b)*0.5` */
function midpoint(a: Point3, b: Point3): Point3 {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, z: (a.z + b.z) * 0.5 };
}

function refine(mesh: BalloonMesh, parameters: BalloonParameters, settings: PatternSettings, lettering: BalloonTextLayout | null, relief: NightFlightRelief | null): boolean {
  const vertices = mesh.vertices;
  const triangles = mesh.triangles;
  const marked = new EdgeTable();
  const third = 1.0 / 3;
  for (let f = 0; f < triangles.length; f++) {
    const t = triangles[f] as Triangle;
    const a = vertices[t.a] as Point3;
    const b = vertices[t.b] as Point3;
    const c = vertices[t.c] as Point3;
    const normal = faceNormal(a, b, c);
    if (relief !== null) {
      if (relief.needsRefinement(a, b, c, normal)) {
        // Wide/short envelopes have long, thin faces. Bisect only oversized
        // edges instead of repeatedly quartering their already short direction.
        if (relief.edgeNeedsRefinement(a, b)) marked.insert(t.a, t.b);
        if (relief.edgeNeedsRefinement(b, c)) marked.insert(t.b, t.c);
        if (relief.edgeNeedsRefinement(c, a)) marked.insert(t.c, t.a);
      }
      continue;
    }
    if (lettering !== null) {
      if (lettering.needsRefinement(a, b, c, normal)) {
        marked.insert(t.a, t.b);
        marked.insert(t.b, t.c);
        marked.insert(t.c, t.a);
      }
      continue;
    }
    // SWIFT-DIFF: Swift colors all seven samples; color() is pure, so stopping at the second color changes nothing.
    const first = color(settings, a, normal, parameters);
    const mixed =
      color(settings, b, normal, parameters) !== first ||
      color(settings, c, normal, parameters) !== first ||
      color(settings, midpoint(a, b), normal, parameters) !== first ||
      color(settings, midpoint(b, c), normal, parameters) !== first ||
      color(settings, midpoint(c, a), normal, parameters) !== first ||
      color(settings, { x: (a.x + b.x + c.x) * third, y: (a.y + b.y + c.y) * third, z: (a.z + b.z + c.z) * third }, normal, parameters) !== first;
    if (mixed) {
      marked.insert(t.a, t.b);
      marked.insert(t.b, t.c);
      marked.insert(t.c, t.a);
    }
  }
  if (marked.size === 0) return false;
  // Deterministic insertion is important for identical exports and regression tests.
  const edges = marked.sortedEdges();
  for (let i = 0; i < edges.length; i += 2) {
    const edgeA = edges[i] as number;
    const edgeB = edges[i + 1] as number;
    marked.set(edgeA, edgeB, vertices.length);
    vertices.push(midpoint(vertices[edgeA] as Point3, vertices[edgeB] as Point3));
  }
  const faces: Triangle[] = [];
  const add = (a: number, b: number, c: number): void => {
    faces.push({ a, b, c });
  };
  for (let f = 0; f < triangles.length; f++) {
    const t = triangles[f] as Triangle;
    const v0 = t.a;
    const v1 = t.b;
    const v2 = t.c;
    const m0 = marked.get(v0, v1);
    const m1 = marked.get(v1, v2);
    const m2 = marked.get(v2, v0);
    const count = (m0 >= 0 ? 1 : 0) + (m1 >= 0 ? 1 : 0) + (m2 >= 0 ? 1 : 0);
    if (count === 0) faces.push(t);
    else if (count === 3) {
      add(v0, m0, m2);
      add(m0, v1, m1);
      add(m2, m1, v2);
      add(m0, m1, m2);
    } else if (count === 1) {
      if (m0 >= 0) {
        add(v0, m0, v2);
        add(m0, v1, v2);
      } else if (m1 >= 0) {
        add(v1, m1, v0);
        add(m1, v2, v0);
      } else {
        add(v2, m2, v1);
        add(m2, v0, v1);
      }
    } else if (m0 >= 0 && m2 >= 0) {
      // i = 0: a = v0, b = v1, c = v2, ab = m0, ca = m2
      add(v0, m0, m2);
      add(m0, v1, v2);
      add(m0, v2, m2);
    } else if (m1 >= 0 && m0 >= 0) {
      // i = 1: a = v1, b = v2, c = v0, ab = m1, ca = m0
      add(v1, m1, m0);
      add(m1, v2, v0);
      add(m1, v0, m0);
    } else {
      // i = 2: a = v2, b = v0, c = v1, ab = m2, ca = m1
      add(v2, m2, m1);
      add(m2, v0, v1);
      add(m2, v1, m1);
    }
  }
  mesh.triangles = faces;
  mesh.innerVertexRange = undefined;
  return true;
}

function split(mesh: BalloonMesh, z: number): void {
  const vertices = mesh.vertices;
  const triangles = mesh.triangles;
  const intersections = new EdgeTable();
  const result: Triangle[] = [];
  const intersection = (a: number, b: number): number => {
    if (Math.abs((vertices[a] as Point3).z - z) < 1e-9) return a;
    if (Math.abs((vertices[b] as Point3).z - z) < 1e-9) return b;
    const known = intersections.get(a, b);
    if (known >= 0) return known;
    const v = vertices[swiftMin(a, b)] as Point3;
    const w = vertices[swiftMax(a, b)] as Point3;
    const t = (z - v.z) / (w.z - v.z);
    const p = { x: v.x + (w.x - v.x) * t, y: v.y + (w.y - v.y) * t, z };
    const i = vertices.length;
    vertices.push(p);
    intersections.set(a, b, i);
    return i;
  };
  for (let f = 0; f < triangles.length; f++) {
    const t = triangles[f] as Triangle;
    const za = (vertices[t.a] as Point3).z;
    const zb = (vertices[t.b] as Point3).z;
    const zc = (vertices[t.c] as Point3).z;
    if (!(lowest(za, zb, zc) < z - 1e-9 && highest(za, zb, zc) > z + 1e-9)) {
      result.push(t);
      continue;
    }
    const ids = [t.a, t.b, t.c];
    for (const side of [-1.0, 1.0]) {
      const polygon: number[] = [];
      for (let i = 0; i < 3; i++) {
        const a = ids[i] as number;
        const b = ids[(i + 1) % 3] as number;
        const insideA = ((vertices[a] as Point3).z - z) * side >= -1e-9;
        const insideB = ((vertices[b] as Point3).z - z) * side >= -1e-9;
        if (insideA) polygon.push(a);
        if (insideA !== insideB) polygon.push(intersection(a, b));
      }
      const unique: number[] = [];
      for (const i of polygon) if (!unique.includes(i)) unique.push(i);
      if (unique.length >= 3) {
        for (let i = 1; i < unique.length - 1; i++) result.push({ a: unique[0] as number, b: unique[i] as number, c: unique[i + 1] as number });
      }
    }
  }
  mesh.triangles = result;
  mesh.innerVertexRange = undefined;
}

// MARK: PurgeSettings

/** Swift `PurgeSettings()`. */
export const PURGE_DEFAULTS: Readonly<PurgeSettings> = Object.freeze({ layerHeight: 0.2, baseToDetail: 400, detailToBase: 400, multiplier: 1, density: 1.24 });

export function makePurgeSettings(overrides: Partial<PurgeSettings> = {}): PurgeSettings {
  return { ...PURGE_DEFAULTS, ...overrides };
}

export function normalizedPurge(input: PurgeSettings): PurgeSettings {
  const clamp = (v: number, lo: number, hi: number, fallback: number): number => (Number.isFinite(v) ? swiftMin(hi, swiftMax(lo, v)) : fallback);
  const s = { ...input };
  s.layerHeight = clamp(input.layerHeight, 0.08, 0.32, 0.2);
  s.baseToDetail = clamp(input.baseToDetail, 0, 1500, 400);
  s.detailToBase = clamp(input.detailToBase, 0, 1500, 400);
  s.multiplier = clamp(input.multiplier, 0, 2, 1);
  s.density = clamp(input.density, 0.5, 2, 1.24);
  return s;
}

/** Synthesized `init(from:)`: every key is required. */
function decodePurgeFields(c: JSONKeyedContainer): PurgeSettings {
  return {
    layerHeight: c.double('layerHeight'),
    baseToDetail: c.double('baseToDetail'),
    detailToBase: c.double('detailToBase'),
    multiplier: c.double('multiplier'),
    density: c.double('density'),
  };
}

export function purgeFromValue(value: unknown): PurgeSettings {
  return decodePurgeFields(JSONKeyedContainer.fromValue(value));
}

export function purgeFromJSON(text: string): PurgeSettings {
  return decodePurgeFields(JSONKeyedContainer.fromJSON(text));
}

export function purgeToJSON(s: PurgeSettings): string {
  return encodeJSONCompact({ ...s });
}

// MARK: PurgeEstimate

// Fixed-height cross sections of the actual painted mesh. Count each color only once per layer,
// regardless of the number of islands. Compare retained-tool and fixed-order scheduling.
export function calculatePurgeEstimate(painted: PaintedBalloon, settings: PurgeSettings): PurgeEstimate {
  const s = normalizedPurge(settings);
  const count = swiftMax(1, intCeil(painted.mesh.dimensions.z / s.layerHeight));
  const differences = [new Int32Array(count + 1), new Int32Array(count + 1)] as const;
  const vertices = painted.mesh.vertices;
  const triangles = painted.mesh.triangles;
  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i] as Triangle;
    const za = (vertices[t.a] as Point3).z;
    const zb = (vertices[t.b] as Point3).z;
    const zc = (vertices[t.c] as Point3).z;
    const low = lowest(za, zb, zc);
    const high = highest(za, zb, zc);
    if (!(high - low > 1e-9)) continue;
    // Sample at the layer midpoint, including one partial layer at the crown.
    const first = swiftMax(0, intCeil(low / s.layerHeight - 0.5));
    const last = swiftMin(count - 1, intCeil(high / s.layerHeight - 0.5) - 1);
    if (first <= last) {
      const row = differences[painted.colors[i] as 0 | 1];
      row[first] = (row[first] as number) + 1;
      row[last + 1] = (row[last + 1] as number) - 1;
    }
  }
  let active0 = 0;
  let active1 = 0;
  const masks: number[] = [];
  for (let layer = 0; layer < count; layer++) {
    active0 += differences[0][layer] as number;
    active1 += differences[1][layer] as number;
    masks.push((active0 > 0 ? 1 : 0) | (active1 > 0 ? 2 : 0));
  }
  const schedule = (retain: boolean, reverse: boolean): [number, number] => {
    let previous: number | undefined;
    let changes = 0;
    let volume = 0.0;
    for (const mask of masks) {
      if (mask === 0) continue;
      let order = mask === 3 ? (reverse ? [1, 0] : [0, 1]) : [mask === 1 ? 0 : 1];
      if (retain && previous !== undefined && order.includes(previous)) {
        const last = previous;
        order = stableSorted(order, (x, y) => x === last && y !== last);
      }
      for (const filament of order) {
        if (previous !== undefined && previous !== filament) {
          changes += 1;
          volume += previous === 0 ? s.baseToDetail : s.detailToBase;
        }
        previous = filament;
      }
    }
    return [changes, (volume * s.multiplier * s.density) / 1000];
  };
  const scenarios = [schedule(true, false), schedule(true, true), schedule(false, false), schedule(false, true)];
  const changeCounts = scenarios.map((x) => x[0]);
  const grams = scenarios.map((x) => x[1]);
  return {
    mixedLayers: masks.filter((mask) => mask === 3).length,
    minimumChanges: arrayMin(changeCounts) as number,
    maximumChanges: arrayMax(changeCounts) as number,
    minimumGrams: arrayMin(grams) as number,
    maximumGrams: arrayMax(grams) as number,
  };
}
