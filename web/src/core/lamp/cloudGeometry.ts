// Ported from mac/Sources/BalloonStudio/CloudGeometry.swift @ 04553ee.
//
// WP-K4a part 1 holds CloudStyle/CloudProfile (:3-62), CloudParameters (:64-273), LampClipGeometry
// and LampClips (:710-744), CloudGenerator.Rect/Layout/horizontalReach/horizontalIntervals/radius
// (:755-841) and CloudMeshBuilder (:1033-1052). `CloudGenerator.generate` (:843-1030) follows in
// part 2; CloudCableParts and CloudKit (:276-704) go to cloudKit.ts (plan §2).
//
// Swift's computed properties of `CloudParameters` are free functions over the plain
// `CloudParameters` of core/types.ts, named like the property. Swift's `static let`s are
// `CloudConstants`. `mutating` functions return a new value.
//
// This module, sunGeometry, cableSeal, cableClamp and lampSurface import each other, as the Swift
// files do. So nothing here may read another of them at module level: only inside functions.

import { CoreFailure, INVALID_SETTINGS_MESSAGE, type Codec } from '../api';
import { BalloonMesh } from '../geometry/mesh';
import type { Point3, Triangle } from '../geometry/point3';
import { IntKey3Map } from '../geometry/weld';
import { atan2, cos, hypot, PI, sin } from '../swift/dmath';
import { formatFixed } from '../swift/format';
import { encodeJSONCompact, type JSONObject } from '../swift/json';
import { arrayMax, arrayMin, swiftMax, swiftMin, swiftMin3 } from '../swift/minmax';
import { ieeeRemainder, intTrunc, rounded } from '../swift/rounding';
import { stableSorted } from '../swift/sort';
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
} from '../types';
import { CableOutlet } from './cableSeal';
import { SunGeometry, sunProfile, type SunPolygon } from './sunGeometry';

/** Swift `(Double, Double)`, a point in the lamp's XY plane or a pair of offsets. */
export type Pair = readonly [number, number];

// --- CloudGenerator.Rect (:755-759), first: the profiles below hold one -------------------------

export class Rect {
  constructor(
    readonly x0: number,
    readonly x1: number,
    readonly y0: number,
    readonly y1: number,
  ) {}
  contains(x: number, y: number): boolean {
    return x > this.x0 && x < this.x1 && y > this.y0 && y < this.y1;
  }
  expanded(d: number): Rect {
    return new Rect(this.x0 - d, this.x1 + d, this.y0 - d, this.y1 + d);
  }
}

// --- CloudProfile (:51-62) ------------------------------------------------------------------------

/** Swift `(Double, Double, Double)`: center x, center y and radius of a disk, at unit width. */
export type Lobe = readonly [x: number, y: number, r: number];

export class CloudProfile {
  private cachedLowY: number | undefined;
  private cachedHighY: number | undefined;
  private cachedMirrored: CloudProfile | undefined;

  constructor(
    readonly lobes: readonly Lobe[],
    readonly body: Rect,
    readonly polygons: readonly SunPolygon[] = [],
  ) {}

  // SWIFT-DIFF: lowY, highY and mirrored are cached; a profile never changes.
  get lowY(): number {
    return (this.cachedLowY ??= swiftMin(
      this.body.y0,
      arrayMin([...this.lobes.map((l) => l[1] - l[2]), ...this.polygons.flatMap((polygon) => polygon.points.map((q) => q.y))])!,
    ));
  }
  get highY(): number {
    return (this.cachedHighY ??= swiftMax(
      this.body.y1,
      arrayMax([...this.lobes.map((l) => l[1] + l[2]), ...this.polygons.flatMap((polygon) => polygon.points.map((q) => q.y))])!,
    ));
  }
  get mirrored(): CloudProfile {
    return (this.cachedMirrored ??= new CloudProfile(
      this.lobes.map((l) => [-l[0], l[1], l[2]] as const),
      new Rect(-this.body.x1, -this.body.x0, this.body.y0, this.body.y1),
      this.polygons.map((polygon) => polygon.mirrored()),
    ));
  }
}

// --- CloudStyle (:3-49); titles and subtitles are CLOUD_STYLE_INFO in core/types.ts ----------------

