// Ported from mac/Sources/BalloonStudio/CableClamp.swift @ cbda68d.
//
// FROZEN SIGNATURES (WP-K4a, part 1). WP-K4b fills every function that throws 'WP-K4b', from:
//   - CableClamp (:66-259, incl. `overlap` :146-154, `fits` :160-177, the `minimumWidth` stride
//     :183 and `stand` :193-259)
//   - FlatRegion (:264-348)
//   - the CloudMeshBuilder extension (:350-399, `remainder` :362/364, `truncatingRemainder` :357)
//     as the free functions annulus, bore and disk
//   - CableClampGenerator (:404-596)
// All `static let`s are done. Keep names and shapes: cloudGeometry, cloudKit, cloudLedLayout and
// the kit texts of part 2 are written against them. A change here is a small PR of its own, with
// the K4 sessions told.
//
// Swift's `init?(_:)` is `CableClamp.create(p)`, its `init(unchecked:)` is `new CableClamp(p)`.
// `stands(on:)` is `stands`, `stand(on:in:)` is `stand(ground, builder)`.
// See cloudGeometry.ts for the rule on module-level reads across this cluster.

import type { BalloonMesh } from '../geometry/mesh';
import type { Point3 } from '../geometry/point3';
import type { CloudParameters } from '../types';
import { CableOutlet } from './cableSeal';
import type { CloudMeshBuilder, Pair, Rect } from './cloudGeometry';

/** A point of a round outline with its angle around the hole (`(Point3, Double)`). */
export type RimPoint = readonly [point: Point3, angle: number];

/**
 * A screwed strain relief, just behind the cable seal. Two posts on the
 * floor flank the way the seal slides in. With the seal home, an anvil
 * drops between the posts, under the cable, and a bar is screwed down onto
 * the posts. Staggered ribs on bar and anvil hold the jacket. The posts
 * stop the bar: the cable is squeezed by a set amount, however hard the
 * screws are turned.
 *
 * Dimensions use the outlet's frame: `t` along the cable from the lamp's
 * origin, `h` across it, and Z from the wall side of the back. The clamp's
 * own `u` runs along the cable from the inner end of the posts.
 */
export class CableClamp {
  /** Two M3 screws with a pan or a button head form their own thread. */
  static readonly screw = 3.0;
  static readonly screwLength = 10.0;
  static readonly headDiameter = 6.0;
  static readonly headHeight = 2.6;
  /** Printed hole the thread is formed in, and its wider mouth. */
  static readonly pilot = 2.8;
  static readonly mouth = 3.4;
  static readonly mouthDepth = 0.4;
  /** Hole through the bar. */
  static readonly passage = 3.4;
  /** Floor left beneath a pilot hole. */
  static readonly holeFloor = 1.2;
  /** Square posts, and their least height above the floor. */
  static readonly post = 7.0;
  static readonly postHeight = 6.0;
  /** Floor between the posts and the pocket's mouth. */
  static readonly gap = 3.2;
  /** Either side of the seal on its way between the posts. */
  static readonly play = 0.4;
  /** The bar under the screw heads. Between them it is as tall as they are. */
  static readonly bar = 3.0;
  /** The ribs squeeze the cable to this share of its diameter. */
  static readonly pinch = 0.8;
  /** Flat tip of a rib, with flanks at 45°, and the distance from an anvil's rib to the next one on the bar. */
  static readonly ribTip = 0.6;
  static readonly ribPitch = 1.5;
  /** Anvil: play around the posts, its cross bars before and behind them, and how far these reach beside the channel. */
  static readonly fit = 0.3;
  static readonly crossBar = 1.5;
  static readonly shoulder = 3.0;
  /** Rails on the anvil keep the cable in line with the seal's bore. */
  static readonly rail = 1.0;
  static readonly railRoom = 0.7;
  /** The bar's tongue passes between the rails. */
  static readonly tongueRoom = 0.4;
  /** Clearance to the ordinary skirt and nail pocket, and under the diffuser. */
  static readonly skirtRoom = 1.5;
  /**
   * The 0.8 mm inward root reinforcement uses part of the original skirt
   * clearance. Keep 0.7 mm at the root and 1.1 mm at the working beam,
   * preserving the existing clamp placement and matching printed backs.
   */
  static readonly clipRoom = 0.7;
  static readonly headRoom = 0.4;
  /** The floor's surface is laid anew this far around the posts. */
  static readonly ground = 0.5;
  static readonly segments = 24;

