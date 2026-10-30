// Ported from mac/Sources/BalloonStudio/CableClip.swift @ cbda68d (:19-510: CableClipParameters,
// CableClip, CableClipGenerator, CableClipKit). CableClipMount (:4-12) is in core/types.ts.
//
// SWIFT-DIFF: the Swift `assert`s at :293 and :351 are compiled out (`swiftc -O` in build-app.sh,
// build-reference-exporter.sh and test.sh), so nothing is checked there: a profile that cannot be
// triangulated gives no triangles and binarySTL's validate() rejects the mesh, as in the app.
import { CoreFailure, INVALID_SETTINGS_MESSAGE, type Quality } from '../api';
import { BalloonMesh } from '../geometry/mesh';
import { cross as cross3, dot, point3, type Point3 } from '../geometry/point3';
import { bore, FlatRegion } from '../lamp/cableClamp';
import { CloudMeshBuilder } from '../lamp/cloudGeometry';
import { asin, cos, hypot, PI, sin } from '../swift/dmath';
import { formatFixed, formatG } from '../swift/format';
import { encodeJSONCompact } from '../swift/json';
import { arrayMin, swiftMax, swiftMax3, swiftMin } from '../swift/minmax';
import { intDiv } from '../swift/rounding';
import { sortDoubles } from '../swift/sort';
import type { CableClipParameters, Range } from '../types';

// MARK: CableClipParameters (CableClip.swift:19-88)

/** `CableClipParameters()`: a fresh value each time. */
export function defaultParameters(): CableClipParameters {
  return {
    cableDiameter: 3.75,
    mount: 'nail',
    nailDiameter: 1.8,
    nailHeadDiameter: 3.3,
    nailHeadHeight: 0.7,
    nailGap: 3.0,
    plate: 2.0,
    length: 6.0,
    wall: 0.7,
    overlap: 0.5,
    flat: false,
  };
}

function invalidSettings(): CoreFailure {
  return new CoreFailure('invalid-settings', INVALID_SETTINGS_MESSAGE);
}

/** `try c.decodeIfPresent(Double.self, forKey:)`: absent or null is nil, a wrong type throws, as does a literal out of Double's range (`JSON.parse` makes it Infinity). */
function decodeDouble(c: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = Object.hasOwn(c, key) ? c[key] : undefined;
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidSettings();
  return value;
}

/** `try c.decodeIfPresent(Bool.self, forKey:)` */
function decodeBool(c: Readonly<Record<string, unknown>>, key: string): boolean | undefined {
  const value = Object.hasOwn(c, key) ? c[key] : undefined;
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw invalidSettings();
  return value;
}

/**
 * `init(from:)` (:42-56) on an already parsed JSON value: every key is optional, an unknown or
 * mistyped `mount` falls back to the default (:46), any other wrong type throws
 * `CoreFailure('invalid-settings')`.
 */
export function fromJSON(value: unknown): CableClipParameters {
  const p = defaultParameters();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalidSettings();
  const c = value as Readonly<Record<string, unknown>>;
  p.cableDiameter = decodeDouble(c, 'cableDiameter') ?? p.cableDiameter;
  const mount = Object.hasOwn(c, 'mount') ? c['mount'] : undefined;
  p.mount = mount === 'nail' || mount === 'adhesive' ? mount : p.mount;
  p.nailDiameter = decodeDouble(c, 'nailDiameter') ?? p.nailDiameter;
  p.nailHeadDiameter = decodeDouble(c, 'nailHeadDiameter') ?? p.nailHeadDiameter;
  p.nailHeadHeight = decodeDouble(c, 'nailHeadHeight') ?? p.nailHeadHeight;
  p.nailGap = decodeDouble(c, 'nailGap') ?? p.nailGap;
  p.plate = decodeDouble(c, 'plate') ?? p.plate;
  p.length = decodeDouble(c, 'length') ?? p.length;
  p.wall = decodeDouble(c, 'wall') ?? p.wall;
  p.overlap = decodeDouble(c, 'overlap') ?? p.overlap;
  p.flat = decodeBool(c, 'flat') ?? p.flat;
  return p;
}

