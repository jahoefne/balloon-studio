// Ported from mac/Sources/BalloonStudio/CableClamp.swift @ cbda68d.
//
// Names and shapes are frozen (WP-K4a, part 1): cloudGeometry, cloudKit, cloudLedLayout and the kit
// texts are written against them. A change here is a small PR of its own, with the K4 sessions told.
//
// Swift's `init?(_:)` is `CableClamp.create(p)`, its `init(unchecked:)` is `new CableClamp(p)`.
// `stands(on:)` is `stands`, `stand(on:in:)` is `stand(ground, builder)`. The CloudMeshBuilder extension
// (:350-399) is the free functions `annulus`, `bore` and `disk`, builder first.
//
// SWIFT-DIFF: a `ClosedRange<Double>` is two numbers here. Swift traps on an inverted range; none of
// the ranges of this file can invert (:125-140, :458, :470-473, :485).
// See cloudGeometry.ts for the rule on module-level reads across this cluster.

import { BalloonMesh } from '../geometry/mesh';
import type { Point3 } from '../geometry/point3';
import { IntKey3Map } from '../geometry/weld';
import { atan2, cos, hypot, PI, sin } from '../swift/dmath';
import { arrayMax, arrayMin, swiftMax, swiftMin } from '../swift/minmax';
import { ieeeRemainder, intCeil, rounded, strideThrough } from '../swift/rounding';
import { sortedDoubles, stableSorted } from '../swift/sort';
import type { CloudParameters } from '../types';
import { CableOutlet } from './cableSeal';
import { CloudConstants, CloudMeshBuilder, LampClipGeometry, Layout, minimumWidth, normalized, Rect, type Pair } from './cloudGeometry';

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
  static create(p: CloudParameters): CableClamp | null {
    if (!p.strainRelief) return null;
    const clamp = new CableClamp(p);
    return clamp.fits ? clamp : null;
  }
  /** Swift `init(unchecked:)`: the clamp as it would be, whether or not the lamp has room for it. */
  constructor(p: CloudParameters) {
    this.parameters = p;
    this.outlet = new CableOutlet(p);
  }

  get cable(): number { return this.parameters.cableDiameter; }
  /** Way between the posts. */
  get channel(): number { return this.outlet.sealWidth + 2 * CableClamp.play; }
  get inner(): number { return this.channel / 2; }
  get outer(): number { return this.inner + CableClamp.post; }
  /** The posts along the cable. */
  get end(): number { return this.outlet.seat - CableClamp.gap; }
  get start(): number { return this.end - CableClamp.post; }
  /** Axis of a screw: along the cable, and to either side of it. */
  get screwT(): number { return this.start + CableClamp.post / 2; }
  get screwH(): number { return this.inner + CableClamp.post / 2; }
  get rib(): number { return swiftMin(0.6, swiftMax(0.4, 0.1 * this.cable)); }
  /** The cable's underside above the floor, in line with the seal's bore. */
  get rest(): number { return this.outlet.axisZ - this.cable / 2 - CloudConstants.floor; }
  /** Flat of the bar's tongue, with the bar down on the posts. */
  get barFlat(): number { return CloudConstants.floor + this.rest + CableClamp.pinch * this.cable; }
  get postTop(): number {
    const least = CloudConstants.floor + CableClamp.postHeight;
    return this.barFlat > least - 0.2 ? this.barFlat : least;
  }
  get tongue(): number { return this.postTop - this.barFlat; }
  get tongueHalfWidth(): number { return this.cable / 2 + CableClamp.tongueRoom; }
  get holeDepth(): number { return this.postTop - CableClamp.holeFloor; }
  /** Thread in the post with the bar down. */
  get engagement(): number { return CableClamp.screwLength - CableClamp.bar; }
  /** Top of the screw heads. */
  get top(): number { return this.postTop + CableClamp.bar + CableClamp.headHeight; }

  // Anvil, in the clamp's own frame.
  get anvilStart(): number { return -CableClamp.fit - CableClamp.crossBar; }
  get anvilEnd(): number { return CableClamp.post + CableClamp.fit + CableClamp.crossBar; }
  get anvilHalfWidth(): number { return this.inner - CableClamp.fit; }
  get shoulderHalfWidth(): number { return this.inner + CableClamp.shoulder; }
  get railInner(): number { return this.cable / 2 + CableClamp.railRoom; }
  get railTop(): number { return this.rest + this.cable / 2; }
  get anvilRibs(): number[] { return [0.5, 3.5, 6.5]; }
  get barRibs(): number[] { return [2, 5]; }

  private rectangle(t0: number, t1: number, h0: number, h1: number): Pair[] {
    return [this.outlet.point(t0, h0), this.outlet.point(t1, h0), this.outlet.point(t1, h1), this.outlet.point(t0, h1)];
  }
  /** The posts as seen from the front, counterclockwise. */
  get posts(): Pair[][] {
    return [this.rectangle(this.start, this.end, this.inner, this.outer), this.rectangle(this.start, this.end, -this.outer, -this.inner)];
  }
  get anvilOutline(): Pair[] {
    return this.rectangle(this.start + this.anvilStart, this.start + this.anvilEnd, -this.shoulderHalfWidth, this.shoulderHalfWidth);
  }
  /** Posts and anvil, for the LED plan. */
  get outlines(): Pair[][] {
    return [...this.posts, this.rectangle(this.start + this.anvilStart, this.start + this.anvilEnd, -this.anvilHalfWidth, this.anvilHalfWidth)];
  }
  /** Floor under the bar, and a little around it. */
  private get groundOutline(): Pair[] {
    return this.rectangle(this.start - CableClamp.ground, this.end + CableClamp.ground, -this.outer - CableClamp.ground, this.outer + CableClamp.ground);
  }
  /** No LEDs under the clamp, nor where the seal is slid in. */
  get keepOut(): Rect {
    const pocket = this.outlet.keepOut, half = this.outer + 0.5;
    const corners = this.rectangle(this.outlet.seat - CableOutlet.landing, this.outlet.seat, -half, half);
    return new Rect(
      swiftMin(pocket.x0, arrayMin(corners.map((q) => q[0]))!),
      swiftMax(pocket.x1, arrayMax(corners.map((q) => q[0]))!),
      swiftMin(pocket.y0, arrayMin(corners.map((q) => q[1]))!),
      swiftMax(pocket.y1, arrayMax(corners.map((q) => q[1]))!),
    );
  }
  /** Whether two convex outlines share a point. */
  private static overlap(a: readonly Pair[], b: readonly Pair[]): boolean {
    for (const outline of [a, b]) {
      for (let i = 0; i < outline.length; i++) {
        const p = outline[i]!, q = outline[(i + 1) % outline.length]!, x = -(q[1] - p[1]), y = q[0] - p[0];
        if (!(hypot(x, y) > 1e-12)) continue;
        const first = a.map((v) => v[0] * x + v[1] * y), second = b.map((v) => v[0] * x + v[1] * y);
        if (arrayMax(first)! < arrayMin(second)! || arrayMax(second)! < arrayMin(first)!) return false;
      }
    }
    return true;
  }
  /** A face of the floor that the posts' ground takes over. */
  stands(face: readonly Point3[]): boolean {
    return CableClamp.overlap(face.map((q) => [q.x, q.y] as const), this.groundOutline);
  }
  /** Room under the diffuser and inside the skirt, on free floor away from the nail pocket, with the seal's whole way in before it. */
  get fits(): boolean {
    const p = this.parameters, boss = new Layout(p).nailBoss.expanded(CableClamp.skirtRoom);
    if (!(this.top <= p.depth - CableClamp.headRoom && this.outlet.landing >= CableOutlet.landing - 1e-9)) return false;
    const nail: Pair[] = [[boss.x0, boss.y0], [boss.x1, boss.y0], [boss.x1, boss.y1], [boss.x0, boss.y1]];
    if (CableClamp.overlap(nail, this.groundOutline) || CableClamp.overlap(nail, this.anvilOutline)) return false;
    const inset = CloudConstants.wall + p.clipFit + LampClipGeometry.rootThickness + CableClamp.clipRoom;
    const areas: [number, number, number][] = [
      [this.start, this.end, this.outer],
      [this.start + this.anvilStart, this.start + this.anvilEnd, this.shoulderHalfWidth],
    ];
    for (const [lower, upper, half] of areas) {
      const steps = intCeil(swiftMax(upper - lower, 2 * half));
      for (let i = 0; i <= steps; i++) {
        const u = i / steps, along = lower + (upper - lower) * u;
        const points: Pair[] = [[along, -half], [along, half], [lower, half * (2 * u - 1)], [upper, half * (2 * u - 1)]];
        for (const [t, h] of points) {
          if (!(t > 0 && this.outlet.inside(t, h, inset))) return false;
        }
      }
    }
    return true;
  }
  /** The narrowest lamp of this design that has room for the clamp. */
  static minimumWidth(p: CloudParameters): number | null {
    const q: CloudParameters = { ...p, strainRelief: true };
    for (const width of strideThrough(minimumWidth(p), 500, 1)) {
      q.width = width;
      if (CableClamp.create(normalized(q)) !== null) return width;
    }
    return null;
  }
  /**
   * Lays the floor's surface anew around the posts and stands them in
   * it, each with a blind hole for a screw to form its thread in.
   * `ground` holds the faces the floor's cells have left out.
   */
  stand(ground: readonly (readonly Point3[])[], builder: CloudMeshBuilder): void {
    const floor = CloudConstants.floor;
    // Points within the ground are left out: they take no part in the mesh.
    const found: Point3[] = [], known = new IntKey3Map();
    const faces = ground.map((face) =>
      face.map((point) => {
        const kx = rounded(point.x * 1e7), ky = rounded(point.y * 1e7), kz = rounded(point.z * 1e7);
        const index = known.get(kx, ky, kz);
        if (index !== -1) return index;
        known.set(kx, ky, kz, found.length);
        found.push(point);
        return found.length - 1;
      }),
    );
    // SWIFT-DIFF: Set<Edge> is a Map in insertion order. As in Swift, the walk below does not depend
    // on the order on a valid contour (`next.size === edges.size`).
    const edges = new Map<number, [number, number]>();
    const edgeKey = (a: number, b: number): number => a * 0x200000 + b;
    for (const face of faces) {
      face.forEach((a, i) => {
        const b = face[(i + 1) % face.length]!;
        if (!edges.delete(edgeKey(b, a))) edges.set(edgeKey(a, b), [a, b]);
      });
    }
    const next = new Map<number, number>();
    for (const [a, b] of edges.values()) next.set(a, b);
    const outline: number[] = [];
    // Start at the same point every time: a set has no order of its own,
    // and the triangles of the floor depend on where the outline begins.
    if (edges.size > 0 && next.size === edges.size) {
      const first = arrayMin([...edges.values()].map((e) => e[0]))!;
      let at = first;
      do {
        outline.push(at);
        at = next.get(at) ?? first;
      } while (at !== first && outline.length <= edges.size);
    }
    const posts = this.posts;
    const corners: Point3[][] = posts.map((post) => post.map((q) => ({ x: q[0], y: q[1], z: floor })));
    const points: Pair[] = outline.map((i) => [found[i]!.x, found[i]!.y]);
    const holes = posts.map((post) => {
      points.push(...post);
      const hole: number[] = [];
      for (let i = points.length - 1; i >= points.length - 4; i--) hole.push(i);
      return hole;
    });
    const triangles = outline.length === edges.size ? FlatRegion.triangles(outline.map((_, i) => i), holes, points) : null;
    if (triangles === null) {
      // Without room for them the floor stays as it was.
      // SWIFT-DIFF: `assertionFailure` (:231) only stops a debug build; the app and the exporter are -O.
      for (const face of ground) {
        const ids = face.map((q) => builder.vertex(q));
        builder.triangles.push({ a: ids[0]!, b: ids[1]!, c: ids[2]! }, { a: ids[0]!, b: ids[2]!, c: ids[3]! });
      }
      return;
    }
    const ids = [...outline.map((i) => found[i]!), ...corners.flat()].map((q) => builder.vertex(q));
    for (const t of triangles) builder.triangles.push({ a: ids[t[0]]!, b: ids[t[1]]!, c: ids[t[2]]! });
    const postTop = this.postTop;
    corners.forEach((post, index) => {
      const top: Point3[] = post.map((q) => ({ x: q.x, y: q.y, z: postTop }));
      post.forEach((_, i) => {
        const k = (i + 1) % post.length;
        const wall = [post[i]!, post[k]!, top[k]!, top[i]!].map((q) => builder.vertex(q));
        builder.triangles.push({ a: wall[0]!, b: wall[1]!, c: wall[2]! }, { a: wall[0]!, b: wall[2]!, c: wall[3]! });
      });
      const h = index === 0 ? this.screwH : -this.screwH;
      const center = this.outlet.point(this.screwT, h);
      const circle = (diameter: number, z: number): RimPoint[] =>
        CableClampGenerator.circle(diameter / 2, this.screwT, h, z).map((c) => [this.outlet.point3(c[0].x, c[0].y, z), c[1] + this.outlet.angle] as const);
      const mouth = circle(CableClamp.mouth, postTop), neck = circle(CableClamp.pilot, postTop - CableClamp.mouthDepth);
      const bottom = circle(CableClamp.pilot, CableClamp.holeFloor);
      annulus(builder, top.map((q) => [q, atan2(q.y - center[1], q.x - center[0])] as const), mouth);
      bore(builder, mouth.map((c) => c[0]), neck.map((c) => c[0]));
      bore(builder, neck.map((c) => c[0]), bottom.map((c) => c[0]));
      disk(builder, bottom.map((c) => c[0]), { x: center[0], y: center[1], z: CableClamp.holeFloor });
    });
  }
}