  readonly parameters: CloudParameters;
  readonly outlet: CableOutlet;

  /** Swift `init?(_:)`: null where the lamp has no room for it, or where it is not wanted. */
  static create(_p: CloudParameters): CableClamp | null {
    throw new Error('WP-K4b');
  }
  /** Swift `init(unchecked:)`: the clamp as it would be, whether or not the lamp has room for it. */
  constructor(p: CloudParameters) {
    this.parameters = p;
    this.outlet = new CableOutlet(p);
  }

  get cable(): number {
    throw new Error('WP-K4b');
  }
  /** Way between the posts. */
  get channel(): number {
    throw new Error('WP-K4b');
  }
  get inner(): number {
    throw new Error('WP-K4b');
  }
  get outer(): number {
    throw new Error('WP-K4b');
  }
  /** The posts along the cable. */
  get end(): number {
    throw new Error('WP-K4b');
  }
  get start(): number {
    throw new Error('WP-K4b');
  }
  /** Axis of a screw: along the cable, and to either side of it. */
  get screwT(): number {
    throw new Error('WP-K4b');
  }
  get screwH(): number {
    throw new Error('WP-K4b');
  }
  get rib(): number {
    throw new Error('WP-K4b');
  }
  /** The cable's underside above the floor, in line with the seal's bore. */
  get rest(): number {
    throw new Error('WP-K4b');
  }
  /** Flat of the bar's tongue, with the bar down on the posts. */
  get barFlat(): number {
    throw new Error('WP-K4b');
  }
  get postTop(): number {
    throw new Error('WP-K4b');
  }
  get tongue(): number {
    throw new Error('WP-K4b');
  }
  get tongueHalfWidth(): number {
    throw new Error('WP-K4b');
  }
  get holeDepth(): number {
    throw new Error('WP-K4b');
  }
  /** Thread in the post with the bar down. */
  get engagement(): number {
    throw new Error('WP-K4b');
  }
  /** Top of the screw heads. */
  get top(): number {
    throw new Error('WP-K4b');
  }

  // Anvil, in the clamp's own frame.
  get anvilStart(): number {
    throw new Error('WP-K4b');
  }
  get anvilEnd(): number {
    throw new Error('WP-K4b');
  }
  get anvilHalfWidth(): number {
    throw new Error('WP-K4b');
  }
  get shoulderHalfWidth(): number {
    throw new Error('WP-K4b');
  }
  get railInner(): number {
    throw new Error('WP-K4b');
  }
  get railTop(): number {
    throw new Error('WP-K4b');
  }
  get anvilRibs(): number[] {
    throw new Error('WP-K4b');
  }
  get barRibs(): number[] {
    throw new Error('WP-K4b');
  }

