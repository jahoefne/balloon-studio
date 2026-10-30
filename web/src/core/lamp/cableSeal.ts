// Ported from mac/Sources/BalloonStudio/CableSeal.swift @ cbda68d.
//
// Names and shapes are frozen (WP-K4a, part 1): cloudGeometry, cloudKit, cloudLedLayout and the kit
// texts are written against them. A change here is a small PR of its own, with the K4 sessions told.
//
// Swift overloads get distinct names: `point(t, h)` and `point3(t, h, z)`; `offset(of:)` is
// `offsetOf`, `distance(of:)` is `distanceOf`, `column(at:)` is `columnAt`, `offset(ofColumn:)` is
// `offsetOfColumn`, `landing(within:)` is `landingWithin`.
// See cloudGeometry.ts for the rule on module-level reads across this cluster.

import type { Quality } from '../api';
import { BalloonMesh } from '../geometry/mesh';
import type { Point3 } from '../geometry/point3';
import { asin, atan, atan2, cos, hypot, PI, sin, tan } from '../swift/dmath';
import { arrayMax, arrayMin, maxBy, minBy, swiftMax, swiftMax3, swiftMin } from '../swift/minmax';
import { ieeeRemainder, intCeil, rounded } from '../swift/rounding';
import type { CableSide, CloudParameters, Range } from '../types';
import { CloudConstants, CloudGenerator, CloudMeshBuilder, coreHalfWidth, coreHighY, coreLowY, lampProfile, Layout, Rect, verticalScale, type CloudProfile, type Pair } from './cloudGeometry';
import { sunOutletOffset } from './sunGeometry';

// --- CableSide (:3-29). Title and opposite are CABLE_SIDE_TITLE and CABLE_SIDE_OPPOSITE in core/types.ts. ---

/** Outward, seen from the front of the lamp. */
export const cableSideCenter = (side: CableSide): number => {
  switch (side) {
    case 'right':
      return 0;
    case 'top':
      return PI / 2;
    case 'left':
      return PI;
    case 'bottom':
      return (3 * PI) / 2;
  }
};
/** The clips sit closer to the sides than to the top and the bottom. */
export const cableSideNearestClip = (side: CableSide): number => (side === 'left' || side === 'right' ? PI / 6 : PI / 3);
export const cableSidePlace = (side: CableSide): string =>
  side === 'left' || side === 'right' ? `on the ${side} as you face the lamp` : `at the ${side} of the lamp`;

/**
 * The cable leaves through a window in the outer wall, low enough for the
 * lamp to sit flat on the wall. Behind the window, two cheeks on the floor
 * hold a flexible seal that grips the cable and closes the window to light.
 *
 * Dimensions use the cable's own frame: `t` along the cable from the lamp's
 * origin, `h` across it, and Z from the wall side of the back.
 */
export class CableOutlet {
  /** Printed walls beside the seal. */
  static readonly cheek = 1.6;
  /** Shortest length of seal held between the cheeks. */
  static readonly seatLength = 6.0;
  /** The seal stands this far out of its pocket, to push and to pull it. */
  static readonly handle = 1.0;
  /** The bore is smaller than the cable, the seal larger than its seat. */
  static readonly grip = 0.3;
  static readonly squeeze = 0.2;
  /** Flexible wall around the cable where it passes the printed wall. */
  static readonly sleeve = 0.8;
  /** Opened to lay the cable in. The pocket presses it shut. */
  static readonly slit = 0.4;
  /** The nozzle ends just inside the outer surface. */
  static readonly recess = 0.4;
  /** Narrower leading edge, to start the seal between the cheeks. */
  static readonly lead = 0.4;
  /** Free floor in front of the pocket to slide the seal in. */
  static readonly landing = 12.0;
  /** Floor between the meshing core and the pocket's mouth. */
  static readonly clearance = 2.0;

  readonly parameters: CloudParameters;
  /** Outward direction of the cable, through the lamp's origin. */
  readonly angle: number;
  /** Mouth of the pocket, measured along the cable. */
  readonly seat: number;
  private readonly axis: Axis;