const NEAR = 1e-7;
const cross2 = (a: Pair, b: Pair, c: Pair): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const same = (a: Pair, b: Pair): boolean => Math.abs(a[0] - b[0]) < NEAR && Math.abs(a[1] - b[1]) < NEAR;
/** On the segment, its ends included. */
const on = (a: Pair, b: Pair, p: Pair): boolean => {
  const length = hypot(b[0] - a[0], b[1] - a[1]);
  if (!(length > NEAR)) return same(a, p);
  const along = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / length;
  return Math.abs(cross2(a, b, p)) / length < NEAR && along > -NEAR && along < length + NEAR;
};
const meet = (a: Pair, b: Pair, c: Pair, d: Pair): boolean => {
  const s0 = cross2(a, b, c), s1 = cross2(a, b, d), s2 = cross2(c, d, a), s3 = cross2(c, d, b);
  if (s0 * s1 < 0 && s2 * s3 < 0) return true;
  return on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
};
const insideOutline = (p: Pair, outline: readonly Pair[]): boolean => {
  let inside = false;
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < a[0] + ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1])) inside = !inside;
  });
  return inside;
};
/** A corner that stands out of the line through its neighbors. */
const isCorner = (a: Pair, b: Pair, c: Pair): boolean => {
  const m = swiftMax(swiftMax(swiftMax(hypot(c[0] - a[0], c[1] - a[1]), hypot(b[0] - a[0], b[1] - a[1])), hypot(c[0] - b[0], c[1] - b[1])), 1e-3);
  return cross2(a, b, c) > 1e-6 * m;
};
/** In the triangle or on its sides. */
const within = (p: Pair, a: Pair, b: Pair, c: Pair): boolean => {
  const side = (u: Pair, v: Pair): number => cross2(u, v, p) / swiftMax(hypot(v[0] - u[0], v[1] - u[1]), NEAR);
  return side(a, b) > -NEAR && side(b, c) > -NEAR && side(c, a) > -NEAR;
};