// All profiles share rounded lobes, a quiet flat base and a unit width.
// The original profile stays exact so existing printed pairs still match.
const CLOUD_PROFILES: Readonly<Record<CloudStyle, CloudProfile>> = {
  classic: new CloudProfile(
    [[-0.31, -0.02, 0.19], [-0.20, 0.10, 0.17], [0.02, 0.11, 0.26], [0.30, -0.005, 0.20]],
    new Rect(-0.31, 0.30, -0.21, 0.10),
  ),
  drift: new CloudProfile(
    [[-0.335, -0.045, 0.165], [-0.19, 0.02, 0.205], [0.045, 0.065, 0.215], [0.255, 0.015, 0.165], [0.345, -0.055, 0.155]],
    new Rect(-0.335, 0.345, -0.21, 0.06),
  ),
  billow: new CloudProfile(
    [[-0.32, -0.03, 0.18], [-0.075, 0.195, 0.305], [0.27, 0.02, 0.23]],
    new Rect(-0.32, 0.27, -0.21, 0.10),
  ),
  twin: new CloudProfile(
    [[-0.33, -0.04, 0.17], [-0.19, 0.125, 0.235], [0.135, 0.14, 0.23], [0.335, -0.045, 0.165]],
    new Rect(-0.33, 0.335, -0.21, 0.10),
  ),
  // A big head, its puffs stepping down towards the other end as if
  // blown along. The end puff stays full: a cable seal and its clamp
  // need its room, and so does the clip on its shoulder.
  breeze: new CloudProfile(
    [[-0.32, -0.03, 0.18], [-0.12, 0.12, 0.24], [0.12, 0.09, 0.195], [0.265, 0.03, 0.165], [0.322, -0.032, 0.178]],
    new Rect(-0.32, 0.322, -0.21, 0.06),
  ),
  // An arc of small puffs on a full body of large ones. The ends, the
  // middle and the highest puff are large enough for the fittings and
  // the cable's way out; the small ones only shape the outline.
  cotton: new CloudProfile(
    [
      [-0.32, -0.03, 0.18], [0.32, -0.03, 0.18], [-0.13, 0.06, 0.21], [0.13, 0.06, 0.21], [0.0, 0.14, 0.21],
      [-0.30, 0.13, 0.095], [-0.21, 0.23, 0.10], [-0.10, 0.30, 0.10], [0.03, 0.28, 0.13], [0.16, 0.27, 0.10],
      [0.27, 0.18, 0.10], [0.335, 0.08, 0.09],
    ],
    new Rect(-0.32, 0.32, -0.21, 0.06),
  ),
};

/** Swift `CloudStyle.profile`. */
export const cloudStyleProfile = (style: CloudStyle): CloudProfile => CLOUD_PROFILES[style];

// --- CloudParameters (:64-273) ----------------------------------------------------------------------

/** Swift `CloudParameters()`. */
export const cloudParameters = (): CloudParameters => ({
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
  // The slot insert for a nail whose head would slip through the slot,
  // and that nail as measured.
  nailInsert: false,
  nailDiameter: 1.8,
  nailHeadDiameter: 3.3,
});

/** Thrown by a failed `init(from:)`, as Swift's DecodingError. */
export class DecodeError extends Error {}

type Container = Readonly<Record<string, unknown>>;

/** `decoder.container(keyedBy:)`: a JSON object, nothing else. */
const keyedContainer = (value: unknown): Container => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new DecodeError('Expected a keyed container');
  return value as Container;
};
const fieldValue = (c: Container, key: string): unknown => (Object.prototype.hasOwnProperty.call(c, key) ? c[key] : undefined);

// JSON.parse turns out-of-range literals (1e999) into Infinity, which JSONDecoder rejects.
const asDouble = (value: unknown, key: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new DecodeError(`${key}: expected Double`);
  return value;
};

/** `try c.decode(Double.self, forKey:)`: the key must be there and not null. */
export const decodeRequiredDouble = (c: Container, key: string): number => {
  const value = fieldValue(c, key);
  if (value === undefined || value === null) throw new DecodeError(`${key}: missing`);
  return asDouble(value, key);
};
/** `try c.decodeIfPresent(Double.self, forKey:)`: absent or null is nil, a wrong type throws. */
const ifPresentDouble = (c: Container, key: string): number | undefined => {
  const value = fieldValue(c, key);
  return value === undefined || value === null ? undefined : asDouble(value, key);
};
const ifPresentBool = (c: Container, key: string): boolean | undefined => {
  const value = fieldValue(c, key);
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new DecodeError(`${key}: expected Bool`);
  return value;
};
const ifPresentEnum = <T extends string>(c: Container, key: string, cases: readonly T[]): T | undefined => {
  const value = fieldValue(c, key);
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !(cases as readonly string[]).includes(value)) throw new DecodeError(`${key}: unknown value`);
  return value as T;
};