  constructor(p: CloudParameters) {
    this.parameters = p;
    const profile = lampProfile(p), center = cableSideCenter(p.cableSide);
    const preferred = ieeeRemainder(CableOutlet.preferredAngle(p, profile) - center, 2 * PI);
    const strip = CableOutlet.notchHalfWidthOf(p.cableDiameter), outer = CableOutlet.pocketWidthOf(p.cableDiameter) / 2 + CableOutlet.cheek;
    const mouth = (axis: Axis): number => {
      const reaches: number[] = [];
      for (let i = -4; i <= 4; i++) reaches.push(axis.reach((i * outer) / 4, CloudConstants.wall));
      return arrayMin(reaches)! - CableOutlet.seatLength;
    };
    // Clip beams and their relief slots keep their own columns. Turn the
    // cable away from them where a small lamp leaves too little room.
    const clip = 6 / (p.width * 0.4) + 0.02;
    let direction = center + preferred;
    // A sun's clips are a ray away from every cable exit.
    for (let i = 0; i < (p.kind === 'sun' ? 0 : 4); i++) {
      const limit = swiftMax(0, cableSideNearestClip(p.cableSide) - clip - atan(strip / mouth(new Axis(p, profile, direction))));
      direction = center + swiftMin(limit, swiftMax(-limit, preferred));
    }
    const turn = 2 * PI, wrapped = direction % turn;
    this.angle = wrapped < 0 ? wrapped + turn : wrapped;
    this.axis = new Axis(p, profile, this.angle);
    this.seat = mouth(this.axis);
  }

  /**
   * Clouds: the widest or the highest point of the outline, or the middle
   * of the flat base. Suns: between two rays, clockwise of the ray on
   * that side, so the four exits are a quarter turn apart.
   */
  private static preferredAngle(p: CloudParameters, profile: CloudProfile): number {
    if (p.kind === 'sun') {
      return cableSideCenter(p.cableSide) - sunOutletOffset(p.sunStyle, p.width, CableOutlet.notchHalfWidthOf(p.cableDiameter));
    }
    const scale = verticalScale(p);
    switch (p.cableSide) {
      case 'right': {
        const lobe = maxBy(profile.lobes, (a, b) => a[0] + a[2] < b[0] + b[2])!;
        return atan2(lobe[1] * scale, lobe[0] + lobe[2]);
      }
      case 'left': {
        const lobe = minBy(profile.lobes, (a, b) => a[0] - a[2] < b[0] - b[2])!;
        return atan2(lobe[1] * scale, lobe[0] - lobe[2]);
      }
      case 'top': {
        const lobe = maxBy(profile.lobes, (a, b) => a[1] + a[2] < b[1] + b[2])!;
        return atan2((lobe[1] + lobe[2]) * scale, lobe[0]);
      }
      case 'bottom':
        return (3 * PI) / 2;
    }
  }
  // SWIFT-DIFF: the static and instance `pocketWidth`/`notchHalfWidth` overloads need two names here.
  private static pocketWidthOf(cable: number): number {
    return cable + 2 * CableOutlet.sleeve + 3.2 - CableOutlet.slit - CableOutlet.squeeze;
  }
  private static notchHalfWidthOf(cable: number): number {
    return CableOutlet.pocketWidthOf(cable) / 2 + CableOutlet.cheek + 0.6;
  }

  // Flexible seal.
  get bore(): number {
    return this.parameters.cableDiameter - CableOutlet.grip;
  }
  /** Square section of the nozzle that fills the window. */
  get nozzle(): number {
    return this.parameters.cableDiameter + 2 * CableOutlet.sleeve;
  }
  get sealWidth(): number {
    return this.nozzle + 3.2;
  }
  get sealHeight(): number {
    return this.nozzle + 1.8;
  }
  get nozzleZ(): number {
    return CloudConstants.floor + 0.8;
  }
  get axisZ(): number {
    return this.nozzleZ + this.nozzle / 2;
  }
  /** Flat inner end of the seal, in front of the pocket's mouth. */
  get sealStart(): number {
    return this.seat - CableOutlet.handle;
  }

  // Printed back and front.
  get window(): number {
    return this.nozzle - CableOutlet.squeeze;
  }
  get windowZ(): Range {
    return { lower: this.nozzleZ + CableOutlet.squeeze / 2, upper: this.nozzleZ + this.nozzle - CableOutlet.squeeze / 2 };
  }
  get pocketWidth(): number {
    return CableOutlet.pocketWidthOf(this.parameters.cableDiameter);
  }
  get cheekTop(): number {
    return CloudConstants.floor + this.sealHeight;
  }
  /** Half width of the strip whose columns run along the cable. */
  get notchHalfWidth(): number {
    return CableOutlet.notchHalfWidthOf(this.parameters.cableDiameter);
  }
  /** The front's skirt is cut back to here where it would meet the pocket. */
  get notchTop(): number {
    return this.cheekTop + 0.5;
  }
  get notchesSkirt(): boolean {
    return this.parameters.depth - CloudConstants.skirt < this.notchTop;
  }

