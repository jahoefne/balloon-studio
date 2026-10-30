// Ported from mac/Sources/BalloonStudio/FigureGeometry.swift @ 04553ee
//
// Figures to hang from the mobile ring: small flat-backed bodies with a rounded front, a hole for
// the thread above their centre of gravity and, if wanted, a second hole at the bottom for a figure
// hanging below.
//
// SWIFT-DIFF: `FigureStyle`/`FigureSurface` live in core/types.ts as string unions (frozen contract);
// their titles come from FIGURE_STYLE_INFO. `FigureParameters` is a plain interface there, so its
// computed properties are free functions (`figureSides(p)`, `figureFilename(p)`, …).
// SWIFT-DIFF: `SIMD2<Double>` is `Vec2`, or two scalars on hot paths (`Field.distanceXY`, sites).
// Every component is computed with the Swift expression, in the Swift order.
import { CoreFailure, INVALID_SETTINGS_MESSAGE, type Codec, type FigureDerived, type FigureParameterApi, type Quality } from '../api';
import { BalloonMesh } from '../geometry/mesh';
import type { Point3, Triangle } from '../geometry/point3';
import { binarySTL } from '../io/binaryStl';
import { storedZipArchive, type ZipEntry } from '../io/storedZip';
import { acos, atan2, cos, hypot, PI, pow, sin } from '../swift/dmath';
import { formatFixed } from '../swift/format';
import { encodeJSONCompact } from '../swift/json';
import { arrayMax, arrayMin, maxBy, swiftMax, swiftMin } from '../swift/minmax';
import { intCeil, intRounded } from '../swift/rounding';
import { sortedDoubles } from '../swift/sort';
import { utf8 } from '../swift/text';
import { FIGURE_STYLE_INFO, FIGURE_STYLES, FIGURE_SURFACES, type FigureParameters, type FigureStyle, type FigureSurface, type Range, type Vec2 } from '../types';

const vec2 = (x: number, y: number): Vec2 => ({ x, y });

// ---------------------------------------------------------------------------
// The lamp outlines the cloud and sun figures are drawn from.
//
// SWIFT-DIFF: `CloudStyle.classic.profile` (CloudGeometry.swift:22-23), `CloudProfile` (:51-54),
// `CloudGenerator.radius` (:824-841), `SunPolygon` (SunGeometry.swift:20-43) and
// `SunStyle.boldEight.profile` (SunGeometry.swift:118-135) belong to WP-K4a (core/lamp/*), which is
// not on main yet. This is a private copy of just these lines, so this WP does not depend on K4a.
// Once K4a has landed it can import from there; the manifest hashes prove the two agree.
// ---------------------------------------------------------------------------

/** `SunPolygon.Plane` */
interface Plane {
  x: number;
  y: number;
  offset: number;
}

/** `SunPolygon.init` (SunGeometry.swift:25-32) */
function sunPolygonPlanes(points: readonly Vec2[]): Plane[] {
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length] as Vec2;
    const edgeX = b.x - a.x;
    const edgeY = b.y - a.y;
    const length = hypot(edgeX, edgeY);
    const nx = edgeY / length;
    const ny = -edgeX / length;
    return { x: nx, y: ny, offset: nx * a.x + ny * a.y };
  });
}

/** `SunPolygon.radius(at:inset:width:)` (SunGeometry.swift:33-43) */
function sunPolygonRadius(planes: readonly Plane[], angle: number, inset: number, width: number): number {
  let low = 0.0;
  let high = Infinity;
  for (const plane of planes) {
    const along = plane.x * cos(angle) + plane.y * sin(angle);
    const limit = plane.offset * width - inset;
    if (Math.abs(along) < 1e-12) {
      if (limit < 0) return 0;
    } else if (along > 0) high = swiftMin(high, limit / along);
    else low = swiftMax(low, limit / along);
  }
  return high >= low ? high : 0;
}

/** `CloudProfile` (CloudGeometry.swift:51-54), polygons as their planes. */
interface LampProfile {
  lobes: readonly (readonly [number, number, number])[];
  body: { x0: number; x1: number; y0: number; y1: number };
  polygons: readonly (readonly Plane[])[];
}

/** `CloudStyle.classic.profile` (CloudGeometry.swift:22-23) */
function classicCloudProfile(): LampProfile {
  return {
    lobes: [[-0.31, -0.02, 0.19], [-0.20, 0.10, 0.17], [0.02, 0.11, 0.26], [0.30, -0.005, 0.20]],
    body: { x0: -0.31, x1: 0.30, y0: -0.21, y1: 0.10 },
    polygons: [],
  };
}

/** `SunGeometry.profile(.boldEight)` (SunGeometry.swift:86-94, 114, 118-135) */
function boldEightSunProfile(): LampProfile {
  const rayCount = 8;
  const sector = (2 * PI) / rayCount;
  const notchRadius = 0.30;
  const lean = 0;
  const tipRadius = 0.5;
  const notch = (ray: number, side: number): Vec2 => {
    const angle = (ray + side / 2) * sector + lean;
    return vec2(cos(angle) * notchRadius, sin(angle) * notchRadius);
  };
  const tip = (ray: number): Vec2 => {
    const angle = ray * sector;
    return vec2(cos(angle) * tipRadius, sin(angle) * tipRadius);
  };
  const triangles: Plane[][] = [];
  for (let ray = 0; ray < rayCount; ray++) {
    const t = tip(ray);
    const corners = [1.0, -1.0].map((side) => {
      const n = notch(ray, side);
      return vec2(t.x + (n.x - t.x) * 1.5, t.y + (n.y - t.y) * 1.5);
    });
    triangles.push(sunPolygonPlanes([t, ...corners]));
  }
  return { lobes: [[0, 0, notchRadius - 0.005]], body: { x0: 0, x1: 0, y0: 0, y1: 0 }, polygons: triangles };
}