/**
 * Triangles of a flat region with holes in it, by ear clipping. Only
 * the points given are used, so the faces around the region stay whole.
 */
export const FlatRegion = {
  /** The outline runs counterclockwise, the holes clockwise, each a list of indices into `points`. Null where no triangles can be found. */
  triangles(outline: readonly number[], holes: readonly (readonly number[])[], points: readonly Pair[]): [number, number, number][] | null {
    let ring = [...outline];
    // A cut from each hole to the outline makes one ring of them.
    for (let index = 0; index < holes.length; index++) {
      const hole = holes[index]!;
      const others: [number, number][] = holes.slice(index).flatMap((h) => h.map((_, i) => [h[i]!, h[(i + 1) % h.length]!] as [number, number]));
      const sides: [number, number][] = [...ring.map((_, i) => [ring[i]!, ring[(i + 1) % ring.length]!] as [number, number]), ...others];
      const cuts: [number, number, number][] = [];
      for (let i = 0; i < hole.length; i++) {
        for (let j = 0; j < ring.length; j++) {
          if (ring.filter((r) => same(points[r]!, points[ring[j]!]!)).length !== 1) continue;
          const a = points[hole[i]!]!, b = points[ring[j]!]!;
          cuts.push([hypot(a[0] - b[0], a[1] - b[1]), i, j]);
        }
      }
      const cut = stableSorted(cuts, (x, y) => x[0] < y[0]).find(([, i, j]) => {
        const a = points[hole[i]!]!, b = points[ring[j]!]!, middle: Pair = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (!insideOutline(middle, ring.map((r) => points[r]!)) || insideOutline(middle, hole.map((r) => points[r]!))) return false;
        return !sides.some((side) => {
          const c = points[side[0]]!, d = points[side[1]]!;
          if (same(c, a) || same(d, a) || same(c, b) || same(d, b)) return false;
          return meet(a, b, c, d);
        });
      });
      if (cut === undefined) return null;
      const turned: number[] = [];
      for (let o = 0; o <= hole.length; o++) turned.push(hole[(cut[1] + o) % hole.length]!);
      ring = [...ring.slice(0, cut[2] + 1), ...turned, ...ring.slice(cut[2])];
    }
    const result: [number, number, number][] = [];
    while (ring.length > 3) {
      const n = ring.length;
      let ear = -1;
      for (let i = 0; i < n; i++) {
        const a = points[ring[(i + n - 1) % n]!]!, b = points[ring[i]!]!, c = points[ring[(i + 1) % n]!]!;
        if (!isCorner(a, b, c)) continue;
        const blocked = ring.some((index) => {
          const p = points[index]!;
          return !same(p, a) && !same(p, b) && !same(p, c) && within(p, a, b, c);
        });
        if (!blocked) {
          ear = i;
          break;
        }
      }
      if (ear < 0) return null;
      result.push([ring[(ear + n - 1) % n]!, ring[ear]!, ring[(ear + 1) % n]!]);
      ring.splice(ear, 1);
    }
    if (!isCorner(points[ring[0]!]!, points[ring[1]!]!, points[ring[2]!]!)) return null;
    result.push([ring[0]!, ring[1]!, ring[2]!]);
    return result;
  },
};

