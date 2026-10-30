// Ported from mac/Sources/BalloonStudio/CableSeal.swift @ cbda68d.
//
// FROZEN SIGNATURES (WP-K4a, part 1). WP-K4b fills every function that throws 'WP-K4b', from:
//   - CableOutlet.Axis (:60-91, incl. `reach` :80-90) as private members of CableOutlet
//   - CableOutlet.init (:100-121, `remainder` :103), preferredAngle (:126-143), the private
//     statics pocketWidth/notchHalfWidth (:144-145), and the members below (:148-238)
//   - CableSealGenerator (:246-340, `rounded` :284)
// The CableSide helpers (:16-28) and all `static let`s are done. Keep names and shapes: cloudGeometry,
// cloudKit, cloudLedLayout and the kit texts of part 2 are written against them. A change here is
// a small PR of its own, with the K4 sessions told.
//
// Swift overloads get distinct names: `point(t, h)` and `point3(t, h, z)`; `offset(of:)` is
// `offsetOf`, `distance(of:)` is `distanceOf`, `column(at:)` is `columnAt`, `offset(ofColumn:)` is
// `offsetOfColumn`, `landing(within:)` is `landingWithin`.
// See cloudGeometry.ts for the rule on module-level reads across this cluster.

import type { Quality } from '../api';
import type { BalloonMesh } from '../geometry/mesh';
import type { Point3 } from '../geometry/point3';
import { PI } from '../swift/dmath';
import type { CableSide, CloudParameters, Range } from '../types';
import type { Pair, Rect } from './cloudGeometry';

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
  readonly angle: number = 0;
  /** Mouth of the pocket, measured along the cable. */
  readonly seat: number = 0;

  constructor(p: CloudParameters) {
    this.parameters = p;
    throw new Error('WP-K4b');
  }

  // Flexible seal.
  get bore(): number {
    throw new Error('WP-K4b');
  }
  /** Square section of the nozzle that fills the window. */
  get nozzle(): number {
    throw new Error('WP-K4b');
  }
  get sealWidth(): number {
    throw new Error('WP-K4b');
  }
  get sealHeight(): number {
    throw new Error('WP-K4b');
  }
  get nozzleZ(): number {
    throw new Error('WP-K4b');
  }
  get axisZ(): number {
    throw new Error('WP-K4b');
  }
  /** Flat inner end of the seal, in front of the pocket's mouth. */
  get sealStart(): number {
    throw new Error('WP-K4b');
  }

  // Printed back and front.
  get window(): number {
    throw new Error('WP-K4b');
  }
  get windowZ(): Range {
    throw new Error('WP-K4b');
  }
  get pocketWidth(): number {
    throw new Error('WP-K4b');
  }
  get cheekTop(): number {
    throw new Error('WP-K4b');
  }
  /** Half width of the strip whose columns run along the cable. */
  get notchHalfWidth(): number {
    throw new Error('WP-K4b');
  }
  /** The front's skirt is cut back to here where it would meet the pocket. */
  get notchTop(): number {
    throw new Error('WP-K4b');
  }
  get notchesSkirt(): boolean {
    throw new Error('WP-K4b');
  }

  point(_t: number, _h: number): Pair {
    throw new Error('WP-K4b');
  }
  point3(_t: number, _h: number, _z: number): Point3 {
    throw new Error('WP-K4b');
  }
  offsetOf(_point: Pair): number {
    throw new Error('WP-K4b');
  }
  distanceOf(_point: Pair): number {
    throw new Error('WP-K4b');
  }
  reach(_h: number, _inset: number): number {
    throw new Error('WP-K4b');
  }
  inside(_t: number, _h: number, _inset: number): boolean {
    throw new Error('WP-K4b');
  }

  /** Offsets of the columns that carry the outlet's faces. */
  get columns(): number[] {
    throw new Error('WP-K4b');
  }
  /** A column is named by the angle of its point on the pocket's mouth. */
  columnAt(_h: number): number {
    throw new Error('WP-K4b');
  }
  /** Null where Swift returns nil. */
  offsetOfColumn(_a: number): number | null {
    throw new Error('WP-K4b');
  }

  /** Footprint of the cheeks, from the pocket's mouth to the wall. */
  get pocketOutline(): Pair[] {
    throw new Error('WP-K4b');
  }
  /** Free floor in front of the pocket. At the top of a small cloud the nail pocket stands closer than the seal would like. */
  get landing(): number {
    throw new Error('WP-K4b');
  }
  /** The same, across a wider strip than the pocket's own. */
  landingWithin(_notchHalfWidth: number): number {
    throw new Error('WP-K4b');
  }
  /** The highest point of the pocket's mouth, in the lamp's frame. */
  get mouthTop(): number {
    throw new Error('WP-K4b');
  }
  /** No LEDs on the pocket, nor where the cable and its seal are slid in. */
  get keepOut(): Rect {
    throw new Error('WP-K4b');
  }
}

/**
 * A block with a round bore, a nozzle on its outer face and a slit beneath
 * the bore. It is swept along the cable on rings around the bore.
 */
export const CableSealGenerator = {
  /** Printed standing on its flat inner end, nozzle up: X across the cable, Y along the lamp's depth, Z along the cable. */
  generate(_p: CloudParameters, _quality: Quality): BalloonMesh {
    throw new Error('WP-K4b');
  },
  /** From the print orientation to the seal's seat in the back. */
  placed(_mesh: BalloonMesh, _p: CloudParameters, _lifted = 0): BalloonMesh {
    throw new Error('WP-K4b');
  },
};