/** `JSONEncoder` with `.sortedKeys` (StableJSON, plan §8). Throws on a non-finite number, as JSONEncoder does. */
export function toJSON(p: CableClipParameters): string {
  return encodeJSONCompact({
    cableDiameter: p.cableDiameter,
    mount: p.mount,
    nailDiameter: p.nailDiameter,
    nailHeadDiameter: p.nailHeadDiameter,
    nailHeadHeight: p.nailHeadHeight,
    nailGap: p.nailGap,
    plate: p.plate,
    length: p.length,
    wall: p.wall,
    overlap: p.overlap,
    flat: p.flat,
  });
}

const range = (lower: number, upper: number): Range => ({ lower, upper });
export const cableRange = range(2.0, 6.0);
export const nailRange = range(1.0, 4.0);
export const headRange = range(2.0, 8.0);
export const headHeightRange = range(0.3, 2.0);
export const nailGapRange = range(0.4, 10.0);
export const plateRange = range(1.2, 4.0);
export const lengthRange = range(4.0, 12.0);
export const wallRange = range(0.6, 1.2);
export const overlapRange = range(0.3, 1.5);

export function normalized(input: CableClipParameters): CableClipParameters {
  const p = { ...input };
  const clamp = (v: number, r: Range, fallback: number): number =>
    Number.isFinite(v) ? swiftMin(r.upper, swiftMax(r.lower, v)) : fallback;
  p.cableDiameter = clamp(input.cableDiameter, cableRange, 3.75);
  p.nailDiameter = clamp(input.nailDiameter, nailRange, 1.8);
  p.nailHeadDiameter = clamp(input.nailHeadDiameter, headRange, 3.3);
  p.nailHeadHeight = clamp(input.nailHeadHeight, headHeightRange, 0.7);
  p.nailGap = clamp(input.nailGap, nailGapRange, 3);
  p.plate = clamp(input.plate, plateRange, 2);
  p.length = clamp(input.length, lengthRange, 6);
  p.wall = clamp(input.wall, wallRange, 0.7);
  p.overlap = clamp(input.overlap, overlapRange, 0.5);
  return p;
}

export function cableText(p: CableClipParameters): string {
  return formatG(p.cableDiameter);
}
export function displayName(p: CableClipParameters): string {
  return `Cable clip · Ø ${cableText(p)} mm`;
}
export function filename(p: CableClipParameters): string {
  return `Cable-Clip-${cableText(p)}mm${p.mount === 'adhesive' ? '-adhesive' : ''}${p.flat ? '-flat' : ''}.stl`;
}

// MARK: CableClip (CableClip.swift:94-283)

export type P2 = readonly [number, number];

/**
 * The clip's dimensions, derived from the parameters. In the wall frame X runs across the cable,
 * Y along it and Z up from the wall. The strap's root is on the -X side, its free end on the +X
 * side; the plate's extension with the nail is on the +Y side of the strap.
 */
export class CableClip {
  static readonly archPlay = 0.1;
  static readonly headFloor = 0.6;
  static readonly ridge = 0.4;
  static readonly minRidge = 0.6;
  static readonly flare = 1.1;
  static readonly rootFillet = 0.6;
  static readonly flangeMargin = 0.7;
  static readonly endMargin = 1.0;
  static readonly minHalfWidth = 1.5;
  static readonly squish = 0.5;
  static readonly minOpening = 0.3;

  readonly parameters: CableClipParameters;
  readonly radius: number;
  readonly inner: number;
  readonly outer: number;
  readonly plateThickness: number;
  readonly halfWidth: number;
  readonly center: number;
  readonly tipAngle: number;
  readonly edgeX: number;
  readonly bore: number;
  readonly counterbore: number;
  readonly counterboreDepth: number;
  readonly flareEnd: number;
  /** nil for adhesive */
  readonly nailY: number | null;
  readonly plateEnd: number;
  readonly fillet: number;