/**
 * `init(from:)` (:104-133).
 * Missing shape/row settings preserve clouds saved by older versions.
 * A sun saved with one of the former designs opens as the first sun.
 * Their rear outlet becomes an outlet in the wall on the right, and
 * they get the strain relief wherever the lamp has room for it.
 */
export const decodeCloudParameters = (value: unknown): CloudParameters => {
  const p = cloudParameters();
  const c = keyedContainer(value);
  p.kind = ifPresentEnum(c, 'kind', WALL_LAMP_KINDS) ?? 'cloud';
  p.width = p.kind === 'sun' ? 200 : p.width;
  p.style = ifPresentEnum(c, 'style', CLOUD_STYLES) ?? p.style;
  // `((try? c.decodeIfPresent(String.self, forKey:)) ?? nil).flatMap(SunStyle.init(rawValue:))`: never throws.
  const sunStyle = fieldValue(c, 'sunStyle');
  p.sunStyle = typeof sunStyle === 'string' && (SUN_STYLES as readonly string[]).includes(sunStyle) ? (sunStyle as CloudParameters['sunStyle']) : p.sunStyle;
  p.mirrored = ifPresentBool(c, 'mirrored') ?? p.mirrored;
  p.width = ifPresentDouble(c, 'width') ?? p.width;
  p.depth = ifPresentDouble(c, 'depth') ?? p.depth;
  p.diffuserThickness = ifPresentDouble(c, 'diffuserThickness') ?? p.diffuserThickness;
  p.surface = ifPresentEnum(c, 'surface', LAMP_SURFACES) ?? 'flat';
  p.surfaceDepth = ifPresentDouble(c, 'surfaceDepth') ?? p.surfaceDepth;
  p.stripWidth = ifPresentDouble(c, 'stripWidth') ?? p.stripWidth;
  p.stripThickness = ifPresentDouble(c, 'stripThickness') ?? p.stripThickness;
  p.stripCutLength = ifPresentDouble(c, 'stripCutLength') ?? p.stripCutLength;
  p.ledRowSpacing = ifPresentDouble(c, 'ledRowSpacing') ?? p.ledRowSpacing;
  p.clipFit = ifPresentDouble(c, 'clipFit') ?? p.clipFit;
  p.cableDiameter = ifPresentDouble(c, 'cableDiameter') ?? p.cableDiameter;
  p.cableSide = ifPresentEnum(c, 'cableSide', CABLE_SIDES) ?? p.cableSide;
  p.secondCableSide = ifPresentEnum(c, 'secondCableSide', CABLE_SIDES) ?? null;
  p.thirdCableSide = ifPresentEnum(c, 'thirdCableSide', CABLE_SIDES) ?? null;
  p.fourthCableSide = ifPresentEnum(c, 'fourthCableSide', CABLE_SIDES) ?? null;
  p.strainRelief = ifPresentBool(c, 'strainRelief') ?? p.strainRelief;
  p.nailHead = ifPresentDouble(c, 'nailHead') ?? p.nailHead;
  p.nailShaft = ifPresentDouble(c, 'nailShaft') ?? p.nailShaft;
  p.nailInsert = ifPresentBool(c, 'nailInsert') ?? p.nailInsert;
  p.nailDiameter = ifPresentDouble(c, 'nailDiameter') ?? p.nailDiameter;
  p.nailHeadDiameter = ifPresentDouble(c, 'nailHeadDiameter') ?? p.nailHeadDiameter;
  return p;
};

/** `StableJSON.encode(parameters)` (:464): sorted keys, nil outlets omitted. */
export const encodeCloudParameters = (p: CloudParameters): string => {
  const fields: JSONObject = { ...p };
  const object: { [key: string]: JSONObject[string] } = {};
  for (const key of Object.keys(fields)) {
    if (fields[key] !== null) object[key] = fields[key];
  }
  return encodeJSONCompact(object);
};

