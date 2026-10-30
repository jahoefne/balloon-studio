// Ported from mac/Sources/BalloonStudio/SunGeometry.swift @ cbda68d.
//
// Enum data (titles, subtitles, notes, ray counts) lives in core/types.ts: SUN_STYLE_INFO,
// WALL_LAMP_KIND_INFO. See cloudGeometry.ts for the rule on module-level reads across this cluster.

import { atan, atan2, cos, hypot, PI, sin } from '../swift/dmath';
import { swiftMax, swiftMin } from '../swift/minmax';
import { SUN_STYLE_INFO, type CloudParameters, type SunStyle, type Vec2, type WallLampKind } from '../types';
import { CableOutlet } from './cableSeal';
import { cloudParameters, CloudConstants, CloudGenerator, CloudProfile, Rect } from './cloudGeometry';

/** `WallLampKind.defaults` (:9-14). */
export const wallLampDefaults = (kind: WallLampKind): CloudParameters => {
  const p = cloudParameters();
  p.kind = kind;
  if (kind === 'sun') p.width = 200;
  return p;
};

/** SunPolygon.Plane */
export interface Plane {
  readonly x: number;
  readonly y: number;
  readonly offset: number;
}

/**
 * Convex ray primitives use parallel inset edges. Their intersection gives
 * actual perpendicular wall clearance even at a pointed tip. Union with the
 * central disk keeps every inset contour connected and star-shaped.
 */
export class SunPolygon {
  readonly points: readonly Vec2[];
  readonly planes: readonly Plane[];

  constructor(points: readonly Vec2[]) {
    this.points = points;
    this.planes = points.map((a, i) => {
      const b = points[(i + 1) % points.length]!;
      const edgeX = b.x - a.x, edgeY = b.y - a.y;
      const length = hypot(edgeX, edgeY), nx = edgeY / length, ny = -edgeX / length;
      return { x: nx, y: ny, offset: nx * a.x + ny * a.y };
    });
  }
  radius(angle: number, inset: number, width: number): number {
    return this.radiusAlong(cos(angle), sin(angle), inset, width);
  }
  /** `radius(at:inset:width:)` for an angle whose cosine and sine are known. */
  radiusAlong(cosine: number, sine: number, inset: number, width: number): number {
    let low = 0.0, high = Infinity;
    for (const plane of this.planes) {
      const along = plane.x * cosine + plane.y * sine, limit = plane.offset * width - inset;
      if (Math.abs(along) < 1e-12) {
        if (limit < 0) return 0;
      } else if (along > 0) high = swiftMin(high, limit / along);
      else low = swiftMax(low, limit / along);
    }
    return high >= low ? high : 0;
  }
  horizontalIntervals(y: number, inset: number, width: number): [number, number][] {
    let low = -Infinity, high = Infinity;
    for (const plane of this.planes) {
      const limit = plane.offset * width - inset - plane.y * y;
      if (Math.abs(plane.x) < 1e-12) {
        if (limit < 0) return [];
      } else if (plane.x > 0) high = swiftMin(high, limit / plane.x);
      else low = swiftMax(low, limit / plane.x);
    }
    return high > low ? [[low, high]] : [];
  }
  /** CloudProfile.mirrored (CloudGeometry.swift:60). */
  mirrored(): SunPolygon {
    return new SunPolygon([...this.points].reverse().map((q) => ({ x: -q.x, y: q.y })));
  }
}

// --- SunStyle (:58-111) -----------------------------------------------------------------------------

export const sunRayCount = (style: SunStyle): number => SUN_STYLE_INFO[style].rayCount;
export const sunSector = (style: SunStyle): number => (2 * PI) / sunRayCount(style);
/** Where two neighboring rays meet, as a fraction of the width. */
export const sunNotchRadius = (style: SunStyle): number => {
  switch (style) {
    case 'soft-star':
    case 'cones':
      return 0.27;
    case 'pinwheel':
      return 0.29;
    case 'bold-eight':
      return 0.30;
  }
};
/** A pinwheel's rays lean: their notches are turned counterclockwise. */
export const sunLean = (style: SunStyle): number => (style === 'pinwheel' ? PI / 24 : 0);
/**
 * The cable leaves between two rays, clockwise of the ray on its
 * side, at this angle from it: through the notch. A pinwheel's notch
 * is close to that ray. Where a strip of the given half width around
 * the cable would reach under the ray's ridge there, the cable leaves
 * further from it instead, at most midway between the two rays,
 * through the long flank of the other one.
 */
export const sunOutletOffset = (style: SunStyle, width: number, strip: number): number => {
  const seat = (sunNotchRadius(style) - 0.005) * width - CloudConstants.wall - CableOutlet.seatLength;
  return swiftMin(sunSector(style) / 2, swiftMax(sunSector(style) / 2 - sunLean(style), atan((strip + 0.5) / seat)));
};
/** Every notch, counterclockwise from the positive X axis. */
export const sunNotchAngles = (style: SunStyle): number[] => {
  const angles: number[] = [];
  for (let i = 0; i < sunRayCount(style); i++) angles.push((i + 0.5) * sunSector(style) + sunLean(style));
  return angles;
};