  constructor(input: CableClipParameters) {
    const p = normalized(input);
    this.parameters = p;
    const c = p.cableDiameter, nail = p.mount === 'nail';
    this.radius = c / 2;
    const inner = c / 2 + CableClip.archPlay;
    this.inner = inner;
    const outer = inner + p.wall;
    this.outer = outer;
    this.bore = p.nailDiameter + 0.3;
    const counterbore = swiftMax(p.nailHeadDiameter + 0.3, this.bore + 0.4);
    this.counterbore = counterbore;
    const thickness = nail ? swiftMax(p.plate, p.nailHeadHeight + CableClip.headFloor) : p.plate;
    this.plateThickness = thickness;
    this.counterboreDepth = nail ? swiftMin(p.nailHeadHeight, thickness - CableClip.headFloor) : 0;
    this.halfWidth = swiftMax3(outer, CableClip.minHalfWidth, nail ? counterbore / 2 + CableClip.flangeMargin : 0);
    this.center = thickness + c / 2;
    const ex = swiftMax((CableClip.ridge * c) / 2, CableClip.minRidge);
    this.edgeX = ex;
    const fil = swiftMin(CableClip.rootFillet, c / 4);
    this.fillet = fil;
    // The free end stops where asked, but never closer than minOpening to the plate or the wall.
    const rm = (inner + outer) / 2, ctr = thickness + c / 2;
    const hw = swiftMax3(outer, CableClip.minHalfWidth, nail ? counterbore / 2 + CableClip.flangeMargin : 0);
    let angle = -asin(swiftMin(p.overlap, inner - 0.2) / inner);
    while (angle < 0 && CableClip.pinch([rm * cos(angle), ctr + rm * sin(angle)], p.wall, thickness, ex, inner, fil) < CableClip.minOpening) {
      angle = swiftMin(0, angle + 0.005);
    }
    this.tipAngle = angle;
    if (nail) {
      const half = p.length / 2, slant = Math.sqrt(1 + CableClip.flare * CableClip.flare);
      this.flareEnd = half + CableClip.flare * (hw - ex);
      // The counterbore keeps the asked gap to the strap and its margin to the slanted edge.
      const y = swiftMax(half + p.nailGap + counterbore / 2, half + (counterbore / 2 + CableClip.flangeMargin) * slant - CableClip.flare * ex);
      this.nailY = y;
      this.plateEnd = y + counterbore / 2 + CableClip.endMargin;
    } else {
      this.flareEnd = p.length / 2;
      this.nailY = null;
      this.plateEnd = p.length / 2;
    }
  }

  private mm(v: number): string {
    return formatFixed(v, 1);
  }
  get problem(): string | null {
    const p = this.parameters;
    if (p.mount === 'nail' && p.nailHeadDiameter < p.nailDiameter + 0.6) {
      return `A ${this.mm(p.nailHeadDiameter)} mm head is too small for a ${this.mm(p.nailDiameter)} mm nail: it needs a head of ${this.mm(p.nailDiameter + 0.6)} mm or more to hold the plate.`;
    }
    return null;
  }
  /** The overlap the strap really has, after keeping its tip off the plate. */
  get overlap(): number {
    return -this.inner * sin(this.tipAngle);
  }
  get note(): string | null {
    const p = this.parameters;
    const notes: string[] = [];
    if (p.mount === 'nail' && p.nailHeadHeight > this.counterboreDepth + 0.001) {
      notes.push(`The nail head stands ${this.mm(p.nailHeadHeight - this.counterboreDepth)} mm proud of the plate under the cable; the sheath takes up about 0.3 mm of that.`);
    }
    if (this.overlap < p.overlap - 0.01) {
      notes.push(`The overlap is limited to ${this.mm(this.overlap)} mm here, so the strap's tip stays ${this.mm(CableClip.minOpening)} mm off the plate.`);
    }
    return notes.length === 0 ? null : notes.join(' ');
  }