/** `JSONDecoder` + `init(from:)` and `StableJSON`, as `Codec` of core/api.ts. */
export const cloudParametersCodec: Codec<CloudParameters> = {
  decode(text) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new CoreFailure('invalid-settings', INVALID_SETTINGS_MESSAGE);
    }
    return cloudParametersCodec.decodeValue(value);
  },
  decodeValue(value) {
    try {
      return decodeCloudParameters(value);
    } catch (error) {
      if (error instanceof DecodeError) throw new CoreFailure('invalid-settings', INVALID_SETTINGS_MESSAGE);
      throw error;
    }
  },
  encode: encodeCloudParameters,
};

/** Swift `static let` of CloudParameters (:135-137, :201, :204, :236-239), as `CloudParameterApi.constants`. */
export const CloudConstants = {
  floor: 3.0,
  wall: 2.4,
  skirt: 12.0,
  // A sun's core stays in its small middle, clear of the seals' pockets
  // in the notches around it.
  sunCore: 0.15,
  /** Top of a sun's nail pocket above the middle, as a fraction of the width. Below it a seal at the top has its whole way in. */
  sunNailTop: 0.118,
  sealFilename: 'C-cable-seal-TPU.stl',
  barFilename: 'D-cable-clamp-bar.stl',
  anvilFilename: 'E-cable-clamp-anvil.stl',
  insertFilename: 'F-nail-slot-insert.stl',
} as const;

/** The first outlet, then up to three more, each on a side of its own. */
export const cableSides = (p: CloudParameters): CableSide[] => {
  const sides: CableSide[] = [];
  for (const side of [p.cableSide, p.secondCableSide, p.thirdCableSide, p.fourthCableSide]) {
    if (side !== null && !sides.includes(side)) sides.push(side);
  }
  return sides;
};
/** The `cableSides` setter (:144-149). */
export const withCableSides = (p: CloudParameters, sides: readonly CableSide[]): CloudParameters => ({
  ...p,
  cableSide: sides[0] ?? p.cableSide,
  secondCableSide: sides.length > 1 ? sides[1]! : null,
  thirdCableSide: sides.length > 2 ? sides[2]! : null,
  fourthCableSide: sides.length > 3 ? sides[3]! : null,
});
/** Individual fittings retain the original single-outlet dimensions. */
export const cableConfigurations = (p: CloudParameters): CloudParameters[] => cableSides(p).map((side) => withCableSides(p, [side]));
/**
 * Moves an outlet to another side. An outlet already there takes its
 * place, so no two outlets share a side.
 */
export const selectCableSide = (p: CloudParameters, side: CableSide, index = 0): CloudParameters => {
  const sides = cableSides(p);
  if (index < 0 || index >= sides.length) return p;
  const other = sides.indexOf(side);
  if (other >= 0) sides[other] = sides[index]!;
  sides[index] = side;
  return withCableSides(p, sides);
};
/**
 * Adds outlets, or removes the last ones, until there are `count`. A new
 * outlet faces the one before it where that side is free, else it goes
 * to the first free side of bottom, top, right and left.
 */
export const setCableOutletCount = (p: CloudParameters, count: number): CloudParameters => {
  const sides = cableSides(p).slice(0, swiftMax(1, count));
  while (sides.length < swiftMin(count, CABLE_SIDES.length)) {
    const candidates = [CABLE_SIDE_OPPOSITE[sides[sides.length - 1]!], ...[...CABLE_SIDES].reverse()];
    sides.push(candidates.find((side) => !sides.includes(side))!);
  }
  return withCableSides(p, sides);
};
export const lampProfile = (p: CloudParameters): CloudProfile =>
  p.kind === 'sun' ? sunProfile(p.sunStyle) : p.mirrored ? cloudStyleProfile(p.style).mirrored : cloudStyleProfile(p.style);