/** `CloudGenerator.radius(_:inset:width:verticalScale:profile:)` (CloudGeometry.swift:824-841) */
function lampRadius(angle: number, inset: number, width: number, verticalScale: number, profile: LampProfile): number {
  const stretch = hypot(cos(angle), sin(angle) / verticalScale);
  const dx = cos(angle) / stretch;
  const dy = sin(angle) / verticalScale / stretch;
  let far = 0.0;
  for (const polygon of profile.polygons) far = swiftMax(far, sunPolygonRadius(polygon, atan2(dy, dx), inset, width));
  for (const [cx, cy, r] of profile.lobes) {
    const x = cx * width;
    const y = cy * width;
    const rr = r * width - inset;
    const projection = x * dx + y * dy;
    const det = rr * rr - x * x - y * y + projection * projection;
    if (det >= 0) far = swiftMax(far, projection + Math.sqrt(det));
  }
  const body = profile.body;
  const rx = dx >= 0 ? (body.x1 * width - inset) / swiftMax(dx, 1e-12) : (body.x0 * width + inset) / swiftMin(dx, -1e-12);
  const ry = dy >= 0 ? (body.y1 * width - inset) / swiftMax(dy, 1e-12) : (body.y0 * width + inset) / swiftMin(dy, -1e-12);
  return swiftMax(far, swiftMin(rx, ry)) / stretch;
}

// ---------------------------------------------------------------------------
// FigureOutline (FigureGeometry.swift:37-73)
// ---------------------------------------------------------------------------

/**
 * The drawing of a figure in its own units: an outer loop and any windows through it, and the radius
 * that rounds its corners. Loops may run either way. Same shape as `FigureOutlineInfo` (core/api.ts).
 */
export interface FigureOutline {
  readonly loops: Vec2[][];
  readonly rounding: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  /** Area centroid of the drawing, windows taken out. */
  readonly centroid: Vec2;
  /** Height and width of the drawing once its corners are rounded outward. */
  readonly rawHeight: number;
  readonly rawWidth: number;
}

function makeFigureOutline(loops: Vec2[][], rounding: number): FigureOutline {
  const all = loops.flat();
  const minX = arrayMin(all.map((p) => p.x)) as number;
  const maxX = arrayMax(all.map((p) => p.x)) as number;
  const minY = arrayMin(all.map((p) => p.y)) as number;
  const maxY = arrayMax(all.map((p) => p.y)) as number;
  // The outer loop has the largest area; windows count against it.
  const areas: number[] = [];
  const moments: Vec2[] = [];
  for (const loop of loops) {
    let area = 0.0;
    let momentX = 0;
    let momentY = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i] as Vec2;
      const b = loop[(i + 1) % loop.length] as Vec2;
      const cross = a.x * b.y - b.x * a.y;
      area += cross / 2;
      momentX += ((a.x + b.x) * cross) / 6;
      momentY += ((a.y + b.y) * cross) / 6;
    }
    areas.push(area);
    moments.push(vec2(momentX, momentY));
  }
  const outer = maxBy(
    areas.map((_, i) => i),
    (x, y) => Math.abs(areas[x] as number) < Math.abs(areas[y] as number),
  ) as number;
  let total = 0.0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < loops.length; i++) {
    const area = areas[i] as number;
    const moment = moments[i] as Vec2;
    const sign = area >= 0 ? 1.0 : -1.0;
    const weight = i === outer ? 1.0 : -1.0;
    total += weight * Math.abs(area);
    sumX += moment.x * (sign * weight);
    sumY += moment.y * (sign * weight);
  }
  return {
    loops,
    rounding,
    minX,
    maxX,
    minY,
    maxY,
    centroid: vec2(sumX / total, sumY / total),
    rawHeight: maxY - minY + 2 * rounding,
    rawWidth: maxX - minX + 2 * rounding,
  };
}

// ---------------------------------------------------------------------------
// FigureOutlines (FigureGeometry.swift:75-175)
// ---------------------------------------------------------------------------

const outlines = new Map<FigureStyle, FigureOutline>();

/** `style.outline` = `FigureOutlines.all[style]!`. */
export function figureOutline(style: FigureStyle): FigureOutline {
  let outline = outlines.get(style);
  if (outline === undefined) {
    outline = makeOutline(style);
    outlines.set(style, outline);
  }
  return outline;
}

function makeOutline(style: FigureStyle): FigureOutline {
  switch (style) {
    case 'star': {
      const points: Vec2[] = [];
      for (let i = 0; i < 10; i++) {
        const angle = PI / 2 + (i * PI) / 5;
        const r = i % 2 === 0 ? 1.0 : 0.46;
        points.push(vec2(r * cos(angle), r * sin(angle)));
      }
      return makeFigureOutline([points], 0.055);
    }
    case 'heart': {
      const points: Vec2[] = [];
      for (let i = 0; i < 240; i++) {
        const t = (i / 240) * 2 * PI;
        points.push(vec2(16 * pow(sin(t), 3), 13 * cos(t) - 5 * cos(2 * t) - 2 * cos(3 * t) - cos(4 * t)));
      }
      return makeFigureOutline([points], 0.7);
    }
    case 'moon': {
      // Outer circle of radius 1, the inner one offset to the right, then
      // the whole crescent leans back so its tips point up and to the right.
      const r = 0.78;
      const d = 0.42;
      const tipX = (1 - r * r + d * d) / (2 * d);
      const tipY = Math.sqrt(1 - tipX * tipX);
      const outerStart = atan2(tipY, tipX);
      const innerTip = atan2(tipY, tipX - d);
      const points: Vec2[] = [];
      for (let i = 0; i <= 160; i++) {
        const a = outerStart + ((2 * PI - 2 * outerStart) * i) / 160;
        points.push(vec2(cos(a), sin(a)));
      }
      for (let i = 1; i < 120; i++) {
        const a = 2 * PI - innerTip - ((2 * PI - 2 * innerTip) * i) / 120;
        points.push(vec2(d + r * cos(a), r * sin(a)));
      }
      const lean = PI / 6;
      return makeFigureOutline([points.map((p) => vec2(p.x * cos(lean) - p.y * sin(lean), p.x * sin(lean) + p.y * cos(lean)))], 0.045);
    }
    case 'cloud': {
      const profile = classicCloudProfile();
      const points: Vec2[] = [];
      for (let i = 0; i < 240; i++) {
        const a = (i * 2 * PI) / 240;
        const r = lampRadius(a, 0, 1, 1, profile);
        points.push(vec2(r * cos(a), r * sin(a)));
      }
      return makeFigureOutline([points], 0.015);
    }
    case 'sun': {
      const profile = boldEightSunProfile();
      const points: Vec2[] = [];
      for (let i = 0; i < 480; i++) {
        const a = (i * 2 * PI) / 480;
        const r = lampRadius(a, 0, 1, 1, profile);
        points.push(vec2(r * cos(a), r * sin(a)));
      }
      return makeFigureOutline([points], 0.014);
    }
    case 'raindrop': {
      const apex = 2.3;
      const touch = acos(1 / apex);
      const points: Vec2[] = [vec2(0, apex)];
      const start = PI / 2 + touch;
      const end = PI / 2 - touch + 2 * PI;
      for (let i = 0; i <= 140; i++) {
        const a = start + ((end - start) * i) / 140;
        points.push(vec2(cos(a), sin(a)));
      }
      return makeFigureOutline([points], 0.09);
    }
    case 'balloon':
      return balloonOutline();
  }
}