// --- SunGeometry (:113-178) -------------------------------------------------------------------------

const tipRadius = 0.5;

/** The notch counterclockwise (side 1) or clockwise (side -1) of a ray. */
const notch = (style: SunStyle, ray: number, side: number): Vec2 => {
  const angle = (ray + side / 2) * sunSector(style) + sunLean(style);
  return { x: cos(angle) * sunNotchRadius(style), y: sin(angle) * sunNotchRadius(style) };
};
const tip = (style: SunStyle, ray: number): Vec2 => {
  const angle = ray * sunSector(style);
  return { x: cos(angle) * tipRadius, y: sin(angle) * tipRadius };
};
/**
 * Triangles from each tip through the two notches beside it, ending
 * inside a central disk that reaches almost to the notches. The
 * outline has plain V notches; inset contours round them.
 */
const makeProfile = (style: SunStyle): CloudProfile => {
  const triangles: SunPolygon[] = [];
  for (let ray = 0; ray < sunRayCount(style); ray++) {
    const t = tip(style, ray);
    triangles.push(
      new SunPolygon([
        t,
        ...[1.0, -1.0].map((side) => {
          const n = notch(style, ray, side);
          return { x: t.x + (n.x - t.x) * 1.5, y: t.y + (n.y - t.y) * 1.5 };
        }),
      ]),
    );
  }
  return new CloudProfile([[0, 0, sunNotchRadius(style) - 0.005]], new Rect(0, 0, 0, 0), triangles);
};

// Built on first use, as Swift's `static let` is, and not at module level (see cloudGeometry.ts).
const profiles = new Map<SunStyle, CloudProfile>();

/** Swift `SunStyle.profile`. */
export const sunProfile = (style: SunStyle): CloudProfile => {
  let profile = profiles.get(style);
  if (profile === undefined) {
    profile = makeProfile(style);
    profiles.set(style, profile);
  }
  return profile;
};

/**
 * The outline's radius at unit width, in fine steps of angle: for
 * means over many directions, where exact radii would cost too much.
 */
export class Outline {
  constructor(private readonly radii: readonly number[]) {}
  radius(angle: number): number {
    const turn = angle / (2 * PI), position = (turn - Math.floor(turn)) * this.radii.length;
    const index = Math.trunc(position) % this.radii.length, part = position - Math.floor(position);
    return this.radii[index]! + (this.radii[(index + 1) % this.radii.length]! - this.radii[index]!) * part;
  }
}

const outlines = new Map<SunStyle, Outline>();

const outline = (style: SunStyle): Outline => {
  let table = outlines.get(style);
  if (table === undefined) {
    const radii: number[] = [];
    for (let i = 0; i < 7200; i++) radii.push(CloudGenerator.radius((i * PI) / 3600, 0, 1, 1, sunProfile(style)));
    table = new Outline(radii);
    outlines.set(style, table);
  }
  return table;
};

/** Length of the spring tab along a flank, and the least width of the relief slot beside it. */
const clipLength = 10.0;
const clipSlit = 1.0;
/** The tab's middle, from the notch towards the tip. Near the notch the ray is wide enough for the tab to flex into the cavity. */
const clipPosition = 0.23;

/**
 * A clip sits on the straight flank of a ray, where the skirt is a flat
 * wall. At a tip or in a notch the tab would be a stiff corner.
 * The flank chosen is far from the cable outlets on all four sides.
 * One angle serves both slots: the one nearer the tip comes out wider,
 * up to half as wide again.
 */
const clip = (style: SunStyle, width: number): { center: number; half: number; slit: number } => {
  const ray = style === 'bold-eight' ? 0 : 1;
  const n = notch(style, ray, 1), t = tip(style, ray);
  const start = { x: n.x * width, y: n.y * width }, end = { x: t.x * width, y: t.y * width };
  const length = hypot(end.x - start.x, end.y - start.y);
  const angle = (along: number): number => {
    const u = along / length;
    const point = { x: start.x + (end.x - start.x) * u, y: start.y + (end.y - start.y) * u };
    return atan2(point.y, point.x);
  };
  const middle = clipPosition * length;
  const a = angle(middle - clipLength / 2), b = angle(middle + clipLength / 2);
  const slit = swiftMax(Math.abs(angle(middle - clipLength / 2 - clipSlit) - a), Math.abs(angle(middle + clipLength / 2 + clipSlit) - b));
  return { center: (a + b) / 2, half: Math.abs(a - b) / 2, slit };
};

export const SunGeometry = { tipRadius, clipLength, clipSlit, clipPosition, clip, outline };