  get length(): number {
    return this.parameters.length / 2 + this.plateEnd;
  }
  get width(): number {
    return 2 * this.halfWidth;
  }
  get height(): number {
    return this.center + this.outer;
  }
  /** The strap's free end: the middle of its round tip, and its lowest point. */
  get tip(): { x: number; z: number } {
    const r = (this.inner + this.outer) / 2;
    return { x: r * cos(this.tipAngle), z: this.center + r * sin(this.tipAngle) };
  }
  get tipBottom(): number {
    return this.tip.z - this.parameters.wall / 2;
  }
  /**
   * The widest thing that passes between the strap's tip and what lies below it: the plate's top
   * beside the root, the ridge's edge, the step and the wall.
   */
  static pinch(tip: P2, wall: number, plate: number, edgeX: number, inner: number, fillet: number): number {
    const path: P2[] = [[-inner + fillet, plate], [edgeX, plate], [edgeX, 0], [edgeX + 50, 0]];
    let best = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!, b = path[i + 1]!, dx = b[0] - a[0], dz = b[1] - a[1], l2 = swiftMax(dx * dx + dz * dz, 1e-12);
      const t = swiftMin(1, swiftMax(0, ((tip[0] - a[0]) * dx + (tip[1] - a[1]) * dz) / l2));
      best = swiftMin(best, hypot(tip[0] - (a[0] + t * dx), tip[1] - (a[1] + t * dz)));
    }
    return best - wall / 2;
  }
  /** The cable has to pass through here. */
  get opening(): number {
    const tip = this.tip;
    return CableClip.pinch([tip.x, tip.z], this.parameters.wall, this.plateThickness, this.edgeX, this.inner, this.fillet);
  }
  /** The plate's footprint, the glue pad. */
  get padArea(): number {
    const p = this.parameters;
    return (this.halfWidth + this.edgeX) * p.length + (p.mount === 'nail' ? 2 * this.halfWidth * (this.plateEnd - p.length / 2) - ((this.halfWidth - this.edgeX) * (this.flareEnd - p.length / 2)) / 2 : 0);
  }
  /** How far the tip has to lift for the squeezed cable to pass. */
  get insertion(): number {
    return swiftMax(0, this.parameters.cableDiameter - CableClip.squish - this.opening);
  }
  /**
   * Rough bending strain in the strap as the cable goes in: a cantilever from the root, the
   * straight leg plus the arc to the tip. PLA takes about 2%.
   */
  get snapStrain(): number {
    const leg = swiftMax(0, this.center - this.plateThickness - this.fillet), arc = ((PI - this.tipAngle) * (this.inner + this.outer)) / 2;
    const spring = leg + arc;
    return (1.5 * this.parameters.wall * this.insertion) / (spring * spring);
  }

  static arc(cx: number, cz: number, r: number, a0: number, a1: number, n: number): P2[] {
    const out: P2[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([cx + r * cos(a), cz + r * sin(a)]);
    }
    return out;
  }
  static dedupe(pts: readonly P2[]): P2[] {
    const out: P2[] = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (last !== undefined && Math.abs(last[0] - p[0]) < 1e-9 && Math.abs(last[1] - p[1]) < 1e-9) continue;
      out.push(p);
    }
    if (out.length > 1 && Math.abs(out[0]![0] - out[out.length - 1]![0]) < 1e-9 && Math.abs(out[0]![1] - out[out.length - 1]![1]) < 1e-9) out.pop();
    return out;
  }

  /**
   * The strap alone, counterclockwise, from its root on the plate's top: up the inner leg, over the
   * inner arc, round the tip, back over the outer arc and down the outer face. Its first edge lies
   * on the plate.
   */
  strapProfile(quality: Quality): P2[] {
    const n = quality === 'export' ? 32 : 14, t = this.plateThickness, f = this.fillet;
    const { inner, outer, center, tipAngle } = this;
    const half = intDiv(n, 2);
    const pts: P2[] = [[-outer, t], [-inner + f, t]];
    pts.push(...CableClip.arc(-inner + f, t + f, f, -PI / 2, -PI, 4));
    pts.push([-inner, center]);
    // The arcs are split at the crown and at the open side's equator, so those points are exact.
    const m = swiftMax(2, intDiv(n, 4));
    pts.push(...CableClip.arc(0, center, inner, PI, PI / 2, half));
    pts.push(...CableClip.arc(0, center, inner, PI / 2, 0, half));
    pts.push(...CableClip.arc(0, center, inner, 0, tipAngle, m));
    const r = (inner + outer) / 2, tc: P2 = [r * cos(tipAngle), center + r * sin(tipAngle)];
    pts.push(...CableClip.arc(tc[0], tc[1], this.parameters.wall / 2, tipAngle + PI, tipAngle + 2 * PI, 8));
    pts.push(...CableClip.arc(0, center, outer, tipAngle, 0, m));
    pts.push(...CableClip.arc(0, center, outer, 0, PI / 2, half));
    pts.push(...CableClip.arc(0, center, outer, PI / 2, PI, half));
    pts.push([-outer, center]);
    return CableClip.dedupe(pts);
  }
  /** Plate and strap together, counterclockwise, where the strap stands: the plate ends at edgeX on the open side. */
  fullProfile(quality: Quality): P2[] {
    const w = this.halfWidth, t = this.plateThickness;
    const pts: P2[] = [[-w, 0], [this.edgeX, 0], [this.edgeX, t]];
    pts.push(...this.strapProfile(quality).slice(1)); // from (-inner+f, t) round to (-outer, center)
    pts.push([-this.outer, t], [-w, t]);
    return CableClip.dedupe(pts);
  }
}