type Pair = readonly [number, number];

function bezier(a: Pair, b: Pair, c: Pair, d: Pair, t: number): Vec2 {
  const s = 1 - t;
  return vec2(
    s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0],
    s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1],
  );
}

/**
 * The classic envelope's meridian, the neck, two ropes and a basket. The
 * window between the ropes is a loop of its own.
 */
function balloonOutline(): FigureOutline {
  // Right half of the envelope from the neck to the crown, in the
  // generator's units, with its shoulder at 65% of a 220 unit height.
  const right: Vec2[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const p = t <= 0.25 ? bezier([16, 6], [16, 17], [26, 28], [33, 38], t * 4) : bezier([33, 38], [56, 71], [90, 94], [90, 142], (t - 0.25) / 0.75);
    right.push(vec2(p.x, 6 + ((p.y - 6) * 137) / 136));
  }
  for (let i = 1; i <= 50; i++) {
    right.push(bezier([90, 143], [90, 143 + (77 * 42) / 78], [48, 220], [0, 220], i / 50));
  }
  const neck = 16.0;
  const rope = 10.0;
  const basketTop = -40.0;
  const basketBottom = -78.0;
  const basketHalfTop = 30.0;
  const basketHalfBottom = 26.0;
  const corner = 6.0;
  const outer: Vec2[] = [vec2(0, basketBottom), vec2(basketHalfBottom - corner, basketBottom)];
  for (let i = 1; i <= 8; i++) {
    const a = -PI / 2 + ((PI / 2) * i) / 8;
    outer.push(vec2(basketHalfBottom - corner + corner * cos(a), basketBottom + corner + corner * sin(a)));
  }
  outer.push(vec2(basketHalfTop, basketTop), vec2(basketHalfTop - 2, basketTop), vec2(neck, 0), vec2(neck, 6));
  outer.push(...right.slice(1));
  outer.push(...right.slice(0, -1).reverse().map((p) => vec2(-p.x, p.y)));
  outer.push(vec2(-neck, 0), vec2(-(basketHalfTop - 2), basketTop), vec2(-basketHalfTop, basketTop));
  for (let i = 0; i < 8; i++) {
    const a = PI + ((PI / 2) * i) / 8;
    outer.push(vec2(-(basketHalfBottom - corner) + corner * cos(a), basketBottom + corner + corner * sin(a)));
  }
  outer.push(vec2(-(basketHalfBottom - corner), basketBottom));
  const window = [vec2(-(neck - rope), 0), vec2(neck - rope, 0), vec2(basketHalfTop - 2 - rope, basketTop), vec2(-(basketHalfTop - 2 - rope), basketTop)];
  return makeFigureOutline([outer, window], 1.5);
}

// ---------------------------------------------------------------------------
// FigureParameters (FigureGeometry.swift:177-243)
// ---------------------------------------------------------------------------

/** `FigureParameters()` */
export function defaultFigureParameters(): FigureParameters {
  return {
    style: 'star',
    height: 60.0,
    surface: 'pillow',
    edge: 1.6,
    dome: 3.2,
    doubleSided: false,
    holeDiameter: 2.0,
    holeMargin: 2.5,
    chainHole: false,
  };
}

const range = (lower: number, upper: number): Range => Object.freeze({ lower, upper });
export const FIGURE_HEIGHT_RANGE = range(40.0, 120.0);
export const FIGURE_EDGE_RANGE = range(0.8, 6.0);
export const FIGURE_DOME_RANGE = range(0.8, 10.0);
export const FIGURE_HOLE_RANGE = range(1.5, 4.0);
export const FIGURE_MARGIN_RANGE = range(1.5, 6.0);

export const figureDomed = (p: FigureParameters): boolean => p.surface !== 'flat';
export const figureSides = (p: FigureParameters): number => (figureDomed(p) && p.doubleSided ? 2 : 1);
/** Thickness at the thickest point. */
export const figureThickness = (p: FigureParameters): number => p.edge + (figureDomed(p) ? p.dome * figureSides(p) : 0);
/** Scale from the drawing's units to millimetres. */
export const figureScale = (p: FigureParameters): number => p.height / figureOutline(p.style).rawHeight;
export const figureWidth = (p: FigureParameters): number => figureOutline(p.style).rawWidth * figureScale(p);
export const figureFitsP2S = (p: FigureParameters): boolean => swiftMax(figureWidth(p), p.height) + 16 <= 256;
export const figureDisplayName = (p: FigureParameters): string => `${FIGURE_STYLE_INFO[p.style].title} · ${intRounded(p.height)} mm`;

export function figureFilename(p: FigureParameters): string {
  const surfaceSuffix = p.surface === 'pillow' ? '' : `-${p.surface}`;
  return `Mobile-Figure-${p.style}-${intRounded(p.height)}mm${surfaceSuffix}${figureSides(p) === 2 ? '-two-sided' : ''}${p.chainHole ? '-chain' : ''}.stl`;
}

export function figureSetFilename(p: FigureParameters): string {
  const surfaceSuffix = p.surface === 'pillow' ? '' : `-${p.surface}`;
  return `Mobile-Figures-${intRounded(p.height)}mm${surfaceSuffix}${figureSides(p) === 2 ? '-two-sided' : ''}${p.chainHole ? '-chain' : ''}-set.zip`;
}

/** `normalized()` */
export function normalizedFigure(input: FigureParameters): FigureParameters {
  const clamp = (v: number, r: Range, fallback: number): number => (Number.isFinite(v) ? swiftMin(r.upper, swiftMax(r.lower, v)) : fallback);
  const p = { ...input };
  p.height = clamp(input.height, FIGURE_HEIGHT_RANGE, 60);
  p.edge = clamp(input.edge, FIGURE_EDGE_RANGE, 1.6);
  p.dome = clamp(input.dome, FIGURE_DOME_RANGE, 3.2);
  p.holeDiameter = clamp(input.holeDiameter, FIGURE_HOLE_RANGE, 2);
  p.holeMargin = clamp(input.holeMargin, FIGURE_MARGIN_RANGE, 2.5);
  if (p.surface === 'flat') p.doubleSided = false;
  return p;
}