export const height = (p: CloudParameters): number => {
  const profile = lampProfile(p);
  return layoutHeightBasis(p) * (profile.highY - profile.lowY);
};
export const reliefDepth = (p: CloudParameters): number => (p.surface === 'sculpted' ? p.surfaceDepth : 0);
export const maximumSurfaceDepth = (p: CloudParameters): number => swiftMin(30, p.width * 0.12);
export const totalDepth = (p: CloudParameters): number => p.depth + p.diffuserThickness + reliefDepth(p);
// Keep real hardware clearances at 100 mm width by making the silhouette
// taller when necessary. The LEDs and blind cap are never scaled down.
// The band of the former rear duct still counts, so outlines and LED rows
// of existing lamps stay as they are.
// A sun's middle is small: below 160 mm the nail pocket stands in the
// way of a cable seal at the top.
export const minimumWidth = (p: CloudParameters): number => (p.kind === 'sun' ? 160 : 100);
export const layoutHeightBasis = (p: CloudParameters): number => {
  if (p.kind === 'sun') return p.width;
  const cableHeight = 2 * cableClearance(p) + 7.2;
  const nailHeight = p.nailHead + 12.8;
  return swiftMax(p.width, Math.ceil((cableHeight + ledChannelWidth(p) + nailHeight + 3.6) / (coreHighFraction(p) - coreLowFraction(p))));
};
export const verticalScale = (p: CloudParameters): number => layoutHeightBasis(p) / p.width;
export const compactBlend = (p: CloudParameters): number => swiftMin(1, swiftMax(0, (p.width - 160) / 40));
const coreLowFraction = (p: CloudParameters): number => (p.kind === 'sun' ? -CloudConstants.sunCore : -(0.15 + 0.03 * compactBlend(p)));
const coreHighFraction = (p: CloudParameters): number =>
  p.kind === 'sun' ? CloudConstants.sunCore : swiftMin(0.22 - 0.07 * compactBlend(p), lampProfile(p).highY - 0.15);
export const coreLowY = (p: CloudParameters): number => layoutHeightBasis(p) * coreLowFraction(p);
export const coreHighY = (p: CloudParameters): number => layoutHeightBasis(p) * coreHighFraction(p);
export const coreHalfWidth = (p: CloudParameters): number => {
  const desired = p.width * (p.kind === 'sun' ? CloudConstants.sunCore : 0.18 + 0.12 * compactBlend(p));
  // Keep the Cartesian core inside the innermost skirt contour, including
  // the scallop between the upper lobe and right lobe during the transition.
  return swiftMin3(
    desired,
    horizontalReach(coreLowY(p) / verticalScale(p), p.width, lampProfile(p)),
    horizontalReach(coreHighY(p) / verticalScale(p), p.width, lampProfile(p)),
  );
};
export const cableStartY = (p: CloudParameters): number =>
  p.kind === 'sun' ? coreLowY(p) + 3.2 : swiftMax(-layoutHeightBasis(p) * 0.16, coreLowY(p) + 3.2);
export const cableBossTop = (p: CloudParameters): number => cableStartY(p) + 2 * cableClearance(p) + 4.8;
export const nailCenterY = (p: CloudParameters): number => {
  // A sun has no band of a former rear duct to keep. Its nail pocket
  // sits around the middle, the first LED row right below it.
  if (p.kind === 'sun') return p.width * CloudConstants.sunNailTop - 10.4 - p.nailHead / 2;
  const preferred = swiftMin(layoutHeightBasis(p) * 0.06, coreHighY(p) - p.nailHead / 2 - 10.4 - 1);
  return swiftMax(preferred, ledCenterY(p) + ledChannelWidth(p) / 2 + 1 + p.nailHead / 2 + 2.4);
};
export const ledCenterY = (p: CloudParameters): number => {
  if (p.kind === 'sun') return nailCenterY(p) - p.nailHead / 2 - 2.4 - 1 - ledChannelWidth(p) / 2;
  const preferred = swiftMin(-layoutHeightBasis(p) * 0.015, coreHighY(p) - ledChannelWidth(p) / 2 - p.nailHead - 14.8);
  return swiftMax(preferred, cableBossTop(p) + 1 + ledChannelWidth(p) / 2);
};
export const ledLength = (p: CloudParameters): number => 2 * coreHalfWidth(p) - 4.8;
export const ledChannelWidth = (p: CloudParameters): number => p.stripWidth + 0.6;
export const cableClearance = (p: CloudParameters): number => p.cableDiameter + 0.8;
export const fitsP2S = (p: CloudParameters): boolean => p.width + 16 <= 256.001 && height(p) + 16 <= 256.001;
export const displayName = (p: CloudParameters): string =>
  p.kind === 'sun' ? `Sun · ${SUN_STYLE_INFO[p.sunStyle].title}` : `${CLOUD_STYLE_INFO[p.style].title}${p.mirrored ? ' · mirrored' : ''}`;