/**
 * A flat face between an outline and a round hole in it. Both run
 * counterclockwise as seen against the face, each point with its
 * angle around the hole. `flipped` faces the other way.
 */
export const annulus = (builder: CloudMeshBuilder, outline: readonly RimPoint[], hole: readonly RimPoint[], flipped = false): void => {
  const turn = 2 * PI, m = outline.length, n = hole.length;
  const ahead = (a: number, b: number): number => {
    const d = (a - b) % turn;
    return d < 0 ? d + turn : d;
  };
  const origin = outline[0]![1];
  let first = 0;
  for (let i = 1; i < n; i++) {
    if (Math.abs(ieeeRemainder(hole[i]![1] - origin, turn)) < Math.abs(ieeeRemainder(hole[first]![1] - origin, turn))) first = i;
  }
  const base = ieeeRemainder(hole[first]![1] - origin, turn);
  const outer: number[] = [];
  for (let i = 0; i <= m; i++) outer.push(i === m ? turn : ahead(outline[i]![1], origin));
  const inner: number[] = [];
  for (let i = 0; i <= n; i++) inner.push(i === n ? base + turn : base + ahead(hole[(first + i) % n]![1], hole[first]![1]));
  const face = (a: Point3, b: Point3, c: Point3): void => {
    const ids = (flipped ? [a, c, b] : [a, b, c]).map((q) => builder.vertex(q));
    builder.triangles.push({ a: ids[0]!, b: ids[1]!, c: ids[2]! });
  };
  // Each point of the hole goes to the nearest point of the outline.
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (j < n && (i === m || inner[j + 1]! <= (outer[i]! + outer[i + 1]!) / 2)) {
      face(outline[i % m]![0], hole[(first + j + 1) % n]![0], hole[(first + j) % n]![0]);
      j += 1;
    } else {
      face(outline[i % m]![0], outline[(i + 1) % m]![0], hole[(first + j) % n]![0]);
      i += 1;
    }
  }
};
/** The wall of a round hole between two of its rims, facing the axis. */
export const bore = (builder: CloudMeshBuilder, upper: readonly Point3[], lower: readonly Point3[]): void => {
  upper.forEach((_, i) => {
    const k = (i + 1) % upper.length;
    const ids = [upper[i]!, upper[k]!, lower[k]!, lower[i]!].map((q) => builder.vertex(q));
    builder.triangles.push({ a: ids[0]!, b: ids[1]!, c: ids[2]! }, { a: ids[0]!, b: ids[2]!, c: ids[3]! });
  });
};
/** The closed end of a blind hole, facing up. */
export const disk = (builder: CloudMeshBuilder, rim: readonly Point3[], center: Point3): void => {
  const c = builder.vertex(center);
  rim.forEach((_, i) => {
    const b = builder.vertex(rim[i]!), d = builder.vertex(rim[(i + 1) % rim.length]!);
    builder.triangles.push({ a: c, b, c: d });
  });
};