// MARK: CableClipGenerator (CableClip.swift:286-449)

/** Builds the clip where it sits on the wall, and lays it down for printing. */
export class CableClipGenerator {
  private static quad(b: CloudMeshBuilder, p: number, q: number, r: number, s: number): void {
    b.triangles.push({ a: p, b: q, c: r });
    b.triangles.push({ a: p, b: r, c: s });
  }
  private static cap(b: CloudMeshBuilder, profile: readonly P2[], y: number, facing: number): void {
    const tris = FlatRegion.triangles(profile.map((_, i) => i), [], profile) ?? [];
    for (const [i, j, k] of tris) {
      const a = b.vertex(point3(profile[i]![0], y, profile[i]![1])), c1 = b.vertex(point3(profile[j]![0], y, profile[j]![1])), c2 = b.vertex(point3(profile[k]![0], y, profile[k]![1]));
      b.triangles.push(facing < 0 ? { a, b: c1, c: c2 } : { a, b: c2, c: c1 });
    }
  }
  /** A convex face as a fan from its first point. */
  private static fan(b: CloudMeshBuilder, profile: readonly P2[], y: number, facing: number): void {
    const p0 = b.vertex(point3(profile[0]![0], y, profile[0]![1]));
    for (let i = 1; i < profile.length - 1; i++) {
      const p1 = b.vertex(point3(profile[i]![0], y, profile[i]![1])), p2 = b.vertex(point3(profile[i + 1]![0], y, profile[i + 1]![1]));
      b.triangles.push(facing < 0 ? { a: p0, b: p1, c: p2 } : { a: p0, b: p2, c: p1 });
    }
  }
  /** Walls along the cable for every edge of a counterclockwise profile between two stations. */
  private static walls(b: CloudMeshBuilder, profile: readonly P2[], y0: number, y1: number, skipping: ReadonlySet<number> = new Set()): void {
    for (let i = 0; i < profile.length; i++) {
      if (skipping.has(i)) continue;
      const p0 = profile[i]!, p1 = profile[(i + 1) % profile.length]!;
      CableClipGenerator.quad(b, b.vertex(point3(p0[0], y0, p0[1])), b.vertex(point3(p0[0], y1, p0[1])),
        b.vertex(point3(p1[0], y1, p1[1])), b.vertex(point3(p1[0], y0, p1[1])));
    }
  }