function invalidSettings(): CoreFailure {
  return new CoreFailure('invalid-settings', INVALID_SETTINGS_MESSAGE);
}

/** `try c.decodeIfPresent(Double.self, forKey:)`: absent or null is nil, a wrong type throws. JSON.parse makes 1e999 Infinity; JSONDecoder rejects it. */
function decodeDouble(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidSettings();
  return value;
}

/** `try c.decodeIfPresent(Bool.self, forKey:)` */
function decodeBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw invalidSettings();
  return value;
}

/** `((try? c.decodeIfPresent(String.self, forKey:)) ?? nil).flatMap(T.init(rawValue:))`: never throws. */
function decodeLenient<T extends string>(value: unknown, cases: readonly T[]): T | undefined {
  return typeof value === 'string' && (cases as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** `init(from:)` (:192-204): missing keys take the defaults, unknown names fall back. No normalization. */
export function decodeFigureParameters(value: unknown): FigureParameters {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalidSettings();
  const own = (key: string): unknown => (Object.prototype.hasOwnProperty.call(value, key) ? (value as Record<string, unknown>)[key] : undefined);
  const p = defaultFigureParameters();
  p.style = decodeLenient<FigureStyle>(own('style'), FIGURE_STYLES) ?? p.style;
  p.height = decodeDouble(own('height')) ?? p.height;
  p.surface = decodeLenient<FigureSurface>(own('surface'), FIGURE_SURFACES) ?? p.surface;
  p.edge = decodeDouble(own('edge')) ?? p.edge;
  p.dome = decodeDouble(own('dome')) ?? p.dome;
  p.doubleSided = decodeBool(own('doubleSided')) ?? p.doubleSided;
  p.holeDiameter = decodeDouble(own('holeDiameter')) ?? p.holeDiameter;
  p.holeMargin = decodeDouble(own('holeMargin')) ?? p.holeMargin;
  p.chainHole = decodeBool(own('chainHole')) ?? p.chainHole;
  return p;
}

/** `StableJSON.encode(p)`: JSONEncoder with sorted keys. */
export function encodeFigureParameters(p: FigureParameters): string {
  return encodeJSONCompact({
    style: p.style,
    height: p.height,
    surface: p.surface,
    edge: p.edge,
    dome: p.dome,
    doubleSided: p.doubleSided,
    holeDiameter: p.holeDiameter,
    holeMargin: p.holeMargin,
    chainHole: p.chainHole,
  });
}

export const figureCodec: Codec<FigureParameters> = {
  decode(text) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw invalidSettings();
    }
    return decodeFigureParameters(value);
  },
  decodeValue: decodeFigureParameters,
  encode: encodeFigureParameters,
};

/** The computed properties of `FigureParameters` (:212-228), as core/api.ts wants them. */
export function figureDerived(p: FigureParameters): FigureDerived {
  return {
    domed: figureDomed(p),
    sides: figureSides(p),
    thickness: figureThickness(p),
    scale: figureScale(p),
    width: figureWidth(p),
    fitsP2S: figureFitsP2S(p),
    displayName: figureDisplayName(p),
    filename: figureFilename(p),
    setFilename: figureSetFilename(p),
  };
}

/** The parameter half of the core contract for figures (`FigureParameterApi`, core/api.ts). */
export const figureParameterApi: FigureParameterApi = {
  defaults: Object.freeze(defaultFigureParameters()),
  ranges: Object.freeze({
    height: FIGURE_HEIGHT_RANGE,
    edge: FIGURE_EDGE_RANGE,
    dome: FIGURE_DOME_RANGE,
    hole: FIGURE_HOLE_RANGE,
    margin: FIGURE_MARGIN_RANGE,
  }),
  normalize: normalizedFigure,
  codec: figureCodec,
  filename: figureFilename,
  setFilename: figureSetFilename,
  derived: figureDerived,
  outline: figureOutline,
};

// ---------------------------------------------------------------------------
// FigureBody (FigureGeometry.swift:245-274)
// ---------------------------------------------------------------------------

/** A generated figure, lying on its back with its lowest point at Z = 0. */
export interface FigureBody {
  mesh: BalloonMesh;
  readonly parameters: FigureParameters;
  readonly width: number;
  /** Hole centres in the figure's plane, millimetres from its middle. */
  readonly hangingHole: Vec2 | null;
  readonly chainHole: Vec2 | null;
}

export const figureHolesWanted = (body: FigureBody): number => 1 + (body.parameters.chainHole ? 1 : 0);
export const figureHoles = (body: FigureBody): number => (body.hangingHole === null ? 0 : 1) + (body.chainHole === null ? 0 : 1);