export const frontFilename = (p: CloudParameters): string => (p.kind === 'sun' ? 'B-sun-front-diffuser.stl' : 'B-cloud-front-white-PLA.stl');
export const filename = (p: CloudParameters): string => {
  const surfaceSuffix = p.surface === 'sculpted' ? `-3d-${formatFixed(p.surfaceDepth, 1)}mm` : '';
  const sides = cableSides(p);
  const cableSuffix =
    sides.length > 1
      ? `-cable-${stableSorted(sides, (a, b) => a < b).join('-')}`
      : p.cableSide === 'right'
        ? ''
        : `-cable-${p.cableSide}`;
  if (p.kind === 'sun') return `Sun-Lamp-${p.sunStyle}-${intTrunc(p.width)}mm${surfaceSuffix}${cableSuffix}-kit.zip`;
  const variant = p.style === 'classic' && !p.mirrored ? '' : `-${p.style}${p.mirrored ? '-mirrored' : ''}`;
  return `Cloud-Lamp${variant}-${intTrunc(p.width)}mm${surfaceSuffix}${cableSuffix}-kit.zip`;
};

/** `normalized()` (:249-272), in the same order: each step may read what the one before it set. */
export const normalized = (self: CloudParameters): CloudParameters => {
  const clamp = (x: number, a: number, b: number, fallback: number): number => swiftMin(b, swiftMax(a, Number.isFinite(x) ? x : fallback));
  let p: CloudParameters = { ...self };
  p.diffuserThickness = clamp(self.diffuserThickness, 0.8, 2, 1.2);
  p.stripWidth = clamp(self.stripWidth, 3.5, 12, 8);
  p.stripThickness = clamp(self.stripThickness, 1, 6, 3);
  p.stripCutLength = clamp(self.stripCutLength, 5, 100, 16);
  p.ledRowSpacing = clamp(self.ledRowSpacing, p.stripWidth + 4, 40, 14);
  p.clipFit = clamp(self.clipFit, 0.2, 0.5, 0.2);
  p.cableDiameter = clamp(self.cableDiameter, 2, 6, 3);
  p = withCableSides(p, cableSides(self));
  p.nailHead = clamp(self.nailHead, 5, 10, 8);
  p.nailShaft = clamp(self.nailShaft, 2, swiftMin(5, p.nailHead - 2), 3);
  p.nailDiameter = clamp(self.nailDiameter, 1, 4, 1.8);
  p.nailHeadDiameter = clamp(self.nailHeadDiameter, 2, 8, 3.3);
  p.width = clamp(self.width, minimumWidth(p), 500, self.kind === 'sun' ? 200 : 230);
  p.surfaceDepth = clamp(self.surfaceDepth, 2, maximumSurfaceDepth(p), 18);
  if (self.kind === 'sun') {
    p.style = 'classic';
    p.mirrored = false;
  } else {
    p.sunStyle = 'soft-star';
  }
  // The 12 mm skirt needs a full 3 mm floor plus 1 mm tip clearance.
  p.depth = clamp(self.depth, 16, 40, 22);
  return p;
};

// --- LampClipGeometry, LampClips (:710-744) ---------------------------------------------------------

/**
 * Only the spring tabs grow into the cavity; the running fit and catch stay
 * on their original outer contours. The root tapers over the first 4 mm of
 * the free beam, and blends into the ordinary skirt across each relief slot.
 */
export const LampClipGeometry = {
  skirtThickness: 1.2,
  beamThickness: 1.6,
  rootThickness: 2.0,
  rootHeight: 2.0,
  taperEnd: 6.0,
} as const;

/**
 * Where the four spring tabs are, as angles seen from the middle of the
 * lamp: each tab's center, half its width and the relief slot beside it.
 * A cloud has them on its rounded shoulders. A sun has them on the flanks
 * of four rays, a quarter turn apart.
 */
export class LampClips {
  readonly centers: readonly number[];
  readonly half: number;
  readonly slit: number;

