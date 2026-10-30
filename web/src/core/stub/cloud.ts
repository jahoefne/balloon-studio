// Ported from mac/Sources/BalloonStudio/CloudGeometry.swift:3-62 (profiles), 64-273 (CloudParameters),
// 754-843 (CloudGenerator.Rect/Layout rectangles, horizontalReach, horizontalIntervals, radius),
// SunGeometry.swift:5-142 (WallLampKind, SunPolygon, SunStyle, SunGeometry.profile) and
// NailInsert.swift:45-121 @ 03c9307. Parameters only; no meshes.
//
// SWIFT-DIFF: `clampFits` / `clampMinimumWidth` are stub approximations. The real answer needs
// CableOutlet and CableClamp.fits (CableSeal.swift, CableClamp.swift:152-185), ported in WP-K4b.

import type { CloudDerived, CloudParameterApi, LampProfileRef } from '../api';
import {
  CABLE_SIDE_OPPOSITE,
  CABLE_SIDES,
  CLOUD_STYLE_INFO,
  CLOUD_STYLES,
  LAMP_SURFACES,
  SUN_STYLE_INFO,
  SUN_STYLES,
  WALL_LAMP_KINDS,
  type CableSide,
  type CloudParameters,
  type CloudStyle,
  type NailInsertInfo,
  type SunStyle,
  type WallLampKind,
} from '../types';
import { atan2, cos, hypot, PI, sin } from '../swift/dmath';
import { keyedCodec, lenientEnumeration } from '../codec';
import type { JSONKeyedContainer } from '../swift/json';
import { formatFixed } from '../swift/format';
import { swiftMax, swiftMin, swiftMin3 } from '../swift/minmax';
import { intTrunc } from '../swift/rounding';

// --- Profiles ----------------------------------------------------------------

type Lobe = readonly [x: number, y: number, r: number];
interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
interface Plane {
  x: number;
  y: number;
  offset: number;
}
interface SunPolygon {
  points: { x: number; y: number }[];
  planes: Plane[];
}
interface CloudProfile {
  lobes: readonly Lobe[];
  body: Rect;
  polygons: SunPolygon[];
}

const sunPolygon = (points: { x: number; y: number }[]): SunPolygon => ({
  points,
  planes: points.map((a, i) => {
    const b = points[(i + 1) % points.length]!;
    const ex = b.x - a.x, ey = b.y - a.y;
    const length = hypot(ex, ey), nx = ey / length, ny = -ex / length;
    return { x: nx, y: ny, offset: nx * a.x + ny * a.y };
  }),
});

const cloudProfile = (lobes: Lobe[], body: Rect): CloudProfile => ({ lobes, body, polygons: [] });

/** CloudGeometry.swift:19-47, copied literally. */
const CLOUD_PROFILES: Readonly<Record<CloudStyle, CloudProfile>> = {
  classic: cloudProfile([[-0.31, -0.02, 0.19], [-0.2, 0.1, 0.17], [0.02, 0.11, 0.26], [0.3, -0.005, 0.2]], { x0: -0.31, x1: 0.3, y0: -0.21, y1: 0.1 }),
  drift: cloudProfile(
    [[-0.335, -0.045, 0.165], [-0.19, 0.02, 0.205], [0.045, 0.065, 0.215], [0.255, 0.015, 0.165], [0.345, -0.055, 0.155]],
    { x0: -0.335, x1: 0.345, y0: -0.21, y1: 0.06 },
  ),
  billow: cloudProfile([[-0.32, -0.03, 0.18], [-0.075, 0.195, 0.305], [0.27, 0.02, 0.23]], { x0: -0.32, x1: 0.27, y0: -0.21, y1: 0.1 }),
  twin: cloudProfile(
    [[-0.33, -0.04, 0.17], [-0.19, 0.125, 0.235], [0.135, 0.14, 0.23], [0.335, -0.045, 0.165]],
    { x0: -0.33, x1: 0.335, y0: -0.21, y1: 0.1 },
  ),
  breeze: cloudProfile(
    [[-0.32, -0.03, 0.18], [-0.12, 0.12, 0.24], [0.12, 0.09, 0.195], [0.265, 0.03, 0.165], [0.322, -0.032, 0.178]],
    { x0: -0.32, x1: 0.322, y0: -0.21, y1: 0.06 },
  ),
  cotton: cloudProfile(
    [
      [-0.32, -0.03, 0.18], [0.32, -0.03, 0.18], [-0.13, 0.06, 0.21], [0.13, 0.06, 0.21], [0.0, 0.14, 0.21],
      [-0.3, 0.13, 0.095], [-0.21, 0.23, 0.1], [-0.1, 0.3, 0.1], [0.03, 0.28, 0.13], [0.16, 0.27, 0.1],
      [0.27, 0.18, 0.1], [0.335, 0.08, 0.09],
    ],
    { x0: -0.32, x1: 0.32, y0: -0.21, y1: 0.06 },
  ),
};