const THREAD_CORNERS: readonly (readonly [number, number, 0 | 1])[] = [
  [-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];
const THREAD_FACES: readonly (readonly [number, number, number])[] = [
  [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
  [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
];

/** The figure upright, as it hangs, with a thread rising from its hole. */
export function figureHangingView(body: FigureBody): { mesh: BalloonMesh; colors: number[] } {
  const p = body.parameters;
  const half = p.height / 2;
  const m = body.mesh.copy();
  const thickness = figureThickness(p);
  m.vertices = m.vertices.map((v) => ({ x: v.x, y: thickness / 2 - v.z, z: v.y + half }));
  const colors = new Array<number>(m.triangles.length).fill(0);
  const hole = body.hangingHole;
  if (hole !== null) {
    const w = 0.45;
    const top = hole.y + half + p.height * 0.55;
    const bottom = hole.y + half;
    const base = m.vertices.length;
    for (const [sx, sy, high] of THREAD_CORNERS) {
      const dx = sx * w;
      const dy = sy * w;
      m.vertices.push({ x: hole.x + dx, y: dy, z: high === 1 ? top : bottom });
    }
    for (const [a, b, c] of THREAD_FACES) {
      m.triangles.push({ a: base + a, b: base + b, c: base + c });
      colors.push(1);
    }
  }
  return { mesh: m, colors };
}

// ---------------------------------------------------------------------------
// FigureGenerator (FigureGeometry.swift:276-559)
// ---------------------------------------------------------------------------

export interface FigureHole {
  center: Vec2;
  radius: number;
}

/**
 * `FigureGenerator.Field` (:277-326): signed distance to the figure's edge, positive inside, with the
 * corners rounded outward and the holes taken out.
 */
export class Field {
  /** `segments`: ax, ay, bx, by per segment, in Swift order. */
  private readonly segments: Float64Array;
  readonly rounding: number;
  holes: FigureHole[] = [];

  constructor(loops: readonly (readonly Vec2[])[], rounding: number) {
    this.rounding = rounding;
    let count = 0;
    for (const loop of loops) count += loop.length;
    this.segments = new Float64Array(count * 4);
    let o = 0;
    for (const loop of loops) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i] as Vec2;
        const b = loop[(i + 1) % loop.length] as Vec2;
        this.segments[o++] = a.x;
        this.segments[o++] = a.y;
        this.segments[o++] = b.x;
        this.segments[o++] = b.y;
      }
    }
  }

  /** `distance(_:)` with the point as two scalars (hot path). */
  distanceXY(px: number, py: number): number {
    const segments = this.segments;
    let best = Infinity;
    let inside = false;
    for (let o = 0; o < segments.length; o += 4) {
      const ax = segments[o] as number;
      const ay = segments[o + 1] as number;
      const bx = segments[o + 2] as number;
      const by = segments[o + 3] as number;
      const ex = bx - ax;
      const ey = by - ay;
      const wx = px - ax;
      const wy = py - ay;
      // max(0, min(1, (w.x*e.x+w.y*e.y)/max(e.x*e.x+e.y*e.y, 1e-30))), written out
      const lengthSquared = ex * ex + ey * ey;
      const ratio = (wx * ex + wy * ey) / (1e-30 >= lengthSquared ? 1e-30 : lengthSquared);
      const clipped = ratio < 1 ? ratio : 1;
      const t = clipped >= 0 ? clipped : 0;
      const qx = wx - ex * t;
      const qy = wy - ey * t;
      const distance = qx * qx + qy * qy;
      if (distance < best) best = distance;
      if (ay > py !== by > py) {
        const x = ax + ((py - ay) / (by - ay)) * (bx - ax);
        if (x > px) inside = !inside;
      }
    }
    let d = (inside ? 1 : -1) * Math.sqrt(best) + this.rounding;
    for (const h of this.holes) d = swiftMin(d, hypot(px - h.center.x, py - h.center.y) - h.radius);
    return d;
  }

  distance(p: Vec2): number {
    return this.distanceXY(p.x, p.y);
  }

  /**
   * Moves a point near the edge onto it: a step along the gradient,
   * then a bisection once the edge is bracketed. At a sharp notch the
   * gradient is unreliable, so a plain Newton step could overshoot.
   */
  project(p: Vec2): Vec2 {
    let qx = p.x;
    let qy = p.y;
    for (let iteration = 0; iteration < 6; iteration++) {
      const d = this.distanceXY(qx, qy);
      if (Math.abs(d) < 1e-7) return vec2(qx, qy);
      const h = 1e-4;
      const gx = (this.distanceXY(qx + h, qy) - this.distanceXY(qx - h, qy)) / (2 * h);
      const gy = (this.distanceXY(qx, qy + h) - this.distanceXY(qx, qy - h)) / (2 * h);
      const n = swiftMax(Math.sqrt(gx * gx + gy * gy), 1e-6);
      const stepX = qx - gx * ((1.5 * d) / n);
      const stepY = qy - gy * ((1.5 * d) / n);
      if (this.distanceXY(stepX, stepY) > 0 === d > 0) {
        qx = qx - gx * (d / n);
        qy = qy - gy * (d / n);
        continue;
      }
      let ax = qx;
      let ay = qy;
      let bx = stepX;
      let by = stepY;
      for (let bisection = 0; bisection < 24; bisection++) {
        const mx = (ax + bx) * 0.5;
        const my = (ay + by) * 0.5;
        if (this.distanceXY(mx, my) > 0 === d > 0) {
          ax = mx;
          ay = my;
        } else {
          bx = mx;
          by = my;
        }
      }
      return vec2((ax + bx) * 0.5, (ay + by) * 0.5);
    }
    return vec2(qx, qy);
  }
}

// `Edge` (:328-331): a = min(x,y), b = max(x,y), as one Int key `a·2²⁶+b` (exact below 2⁵³).
const EDGE_BASE = 67108864;
const edgeKey = (x: number, y: number): number => (y < x ? y * EDGE_BASE + x : x * EDGE_BASE + y);
const edgeA = (key: number): number => Math.floor(key / EDGE_BASE);
const edgeB = (key: number): number => key - edgeA(key) * EDGE_BASE;

/** `FigureGenerator.field(_:)` (:339-363) */
export function figureField(input: FigureParameters): { field: Field; hanging: Vec2 | null; chain: Vec2 | null } {
  const p = normalizedFigure(input);
  const outline = figureOutline(p.style);
  const scale = figureScale(p);
  const centerX = (outline.minX + outline.maxX) / 2;
  const centerY = (outline.minY + outline.maxY) / 2;
  const field = new Field(
    outline.loops.map((loop) => loop.map((q) => vec2((q.x - centerX) * scale, (q.y - centerY) * scale))),
    outline.rounding * scale,
  );
  const radius = p.holeDiameter / 2;
  const need = radius + p.holeMargin;
  const half = p.height / 2;
  const x = (outline.centroid.x - centerX) * scale;
  // The thread's hole sits as high as the figure has room for it, on the
  // vertical through the centre of gravity, so the figure hangs straight.
  const place = (start: number, step: number, limit: number): Vec2 | null => {
    let y = start;
    while (step > 0 ? y <= limit : y >= limit) {
      if (field.distanceXY(x, y) >= need) return vec2(x, y);
      y += step;
    }
    return null;
  };
  const hanging = place(half - need, -0.1, -half + need);
  let chain: Vec2 | null = null;
  if (p.chainHole) {
    chain = place(-half + need, 0.1, half - need);
    if (hanging !== null && chain !== null && hypot(hanging.x - chain.x, hanging.y - chain.y) < 2 * radius + p.holeMargin) chain = null;
  }
  const holes: FigureHole[] = [];
  if (hanging !== null) holes.push({ center: hanging, radius });
  if (chain !== null) holes.push({ center: chain, radius });
  field.holes = holes;
  return { field, hanging, chain };
}

/** `(site: Int, boundary: Bool)` of a cell polygon. */
interface PolygonEntry {
  site: number;
  boundary: boolean;
}

