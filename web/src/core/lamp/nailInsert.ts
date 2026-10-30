// Ported from mac/Sources/BalloonStudio/NailInsert.swift @ cbda68d.
//
// FROZEN SIGNATURES (WP-K4a, part 1). WP-K4b fills every function that throws 'WP-K4b', from:
//   - NailInsert (:47-120)
//   - NailInsertGenerator (:126-181)
// All `static let`s are done. Keep names and shapes: cloudKit and the kit texts of part 2 are
// written against them. A change here is a small PR of its own, with the K4 sessions told.
//
// Swift's `init?(_:)` is `NailInsert.create(p)`, its private `init(unchecked:)` is the constructor,
// `placed(_:exploded:)` is `placed(mesh, exploded)`.
// See cloudGeometry.ts for the rule on module-level reads across this cluster.

import type { BalloonMesh } from '../geometry/mesh';
import type { CloudParameters } from '../types';

/**
 * A slider that narrows the keyhole's slot for a nail with a small head.
 * It goes in through the square entry, flat face towards the wall, and
 * slides up behind the retaining lip into the chamber above. Its own slot
 * is a little wider than the shaft, so the head bears on its plate instead
 * of slipping through the lamp's slot. Two fingers at its sides spring
 * against the chamber's walls and keep it up while the lamp is hung; then
 * the nail holds it against the top of the chamber.
 *
 * In its own frame X runs across, Y up the slot from its open end, and Z
 * from the flat face, which rests on the lip, towards the cap. That is how
 * it prints too: flat face on the bed, fingers up.
 */
export class NailInsert {
  /** Between the body and the chamber's side walls. */
  static readonly clearance = 0.2;
  /** Shorter than the entry is wide, to pass through it. */
  static readonly endPlay = 0.6;
  /** The head bears on it. */
  static readonly plate = 1.0;
  /** The fingers' reach towards the cap. The plate keeps 0.3 mm of play. `CloudGenerator.Layout.headSpace-0.3` */
  static readonly depth = 3.0 - 0.3;
  static readonly finger = 0.7;
  /** Between a finger and the plate, at the finger's root. */
  static readonly slit = 0.6;
  /** How far the relaxed finger tips stand beyond the chamber's walls. */
  static readonly spring = 0.2;
  /** Around the shaft, either side. */
  static readonly play = 0.2;
  /** Off the fingers' outer back edges and the top's front edge: they start the insert into the entry and behind the lip. */
  static readonly chamfer = 0.4;
  /** Lead-in for the head on the plate's lower back edge. */
  static readonly ramp = 0.5;
  /** Over this height the slot's mouth narrows from the lamp's slot. */
  static readonly mouth = 1.0;
  /** Plate above the end of the slot. */
  static readonly crown = 1.8;
  /** Solid band the fingers and the plate hang from. */
  static readonly band = 1.5;
  /** Least overlap of the head on the plate, either side. */
  static readonly grip = 0.3;
  /** Beside the slot, and at the mouth. */
  static readonly cheekWidth = 0.8;
  static readonly mouthCheek = 0.5;

  readonly parameters: CloudParameters;
  /** Half the body's width, clear of the chamber's walls. */
  readonly halfWidth: number = 0;
  /** Half the width across the relaxed finger tips. */
  readonly tipHalfWidth: number = 0;
  readonly height: number = 0;
  readonly slotHalfWidth: number = 0;
  readonly mouthHalfWidth: number = 0;
  /** Outer edge of the plate beside the slot. */
  readonly cheek: number = 0;
  /** The top of the chamber, in the back's frame. The insert's top rests against it. */
  readonly top: number = 0;

  /** Swift `init?(_:)`: null where the pocket is too small for the insert, or where the nail does not need it or cannot use it. */
  static create(_p: CloudParameters): NailInsert | null {
    throw new Error('WP-K4b');
  }
  /** Swift `private init(unchecked:)`. */
  constructor(p: CloudParameters) {
    this.parameters = p;
    throw new Error('WP-K4b');
  }
  /** Swift `static func problem(_:)`. */
  static problem(_p: CloudParameters): string | null {
    throw new Error('WP-K4b');
  }
  /** Why the insert does not suit this keyhole and nail, if it does not. */
  get problem(): string | null {
    throw new Error('WP-K4b');
  }
  /** Center of the slot's round end, in the insert's frame. */
  get slotCenter(): number {
    throw new Error('WP-K4b');
  }
  /** The shaft at rest against the end of the slot, in the back's frame. */
  get nailY(): number {
    throw new Error('WP-K4b');
  }
  /** The underside of the head stands this far off the wall at least, with the plate on the lip. */
  get nearestHead(): number {
    throw new Error('WP-K4b');
  }
  /** Room for the head behind the plate, to the cap. */
  get headRoom(): number {
    throw new Error('WP-K4b');
  }
  /** As it sits in the back, flat face on the lip, top against the top of the chamber. Exploded, it waits behind the wall side. */
  placed(_mesh: BalloonMesh, _exploded = false): BalloonMesh {
    throw new Error('WP-K4b');
  }
}

/**
 * Hexahedral cells on a mapped grid, in two layers: the plate, and the
 * fingers above it. Columns follow the leaning fingers, the slits, the
 * slot's flared mouth and its round end; rows are horizontal lines.
 */
export const NailInsertGenerator = {
  generate(_insert: NailInsert): BalloonMesh {
    throw new Error('WP-K4b');
  },
};