  static clip(c: CableClip, quality: Quality): BalloonMesh {
    const { quad, cap, walls, fan } = CableClipGenerator;
    const p = c.parameters, half = p.length / 2, n = quality === 'export' ? 48 : 24;
    const b = new CloudMeshBuilder();
    const full = c.fullProfile(quality);
    cap(b, full, -half, -1);
    walls(b, full, -half, half);
    const nailY = c.nailY;
    if (nailY === null) {
      cap(b, full, half, 1);
      return b.mesh;
    }
    // The strap's end face; then the plate's extension in three bands along the
    // cable, so the band with the hole has a plain outline. On the open side the
    // plate widens along a slant from the strap's end to the full width.
    cap(b, c.strapProfile(quality), half, 1);
    const w = c.halfWidth, t = c.plateThickness, ex = c.edgeX, fe = c.flareEnd, end = c.plateEnd;
    const y1 = nailY - c.counterbore / 2 - 0.1, y2 = nailY + c.counterbore / 2 + 0.1;
    const edge = (y: number): number => (y >= fe - 1e-9 ? w : ex + (y - half) / CableClip.flare);
    const v = (x: number, y: number, z: number): number => b.vertex(point3(x, y, z));
    // Bands along the cable between every border: the strap's end, the end of the
    // slant (wherever it falls), the hole's band and the plate's end. Within a band
    // the open-side edge is straight, so every band is a trapezoid, and only the
    // hole's band needs the ear clipper.
    const ys = [half, y1, y2, end];
    if (fe > half + 1e-9 && fe < y1 - 1e-9) ys.push(fe); // inside the hole's band the slant's end is a corner of its outline instead
    sortDoubles(ys);
    const xs: number[] = [];
    for (const x of [-w, -c.outer, -c.inner + c.fillet, ex]) {
      if (xs.length === 0 || Math.abs(xs[xs.length - 1]! - x) > 1e-9) xs.push(x);
    }
    const holed = (outline: readonly P2[], z: number, radius: number, up: boolean): void => {
      const points = [...outline];
      const start = points.length;
      for (let k = 0; k < n; k++) {
        const a = (-2 * PI * k) / n;
        points.push([radius * cos(a), nailY + radius * sin(a)]);
      }
      const outlineIndices: number[] = [], holeIndices: number[] = [];
      for (let k = 0; k < start; k++) outlineIndices.push(k);
      for (let k = start; k < start + n; k++) holeIndices.push(k);
      const tris = FlatRegion.triangles(outlineIndices, [holeIndices], points) ?? [];
      for (const [i, j, k] of tris) {
        const ids = [v(points[i]![0], points[i]![1], z), v(points[j]![0], points[j]![1], z), v(points[k]![0], points[k]![1], z)];
        b.triangles.push(up ? { a: ids[0]!, b: ids[1]!, c: ids[2]! } : { a: ids[0]!, b: ids[2]!, c: ids[1]! });
      }
    };
    for (let i = 0; i < ys.length - 1; i++) {
      const ya = ys[i]!, yb = ys[i + 1]!;
      if (yb - ya < 1e-9) continue;
      quad(b, v(-w, ya, 0), v(-w, ya, t), v(-w, yb, t), v(-w, yb, 0));
      // The open-side wall bends where the slant ends, which may fall inside the hole's band.
      const stops = fe > ya + 1e-9 && fe < yb - 1e-9 ? [ya, fe, yb] : [ya, yb];
      for (let k = 0; k < stops.length - 1; k++) {
        quad(b, v(edge(stops[k]!), stops[k]!, 0), v(edge(stops[k + 1]!), stops[k + 1]!, 0), v(edge(stops[k + 1]!), stops[k + 1]!, t), v(edge(stops[k]!), stops[k]!, t));
      }
      if (Math.abs(ya - y1) < 1e-9) {
        const outline: P2[] = [[-w, y1], [edge(y1), y1]];
        if (fe > y1 + 1e-9 && fe < y2 - 1e-9) outline.push([w, fe]);
        outline.push([w, y2], [-w, y2]);
        holed(outline, t, c.counterbore / 2, true);
        holed(outline, 0, c.bore / 2, false);
      } else if (Math.abs(ya - half) < 1e-9) {
        // The first band's top is a fan over the points where the strap's root and the plate's top meet it.
        for (let j = 0; j < xs.length - 1; j++) b.triangles.push({ a: v(xs[j]!, half, t), b: v(xs[j + 1]!, half, t), c: v(-w, yb, t) });
        b.triangles.push({ a: v(ex, half, t), b: v(edge(yb), yb, t), c: v(-w, yb, t) });
        quad(b, v(-w, half, 0), v(-w, yb, 0), v(edge(yb), yb, 0), v(ex, half, 0));
      } else {
        quad(b, v(-w, ya, t), v(edge(ya), ya, t), v(edge(yb), yb, t), v(-w, yb, t));
        quad(b, v(-w, ya, 0), v(-w, yb, 0), v(edge(yb), yb, 0), v(edge(ya), ya, 0));
      }
    }
    fan(b, [[-w, 0], [w, 0], [w, t], [-w, t]], end, 1);
    const ring = (r: number, z: number): Point3[] => {
      const out: Point3[] = [];
      for (let i = 0; i < n; i++) {
        const a = (2 * PI * i) / n;
        out.push(point3(r * cos(a), nailY + r * sin(a), z));
      }
      return out;
    };
    const floor = c.plateThickness - c.counterboreDepth;
    bore(b, ring(c.counterbore / 2, c.plateThickness), ring(c.counterbore / 2, floor));
    const outerRing = ring(c.counterbore / 2, floor), innerRing = ring(c.bore / 2, floor);
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      quad(b, b.vertex(outerRing[k]!), b.vertex(outerRing[k1]!), b.vertex(innerRing[k1]!), b.vertex(innerRing[k]!));
    }
    bore(b, ring(c.bore / 2, floor), ring(c.bore / 2, 0));
    return b.mesh;
  }

  /** A round body along the cable, for the previews. */
  static rod(y0: number, y1: number, r: number, z: number, segments = 32): BalloonMesh {
    const { quad } = CableClipGenerator;
    const b = new CloudMeshBuilder();
    const ring = (y: number): Point3[] => {
      const out: Point3[] = [];
      for (let i = 0; i < segments; i++) {
        const a = (2 * PI * i) / segments;
        out.push(point3(r * cos(a), y, z + r * sin(a)));
      }
      return out;
    };
    const r0 = ring(y0), r1 = ring(y1);
    for (let i = 0; i < segments; i++) {
      const k = (i + 1) % segments;
      quad(b, b.vertex(r0[i]!), b.vertex(r0[k]!), b.vertex(r1[k]!), b.vertex(r1[i]!));
    }
    const c0 = b.vertex(point3(0, y0, z)), c1 = b.vertex(point3(0, y1, z));
    for (let i = 0; i < segments; i++) {
      const k = (i + 1) % segments;
      b.triangles.push({ a: c0, b: b.vertex(r0[k]!), c: b.vertex(r0[i]!) });
      b.triangles.push({ a: c1, b: b.vertex(r1[i]!), c: b.vertex(r1[k]!) });
    }
    const mesh = b.mesh;
    if (CableClipGenerator.signedVolume(mesh) < 0) mesh.triangles = mesh.triangles.map((t) => ({ a: t.a, b: t.c, c: t.b }));
    return mesh;
  }
  static signedVolume(m: BalloonMesh): number {
    return m.triangles.reduce((sum, t) => sum + dot(m.vertices[t.a]!, cross3(m.vertices[t.b]!, m.vertices[t.c]!)) / 6, 0);
  }
  /** A vertical cylinder, for the nail. */
  static post(y: number, r: number, z0: number, z1: number, segments = 24): BalloonMesh {
    const { quad } = CableClipGenerator;
    const b = new CloudMeshBuilder();
    const ring = (z: number): Point3[] => {
      const out: Point3[] = [];
      for (let i = 0; i < segments; i++) {
        const a = (2 * PI * i) / segments;
        out.push(point3(r * cos(a), y + r * sin(a), z));
      }
      return out;
    };
    const lower = ring(z0), upper = ring(z1);
    for (let i = 0; i < segments; i++) {
      const k = (i + 1) % segments;
      quad(b, b.vertex(lower[i]!), b.vertex(lower[k]!), b.vertex(upper[k]!), b.vertex(upper[i]!));
    }
    const c0 = b.vertex(point3(0, y, z0)), c1 = b.vertex(point3(0, y, z1));
    for (let i = 0; i < segments; i++) {
      const k = (i + 1) % segments;
      b.triangles.push({ a: c0, b: b.vertex(lower[k]!), c: b.vertex(lower[i]!) });
      b.triangles.push({ a: c1, b: b.vertex(upper[i]!), c: b.vertex(upper[k]!) });
    }
    return b.mesh;
  }
  static transformed(m: BalloonMesh, f: (p: Point3) => Point3): BalloonMesh {
    return new BalloonMesh(m.vertices.map(f), m.triangles, m.maxOverhang, m.innerVertexRange);
  }
  static grounded(m: BalloonMesh): BalloonMesh {
    const low = arrayMin(m.vertices.map((p) => p.z)) ?? 0;
    return CableClipGenerator.transformed(m, (p) => point3(p.x, p.y, p.z - low));
  }
}