  point(t: number, h: number): Pair {
    return this.axis.point(t, h);
  }
  point3(t: number, h: number, z: number): Point3 {
    const [x, y] = this.axis.point(t, h);
    return { x, y, z };
  }
  offsetOf(point: Pair): number {
    return point[1] * this.axis.cosine - point[0] * this.axis.sine;
  }
  distanceOf(point: Pair): number {
    return point[0] * this.axis.cosine + point[1] * this.axis.sine;
  }
  reach(h: number, inset: number): number {
    return this.axis.reach(h, inset);
  }
  inside(t: number, h: number, inset: number): boolean {
    return this.axis.inside(t, h, inset);
  }

  /** Offsets of the columns that carry the outlet's faces. */
  get columns(): number[] {
    const half = [this.window / 2, this.pocketWidth / 2, this.pocketWidth / 2 + CableOutlet.cheek, this.notchHalfWidth];
    return [0, ...half, ...half.map((h) => -h)];
  }
  /** A column is named by the angle of its point on the pocket's mouth. */
  columnAt(h: number): number {
    const turn = 2 * PI, a = (this.angle + atan(h / this.seat)) % turn;
    return a < 0 ? a + turn : a;
  }
  /** Null where Swift returns nil. */
  offsetOfColumn(a: number): number | null {
    const d = ieeeRemainder(a - this.angle, 2 * PI);
    if (!(Math.abs(d) < PI / 2)) return null;
    const h = this.seat * tan(d);
    return Math.abs(h) <= this.notchHalfWidth + 0.002 ? h : null;
  }

  /** Footprint of the cheeks, from the pocket's mouth to the wall. */
  get pocketOutline(): Pair[] {
    const h = this.pocketWidth / 2 + CableOutlet.cheek;
    return [
      this.point(this.seat, -h),
      this.point(this.reach(-h, CloudConstants.wall), -h),
      this.point(this.reach(0, CloudConstants.wall), 0),
      this.point(this.reach(h, CloudConstants.wall), h),
      this.point(this.seat, h),
    ];
  }
  /** Free floor in front of the pocket. At the top of a small cloud the nail pocket stands closer than the seal would like. */
  get landing(): number {
    return this.landingWithin(this.notchHalfWidth);
  }
  /** The same, across a wider strip than the pocket's own. */
  landingWithin(notchHalfWidth: number): number {
    const boss = new Layout(this.parameters).nailBoss;
    let outline: Pair[] = ([[boss.x0, boss.y0], [boss.x1, boss.y0], [boss.x1, boss.y1], [boss.x0, boss.y1]] as Pair[]).map((q) => [this.distanceOf(q), this.offsetOf(q)]);
    // What is left of the nail pocket within the strip.
    for (const side of [1.0, -1]) {
      const clipped: Pair[] = [];
      outline.forEach((a, i) => {
        const b = outline[(i + 1) % outline.length]!;
        const da = notchHalfWidth - side * a[1], db = notchHalfWidth - side * b[1];
        if (da >= 0) clipped.push(a);
        if (da > 0 !== db > 0 && da !== db) {
          const u = da / (da - db);
          clipped.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
        }
      });
      outline = clipped;
    }
    const nearest = arrayMax(outline.map((q) => q[0]).filter((d) => d < this.seat));
    if (nearest === undefined) return CableOutlet.landing;
    return swiftMin(CableOutlet.landing, this.seat - nearest);
  }
  /** The highest point of the pocket's mouth, in the lamp's frame. */
  get mouthTop(): number {
    return swiftMax(this.point(this.seat, -this.notchHalfWidth)[1], this.point(this.seat, this.notchHalfWidth)[1]);
  }
  /** No LEDs on the pocket, nor where the cable and its seal are slid in. */
  get keepOut(): Rect {
    const half = this.notchHalfWidth;
    const far = swiftMax3(this.reach(-half, 0), this.reach(0, 0), this.reach(half, 0));
    const landing = this.landing;
    const corners = ([[this.seat - landing, -half], [this.seat - landing, half], [far, -half], [far, half]] as Pair[]).map((q) => this.point(q[0], q[1]));
    return new Rect(arrayMin(corners.map((q) => q[0]))!, arrayMax(corners.map((q) => q[0]))!, arrayMin(corners.map((q) => q[1]))!, arrayMax(corners.map((q) => q[1]))!);
  }
}