const mirroredProfile = (p: CloudProfile): CloudProfile => ({
  lobes: p.lobes.map(([x, y, r]) => [-x, y, r] as const),
  body: { x0: -p.body.x1, x1: -p.body.x0, y0: p.body.y0, y1: p.body.y1 },
  polygons: p.polygons.map((polygon) => sunPolygon([...polygon.points].reverse().map((q) => ({ x: -q.x, y: q.y })))),
});

// SunGeometry.swift:56-142
const sunRayCount = (style: SunStyle): number => SUN_STYLE_INFO[style].rayCount;
const sunSector = (style: SunStyle): number => (2 * PI) / sunRayCount(style);
const sunNotchRadius = (style: SunStyle): number =>
  style === 'soft-star' || style === 'cones' ? 0.27 : style === 'pinwheel' ? 0.29 : 0.3;
const sunLean = (style: SunStyle): number => (style === 'pinwheel' ? PI / 24 : 0);
const SUN_TIP_RADIUS = 0.5;

const sunNotch = (style: SunStyle, ray: number, side: number) => {
  const angle = (ray + side / 2) * sunSector(style) + sunLean(style);
  return { x: cos(angle) * sunNotchRadius(style), y: sin(angle) * sunNotchRadius(style) };
};
const sunTip = (style: SunStyle, ray: number) => {
  const angle = ray * sunSector(style);
  return { x: cos(angle) * SUN_TIP_RADIUS, y: sin(angle) * SUN_TIP_RADIUS };
};
const makeSunProfile = (style: SunStyle): CloudProfile => {
  const triangles: SunPolygon[] = [];
  for (let ray = 0; ray < sunRayCount(style); ray += 1) {
    const t = sunTip(style, ray);
    const sides = [1.0, -1.0].map((side) => {
      const n = sunNotch(style, ray, side);
      return { x: t.x + (n.x - t.x) * 1.5, y: t.y + (n.y - t.y) * 1.5 };
    });
    triangles.push(sunPolygon([t, ...sides]));
  }
  return { lobes: [[0, 0, sunNotchRadius(style) - 0.005]], body: { x0: 0, x1: 0, y0: 0, y1: 0 }, polygons: triangles };
};
const SUN_PROFILES = Object.fromEntries(SUN_STYLES.map((style) => [style, makeSunProfile(style)])) as Record<SunStyle, CloudProfile>;

const profileOf = (ref: LampProfileRef): CloudProfile => {
  if (ref.kind === 'sun') return SUN_PROFILES[ref.sunStyle];
  return ref.mirrored ? mirroredProfile(CLOUD_PROFILES[ref.style]) : CLOUD_PROFILES[ref.style];
};
const refOf = (p: CloudParameters): LampProfileRef =>
  p.kind === 'sun' ? { kind: 'sun', sunStyle: p.sunStyle } : { kind: 'cloud', style: p.style, mirrored: p.mirrored };