// MARK: CableClipKit (CableClip.swift:452-509)

/** The clip as it sits on the wall, its print view and its notes. */
export class CableClipKit {
  readonly parameters: CableClipParameters;
  readonly clip: CableClip;
  readonly mesh: BalloonMesh;

  constructor(parameters: CableClipParameters, clip: CableClip, mesh: BalloonMesh) {
    this.parameters = parameters;
    this.clip = clip;
    this.mesh = mesh;
  }

  static generate(input: CableClipParameters, quality: Quality = 'preview'): CableClipKit {
    const clip = new CableClip(input);
    return new CableClipKit(clip.parameters, clip, CableClipGenerator.clip(clip, quality));
  }

  /** Standing on the strap's end, the profile on the bed, so the strap flexes within its layers; or lying on the plate if asked. */
  get printView(): BalloonMesh {
    if (this.parameters.flat) return CableClipGenerator.grounded(this.mesh);
    return CableClipGenerator.grounded(CableClipGenerator.transformed(this.mesh, (p) => point3(p.x, -p.z, p.y)));
  }
  /** A length of cable through the clip. */
  cable(): BalloonMesh {
    const reach = swiftMax(this.clip.length * 1.3, 12);
    return CableClipGenerator.rod(-reach, reach, this.clip.radius, this.clip.center);
  }
  /** The nail in its hole: shaft to the wall, head in the counterbore. */
  nail(): BalloonMesh[] {
    const y = this.clip.nailY;
    if (y === null) return [];
    const p = this.parameters, floor = this.clip.plateThickness - this.clip.counterboreDepth;
    return [CableClipGenerator.post(y, p.nailDiameter / 2, -0.5, floor + 0.01),
      CableClipGenerator.post(y, p.nailHeadDiameter / 2, floor, floor + p.nailHeadHeight)];
  }
  /** Clip (0), cable (2) and nail (3) together. */
  assembly(): { mesh: BalloonMesh; colors: number[] } {
    const parts: [BalloonMesh, number][] = [[this.mesh, 0], [this.cable(), 2]];
    for (const part of this.nail()) parts.push([part, 3]);
    const out = new BalloonMesh([], [], 0), colors: number[] = [];
    for (const [part, color] of parts) {
      const offset = out.vertices.length;
      for (const vertex of part.vertices) out.vertices.push(vertex);
      for (const t of part.triangles) out.triangles.push({ a: t.a + offset, b: t.b + offset, c: t.c + offset });
      for (let i = 0; i < part.triangles.length; i++) colors.push(color);
    }
    return { mesh: out, colors };
  }
  get fitsP2S(): boolean {
    return this.clip.length + 16 <= 256;
  }