/** CableOutlet.Axis (:60-91). SWIFT-DIFF: a class of this module, as TS has no nested private types. */
class Axis {
  readonly width: number;
  readonly verticalScale: number;
  readonly cosine: number;
  readonly sine: number;
  readonly start: number;

  constructor(p: CloudParameters, readonly profile: CloudProfile, angle: number) {
    this.width = p.width;
    this.verticalScale = verticalScale(p);
    this.cosine = cos(angle);
    this.sine = sin(angle);
    const x = coreHalfWidth(p) / swiftMax(Math.abs(this.cosine), 1e-15);
    const y = (this.sine >= 0 ? coreHighY(p) : -coreLowY(p)) / swiftMax(Math.abs(this.sine), 1e-15);
    this.start = 0.9 * swiftMin(x, y);
  }
  point(t: number, h: number): Pair {
    return [t * this.cosine - h * this.sine, t * this.sine + h * this.cosine];
  }
  inside(t: number, h: number, inset: number): boolean {
    const [x, y] = this.point(t, h);
    return hypot(x, y) < CloudGenerator.radius(atan2(y, x), inset, this.width, this.verticalScale, this.profile);
  }
  /** Where a line along the cable first leaves an inset outline. */
  reach(h: number, inset: number): number {
    let low = this.start;
    while (low > 0 && !this.inside(low, h, inset)) low = swiftMax(0, low - 2);
    let high = low + 0.5;
    while (high < 1.2 * this.width * swiftMax(1, this.verticalScale) && this.inside(high, h, inset)) {
      low = high;
      high += 0.5;
    }
    for (let i = 0; i < 48; i++) {
      const middle = (low + high) / 2;
      if (this.inside(middle, h, inset)) low = middle;
      else high = middle;
    }
    return low;
  }
}

/**
 * A block with a round bore, a nozzle on its outer face and a slit beneath
 * the bore. It is swept along the cable on rings around the bore. Flange
 * and nozzle follow the wall they meet, from the inside: between two of
 * its vertices the seal never stands proud of the printed wall, even
 * where the outline turns a corner beside a ray.
 */