const firstMin = (values: number[]): number => values.reduce((a, b) => (b < a ? b : a));
const firstMax = (values: number[]): number => values.reduce((a, b) => (a < b ? b : a));
const extremes = (profile: CloudProfile, sign: 1 | -1): number[] => [
  ...profile.lobes.map(([, y, r]) => y + sign * r),
  ...profile.polygons.flatMap((polygon) => polygon.points.map((q) => q.y)),
];
const lowY = (profile: CloudProfile): number => swiftMin(profile.body.y0, firstMin(extremes(profile, -1)));
const highY = (profile: CloudProfile): number => swiftMax(profile.body.y1, firstMax(extremes(profile, 1)));

// --- CloudGenerator outline functions (CloudGeometry.swift:793-843) -------------

const polygonRadius = (polygon: SunPolygon, angle: number, inset: number, width: number): number => {
  let low = 0, high = Infinity;
  for (const plane of polygon.planes) {
    const along = plane.x * cos(angle) + plane.y * sin(angle), limit = plane.offset * width - inset;
    if (Math.abs(along) < 1e-12) {
      if (limit < 0) return 0;
    } else if (along > 0) high = swiftMin(high, limit / along);
    else low = swiftMax(low, limit / along);
  }
  return high >= low ? high : 0;
};

const polygonIntervals = (polygon: SunPolygon, y: number, inset: number, width: number): [number, number][] => {
  let low = -Infinity, high = Infinity;
  for (const plane of polygon.planes) {
    const limit = plane.offset * width - inset - plane.y * y;
    if (Math.abs(plane.x) < 1e-12) {
      if (limit < 0) return [];
    } else if (plane.x > 0) high = swiftMin(high, limit / plane.x);
    else low = swiftMax(low, limit / plane.x);
  }
  return high > low ? [[low, high]] : [];
};

const horizontalIntervals = (y: number, inset: number, width: number, profile: CloudProfile): [number, number][] => {
  const intervals = profile.polygons.flatMap((polygon) => polygonIntervals(polygon, y, inset, width));
  for (const [cx, cy, r] of profile.lobes) {
    const radius = r * width - inset, dy = y - cy * width;
    if (Math.abs(dy) < radius) {
      const dx = Math.sqrt(radius * radius - dy * dy);
      intervals.push([cx * width - dx, cx * width + dx]);
    }
  }
  const body = profile.body;
  if (y >= body.y0 * width + inset && y <= body.y1 * width - inset) intervals.push([body.x0 * width + inset, body.x1 * width - inset]);
  const merged: [number, number][] = [];
  // Array.prototype.sort is stable, as Swift's sort is.
  for (const interval of [...intervals].sort((a, b) => (a[0] < b[0] ? -1 : b[0] < a[0] ? 1 : 0))) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1]) last[1] = swiftMax(last[1], interval[1]);
    else merged.push([interval[0], interval[1]]);
  }
  return merged;
};

const horizontalReach = (y: number, width: number, profile: CloudProfile): number => {
  const span = horizontalIntervals(y, 4.5, width, profile).find(([a, b]) => a <= 0 && b >= 0);
  return span ? swiftMin(-span[0], span[1]) : 0;
};

export const lampRadius = (angle: number, inset: number, width: number, verticalScale: number, profile: CloudProfile): number => {
  const stretch = hypot(cos(angle), sin(angle) / verticalScale);
  const dx = cos(angle) / stretch, dy = sin(angle) / verticalScale / stretch;
  let far = 0;
  for (const polygon of profile.polygons) far = swiftMax(far, polygonRadius(polygon, atan2(dy, dx), inset, width));
  for (const [cx, cy, r] of profile.lobes) {
    const x = cx * width, y = cy * width, rr = r * width - inset;
    const projection = x * dx + y * dy, det = rr * rr - x * x - y * y + projection * projection;
    if (det >= 0) far = swiftMax(far, projection + Math.sqrt(det));
  }
  const body = profile.body;
  const rx = dx >= 0 ? (body.x1 * width - inset) / swiftMax(dx, 1e-12) : (body.x0 * width + inset) / swiftMin(dx, -1e-12);
  const ry = dy >= 0 ? (body.y1 * width - inset) / swiftMax(dy, 1e-12) : (body.y0 * width + inset) / swiftMin(dy, -1e-12);
  return swiftMax(far, swiftMin(rx, ry)) / stretch;
};