const unique = (values: readonly number[]): number[] => {
  const result: number[] = [];
  for (const value of sortedDoubles(values)) if (result.length === 0 || Math.abs(result[result.length - 1]! - value) > 1e-7) result.push(value);
  return result;
};
type Span = readonly [lower: number, upper: number];
const inSpan = (s: Span, x: number): boolean => x >= s[0] && x <= s[1];
/** Ribs across the cable, in one layer of the grid. Their flanks rise at 45° to a narrower face, above or below. */
class Ribs {
  constructor(readonly spans: readonly Span[], readonly layer: Span, readonly halfWidth: number, readonly flank: number, readonly narrowAbove: boolean) {}
  contains(u: number, h: number, z: number): boolean {
    return inSpan(this.layer, z) && Math.abs(h) < this.halfWidth && this.spans.some((s) => inSpan(s, u));
  }
  /** Where a grid line of the wide face meets the narrow one. */
  narrowed(u: number, center: number): number {
    const span = this.spans.find((s) => inSpan(s, center))!, width = span[1] - span[0];
    return span[0] + this.flank + ((u - span[0]) * (width - 2 * this.flank)) / width;
  }
}
/** `open` leaves a cell's lower and upper face to a round hole. */
const blocks = (
  usIn: readonly number[],
  hsIn: readonly number[],
  zsIn: readonly number[],
  ribs: Ribs,
  solid: (u: number, h: number, z: number) => boolean,
  open: (u: number, h: number, z: number) => boolean = () => false,
): CloudMeshBuilder => {
  const us = unique([...usIn, ...ribs.spans.flatMap((s) => [s[0], s[1]])]), hs = unique(hsIn), zs = unique(zsIn);
  const nu = us.length - 1, nh = hs.length - 1, nz = zs.length - 1;
  const center = (i: number, j: number, k: number): [number, number, number] => [(us[i]! + us[i + 1]!) / 2, (hs[j]! + hs[j + 1]!) / 2, (zs[k]! + zs[k + 1]!) / 2];
  const filled = (i: number, j: number, k: number): boolean => {
    if (!(i >= 0 && j >= 0 && k >= 0 && i < nu && j < nh && k < nz)) return false;
    const c = center(i, j, k);
    return ribs.contains(c[0], c[1], c[2]) || solid(c[0], c[1], c[2]);
  };
  const builder = new CloudMeshBuilder();
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < nh; j++) {
      for (let i = 0; i < nu; i++) {
        if (!filled(i, j, k)) continue;
        const c = center(i, j, k), hole = open(c[0], c[1], c[2]);
        let low = [us[i]!, us[i + 1]!], high = low;
        if (ribs.contains(c[0], c[1], c[2])) {
          const narrow = low.map((u) => ribs.narrowed(u, c[0]));
          if (ribs.narrowAbove) high = narrow;
          else low = narrow;
        }
        const v: Point3[] = [
          { x: low[0]!, y: hs[j]!, z: zs[k]! }, { x: low[1]!, y: hs[j]!, z: zs[k]! }, { x: low[1]!, y: hs[j + 1]!, z: zs[k]! }, { x: low[0]!, y: hs[j + 1]!, z: zs[k]! },
          { x: high[0]!, y: hs[j]!, z: zs[k + 1]! }, { x: high[1]!, y: hs[j]!, z: zs[k + 1]! }, { x: high[1]!, y: hs[j + 1]!, z: zs[k + 1]! }, { x: high[0]!, y: hs[j + 1]!, z: zs[k + 1]! },
        ];
        builder.cell(v, [hole || filled(i, j, k - 1), hole || filled(i, j, k + 1), filled(i, j - 1, k), filled(i + 1, j, k), filled(i, j + 1, k), filled(i - 1, j, k)]);
      }
    }
  }
  return builder;
};
const ribSpans = (centers: readonly number[], c: CableClamp): Span[] => centers.map((u) => [u - CableClamp.ribTip / 2 - c.rib, u + CableClamp.ribTip / 2 + c.rib]);
const barMiddle = (c: CableClamp): number => (CableClamp.bar + CableClamp.headHeight - c.tongue - c.rib) / 2;

