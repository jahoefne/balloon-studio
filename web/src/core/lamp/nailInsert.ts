// Ported from mac/Sources/BalloonStudio/NailInsert.swift @ cbda68d.
//
// Names and shapes are frozen (WP-K4a, part 1): cloudKit and the kit texts are written against them.
// A change here is a small PR of its own, with the K4 sessions told.
//
// Swift's `init?(_:)` is `NailInsert.create(p)`, its private `init(unchecked:)` is the constructor,
// `placed(_:exploded:)` is `placed(mesh, exploded)`.
// See cloudGeometry.ts for the rule on module-level reads across this cluster.

import { BalloonMesh } from '../geometry/mesh';
import type { Point3 } from '../geometry/point3';
import { cos, PI, sin } from '../swift/dmath';
import { formatFixed } from '../swift/format';
import { swiftMax, swiftMin } from '../swift/minmax';
import type { CloudParameters } from '../types';
import { CloudMeshBuilder, Layout } from './cloudGeometry';

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
  readonly halfWidth: number;
  /** Half the width across the relaxed finger tips. */
  readonly tipHalfWidth: number;
  readonly height: number;
  readonly slotHalfWidth: number;
  readonly mouthHalfWidth: number;
  /** Outer edge of the plate beside the slot. */
  readonly cheek: number;
  /** Half the lamp's own slot. */
  private readonly lampSlot: number;
  /** The top of the chamber, in the back's frame. The insert's top rests against it. */
  readonly top: number;

  /** Swift `init?(_:)`: null where the pocket is too small for the insert, or where the nail does not need it or cannot use it. */
  static create(p: CloudParameters): NailInsert | null {
    const insert = new NailInsert(p);
    return insert.problem === null ? insert : null;
  }
  /** Swift `private init(unchecked:)`. */
  constructor(p: CloudParameters) {
    const l = new Layout(p);
    this.parameters = p;
    const entry = l.head.x1 - l.head.x0;
    this.halfWidth = entry / 2 - NailInsert.clearance;
    this.tipHalfWidth = entry / 2 + NailInsert.spring;
    this.height = swiftMin(entry - NailInsert.endPlay, Layout.slotLength);
    this.slotHalfWidth = p.nailDiameter / 2 + NailInsert.play;
    this.cheek = this.halfWidth - NailInsert.finger - NailInsert.slit;
    this.lampSlot = (l.slot.x1 - l.slot.x0) / 2;
    this.mouthHalfWidth = swiftMin(this.lampSlot, this.cheek - NailInsert.mouthCheek);
    this.top = l.slot.y1;
  }
  /** Swift `static func problem(_:)`. */
  static problem(p: CloudParameters): string | null {
    return new NailInsert(p).problem;
  }
  /** Why the insert does not suit this keyhole and nail, if it does not. */
  get problem(): string | null {
    const mm = (v: number): string => formatFixed(v, 1);
    const p = this.parameters, head = p.nailHeadDiameter / 2;
    if (this.slotHalfWidth + 0.25 > this.lampSlot) {
      return `A ${mm(p.nailDiameter)} mm shaft is too thick for the insert to narrow the ${mm(p.nailShaft)} mm slot.`;
    }
    if (head - this.slotHalfWidth < NailInsert.grip) {
      return `A ${mm(p.nailHeadDiameter)} mm head is too small for a ${mm(p.nailDiameter)} mm shaft: the insert needs a head of ${mm(2 * (this.slotHalfWidth + NailInsert.grip))} mm or more.`;
    }
    if (this.cheek - this.slotHalfWidth < NailInsert.cheekWidth || this.mouthHalfWidth <= this.slotHalfWidth || this.slotCenter - NailInsert.mouth < 0.3) {
      return 'The keyhole is too small for the insert. Give it a larger head clearance, 8 mm for instance.';
    }
    if (head + 0.3 > this.cheek || this.nailY - head - (this.top - this.height) < NailInsert.ramp) {
      return `A head over ${mm(2 * (this.cheek - 0.3))} mm does not fit between the insert's fingers in this keyhole.`;
    }
    return null;
  }
  /** Center of the slot's round end, in the insert's frame. */
  get slotCenter(): number {
    return this.height - NailInsert.crown - this.slotHalfWidth;
  }
  /** The shaft at rest against the end of the slot, in the back's frame. */
  get nailY(): number {
    return this.top - NailInsert.crown - this.parameters.nailDiameter / 2;
  }
  /** The underside of the head stands this far off the wall at least, with the plate on the lip. */
  get nearestHead(): number {
    return Layout.lip + NailInsert.plate;
  }
  /** Room for the head behind the plate, to the cap. */
  get headRoom(): number {
    return Layout.headSpace - NailInsert.plate;
  }
  /** As it sits in the back, flat face on the lip, top against the top of the chamber. Exploded, it waits behind the wall side. */
  placed(mesh: BalloonMesh, exploded = false): BalloonMesh {
    const dy = this.top - this.height, dz = Layout.lip - (exploded ? 14 : 0);
    return new BalloonMesh(mesh.vertices.map((v) => ({ x: v.x, y: v.y + dy, z: v.z + dz })), mesh.triangles, mesh.maxOverhang, mesh.innerVertexRange);
  }
}