/** `FigureGenerator.generate(_:quality:)` (:365-558) */
export function generateFigure(input: FigureParameters, quality: Quality = 'preview'): FigureBody {
  const p = normalizedFigure(input);
  const { field, hanging, chain } = figureField(p);
  const width = figureWidth(p);
  const sides = figureSides(p);
  const halfW = width / 2;
  const halfH = p.height / 2;
  const cell = p.height / (quality === 'export' ? 150 : 56);
  const x0 = -halfW - 1.5 * cell;
  const y0 = -halfH - 1.5 * cell;
  const nx = intCeil((2 * halfW + 3 * cell) / cell);
  const ny = intCeil((2 * halfH + 3 * cell) / cell);

  // Corner distances. A corner exactly on the edge counts as inside.
  const corner = new Float64Array((nx + 1) * (ny + 1));
  let deepest = 0.0;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      let d = field.distanceXY(x0 + i * cell, y0 + j * cell);
      if (Math.abs(d) < 1e-9) d = 1e-9;
      corner[j * (nx + 1) + i] = d;
      deepest = swiftMax(deepest, d);
    }
  }

  // `sites: [Site]` as parallel arrays; `mate` is -1 where the Swift dictionary has no entry.
  const siteX: number[] = [];
  const siteY: number[] = [];
  const siteTop: boolean[] = [];
  const siteBoundary: boolean[] = [];
  const siteDistance: number[] = [];
  const mate: number[] = [];
  let triangles: Triangle[] = [];
  let faces: number[] = []; // 0 top, 1 bottom, 2 wall
  const chords = new Set<number>();
  // SWIFT-DIFF: the four `[Int: Int]` maps are arrays over the same keys, -1 meaning no entry.
  const cornerTop = new Int32Array((nx + 1) * (ny + 1)).fill(-1);
  const cornerBottom = new Int32Array((nx + 1) * (ny + 1)).fill(-1);
  const crossTop = new Int32Array((nx + 1) * (ny + 1) * 2).fill(-1);
  const crossBottom = new Int32Array((nx + 1) * (ny + 1) * 2).fill(-1);
  const add = (x: number, y: number, top: boolean, boundary: boolean, distance: number): number => {
    siteX.push(x);
    siteY.push(y);
    siteTop.push(top);
    siteBoundary.push(boundary);
    siteDistance.push(distance);
    mate.push(-1);
    return siteX.length - 1;
  };
  const mateOf = (v: number): number => {
    const other = mate[v] as number;
    if (other < 0) throw new RangeError(`Figure site ${v} has no mate`); // Swift: `mate[v]!` traps
    return other;
  };
  const cornerSite = (i: number, j: number, top: boolean): number => {
    const key = j * (nx + 1) + i;
    const known = (top ? cornerTop[key] : cornerBottom[key]) as number;
    if (known >= 0) return known;
    const v = add(x0 + i * cell, y0 + j * cell, top, false, corner[key] as number);
    if (top) cornerTop[key] = v;
    else cornerBottom[key] = v;
    return v;
  };
  /** The edge's zero crossing, found on the exact field. */
  const crossing = (i: number, j: number, horizontal: boolean, top: boolean): number => {
    const key = (j * (nx + 1) + i) * 2 + (horizontal ? 1 : 0);
    const known = (top ? crossTop[key] : crossBottom[key]) as number;
    if (known >= 0) return known;
    const other = (top ? crossBottom[key] : crossTop[key]) as number;
    if (other >= 0) {
      const v = add(siteX[other] as number, siteY[other] as number, top, true, 0);
      mate[v] = other;
      mate[other] = v;
      if (top) crossTop[key] = v;
      else crossBottom[key] = v;
      return v;
    }
    const ax = x0 + i * cell;
    const ay = y0 + j * cell;
    const bx = horizontal ? ax + cell : ax;
    const by = horizontal ? ay : ay + cell;
    let lo = 0.0;
    let hi = 1.0;
    const positiveAtA = (corner[j * (nx + 1) + i] as number) > 0;
    for (let step = 0; step < 14; step++) {
      const t = (lo + hi) / 2;
      if (field.distanceXY(ax + (bx - ax) * t, ay + (by - ay) * t) > 0 === positiveAtA) lo = t;
      else hi = t;
    }
    const t = swiftMin(0.98, swiftMax(0.02, (lo + hi) / 2));
    const v = add(ax + (bx - ax) * t, ay + (by - ay) * t, top, true, 0);
    if (top) crossTop[key] = v;
    else crossBottom[key] = v;
    return v;
  };
  const emit = (polygon: readonly PolygonEntry[], top: boolean): void => {
    // Fan from a corner where there is one, so chords stay chords.
    const found = polygon.findIndex((e) => !e.boundary);
    const start = found < 0 ? 0 : found;
    const ring = [...polygon.slice(start), ...polygon.slice(0, start)];
    for (let k = 1; k < ring.length - 1; k++) {
      const a = (ring[0] as PolygonEntry).site;
      const b = (ring[k] as PolygonEntry).site;
      const c = (ring[k + 1] as PolygonEntry).site;
      triangles.push(top ? { a, b, c } : { a, b: c, c: b });
      faces.push(top ? 0 : 1);
    }
    if (!top) return;
    for (let k = 0; k < ring.length; k++) {
      const here = ring[k] as PolygonEntry;
      const after = ring[(k + 1) % ring.length] as PolygonEntry;
      if (!(here.boundary && after.boundary)) continue;
      const a = here.site;
      const b = after.site;
      const ba = mateOf(a);
      const bb = mateOf(b);
      triangles.push({ a, b: ba, c: bb });
      faces.push(2);
      triangles.push({ a, b: bb, c: b });
      faces.push(2);
      chords.add(edgeKey(a, b));
      chords.add(edgeKey(ba, bb));
    }
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cornersI = [i, i + 1, i + 1, i] as const;
      const cornersJ = [j, j, j + 1, j + 1] as const;
      const inside = [
        (corner[cornersJ[0] * (nx + 1) + cornersI[0]] as number) > 0,
        (corner[cornersJ[1] * (nx + 1) + cornersI[1]] as number) > 0,
        (corner[cornersJ[2] * (nx + 1) + cornersI[2]] as number) > 0,
        (corner[cornersJ[3] * (nx + 1) + cornersI[3]] as number) > 0,
      ] as const;
      const count = (inside[0] ? 1 : 0) + (inside[1] ? 1 : 0) + (inside[2] ? 1 : 0) + (inside[3] ? 1 : 0);
      if (!(count > 0)) continue;
      // Edge k runs from corner k to corner k+1.
      const cross = (k: number, top: boolean): number => {
        switch (k) {
          case 0:
            return crossing(i, j, true, top);
          case 1:
            return crossing(i + 1, j, false, top);
          case 2:
            return crossing(i, j + 1, true, top);
          default:
            return crossing(i, j, false, top);
        }
      };
      let groups: readonly (readonly number[])[] = [[0, 1, 2, 3]];
      if (count === 2 && inside[0] === inside[2]) {
        // Two opposite corners: joined through the middle, or two separate corners.
        const middle = field.distanceXY(x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell);
        if (middle <= 0) {
          groups = inside[0] ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
        }
      }
      for (const top of [false, true]) {
        for (const group of groups) {
          const polygon: PolygonEntry[] = [];
          for (const k of group) {
            if (inside[k as 0 | 1 | 2 | 3]) polygon.push({ site: cornerSite(cornersI[k as 0 | 1 | 2 | 3], cornersJ[k as 0 | 1 | 2 | 3], top), boundary: false });
            if (inside[k as 0 | 1 | 2 | 3] !== inside[((k + 1) % 4) as 0 | 1 | 2 | 3]) polygon.push({ site: cross(k, top), boundary: true });
          }
          if (polygon.length >= 3) emit(polygon, top);
        }
      }
    }
  }

  // Refine until the domes are smooth and the chords follow the edge.
  const dome = figureDomed(p) ? p.dome : 0;
  const roll = p.surface === 'puffy' ? deepest : swiftMin(1.75 * dome, deepest);
  const rise = (d: number): number => {
    if (!(dome > 0 && roll > 0)) return 0;
    const s = swiftMin(1, swiftMax(0, d) / roll);
    return dome * Math.sqrt(1 - (1 - s) * (1 - s));
  };
  const tolerance = quality === 'export' ? 0.02 : 0.08;
  const shortest = quality === 'export' ? 0.3 : 0.7;
  let settled = faces.map((face) => face === 2);
  const lengths = [0, 0, 0];
  for (;;) {
    const marked = new Set<number>();
    for (let index = 0; index < triangles.length; index++) {
      if (settled[index] as boolean) continue;
      const t = triangles[index] as Triangle;
      const ids = [t.a, t.b, t.c] as const;
      for (let k = 0; k < 3; k++) {
        const u = ids[k as 0 | 1 | 2];
        const w = ids[((k + 1) % 3) as 0 | 1 | 2];
        const dx = (siteX[u] as number) - (siteX[w] as number);
        const dy = (siteY[u] as number) - (siteY[w] as number);
        lengths[k] = Math.sqrt(dx * dx + dy * dy);
      }
      const domedFace = dome > 0 && (faces[index] === 0 || sides === 2);
      let needsDetail = false;
      for (let k = 0; k < 3 && !needsDetail; k++) {
        const a = ids[k as 0 | 1 | 2];
        const b = ids[((k + 1) % 3) as 0 | 1 | 2];
        const edgeLength = lengths[k] as number;
        if (!(edgeLength > shortest)) continue;
        const midpointX = ((siteX[a] as number) + (siteX[b] as number)) * 0.5;
        const midpointY = ((siteY[a] as number) + (siteY[b] as number)) * 0.5;
        if (chords.has(edgeKey(a, b))) {
          needsDetail = Math.abs(field.distanceXY(midpointX, midpointY)) > tolerance;
          continue;
        }
        if (!domedFace) continue;
        const ha = rise(siteDistance[a] as number);
        const hb = rise(siteDistance[b] as number);
        const slope = (ha - hb) / edgeLength;
        needsDetail = Math.abs(rise(field.distanceXY(midpointX, midpointY)) - (ha + hb) * 0.5) > tolerance * Math.sqrt(1 + slope * slope);
      }
      if (needsDetail) {
        // `(0..<3).max { lengths[$0] < lengths[$1] }!`: the first of equal longest edges.
        let longest = 0;
        if ((lengths[longest] as number) < (lengths[1] as number)) longest = 1;
        if ((lengths[longest] as number) < (lengths[2] as number)) longest = 2;
        marked.add(edgeKey(ids[longest as 0 | 1 | 2], ids[((longest + 1) % 3) as 0 | 1 | 2]));
      } else settled[index] = true;
    }
    if (marked.size === 0) break;
    // A chord is split together with its twin on the other face.
    for (const edge of Array.from(marked)) {
      if (!chords.has(edge)) continue;
      const a = mate[edgeA(edge)] as number;
      const b = mate[edgeB(edge)] as number;
      if (a >= 0 && b >= 0) marked.add(edgeKey(a, b));
    }
    const mids = new Map<number, number>();
    // `marked.sorted { a first, then b }`: the key orders the same way.
    for (const edge of sortedDoubles(Array.from(marked))) {
      const ea = edgeA(edge);
      const eb = edgeB(edge);
      const ax = siteX[ea] as number;
      const ay = siteY[ea] as number;
      const bx = siteX[eb] as number;
      const by = siteY[eb] as number;
      if (chords.has(edge)) {
        const twin = edgeKey(mateOf(ea), mateOf(eb));
        const other = mids.get(twin);
        const point = other !== undefined ? vec2(siteX[other] as number, siteY[other] as number) : field.project(vec2((ax + bx) * 0.5, (ay + by) * 0.5));
        const v = add(point.x, point.y, siteTop[ea] as boolean, true, 0);
        if (other !== undefined) {
          mate[v] = other;
          mate[other] = v;
        }
        mids.set(edge, v);
        chords.delete(edge);
        chords.add(edgeKey(ea, v));
        chords.add(edgeKey(v, eb));
      } else {
        const pointX = (ax + bx) * 0.5;
        const pointY = (ay + by) * 0.5;
        mids.set(edge, add(pointX, pointY, siteTop[ea] as boolean, false, field.distanceXY(pointX, pointY)));
      }
    }
    const next: Triangle[] = [];
    const kinds: number[] = [];
    const done: boolean[] = [];
    for (let index = 0; index < triangles.length; index++) {
      const t = triangles[index] as Triangle;
      const face = faces[index] as number;
      const put = (a: number, b: number, c: number): void => {
        next.push({ a, b, c });
        kinds.push(face);
        done.push(face === 2);
      };
      const v = [t.a, t.b, t.c] as const;
      const m = [mids.get(edgeKey(v[0], v[1])), mids.get(edgeKey(v[1], v[2])), mids.get(edgeKey(v[2], v[0]))] as const;
      const splits = (m[0] !== undefined ? 1 : 0) + (m[1] !== undefined ? 1 : 0) + (m[2] !== undefined ? 1 : 0);
      switch (splits) {
        case 0:
          next.push(t);
          kinds.push(face);
          done.push(settled[index] as boolean);
          break;
        case 3: {
          const [m0, m1, m2] = m as readonly [number, number, number];
          put(v[0], m0, m2);
          put(m0, v[1], m1);
          put(m2, m1, v[2]);
          put(m0, m1, m2);
          break;
        }
        case 1: {
          const i = (m[0] !== undefined ? 0 : m[1] !== undefined ? 1 : 2) as 0 | 1 | 2;
          const mi = m[i] as number;
          put(v[i], mi, v[((i + 2) % 3) as 0 | 1 | 2]);
          put(mi, v[((i + 1) % 3) as 0 | 1 | 2], v[((i + 2) % 3) as 0 | 1 | 2]);
          break;
        }
        default: {
          // `(0..<3).first { m[$0] != nil && m[($0+2) % 3] != nil }!`
          const i = (m[0] !== undefined && m[2] !== undefined ? 0 : m[1] !== undefined && m[0] !== undefined ? 1 : 2) as 0 | 1 | 2;
          const a = v[i];
          const b = v[((i + 1) % 3) as 0 | 1 | 2];
          const c = v[((i + 2) % 3) as 0 | 1 | 2];
          const ab = m[i] as number;
          const ca = m[((i + 2) % 3) as 0 | 1 | 2] as number;
          put(a, ab, ca);
          const d1x = (siteX[ab] as number) - (siteX[c] as number);
          const d1y = (siteY[ab] as number) - (siteY[c] as number);
          const d2x = (siteX[b] as number) - (siteX[ca] as number);
          const d2y = (siteY[b] as number) - (siteY[ca] as number);
          if (d1x * d1x + d1y * d1y <= d2x * d2x + d2y * d2y) {
            put(ab, b, c);
            put(ab, c, ca);
          } else {
            put(ab, b, ca);
            put(b, c, ca);
          }
        }
      }
    }
    triangles = next;
    faces = kinds;
    settled = done;
  }

  const base = sides === 2 ? dome : 0;
  const vertices: Point3[] = new Array<Point3>(siteX.length);
  for (let s = 0; s < siteX.length; s++) {
    const distance = siteDistance[s] as number;
    const boundary = siteBoundary[s] as boolean;
    let z: number;
    if (siteTop[s] as boolean) z = base + p.edge + (boundary ? 0 : rise(distance));
    else z = sides === 2 && !boundary ? base - rise(distance) : base;
    vertices[s] = { x: siteX[s] as number, y: siteY[s] as number, z };
  }
  const mesh = new BalloonMesh(vertices, triangles, 0);
  return { mesh, parameters: p, width, hangingHole: hanging, chainHole: chain };
}