// --- CloudParameters ------------------------------------------------------------

const FLOOR = 3.0, WALL = 2.4, SKIRT = 12.0, SUN_CORE = 0.15, SUN_NAIL_TOP = 0.118;

const baseDefaults: CloudParameters = Object.freeze({
  kind: 'cloud',
  style: 'classic',
  sunStyle: 'soft-star',
  mirrored: false,
  width: 230.0,
  depth: 22.0,
  diffuserThickness: 1.2,
  surface: 'flat',
  surfaceDepth: 18.0,
  stripWidth: 8.0,
  stripThickness: 3.0,
  stripCutLength: 16.0,
  ledRowSpacing: 14.0,
  clipFit: 0.2,
  cableDiameter: 3.0,
  cableSide: 'right',
  secondCableSide: null,
  thirdCableSide: null,
  fourthCableSide: null,
  strainRelief: true,
  nailHead: 8.0,
  nailShaft: 3.5,
  nailInsert: false,
  nailDiameter: 1.8,
  nailHeadDiameter: 3.3,
});

/** WallLampKind.defaults (SunGeometry.swift:9-14) */
export const lampDefaults = (kind: WallLampKind): CloudParameters =>
  kind === 'sun' ? { ...baseDefaults, kind, width: 200 } : { ...baseDefaults, kind };

/** The first outlet, then up to three more, each on a side of its own. */
export const cableSides = (p: CloudParameters): CableSide[] =>
  [p.cableSide, p.secondCableSide, p.thirdCableSide, p.fourthCableSide]
    .filter((side): side is CableSide => side !== null)
    .reduce<CableSide[]>((sides, side) => (sides.includes(side) ? sides : [...sides, side]), []);

/** The `cableSides` setter. */
export const withCableSides = (p: CloudParameters, sides: readonly CableSide[]): CloudParameters => ({
  ...p,
  cableSide: sides[0] ?? p.cableSide,
  secondCableSide: sides.length > 1 ? sides[1]! : null,
  thirdCableSide: sides.length > 2 ? sides[2]! : null,
  fourthCableSide: sides.length > 3 ? sides[3]! : null,
});

export const cableConfigurations = (p: CloudParameters): CloudParameters[] => cableSides(p).map((side) => withCableSides(p, [side]));

/** Moves an outlet to another side. An outlet already there takes its place. */
export const selectCableSide = (p: CloudParameters, side: CableSide, outlet = 0): CloudParameters => {
  const sides = cableSides(p);
  if (outlet < 0 || outlet >= sides.length) return p;
  const other = sides.indexOf(side);
  if (other >= 0) sides[other] = sides[outlet]!;
  sides[outlet] = side;
  return withCableSides(p, sides);
};

/** Adds outlets facing the one before where free, else bottom, top, right, left; or removes the last ones. */
export const setCableOutletCount = (p: CloudParameters, count: number): CloudParameters => {
  const sides = cableSides(p).slice(0, swiftMax(1, count));
  while (sides.length < swiftMin(count, CABLE_SIDES.length)) {
    const candidates = [CABLE_SIDE_OPPOSITE[sides[sides.length - 1]!], ...[...CABLE_SIDES].reverse()];
    sides.push(candidates.find((side) => !sides.includes(side))!);
  }
  return withCableSides(p, sides);
};