/**
 * Hexahedral cells on a mapped grid, in two layers: the plate, and the
 * fingers above it. Columns follow the leaning fingers, the slits, the
 * slot's flared mouth and its round end; rows are horizontal lines.
 */
export const NailInsertGenerator = {
  generate(insert: NailInsert): BalloonMesh {
    const a = insert.slotHalfWidth, h = insert.height, rise = h - NailInsert.band, center = insert.slotCenter;
    const rows = [0, NailInsert.ramp, NailInsert.mouth, center, rise, h - NailInsert.chamfer, h];
    // The slot's round end is the row at its center, bent up over these columns.
    const arc = 12, arcRow = 3, last = rows.length - 1;
    const outer = (y: number): number => insert.halfWidth + (insert.tipHalfWidth - insert.halfWidth) * swiftMax(0, 1 - y / rise);
    const mouth = (y: number): number => (y >= NailInsert.mouth ? a : insert.mouthHalfWidth + ((a - insert.mouthHalfWidth) * y) / NailInsert.mouth);
    // From the outside in: finger tip, chamfer, finger's inner edge, plate's edge.
    const side: ((y: number) => number)[] = [outer, (y) => outer(y) - NailInsert.chamfer, (y) => outer(y) - NailInsert.finger, () => insert.cheek];
    const slotStart = side.length, slotEnd = slotStart + arc, lines = 2 * side.length + arc + 1;
    // Above the round end the slot's lines rise straight from it, so its
    // cells keep convex faces.
    const point = (i: number, r: number): [number, number] => {
      const y = rows[r]!;
      if (i >= slotStart && i <= slotEnd) {
        const angle = PI * (1 - (i - slotStart) / arc);
        if (r === arcRow) return [a * cos(angle), center + a * sin(angle)];
        if (r > arcRow || (i > slotStart && i < slotEnd)) return [a * cos(angle), y];
        return [i === slotStart ? -mouth(y) : mouth(y), y];
      }
      return i < slotStart ? [-side[i]!(y), y] : [side[lines - 1 - i]!(y), y];
    };
    const z = (i: number, r: number, level: number): number => {
      switch (level) {
        case 0:
          return r === last ? NailInsert.chamfer : 0;
        case 1:
          return r === 0 && i >= slotStart - 1 && i <= slotEnd + 1 ? NailInsert.plate - NailInsert.ramp : NailInsert.plate;
        default:
          return i === 0 || i === lines - 1 ? NailInsert.depth - NailInsert.chamfer : NailInsert.depth;
      }
    };
    // Columns: finger (two), slit, plate, the slot's columns, and mirrored.
    const columns = lines - 1, band = rows.indexOf(rise);
    const solid = (c: number, r: number, k: number): boolean => {
      if (!(c >= 0 && c < columns && r >= 0 && r < rows.length - 1 && k >= 0 && k < 2)) return false;
      const fromEdge = swiftMin(c, columns - 1 - c);
      switch (fromEdge) {
        case 0:
        case 1:
          return true;
        case 2:
          return r >= band;
        case 3:
          return k === 0;
        default:
          return k === 0 && r >= arcRow;
      }
    };
    const builder = new CloudMeshBuilder();
    for (let k = 0; k < 2; k++) {
      for (let r = 0; r < rows.length - 1; r++) {
        for (let c = 0; c < columns; c++) {
          if (!solid(c, r, k)) continue;
          const corners: [number, number][] = [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]];
          const v: Point3[] = [];
          for (const level of [k, k + 1]) {
            for (const [i, row] of corners) {
              const [x, y] = point(i, row);
              v.push({ x, y, z: z(i, row, level) });
            }
          }
          builder.cell(v, [solid(c, r, k - 1), solid(c, r, k + 1), solid(c, r - 1, k), solid(c + 1, r, k), solid(c, r + 1, k), solid(c - 1, r, k)]);
        }
      }
    }
    return builder.mesh;
  },
};