  constructor(p: CloudParameters) {
    if (p.kind === 'sun') {
      const clip = SunGeometry.clip(p.sunStyle, p.width);
      this.centers = [0, 1, 2, 3].map((i) => clip.center + (i * PI) / 2);
      this.half = clip.half;
      this.slit = clip.slit;
    } else {
      this.centers = [PI / 6, (5 * PI) / 6, (7 * PI) / 6, (11 * PI) / 6];
      this.half = 5 / (p.width * 0.4);
      this.slit = 1 / (p.width * 0.4);
    }
  }
  thickness(angle: number, height: number): number {
    const separation = arrayMin(this.centers.map((center) => Math.abs(ieeeRemainder(angle - center, 2 * PI))))!;
    const across = swiftMax(0, swiftMin(1, (this.half + this.slit - separation) / this.slit));
    const root = swiftMax(0, swiftMin(1, (LampClipGeometry.taperEnd - height) / (LampClipGeometry.taperEnd - LampClipGeometry.rootHeight)));
    const beam = LampClipGeometry.beamThickness + (LampClipGeometry.rootThickness - LampClipGeometry.beamThickness) * root;
    return LampClipGeometry.skirtThickness + (beam - LampClipGeometry.skirtThickness) * across;
  }
}

// --- CloudGenerator (:754-841) --------------------------------------------------------------------

/** Swift `CloudGenerator.Layout` (:760-789). */
export class Layout {
  /** The retaining lip on the wall side, the head's chamber behind it and the shaft's slot above the entry. */
  static readonly lip = 2.4;
  static readonly headSpace = 3.0;
  static readonly slotLength = 8.0;

  readonly p: CloudParameters;
  readonly coreX: number;
  readonly lowY: number;
  readonly highY: number;
  // SWIFT-DIFF: computed once. Swift recomputes them, and `material` runs once per grid cell.
  readonly head: Rect;
  readonly slot: Rect;
  readonly chamber: Rect;
  readonly nailBoss: Rect;
  readonly led: Rect;

  constructor(p: CloudParameters) {
    this.p = p;
    this.coreX = coreHalfWidth(p);
    this.highY = coreHighY(p);
    // A cloud's flat base is close to the core. With the cable at the
    // bottom, the core ends before the mouth of the seal's pocket.
    const bottom = cableConfigurations(p).find((q) => q.cableSide === 'bottom');
    this.lowY = bottom === undefined ? coreLowY(p) : swiftMax(coreLowY(p), new CableOutlet(bottom).mouthTop + CableOutlet.clearance);
    const center = nailCenterY(p);
    this.head = new Rect(-p.nailHead / 2, p.nailHead / 2, center - p.nailHead / 2, center + p.nailHead / 2);
    this.slot = new Rect(-p.nailShaft / 2, p.nailShaft / 2, this.head.y1, this.head.y1 + Layout.slotLength);
    this.chamber = new Rect(this.head.x0, this.head.x1, this.head.y0, this.slot.y1);
    this.nailBoss = this.chamber.expanded(2.4);
    const length = ledLength(p), led = ledCenterY(p), channel = ledChannelWidth(p);
    this.led = new Rect(-length / 2, length / 2, led - channel / 2, led + channel / 2);
  }
  get rectangles(): Rect[] {
    return [this.head, this.slot, this.chamber, this.nailBoss, this.led];
  }
  // The floor has no opening for the cable: it leaves through the outer wall.
  material(x: number, y: number, z: number): boolean {
    let solid = z < CloudConstants.floor;
    if (this.nailBoss.contains(x, y) && z < 8.4) solid = true;
    if (z < Layout.lip && (this.head.contains(x, y) || this.slot.contains(x, y))) solid = false;
    if (z > Layout.lip && z < Layout.lip + Layout.headSpace && this.chamber.contains(x, y)) solid = false;
    return solid;
  }
}

/**
 * Horizontal interval connected to the origin after a conservative 4.5 mm
 * inset. Selecting that interval avoids spanning a concave gap between lobes.
 */
const horizontalReach = (y: number, width: number, profile: CloudProfile = cloudStyleProfile('classic')): number => {
  const merged = horizontalIntervals(y, 4.5, width, profile);
  const span = merged.find((s) => s[0] <= 0 && s[1] >= 0);
  if (span === undefined) return 0;
  return swiftMin(-span[0], span[1]);
};