  /** The posts as seen from the front, counterclockwise. */
  get posts(): Pair[][] {
    throw new Error('WP-K4b');
  }
  get anvilOutline(): Pair[] {
    throw new Error('WP-K4b');
  }
  /** Posts and anvil, for the LED plan. */
  get outlines(): Pair[][] {
    throw new Error('WP-K4b');
  }
  /** No LEDs under the clamp, nor where the seal is slid in. */
  get keepOut(): Rect {
    throw new Error('WP-K4b');
  }
  /** A face of the floor that the posts' ground takes over. */
  stands(_face: readonly Point3[]): boolean {
    throw new Error('WP-K4b');
  }
  /** Room under the diffuser and inside the skirt, on free floor away from the nail pocket, with the seal's whole way in before it. */
  get fits(): boolean {
    throw new Error('WP-K4b');
  }
  /** The narrowest lamp of this design that has room for the clamp. */
  static minimumWidth(_p: CloudParameters): number | null {
    throw new Error('WP-K4b');
  }
  /**
   * Lays the floor's surface anew around the posts and stands them in
   * it, each with a blind hole for a screw to form its thread in.
   * `ground` holds the faces the floor's cells have left out.
   */
  stand(_ground: readonly (readonly Point3[])[], _builder: CloudMeshBuilder): void {
    throw new Error('WP-K4b');
  }
}

/**
 * Triangles of a flat region with holes in it, by ear clipping. Only
 * the points given are used, so the faces around the region stay whole.
 */
export const FlatRegion = {
  /** The outline runs counterclockwise, the holes clockwise, each a list of indices into `points`. Null where no triangles can be found. */
  triangles(
    _outline: readonly number[],
    _holes: readonly (readonly number[])[],
    _points: readonly Pair[],
  ): [number, number, number][] | null {
    throw new Error('WP-K4b');
  },
};

/**
 * A flat face between an outline and a round hole in it. Both run
 * counterclockwise as seen against the face, each point with its
 * angle around the hole. `flipped` faces the other way.
 */
export const annulus = (_builder: CloudMeshBuilder, _outline: readonly RimPoint[], _hole: readonly RimPoint[], _flipped = false): void => {
  throw new Error('WP-K4b');
};
/** The wall of a round hole between two of its rims, facing the axis. */
export const bore = (_builder: CloudMeshBuilder, _upper: readonly Point3[], _lower: readonly Point3[]): void => {
  throw new Error('WP-K4b');
};
/** The closed end of a blind hole, facing up. */
export const disk = (_builder: CloudMeshBuilder, _rim: readonly Point3[], _center: Point3): void => {
  throw new Error('WP-K4b');
};

/**
 * Bar and anvil are boxes on a grid, with tapered ribs and round holes.
 * Both are built where they sit, in the clamp's frame, then laid down
 * for printing.
 */
export const CableClampGenerator = {
  circle(_radius: number, _u: number, _h: number, _z: number): RimPoint[] {
    throw new Error('WP-K4b');
  },
  /** Lies on the floor between the posts: Z from the floor. */
  seatedAnvil(_c: CableClamp): BalloonMesh {
    throw new Error('WP-K4b');
  },
  /** Rests on the posts: Z from their tops. */
  seatedBar(_c: CableClamp): BalloonMesh {
    throw new Error('WP-K4b');
  },
  /** A pan head screw, to show in the preview. Z from under its head. */
  screw(): BalloonMesh {
    throw new Error('WP-K4b');
  },
  /** Printed as it lies in the lamp, ribs up. */
  anvil(_p: CloudParameters): BalloonMesh {
    throw new Error('WP-K4b');
  },
  /** Printed on its side: X across the cable, Y along the lamp's depth, Z along the cable. */
  bar(_p: CloudParameters): BalloonMesh {
    throw new Error('WP-K4b');
  },
  /** From the print orientation to the clamp's place in the back. */
  placedAnvil(_mesh: BalloonMesh, _p: CloudParameters, _lifted = 0): BalloonMesh {
    throw new Error('WP-K4b');
  },
  placedBar(_mesh: BalloonMesh, _p: CloudParameters, _lifted = 0): BalloonMesh {
    throw new Error('WP-K4b');
  },
  placedScrews(_p: CloudParameters, _lifted = 0): BalloonMesh {
    throw new Error('WP-K4b');
  },
  /** Both printed parts side by side, as they lie on the bed. */
  printView(_bar: BalloonMesh, _anvil: BalloonMesh): BalloonMesh {
    throw new Error('WP-K4b');
  },
};
