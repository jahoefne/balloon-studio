// Ported from mac/Sources/BalloonStudio/CeilingLoop.swift @ cbda68d (whole file).
//
// A stitched lifting lug for the ceiling cord: a thick eyelet with a round, bevelled bore, rounded
// edges and a concave fillet into the crown pad. Its open underside replaces a crown patch, so
// there are no intersecting solids.
//
// The balloon prints upright, so the cord's pull runs across the layer lines, the weakest direction
// of brittle PLA. Every loaded section is therefore kept thick and free of notches: the bore has no
// corners, the edges are rounded, and the lug flares into the crown instead of meeting it at a
// sharp corner.
import type { BalloonMesh } from '../geometry/mesh';
import type { Point3, Triangle } from '../geometry/point3';
import { atan2, cos, hypot, PI, sin } from '../swift/dmath';
import { swiftMax } from '../swift/minmax';
import type { BalloonParameters } from '../types';

/** Rounding of the lug's outer edges. */
export const edgeRadius = 2.0;
/** Chamfer at each bore mouth, where the cord bends up toward the ceiling. */
export const bevel = 0.8;

/** Keep the chamfered bore above the fillet even at the largest flare. */
export function foot(p: BalloonParameters): number {
  return p.hangingFillet + 2;
}
/** Height of the lug above the crown pad. */
export function height(p: BalloonParameters): number {
  return foot(p) + p.hangingClearance + p.hangingWall;
}
/** How far the filleted foot reaches from the balloon's axis. */
export function reach(p: BalloonParameters): number {
  return hypot(p.hangingClearance / 2 + p.hangingWall - edgeRadius, p.hangingThickness / 2 - edgeRadius) + edgeRadius + p.hangingFillet;
}
/** Flat crown radius the foot needs, allowing for 8 % panel grooves. */
export function padRadius(p: BalloonParameters): number {
  return swiftMax(10, (reach(p) + 1) / 0.92);
}