export const CableSealGenerator = {
  /** Printed standing on its flat inner end, nozzle up: X across the cable, Y along the lamp's depth, Z along the cable. */
  generate(p: CloudParameters, quality: Quality): BalloonMesh {
    const outlet = new CableOutlet(p), detail = quality === 'export' ? 2 : 1;
    // Half the underside, a side, the top, a side, half the underside.
    // Fine steps across the cable, where the ends follow the wall.
    const spacing = 0.5, half = intCeil(outlet.sealWidth / 2 / spacing);
    const counts = [half, 4 * detail, 2 * half, 4 * detail, half], total = counts.reduce((a, b) => a + b, 0);
    const gap = CableOutlet.slit / 2;
    const rectangle = (width: number, z0: number, z1: number): Pair[] => {
      const corners: Pair[] = [[gap, z0], [width / 2, z0], [width / 2, z1], [-width / 2, z1], [-width / 2, z0], [-gap, z0]];
      const out: Pair[] = [];
      counts.forEach((count, side) => {
        for (let i = 0; i < count; i++) {
          const a = corners[side]!, b = corners[side + 1]!, u = i / count;
          out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
        }
      });
      out.push(corners[5]!);
      return out;
    };
    const radius = outlet.bore / 2, open = asin(gap / radius), quarter = PI / 4;
    const turns = [-2 * quarter + open, -quarter, quarter, 3 * quarter, 5 * quarter, 6 * quarter - open];
    const bore: number[] = [];
    counts.forEach((count, side) => {
      for (let i = 0; i < count; i++) bore.push(turns[side]! + ((turns[side + 1]! - turns[side]!) * i) / count);
    });
    bore.push(turns[5]!);
    const floor = CloudConstants.floor, top = floor + outlet.sealHeight;
    const rings: Pair[][] = [
      bore.map((a) => [radius * cos(a), outlet.axisZ + radius * sin(a)]),
      rectangle(outlet.nozzle, outlet.nozzleZ, outlet.nozzleZ + outlet.nozzle),
      rectangle(outlet.sealWidth, floor, top),
      rectangle(outlet.sealWidth - 2 * CableOutlet.lead, floor, top),
    ];

    // The nearest wall within a step to either side.
    const step = 0.1, samples = intCeil((outlet.sealWidth / 2 + spacing) / step), within = intCeil(spacing / step) + 1;
    const insets = [CloudConstants.wall, CableOutlet.recess];
    const walls = insets.map((inset) => {
      const row: number[] = [];
      for (let i = -samples; i <= samples; i++) row.push(outlet.reach(i * step, inset));
      return row;
    });
    const corners = [new Map<number, number>(), new Map<number, number>()];
    const reach = (h: number, index: number): number => {
      const center = rounded(h / step) + samples;
      const lower = swiftMax(0, center - within), upper = swiftMin(2 * samples, center + within);
      let least = lower;
      for (let i = lower + 1; i <= upper; i++) if (walls[index]![i]! < walls[index]![least]!) least = i;
      // A corner of the wall may lie between two samples, beside the
      // notch of a pinwheel: look for it there.
      if (!(least > lower && least < upper)) return walls[index]![least]!;
      const known = corners[index]!.get(least);
      if (known !== undefined) return known;
      let a = (least - 1 - samples) * step, b = (least + 1 - samples) * step;
      for (let i = 0; i < 40; i++) {
        const first = a + (b - a) / 3, second = b - (b - a) / 3;
        if (outlet.reach(first, insets[index]!) < outlet.reach(second, insets[index]!)) b = second;
        else a = first;
      }
      const corner = outlet.reach((a + b) / 2, insets[index]!);
      const value = corner < walls[index]![least]! - 1e-7 ? corner : walls[index]![least]!;
      corners[index]!.set(least, value);
      return value;
    };
    // The flange follows a wall that curves towards it. Where the wall
    // runs away, along the flank of a ray, it stays level.
    const edge = outlet.nozzle / 2;
    const flange = (h: number): number => (Math.abs(h) <= edge ? reach(h, 0) : swiftMin(reach(h, 0), reach(h < 0 ? -edge : edge, 0)));
    const vertex = (i: number, ring: number, station: number): Point3 => {
      const [h, z] = rings[ring === 2 && station === 2 ? 3 : ring]![i]!;
      let t: number;
      switch (station) {
        case 0:
          t = outlet.sealStart;
          break;
        case 1:
          t = flange(h) - CableOutlet.lead;
          break;
        case 2:
          t = flange(h);
          break;
        default:
          t = reach(h, 1);
      }
      return { x: h, y: z - floor - outlet.sealHeight / 2, z: t - outlet.sealStart };
    };
    // The block ends at the wall. Only the sleeve around the bore goes on.
    const solid = (ring: number, station: number): boolean => ring === 0 || station < 2;
    const builder = new CloudMeshBuilder();
    for (let station = 0; station < 3; station++) {
      for (let ring = 0; ring < 2; ring++) {
        if (!solid(ring, station)) continue;
        for (let i = 0; i < total; i++) {
          const v: Point3[] = [];
          for (const s of [station, station + 1]) v.push(vertex(i, ring, s), vertex(i, ring + 1, s), vertex(i + 1, ring + 1, s), vertex(i + 1, ring, s));
          builder.cell(v, [station > 0, station < 2 && solid(ring, station + 1), i > 0, ring === 0 && solid(1, station), i + 1 < total, ring === 1]);
        }
      }
    }
    return builder.mesh;
  },
  /** From the print orientation to the seal's seat in the back. */
  placed(mesh: BalloonMesh, p: CloudParameters, lifted = 0): BalloonMesh {
    const outlet = new CableOutlet(p);
    return new BalloonMesh(
      mesh.vertices.map((v) => outlet.point3(v.z + outlet.sealStart - lifted, v.x, v.y + CloudConstants.floor + outlet.sealHeight / 2 + lifted)),
      mesh.triangles,
      mesh.maxOverhang,
      mesh.innerVertexRange,
    );
  },
};