/** CloudParameters' computed layout, in Swift's dependency order. */
const layout = (p: CloudParameters) => {
  const profile = profileOf(refOf(p));
  const pLowY = lowY(profile), pHighY = highY(profile);
  const isSun = p.kind === 'sun';
  const cableClearance = p.cableDiameter + 0.8;
  const ledChannelWidth = p.stripWidth + 0.6;
  const compactBlend = swiftMin(1, swiftMax(0, (p.width - 160) / 40));
  const coreLowFraction = isSun ? -SUN_CORE : -(0.15 + 0.03 * compactBlend);
  const coreHighFraction = isSun ? SUN_CORE : swiftMin(0.22 - 0.07 * compactBlend, pHighY - 0.15);
  const layoutHeightBasis = (() => {
    if (isSun) return p.width;
    const cableHeight = 2 * cableClearance + 7.2;
    const nailHeight = p.nailHead + 12.8;
    return swiftMax(p.width, Math.ceil((cableHeight + ledChannelWidth + nailHeight + 3.6) / (coreHighFraction - coreLowFraction)));
  })();
  const verticalScale = layoutHeightBasis / p.width;
  const coreLowY = layoutHeightBasis * coreLowFraction;
  const coreHighY = layoutHeightBasis * coreHighFraction;
  const desired = p.width * (isSun ? SUN_CORE : 0.18 + 0.12 * compactBlend);
  const coreHalfWidth = swiftMin3(
    desired,
    horizontalReach(coreLowY / verticalScale, p.width, profile),
    horizontalReach(coreHighY / verticalScale, p.width, profile),
  );
  const cableStartY = isSun ? coreLowY + 3.2 : swiftMax(-layoutHeightBasis * 0.16, coreLowY + 3.2);
  const cableBossTop = cableStartY + 2 * cableClearance + 4.8;
  // nailCenterY and ledCenterY refer to each other differently for the two kinds (CloudGeometry.swift:205-217).
  let nailCenterY: number, ledCenterY: number;
  if (isSun) {
    nailCenterY = p.width * SUN_NAIL_TOP - 10.4 - p.nailHead / 2;
    ledCenterY = nailCenterY - p.nailHead / 2 - 2.4 - 1 - ledChannelWidth / 2;
  } else {
    const preferredLed = swiftMin(-layoutHeightBasis * 0.015, coreHighY - ledChannelWidth / 2 - p.nailHead - 14.8);
    ledCenterY = swiftMax(preferredLed, cableBossTop + 1 + ledChannelWidth / 2);
    const preferredNail = swiftMin(layoutHeightBasis * 0.06, coreHighY - p.nailHead / 2 - 10.4 - 1);
    nailCenterY = swiftMax(preferredNail, ledCenterY + ledChannelWidth / 2 + 1 + p.nailHead / 2 + 2.4);
  }
  const height = layoutHeightBasis * (pHighY - pLowY);
  return {
    profile, cableClearance, ledChannelWidth, compactBlend, layoutHeightBasis, verticalScale, coreLowY, coreHighY,
    coreHalfWidth, cableStartY, cableBossTop, nailCenterY, ledCenterY, height,
  };
};

const minimumWidth = (p: CloudParameters): number => (p.kind === 'sun' ? 160 : 100);
const maximumSurfaceDepth = (p: CloudParameters): number => swiftMin(30, p.width * 0.12);

export const lampDisplayName = (p: CloudParameters): string =>
  p.kind === 'sun' ? `Sun · ${SUN_STYLE_INFO[p.sunStyle].title}` : `${CLOUD_STYLE_INFO[p.style].title}${p.mirrored ? ' · mirrored' : ''}`;

export const lampFilename = (p: CloudParameters): string => {
  const surfaceSuffix = p.surface === 'sculpted' ? `-3d-${formatFixed(p.surfaceDepth, 1)}mm` : '';
  const sides = cableSides(p);
  const cableSuffix =
    sides.length > 1
      ? `-cable-${[...sides].sort((a, b) => (a < b ? -1 : b < a ? 1 : 0)).join('-')}`
      : p.cableSide === 'right'
        ? ''
        : `-cable-${p.cableSide}`;
  if (p.kind === 'sun') return `Sun-Lamp-${p.sunStyle}-${intTrunc(p.width)}mm${surfaceSuffix}${cableSuffix}-kit.zip`;
  const variant = p.style === 'classic' && !p.mirrored ? '' : `-${p.style}${p.mirrored ? '-mirrored' : ''}`;
  return `Cloud-Lamp${variant}-${intTrunc(p.width)}mm${surfaceSuffix}${cableSuffix}-kit.zip`;
};