/**
 * Bar and anvil are boxes on a grid, with tapered ribs and round holes.
 * Both are built where they sit, in the clamp's frame, then laid down
 * for printing.
 */
export const CableClampGenerator = {
  circle(radius: number, u: number, h: number, z: number): RimPoint[] {
    const out: RimPoint[] = [];
    for (let i = 0; i < CableClamp.segments; i++) {
      const a = ((i + 0.5) * 2 * PI) / CableClamp.segments;
      out.push([{ x: u + radius * cos(a), y: h + radius * sin(a), z }, a]);
    }
    return out;
  },
  /** Lies on the floor between the posts: Z from the floor. */
  seatedAnvil(c: CableClamp): BalloonMesh {
    const flat = c.rest - c.rib;
    const ribs = new Ribs(ribSpans(c.anvilRibs, c), [flat, c.rest], c.tongueHalfWidth, c.rib, true);
    const bars: Span[] = [[c.anvilStart, -CableClamp.fit], [CableClamp.post + CableClamp.fit, c.anvilEnd]];
    const rails: Span = [c.railInner, c.railInner + CableClamp.rail];
    const us = [c.anvilStart, c.anvilEnd, ...bars.flatMap((s) => [s[0], s[1]])];
    const halves = [c.shoulderHalfWidth, c.anvilHalfWidth, rails[1], rails[0], c.tongueHalfWidth];
    return blocks(us, [...halves, ...halves.map((h) => -h)], [0, flat, c.rest, c.railTop], ribs, (u, h, z) => {
      if (z < flat) return Math.abs(h) < c.anvilHalfWidth || bars.some((s) => inSpan(s, u));
      return inSpan(rails, Math.abs(h));
    }).mesh;
  },
  /** Rests on the posts: Z from their tops. */
  seatedBar(c: CableClamp): BalloonMesh {
    const post = CableClamp.post, crown = CableClamp.bar + CableClamp.headHeight;
    const ribs = new Ribs(ribSpans(c.barRibs, c), [-c.tongue - c.rib, -c.tongue], c.tongueHalfWidth, c.rib, false);
    const halves = [c.outer, c.inner, c.tongueHalfWidth];
    const zs = [-c.tongue - c.rib, -c.tongue, 0, CableClamp.bar, crown];
    const builder = blocks(
      [0, post],
      [...halves, ...halves.map((h) => -h)],
      zs,
      ribs,
      (_, h, z) => {
        if (z > CableClamp.bar) return Math.abs(h) < c.inner;
        return z > 0 || (z > -c.tongue && Math.abs(h) < c.tongueHalfWidth);
      },
      (_, h, z) => z > 0 && z < CableClamp.bar && Math.abs(h) > c.inner,
    );
    // Round holes for the screws, through the bar's ends.
    const along = unique([0, post, ...ribs.spans.flatMap((s) => [s[0], s[1]])]);
    for (const side of [-1.0, 1]) {
      const near = side > 0 ? c.inner : -c.outer, far = side > 0 ? c.outer : -c.inner;
      const h = side * c.screwH, u = post / 2, radius = CableClamp.passage / 2;
      const outline = (z: number): RimPoint[] =>
        [...along.map((a) => [a, near] as const), ...[...along].reverse().map((a) => [a, far] as const)].map((q) => [{ x: q[0], y: q[1], z }, atan2(q[1] - h, q[0] - u)] as const);
      const upper = CableClampGenerator.circle(radius, u, h, CableClamp.bar), lower = CableClampGenerator.circle(radius, u, h, 0);
      annulus(builder, outline(CableClamp.bar), upper);
      annulus(builder, outline(0), lower, true);
      bore(builder, upper.map((q) => q[0]), lower.map((q) => q[0]));
    }
    return builder.mesh;
  },
  /** A pan head screw, to show in the preview. Z from under its head. */
  screw(): BalloonMesh {
    const head = CableClamp.headDiameter / 2 - 0.2, shaft = CableClamp.screw / 2, tall = CableClamp.headHeight - 0.2;
    const profile: Pair[] = [[head - 1, tall], [head, tall - 0.8], [head, 0], [shaft, 0], [shaft, -CableClamp.screwLength + 0.5], [shaft - 0.5, -CableClamp.screwLength]];
    const n = CableClamp.segments;
    const mesh = new BalloonMesh([], [], 0);
    for (const [r, z] of profile) {
      for (let i = 0; i < n; i++) {
        const a = (i * 2 * PI) / n;
        mesh.vertices.push({ x: r * cos(a), y: r * sin(a), z });
      }
    }
    for (let row = 0; row < profile.length - 1; row++) {
      for (let i = 0; i < n; i++) {
        const a = row * n + i, b = row * n + (i + 1) % n, c = a + n, d = b + n;
        mesh.triangles.push({ a, b: d, c: b }, { a, b: c, c: d });
      }
    }
    const top = mesh.vertices.length, bottom = top + 1, last = (profile.length - 1) * n;
    mesh.vertices.push({ x: 0, y: 0, z: tall }, { x: 0, y: 0, z: -CableClamp.screwLength });
    for (let i = 0; i < n; i++) {
      mesh.triangles.push({ a: top, b: i, c: (i + 1) % n });
      mesh.triangles.push({ a: bottom, b: last + (i + 1) % n, c: last + i });
    }
    return mesh;
  },
  /** Printed as it lies in the lamp, ribs up. */
  anvil(p: CloudParameters): BalloonMesh {
    const c = new CableClamp(p);
    const mesh = CableClampGenerator.seatedAnvil(c);
    const middle = (c.anvilStart + c.anvilEnd) / 2;
    mesh.vertices = mesh.vertices.map((v) => ({ x: v.x - middle, y: v.y, z: v.z }));
    return mesh;
  },
  /** Printed on its side: X across the cable, Y along the lamp's depth, Z along the cable. */
  bar(p: CloudParameters): BalloonMesh {
    const c = new CableClamp(p);
    const mesh = CableClampGenerator.seatedBar(c);
    mesh.vertices = mesh.vertices.map((v) => ({ x: v.y, y: v.z - barMiddle(c), z: v.x }));
    return mesh;
  },
  /** From the print orientation to the clamp's place in the back. */
  placedAnvil(mesh: BalloonMesh, p: CloudParameters, lifted = 0): BalloonMesh {
    const c = new CableClamp(p), middle = (c.anvilStart + c.anvilEnd) / 2;
    return new BalloonMesh(
      mesh.vertices.map((v) => c.outlet.point3(c.start + v.x + middle, v.y, CloudConstants.floor + v.z + lifted)),
      mesh.triangles,
      mesh.maxOverhang,
      mesh.innerVertexRange,
    );
  },
  placedBar(mesh: BalloonMesh, p: CloudParameters, lifted = 0): BalloonMesh {
    const c = new CableClamp(p), middle = barMiddle(c);
    return new BalloonMesh(
      mesh.vertices.map((v) => c.outlet.point3(c.start + v.z, v.x, c.postTop + v.y + middle + lifted)),
      mesh.triangles,
      mesh.maxOverhang,
      mesh.innerVertexRange,
    );
  },
  placedScrews(p: CloudParameters, lifted = 0): BalloonMesh {
    const c = new CableClamp(p), screw = CableClampGenerator.screw();
    const placed = new BalloonMesh([], [], 0);
    for (const side of [-1.0, 1]) {
      const offset = placed.vertices.length;
      for (const v of screw.vertices) placed.vertices.push(c.outlet.point3(c.screwT + v.x, side * c.screwH + v.y, c.postTop + CableClamp.bar + v.z + lifted));
      for (const t of screw.triangles) placed.triangles.push({ a: t.a + offset, b: t.b + offset, c: t.c + offset });
    }
    return placed;
  },
  /** Both printed parts side by side, as they lie on the bed. */
  printView(bar: BalloonMesh, anvil: BalloonMesh): BalloonMesh {
    const view = new BalloonMesh([], [...bar.triangles], bar.maxOverhang, bar.innerVertexRange);
    const shift = bar.dimensions.y / 2 + anvil.dimensions.x / 2 + 6, offset = bar.vertices.length;
    view.vertices = bar.vertices.map((v) => ({ x: v.x, y: v.y + shift / 2, z: v.z }));
    for (const v of anvil.vertices) view.vertices.push({ x: v.y, y: -v.x - shift / 2, z: v.z });
    for (const t of anvil.triangles) view.triangles.push({ a: t.a + offset, b: t.b + offset, c: t.c + offset });
    return view;
  },
};