// ---------------------------------------------------------------------------
// FigureSet (FigureGeometry.swift:561-617)
// ---------------------------------------------------------------------------

/** Every figure at the current settings, with notes, as one ZIP. `FigureSet.entries(_:)` */
export function figureSetEntries(input: FigureParameters): ZipEntry[] {
  const p = normalizedFigure(input);
  const parts: ZipEntry[] = [];
  for (const style of FIGURE_STYLES) {
    const q = { ...p, style };
    parts.push([figureFilename(q), binarySTL(generateFigure(q, 'export').mesh)]);
  }
  parts.push(['FIGURES.md', utf8(figureSetNotes(p))], ['figure-settings.json', utf8(encodeFigureParameters(p))]);
  return parts;
}

/** `FigureSet.archive(_:)` */
export function figureSetArchive(p: FigureParameters): Uint8Array {
  return storedZipArchive(figureSetEntries(p));
}

/** `FigureSet.notes(_:)` */
export function figureSetNotes(p: FigureParameters): string {
  const mm = (v: number): string => formatFixed(v, 1);
  let body: string;
  switch (p.surface) {
    case 'flat':
      body = `a flat slab ${mm(p.edge)} mm thick`;
      break;
    case 'pillow':
      body = `a flat back, a ${mm(p.edge)} mm edge band and a rounded front rising ${mm(p.dome)} mm`;
      break;
    case 'puffy':
      body = `a flat back, a ${mm(p.edge)} mm edge band and a domed front rising ${mm(p.dome)} mm in the middle`;
      break;
  }
  const twoSided =
    figureSides(p) === 2
      ? '\n' +
        'These figures are domed on both sides. Print them on a raft with supports under the ' +
        'lower dome, or print the flat-backed version twice and glue the pair back to back.'
      : '';
  const chain = p.chainHole
    ? '\n' +
      'Each figure also has a hole at the bottom, so another figure can hang below it: ' +
      'raindrops under a cloud, a star under the moon.'
    : '';
  return (
    '# Mobile figures\n' +
    '\n' +
    `Seven figures, ${intRounded(p.height)} mm tall, each with ${body}. ` +
    `Every figure has a ${mm(p.holeDiameter)} mm hole for the thread, placed above its ` +
    `centre of gravity with at least ${mm(p.holeMargin)} mm of material around it, so it ` +
    `hangs straight.${twoSided}${chain}\n` +
    '\n' +
    '## Printing\n' +
    '\n' +
    'Import at 100% scale in millimetres. Print flat back down, no supports, with a brim if ' +
    'the figure is slim. About 0.2 mm layers and enough walls to fill the edge band work ' +
    'well; use fine or adaptive layers for the gently curved crown. Print each figure in ' +
    'its own colour, or pause for a colour change at the top of the edge band.\n' +
    '\n' +
    '## Hanging\n' +
    '\n' +
    'Thread a cord through the hole from front to back and tie a loop, or knot the cord ' +
    "through the hole directly. Hang the figures from the mobile ring's holes at " +
    'different heights, 60 to 90 mm apart in height reads best. Keep the whole mobile out ' +
    "of a baby's reach: mount it high, keep the cords short, and take it down once the " +
    'baby can push up on hands and knees. Check knots and cords regularly. Nothing here ' +
    'has been load- or safety-tested.'
  );
}