const frontFilename = (p: CloudParameters): string => (p.kind === 'sun' ? 'B-sun-front-diffuser.stl' : 'B-cloud-front-white-PLA.stl');

const derived = (p: CloudParameters): CloudDerived => {
  const l = layout(p);
  const reliefDepth = p.surface === 'sculpted' ? p.surfaceDepth : 0;
  return {
    cableSides: cableSides(p),
    height: l.height,
    reliefDepth,
    maximumSurfaceDepth: maximumSurfaceDepth(p),
    totalDepth: p.depth + p.diffuserThickness + reliefDepth,
    minimumWidth: minimumWidth(p),
    layoutHeightBasis: l.layoutHeightBasis,
    verticalScale: l.verticalScale,
    compactBlend: l.compactBlend,
    coreLowY: l.coreLowY,
    coreHighY: l.coreHighY,
    coreHalfWidth: l.coreHalfWidth,
    cableStartY: l.cableStartY,
    cableBossTop: l.cableBossTop,
    nailCenterY: l.nailCenterY,
    ledCenterY: l.ledCenterY,
    ledLength: 2 * l.coreHalfWidth - 4.8,
    ledChannelWidth: l.ledChannelWidth,
    cableClearance: l.cableClearance,
    fitsP2S: p.width + 16 <= 256.001 && l.height + 16 <= 256.001,
    displayName: lampDisplayName(p),
    frontFilename: frontFilename(p),
    filename: lampFilename(p),
  };
};

/** CloudGeometry.swift:249-272, in the same order. */
export const normalizeLamp = (input: CloudParameters): CloudParameters => {
  const clamp = (x: number, a: number, b: number, fallback: number): number =>
    swiftMin(b, swiftMax(a, Number.isFinite(x) ? x : fallback));
  let p: CloudParameters = { ...input };
  p.diffuserThickness = clamp(input.diffuserThickness, 0.8, 2, 1.2);
  p.stripWidth = clamp(input.stripWidth, 3.5, 12, 8);
  p.stripThickness = clamp(input.stripThickness, 1, 6, 3);
  p.stripCutLength = clamp(input.stripCutLength, 5, 100, 16);
  p.ledRowSpacing = clamp(input.ledRowSpacing, p.stripWidth + 4, 40, 14);
  p.clipFit = clamp(input.clipFit, 0.2, 0.5, 0.2);
  p.cableDiameter = clamp(input.cableDiameter, 2, 6, 3);
  p = withCableSides(p, cableSides(input));
  p.nailHead = clamp(input.nailHead, 5, 10, 8);
  p.nailShaft = clamp(input.nailShaft, 2, swiftMin(5, p.nailHead - 2), 3);
  p.nailDiameter = clamp(input.nailDiameter, 1, 4, 1.8);
  p.nailHeadDiameter = clamp(input.nailHeadDiameter, 2, 8, 3.3);
  p.width = clamp(input.width, minimumWidth(p), 500, input.kind === 'sun' ? 200 : 230);
  p.surfaceDepth = clamp(input.surfaceDepth, 2, maximumSurfaceDepth(p), 18);
  if (input.kind === 'sun') {
    p.style = 'classic';
    p.mirrored = false;
  } else p.sunStyle = 'soft-star';
  p.depth = clamp(input.depth, 16, 40, 22);
  return p;
};