const horizontalIntervals = (y: number, inset: number, width: number, profile: CloudProfile = cloudStyleProfile('classic')): [number, number][] => {
  const intervals: [number, number][] = profile.polygons.flatMap((polygon) => polygon.horizontalIntervals(y, inset, width));
  for (const [cx, cy, r] of profile.lobes) {
    const radius = r * width - inset, dy = y - cy * width;
    if (Math.abs(dy) < radius) {
      const dx = Math.sqrt(radius * radius - dy * dy);
      intervals.push([cx * width - dx, cx * width + dx]);
    }
  }
  const body = profile.body;
  if (y >= body.y0 * width + inset && y <= body.y1 * width - inset) {
    intervals.push([body.x0 * width + inset, body.x1 * width - inset]);
  }
  const merged: [number, number][] = [];
  for (const interval of stableSorted(intervals, (a, b) => a[0] < b[0])) {
    const last = merged[merged.length - 1];
    if (last !== undefined && interval[0] <= last[1]) {
      last[1] = swiftMax(last[1], interval[1]);
    } else {
      merged.push([interval[0], interval[1]]);
    }
  }
  return merged;
};

/**
 * Radial boundary of the profile's disks and rectangular lower body.
 * Shrinking every primitive is conservative at the scallops: walls never
 * get thinner there. All concentric contours stay ordered and star-shaped.
 */
const radius = (angle: number, inset: number, width: number, verticalScale = 1, profile: CloudProfile = cloudStyleProfile('classic')): number => {
  // Elliptical outline only: the actual pockets and cable retain their mm
  // dimensions. Insets stretch vertically too, making barriers thicker.
  const stretch = hypot(cos(angle), sin(angle) / verticalScale);
  const dx = cos(angle) / stretch, dy = sin(angle) / verticalScale / stretch;
  let far = 0.0;
  if (profile.polygons.length > 0) {
    // SWIFT-DIFF: the polygons' direction is computed once, not once per polygon and plane.
    const direction = atan2(dy, dx), cosine = cos(direction), sine = sin(direction);
    for (const polygon of profile.polygons) far = swiftMax(far, polygon.radiusAlong(cosine, sine, inset, width));
  }
  for (const lobe of profile.lobes) {
    const x = lobe[0] * width, y = lobe[1] * width, rr = lobe[2] * width - inset;
    const projection = x * dx + y * dy, det = rr * rr - x * x - y * y + projection * projection;
    if (det >= 0) far = swiftMax(far, projection + Math.sqrt(det));
  }
  const body = profile.body;
  const rx = dx >= 0 ? (body.x1 * width - inset) / swiftMax(dx, 1e-12) : (body.x0 * width + inset) / swiftMin(dx, -1e-12);
  const ry = dy >= 0 ? (body.y1 * width - inset) / swiftMax(dy, 1e-12) : (body.y0 * width + inset) / swiftMin(dy, -1e-12);
  return swiftMax(far, swiftMin(rx, ry)) / stretch;
};

/**
 * Swift `CloudGenerator`. `radius(angle, inset, width, verticalScale, profile)` is scalar and
 * positional: a Swift call that leaves out `verticalScale:` passes 1 here.
 */
export const CloudGenerator = { horizontalReach, horizontalIntervals, radius };

// --- CloudMeshBuilder (:1033-1052) ------------------------------------------------------------------

/** Hexahedral cell faces, in Swift's order: bottom, top, then the four sides. */
const CELL_FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] as const;

export class CloudMeshBuilder {
  vertices: Point3[] = [];
  triangles: Triangle[] = [];
  private readonly indices = new IntKey3Map(4096);

  vertex(p: Point3): number {
    const kx = rounded(p.x * 1e7), ky = rounded(p.y * 1e7), kz = rounded(p.z * 1e7);
    const known = this.indices.get(kx, ky, kz);
    if (known !== -1) return known;
    const i = this.vertices.length;
    this.vertices.push(p);
    this.indices.set(kx, ky, kz, i);
    return i;
  }
  cell(v: readonly Point3[], neighbors: readonly boolean[]): void {
    for (let i = 0; i < 6; i++) {
      if (neighbors[i]) continue;
      const f = CELL_FACES[i]!;
      const id0 = this.vertex(v[f[0]]!), id1 = this.vertex(v[f[1]]!), id2 = this.vertex(v[f[2]]!), id3 = this.vertex(v[f[3]]!);
      this.triangles.push({ a: id0, b: id1, c: id2 }, { a: id0, b: id2, c: id3 });
    }
  }
  get mesh(): BalloonMesh {
    return new BalloonMesh(this.vertices, this.triangles, 0);
  }
}