export function attach(mesh: BalloonMesh, ringStart: number, columns: number, outerTop: number, p: BalloonParameters): void {
  const firstRemoved = ringStart + columns;
  const inRemoved = (i: number): boolean => i >= firstRemoved && i <= outerTop;
  mesh.triangles = mesh.triangles.filter((t) => !(inRemoved(t.a) || inRemoved(t.b) || inRemoved(t.c)));
  const vertices = mesh.vertices;
  const triangles: Triangle[] = mesh.triangles;
  // Local coordinates: the crown pad is z = 0, the bore runs along y.
  const vertex = (x: number, y: number, z: number): number => {
    const index = vertices.length;
    vertices.push({ x, y, z: p.height + z });
    return index;
  };
  const triangle = (a: number, b: number, c: number): void => {
    triangles.push({ a, b, c });
  };
  // Stitch two convex loops using their angular progression. Both run CCW;
  // the resulting annulus runs forward outside and backward inside.
  const annulus = (outer: readonly number[], inner: readonly number[], outerAngles: readonly number[], innerAngles: readonly number[], reverse = false): void => {
    let i = 0;
    let j = 0;
    const emit = (a: number, b: number, c: number): void => {
      if (reverse) triangle(a, c, b);
      else triangle(a, b, c);
    };
    while (i < outer.length || j < inner.length) {
      const nextOuter = i < outer.length ? (i + 1 < outer.length ? (outerAngles[i + 1] as number) : 2 * PI) : Infinity;
      const nextInner = j < inner.length ? (j + 1 < inner.length ? (innerAngles[j + 1] as number) : 2 * PI) : Infinity;
      if (nextOuter <= nextInner) {
        emit(outer[i % outer.length] as number, outer[(i + 1) % outer.length] as number, inner[j % inner.length] as number);
        i += 1;
      } else {
        emit(outer[i % outer.length] as number, inner[(j + 1) % inner.length] as number, inner[j % inner.length] as number);
        j += 1;
      }
    }
  };
  // Quads between two loops of equal length. `lower` comes first along the
  // surface's outward orientation (below, or earlier around the top arc).
  const band = (lower: readonly number[], upper: readonly number[], closed: boolean): void => {
    const n = lower.length;
    const end = closed ? n : n - 1;
    for (let j = 0; j < end; j++) {
      const k = (j + 1) % n;
      triangle(lower[j] as number, lower[k] as number, upper[k] as number);
      triangle(lower[j] as number, upper[k] as number, upper[j] as number);
    }
  };
  const wall = p.hangingWall;
  const filletRadius = p.hangingFillet;
  const r = p.hangingClearance / 2;
  const c = foot(p) + r;
  const half = p.hangingThickness / 2;
  const flatX = r + wall - edgeRadius;
  const flatY = half - edgeRadius;
  const segments = 4;
  const fillets = 4;
  const arcs = 16;
  const bore = 24;
  const quarter = PI / 2;
  const angle = (index: number): number => {
    const v = vertices[index] as Point3;
    const a = atan2(v.z - p.height - c, v.x);
    return a < -1e-9 ? a + 2 * PI : swiftMax(0, a);
  };

  // Horizontal slice: a rounded rectangle, counter-clockwise from the +x/-y
  // corner, with `sides` extra points along each flat face. The corner
  // centres never move; only the corner radius grows with the fillet's
  // spread, which keeps the slices' vertices aligned.
  const slice = (e: number, z: number, sides: number): number[] => {
    const rho = edgeRadius + e;
    const ring: number[] = [];
    for (let corner = 0; corner < 4; corner++) {
      const cx = corner < 2 ? flatX : -flatX;
      const cy = corner === 1 || corner === 2 ? flatY : -flatY;
      for (let s = 0; s <= segments; s++) {
        const a = quarter * (corner + s / segments) - quarter;
        ring.push(vertex(cx + rho * cos(a), cy + rho * sin(a), z));
      }
      if ((corner === 1 || corner === 3) && sides > 0) {
        // Along the +y face from +x to -x, and back along the -y face.
        for (let s = 1; s <= sides; s++) {
          const x = flatX * (1 - (2 * s) / (sides + 1));
          ring.push(vertex(corner === 1 ? x : -x, corner === 1 ? half + e : -(half + e), z));
        }
      }
    }
    return ring;
  };
  // Foot fillet, then the straight body up to the bore's centre line. The
  // fillet slices carry extra points along the faces, so the faces fan out
  // evenly around the bore from the top of the fillet.
  const sides = 3;
  const rings: number[][] = [];
  for (let s = 0; s <= fillets; s++) {
    const psi = (quarter * s) / fillets;
    rings.push(slice(filletRadius * (1 - sin(psi)), filletRadius * (1 - cos(psi)), sides));
  }
  const base = rings[fillets] as number[];
  const crest = slice(0, c, 0);
  for (let i = 0; i < fillets; i++) band(rings[i] as number[], rings[i + 1] as number[], true);
  // The straight body: only its rounded sides. The flat faces are stitched
  // separately, around the bore, from the top of the fillet upward.
  const perHalf = 2 * (segments + 1);
  band(base.slice(0, perHalf), crest.slice(0, perHalf), false);
  band(base.slice(perHalf + sides, 2 * perHalf + sides), crest.slice(perHalf), false);

  // Rounded top: the body's edge rounding swept around a semicircle. Each
  // arc runs from the -y face over the outer edge to the +y face; the first
  // and last arcs are the two halves of the crest slice.
  const arc = (k: number): number[] => {
    if (k === 0) return crest.slice(0, perHalf);
    if (k === arcs) return crest.slice(perHalf).reverse();
    const theta = (PI * k) / arcs;
    const ex = flatX * cos(theta);
    const ez = c + flatX * sin(theta);
    const ring: number[] = [];
    for (const side of [-1.0, 1.0]) {
      for (let s = 0; s <= segments; s++) {
        const phi = quarter * (s / segments + (side < 0 ? -1 : 0));
        ring.push(vertex(ex + edgeRadius * cos(phi) * cos(theta), side * flatY + edgeRadius * sin(phi), ez + edgeRadius * cos(phi) * sin(theta)));
      }
    }
    return ring;
  };
  const front: number[] = [];
  const back: number[] = [];
  let previous = arc(0);
  front.push(previous[0] as number);
  back.push(previous[perHalf - 1] as number);
  for (let k = 1; k <= arcs; k++) {
    const ring = arc(k);
    band(previous, ring, false);
    front.push(ring[0] as number);
    back.push(ring[perHalf - 1] as number);
    previous = ring;
  }
  // The flat faces: semicircle, then down the sides and along the top of the fillet.
  front.push(base[2 * perHalf + sides - 1] as number);
  front.push(...base.slice(2 * perHalf + sides));
  front.push(base[0] as number);
  back.push(base[perHalf + sides] as number);
  back.push(...base.slice(perHalf, perHalf + sides).reverse());
  back.push(base[perHalf - 1] as number);

  // Round bore with a chamfer at each mouth.
  const circle = (radius: number, y: number): number[] => {
    const out: number[] = [];
    for (let m = 0; m < bore; m++) {
      const a = (2 * PI * m) / bore;
      out.push(vertex(radius * cos(a), y, c + radius * sin(a)));
    }
    return out;
  };
  const mouthFront = circle(r + bevel, -half);
  const boreFront = circle(r, -half + bevel);
  const boreBack = circle(r, half - bevel);
  const mouthBack = circle(r + bevel, half);
  annulus(front, mouthFront, front.map(angle), mouthFront.map(angle));
  annulus(back, mouthBack, back.map(angle), mouthBack.map(angle), true);
  for (const [near, far] of [[mouthFront, boreFront], [boreFront, boreBack], [boreBack, mouthBack]] as const) {
    for (let m = 0; m < bore; m++) {
      const n = (m + 1) % bore;
      triangle(near[m] as number, near[n] as number, far[n] as number);
      triangle(near[m] as number, far[n] as number, far[m] as number);
    }
  }

  // Lift the attachment pad above the original curved crown. A direct
  // chord to the lug would shave the shell on tall, narrow balloons.
  const raised: number[] = [];
  for (let j = 0; j < columns; j++) {
    const point = vertices[ringStart + j] as Point3;
    raised.push(vertex(point.x, point.y, 0));
  }
  for (let j = 0; j < columns; j++) {
    const k = (j + 1) % columns;
    triangle(ringStart + j, ringStart + k, raised[k] as number);
    triangle(ringStart + j, raised[k] as number, raised[j] as number);
  }
  // The raised crown ring follows the panel grooves, so it is not convex.
  // A round ring just outside the foot keeps the flat stitching between
  // convex loops; the grooved ring joins it with plain quads.
  const ringRadius = reach(p) + 0.5;
  const pad: number[] = [];
  for (let j = 0; j < columns; j++) {
    const a = (2 * PI * j) / columns;
    pad.push(vertex(ringRadius * cos(a), ringRadius * sin(a), 0));
  }
  for (let j = 0; j < columns; j++) {
    const k = (j + 1) % columns;
    triangle(raised[j] as number, raised[k] as number, pad[k] as number);
    triangle(raised[j] as number, pad[k] as number, pad[j] as number);
  }
  // Start the pad ring at the column just before the footprint's first
  // vertex, so both loops progress from angle zero.
  const footprint = rings[0] as number[];
  const footprintFirst = vertices[footprint[0] as number] as Point3;
  const origin = atan2(footprintFirst.y, footprintFirst.x);
  const startAngle = origin < 0 ? origin + 2 * PI : origin;
  const start = Math.floor((startAngle / (2 * PI)) * columns) % columns;
  const reference = (2 * PI * start) / columns;
  const crown: number[] = [];
  const crownAngles: number[] = [];
  for (let j = 0; j < columns; j++) {
    crown.push(pad[(start + j) % columns] as number);
    crownAngles.push((2 * PI * j) / columns);
  }
  const footprintAngles = footprint.map((index) => {
    const point = vertices[index] as Point3;
    // The reference can exceed the vertex angle by more than a turn.
    const a = (atan2(point.y, point.x) - reference) % (2 * PI);
    return a < -1e-9 ? a + 2 * PI : swiftMax(0, a);
  });
  annulus(crown, footprint, crownAngles, footprintAngles);
}