/** CloudGeometry.swift:104-131: a sun saved with a former design opens as the first sun. */
export const decodeLamp = (c: JSONKeyedContainer): CloudParameters => {
  const kind = c.enumerationIfPresent('kind', WALL_LAMP_KINDS) ?? 'cloud';
  const d = { ...baseDefaults, kind, width: kind === 'sun' ? 200 : baseDefaults.width };
  return {
    kind,
    style: c.enumerationIfPresent('style', CLOUD_STYLES) ?? d.style,
    sunStyle: lenientEnumeration(c, 'sunStyle', SUN_STYLES) ?? d.sunStyle,
    mirrored: c.boolIfPresent('mirrored') ?? d.mirrored,
    width: c.doubleIfPresent('width') ?? d.width,
    depth: c.doubleIfPresent('depth') ?? d.depth,
    diffuserThickness: c.doubleIfPresent('diffuserThickness') ?? d.diffuserThickness,
    surface: c.enumerationIfPresent('surface', LAMP_SURFACES) ?? 'flat',
    surfaceDepth: c.doubleIfPresent('surfaceDepth') ?? d.surfaceDepth,
    stripWidth: c.doubleIfPresent('stripWidth') ?? d.stripWidth,
    stripThickness: c.doubleIfPresent('stripThickness') ?? d.stripThickness,
    stripCutLength: c.doubleIfPresent('stripCutLength') ?? d.stripCutLength,
    ledRowSpacing: c.doubleIfPresent('ledRowSpacing') ?? d.ledRowSpacing,
    clipFit: c.doubleIfPresent('clipFit') ?? d.clipFit,
    cableDiameter: c.doubleIfPresent('cableDiameter') ?? d.cableDiameter,
    cableSide: c.enumerationIfPresent('cableSide', CABLE_SIDES) ?? d.cableSide,
    secondCableSide: c.enumerationIfPresent('secondCableSide', CABLE_SIDES) ?? null,
    thirdCableSide: c.enumerationIfPresent('thirdCableSide', CABLE_SIDES) ?? null,
    fourthCableSide: c.enumerationIfPresent('fourthCableSide', CABLE_SIDES) ?? null,
    strainRelief: c.boolIfPresent('strainRelief') ?? d.strainRelief,
    nailHead: c.doubleIfPresent('nailHead') ?? d.nailHead,
    nailShaft: c.doubleIfPresent('nailShaft') ?? d.nailShaft,
    nailInsert: c.boolIfPresent('nailInsert') ?? d.nailInsert,
    nailDiameter: c.doubleIfPresent('nailDiameter') ?? d.nailDiameter,
    nailHeadDiameter: c.doubleIfPresent('nailHeadDiameter') ?? d.nailHeadDiameter,
  };
};

// --- NailInsert (NailInsert.swift:45-121) ---------------------------------------

const LAYOUT_LIP = 2.4, LAYOUT_HEAD_SPACE = 3.0, LAYOUT_SLOT_LENGTH = 8.0;
const INSERT = { clearance: 0.2, endPlay: 0.6, plate: 1.0, finger: 0.7, slit: 0.6, spring: 0.2, play: 0.2, mouth: 1.0, crown: 1.8, ramp: 0.5, grip: 0.3, cheekWidth: 0.8, mouthCheek: 0.5 };

const uncheckedInsert = (p: CloudParameters): NailInsertInfo & { lampSlot: number } => {
  const nailCenterY = layout(p).nailCenterY;
  // CloudGenerator.Layout.head and .slot (CloudGeometry.swift:776-777)
  const head: Rect = { x0: -p.nailHead / 2, x1: p.nailHead / 2, y0: nailCenterY - p.nailHead / 2, y1: nailCenterY + p.nailHead / 2 };
  const slot: Rect = { x0: -p.nailShaft / 2, x1: p.nailShaft / 2, y0: head.y1, y1: head.y1 + LAYOUT_SLOT_LENGTH };
  const entry = head.x1 - head.x0;
  const halfWidth = entry / 2 - INSERT.clearance;
  const height = swiftMin(entry - INSERT.endPlay, LAYOUT_SLOT_LENGTH);
  const slotHalfWidth = p.nailDiameter / 2 + INSERT.play;
  const cheek = halfWidth - INSERT.finger - INSERT.slit;
  const lampSlot = (slot.x1 - slot.x0) / 2;
  const top = slot.y1;
  return {
    halfWidth,
    tipHalfWidth: entry / 2 + INSERT.spring,
    height,
    slotHalfWidth,
    mouthHalfWidth: swiftMin(lampSlot, cheek - INSERT.mouthCheek),
    cheek,
    top,
    slotCenter: height - INSERT.crown - slotHalfWidth,
    nailY: top - INSERT.crown - p.nailDiameter / 2,
    nearestHead: LAYOUT_LIP + INSERT.plate,
    headRoom: LAYOUT_HEAD_SPACE - INSERT.plate,
    lampSlot,
  };
};