  get notes(): string {
    const mm = (v: number, digits = 1): string => formatFixed(v, digits);
    const p = this.parameters, c = this.clip;
    const fixing = p.mount === 'nail'
      ? `Nail: a ${mm(p.nailDiameter)} mm nail with a ${mm(p.nailHeadDiameter)} mm head through the ${mm(c.bore)} mm bore in the plate's extension, ${mm(c.counterbore)} × ${mm(c.counterboreDepth)} mm counterbore, under the cable, ${mm((c.nailY ?? 0) - c.counterbore / 2 - p.length / 2)} mm past the strap. The hammer meets only the flat plate. Finish with a nail punch.`
      : `Adhesive: a pad of thin double-sided tape cut to ${mm(c.width)} × ${mm(c.length)} mm, or a crumb of mounting putty, under the plate.`;
    return `Cable clip for a ${cableText(p)} mm cable: one piece, ${mm(c.width)} × ${mm(c.length)} × ${mm(c.height)} mm. ` +
      `The strap (${mm(p.wall)} mm, ${mm(p.length)} mm long) is fixed on one side and ends ${mm(p.overlap)} mm below ` +
      `the cable's middle on the other; the opening under its tip is ${mm(c.opening)} mm. ${fixing} Press the cable in ` +
      `from the open side: the strap lifts about ${mm(c.insertion)} mm, an estimated ${mm(c.snapStrain * 100)} % strain. ` +
      `Print ${p.flat ? 'lying on the plate, with the arch bridged' : "standing on the strap's end, profile on the bed, with a brim"}; ` +
      'PETG bends further than PLA.';
  }
}