export const nailInsertProblem = (p: CloudParameters): string | null => {
  const mm = (v: number) => formatFixed(v, 1);
  const i = uncheckedInsert(p), head = p.nailHeadDiameter / 2;
  if (i.slotHalfWidth + 0.25 > i.lampSlot) {
    return `A ${mm(p.nailDiameter)} mm shaft is too thick for the insert to narrow the ${mm(p.nailShaft)} mm slot.`;
  }
  if (head - i.slotHalfWidth < INSERT.grip) {
    return `A ${mm(p.nailHeadDiameter)} mm head is too small for a ${mm(p.nailDiameter)} mm shaft: the insert needs a head of ${mm(2 * (i.slotHalfWidth + INSERT.grip))} mm or more.`;
  }
  if (i.cheek - i.slotHalfWidth < INSERT.cheekWidth || i.mouthHalfWidth <= i.slotHalfWidth || i.slotCenter - INSERT.mouth < 0.3) {
    return 'The keyhole is too small for the insert. Give it a larger head clearance, 8 mm for instance.';
  }
  if (head + 0.3 > i.cheek || i.nailY - head - (i.top - i.height) < INSERT.ramp) {
    return `A head over ${mm(2 * (i.cheek - 0.3))} mm does not fit between the insert's fingers in this keyhole.`;
  }
  return null;
};

export const nailInsert = (p: CloudParameters): NailInsertInfo | null => {
  if (nailInsertProblem(p) !== null) return null;
  const { lampSlot: _lampSlot, ...info } = uncheckedInsert(p);
  return info;
};

// --- Strain relief (stub approximation, see header) ------------------------------

/** STUB: `CableClamp(p) != nil`. Approximates the room the clamp needs by the lamp's width. */
export const clampFits = (p: CloudParameters): boolean => p.strainRelief && p.width >= (p.kind === 'sun' ? 180 : 140);

/** `CableClamp.minimumWidth` (CableClamp.swift:177-185) over the stub's `clampFits`. */
export const clampMinimumWidth = (p: CloudParameters): number | null => {
  const q = { ...p, strainRelief: true };
  const from = minimumWidth(p);
  for (let i = 0; from + i <= 500; i += 1) {
    const width = from + i * 1;
    if (clampFits(normalizeLamp({ ...q, width }))) return width;
  }
  return null;
};

export const cloudParameters: CloudParameterApi = {
  defaults: lampDefaults,
  normalize: normalizeLamp,
  codec: keyedCodec(decodeLamp),
  filename: lampFilename,
  derived,
  constants: Object.freeze({
    floor: FLOOR,
    wall: WALL,
    skirt: SKIRT,
    sunCore: SUN_CORE,
    sunNailTop: SUN_NAIL_TOP,
    sealFilename: 'C-cable-seal-TPU.stl',
    barFilename: 'D-cable-clamp-bar.stl',
    anvilFilename: 'E-cable-clamp-anvil.stl',
    insertFilename: 'F-nail-slot-insert.stl',
  }),
  withCableSides,
  selectCableSide,
  setCableOutletCount,
  cableConfigurations,
  nailInsertProblem,
  nailInsert,
  clampFits,
  clampMinimumWidth,
  profileExtent: (ref) => {
    const profile = profileOf(ref);
    return { lowY: lowY(profile), highY: highY(profile) };
  },
  radius: (angle, ref, options) =>
    lampRadius(angle, options?.inset ?? 0, options?.width ?? 1, options?.verticalScale ?? 1, profileOf(ref)),
};

/** For the stub's outline extrusion and the figure outlines. */
export const lampProfile = (ref: LampProfileRef): CloudProfile => profileOf(ref);
export const lampLayout = layout;
