// Ported from mac/Sources/BalloonStudio/RingGeometry.swift @ 04553ee
// (RingParameters :3-112, RingGenerator :114-214).
//
// SWIFT-DIFF: RingParameters is the plain data interface of core/types.ts (the frozen contract), so
// its computed properties are free functions of the parameters, with the Swift names.
//
// SWIFT-DIFF: the section at the end ports StringHoles.patch, punch and compact
// (mac/Sources/BalloonStudio/StringHoles.swift:10-19, 55-77, 106-117). That file belongs to WP-K2
// (core/balloon/stringHoles.ts), which had not landed when this was written; switch the import once
// it is on main. Nothing here depends on the rest of StringHoles.
import type { RingDerived } from '../api';
import { BalloonMesh } from '../geometry/mesh';
import type { Point3, Triangle } from '../geometry/point3';
import type { Range, RingParameters } from '../types';
import { atan, atan2, cos, hypot, PI, sin } from '../swift/dmath';
import { formatG } from '../swift/format';
import { encodeJSONCompact } from '../swift/json';
import { swiftMax, swiftMin } from '../swift/minmax';
import { intTrunc, truncatingRemainder } from '../swift/rounding';
import { sortDoubles, sortedDoubles } from '../swift/sort';

/** Swift `BalloonGenerator.Quality`. */
export type RingQuality = 'preview' | 'export';

/** `RingParameters()`. */
export const RING_DEFAULTS: Readonly<RingParameters> = Object.freeze({
  diameter: 240,
  bandWidth: 18,
  height: 6,
  cordClearance: 3,
  ledClearance: 0.4,
  channelDepth: 1.5,
  segmented: false,
  jointFit: 0.3,
  reflectedLED: false,
  stripWidth: 3.5,
  stripThickness: 3,
});

/** The Swift memberwise initializer: every parameter left out takes its default. */
export function ringParameters(values: Partial<RingParameters> = {}): RingParameters {
  return { ...RING_DEFAULTS, ...values };
}

/** `RingParameters.large`. */
export const RING_LARGE: Readonly<RingParameters> = Object.freeze(
  ringParameters({ diameter: 450, bandWidth: 40, height: 12, cordClearance: 6, ledClearance: 0.5, segmented: true, reflectedLED: true, stripWidth: 8 }),
);
/** `RingParameters.solid`. */
export const RING_SOLID: Readonly<RingParameters> = Object.freeze({ ...RING_LARGE, segmented: false });

const closedRange = (lower: number, upper: number): Range => ({ lower, upper });

export function diameterRange(p: RingParameters): Range {
  return p.segmented ? closedRange(300, 600) : closedRange(140, 600);
}
export function heightRange(p: RingParameters): Range {
  return p.segmented || p.reflectedLED ? closedRange(8, 16) : closedRange(4, 10);
}
export function cordRange(p: RingParameters): Range {
  return p.segmented || p.reflectedLED ? closedRange(4, 8) : closedRange(2, 5);
}
export function maximumBandWidth(p: RingParameters): number {
  return p.reflectedLED ? 60 : p.segmented ? 36 : 28;
}
export function continuousCords(p: RingParameters): boolean {
  return p.segmented;
}
export function fitsP2S(p: RingParameters): boolean {
  return p.diameter + 16 <= 256 && totalHeight(p) <= 256;
}

export const OUTER_LIP = 2.0;
export function channelWidth(p: RingParameters): number {
  return p.stripWidth + p.ledClearance;
}
export function minimumBandWidth(p: RingParameters): number {
  if (p.reflectedLED) return Math.ceil(p.diameter / 2 - flangeOuterRadius(p) + 4 + Math.sqrt(2) * (p.cordClearance + 1.6));
  return p.segmented
    ? swiftMax(24, Math.ceil(channelWidth(p) + 6 + Math.sqrt(2) * (p.cordClearance + 1.6)))
    : Math.ceil(channelWidth(p) + 6 + Math.sqrt(2) * p.cordClearance);
}
export function maximumChannelDepth(p: RingParameters): number {
  return swiftMin(3, p.height - 3);
}
export function innerRadius(p: RingParameters): number {
  return p.diameter / 2 - p.bandWidth;
}
export function channelOuterRadius(p: RingParameters): number {
  return p.diameter / 2 - OUTER_LIP;
}
export function channelInnerRadius(p: RingParameters): number {
  return channelOuterRadius(p) - channelWidth(p);
}
export function flangeOuterRadius(p: RingParameters): number {
  return p.reflectedLED ? reflectorInnerRadius(p) - 2 : channelInnerRadius(p);
}
export function holeRadius(p: RingParameters): number {
  return (innerRadius(p) + flangeOuterRadius(p)) / 2;
}
export function channelRadius(p: RingParameters): number {
  return (channelInnerRadius(p) + channelOuterRadius(p)) / 2;
}
export function stripPathLength(p: RingParameters): number {
  return 2 * PI * (p.reflectedLED ? ledWallRadius(p) : channelRadius(p));
}
export function balloonSpacing(p: RingParameters): number {
  return Math.sqrt(3) * holeRadius(p);
}
export function floorThickness(p: RingParameters): number {
  return p.height - p.channelDepth;
}
// The LED backing follows a vertical cylinder. The 45° ramp faces it across
// a clear floor; neither the ramp nor the mounting ledge intersects a bore.
export function ledWallRadius(p: RingParameters): number {
  return p.diameter / 2 - 2.4;
}
export function ledShelfZ(p: RingParameters): number {
  return p.height + 1;
}
export function ledShelfRadius(p: RingParameters): number {
  return ledWallRadius(p) - p.stripThickness - 0.5;
}
export function reflectorRise(p: RingParameters): number {
  return channelWidth(p) + 2;
}
export function reflectorToeRadius(p: RingParameters): number {
  return ledWallRadius(p) - p.stripThickness - 2;
}
export function reflectorInnerRadius(p: RingParameters): number {
  return reflectorToeRadius(p) - reflectorRise(p);
}
export function totalHeight(p: RingParameters): number {
  return p.height + (p.reflectedLED ? reflectorRise(p) : 0);
}
export function outerProfile(p: RingParameters): { radius: number; z: number }[] {
  const point = (radius: number, z: number) => ({ radius, z });
  if (p.reflectedLED) {
    return [
      point(flangeOuterRadius(p), 0), point(p.diameter / 2, 0), point(p.diameter / 2, totalHeight(p)),
      point(ledWallRadius(p), totalHeight(p)), point(ledWallRadius(p), ledShelfZ(p) + channelWidth(p)),
      point(ledWallRadius(p), ledShelfZ(p)), point(ledShelfRadius(p), ledShelfZ(p)), point(ledShelfRadius(p), p.height),
      point(reflectorToeRadius(p), p.height), point(reflectorInnerRadius(p), totalHeight(p)),
      point(flangeOuterRadius(p), totalHeight(p)), point(flangeOuterRadius(p), p.height),
    ];
  }
  return [
    point(flangeOuterRadius(p), 0), point(p.diameter / 2, 0), point(p.diameter / 2, p.height), point(channelOuterRadius(p), p.height),
    point(channelOuterRadius(p), floorThickness(p)), point(channelInnerRadius(p), floorThickness(p)), point(flangeOuterRadius(p), p.height),
  ];
}
export function filename(p: RingParameters): string {
  if (p.reflectedLED) return `Mobile-Ring-${intTrunc(p.diameter)}mm-${formatG(p.stripWidth)}mm-uplight-${p.segmented ? 'kit.zip' : 'solid.stl'}`;
  return p.segmented ? `Mobile-Ring-${intTrunc(p.diameter)}mm-6-section-kit.zip` : `Mobile-Ring-${intTrunc(p.diameter)}mm-3-balloons.stl`;
}

/** `input.normalized()`. */
export function normalized(input: RingParameters): RingParameters {
  const p: RingParameters = { ...input };
  const clamp = (value: number, low: number, high: number, fallback: number): number =>
    swiftMax(low, swiftMin(high, Number.isFinite(value) ? value : fallback));
  p.stripWidth = clamp(input.stripWidth, 3.5, 12, p.reflectedLED ? 8 : 3.5);
  p.stripThickness = clamp(input.stripThickness, 1, 6, 3);
  p.diameter = clamp(input.diameter, diameterRange(p).lower, diameterRange(p).upper, input.segmented ? 450 : 240);
  p.height = clamp(input.height, heightRange(p).lower, heightRange(p).upper, p.segmented || p.reflectedLED ? 12 : 6);
  p.cordClearance = clamp(input.cordClearance, cordRange(p).lower, cordRange(p).upper, p.segmented || p.reflectedLED ? 6 : 3);
  p.ledClearance = clamp(input.ledClearance, 0.2, 1, 0.4);
  p.bandWidth = clamp(input.bandWidth, minimumBandWidth(p), maximumBandWidth(p), p.reflectedLED ? 40 : input.segmented ? 24 : 18);
  p.channelDepth = clamp(input.channelDepth, 0.6, maximumChannelDepth(p), 1.5);
  p.jointFit = clamp(input.jointFit, 0.2, 0.6, 0.3);
  return p;
}

/** `p.ledFaces(in: mesh)`: 1 for a face on the LED mounting surface, otherwise 0. */
export function ledFaces(p: RingParameters, mesh: BalloonMesh): number[] {
  const wall = ledWallRadius(p);
  const shelf = ledShelfZ(p);
  const width = channelWidth(p);
  const floor = floorThickness(p);
  const onMount = (index: number): boolean => {
    const v = mesh.vertices[index] as Point3;
    return p.reflectedLED
      ? Math.abs(hypot(v.x, v.y) - wall) < 1e-7 && v.z >= shelf - 1e-7 && v.z <= shelf + width + 1e-7
      : Math.abs(v.z - floor) < 1e-7;
  };
  return mesh.triangles.map((t) => (onMount(t.a) && onMount(t.b) && onMount(t.c) ? 1 : 0));
}

/** The Swift `CodingKeys` in declaration order; `JSONEncoder` writes exactly these. */
const CODING_KEYS = ['diameter', 'bandWidth', 'height', 'cordClearance', 'ledClearance', 'channelDepth', 'segmented', 'jointFit', 'reflectedLED', 'stripWidth', 'stripThickness'] as const;

/** `StableJSON.encode(p)` (JSONEncoder with `.sortedKeys`). Throws on a non-finite value, as Swift does. */
export function encodeRingParameters(p: RingParameters): string {
  const object: Record<string, number | boolean> = {};
  for (const key of CODING_KEYS) object[key] = p[key];
  return encodeJSONCompact(object);
}

/**
 * `init(from: decoder)` on an already parsed JSON value (:97-111): `decodeIfPresent ?? default`, where
 * absent and null are nil and a wrong type throws. JSONDecoder also rejects number literals that do
 * not fit a Double (`1e999`), which JSON.parse turned into Infinity.
 */
export function decodeRingParameters(value: unknown): RingParameters {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('RingParameters: expected a keyed container');
  const c = value as Readonly<Record<string, unknown>>;
  const present = (key: string): unknown => (Object.prototype.hasOwnProperty.call(c, key) ? c[key] : undefined);
  const double = (key: string, fallback: number): number => {
    const v = present(key);
    if (v === undefined || v === null) return fallback;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`RingParameters.${key}: expected Double`);
    return v;
  };
  const bool = (key: string, fallback: boolean): boolean => {
    const v = present(key);
    if (v === undefined || v === null) return fallback;
    if (typeof v !== 'boolean') throw new TypeError(`RingParameters.${key}: expected Bool`);
    return v;
  };
  return {
    diameter: double('diameter', RING_DEFAULTS.diameter),
    bandWidth: double('bandWidth', RING_DEFAULTS.bandWidth),
    height: double('height', RING_DEFAULTS.height),
    cordClearance: double('cordClearance', RING_DEFAULTS.cordClearance),
    ledClearance: double('ledClearance', RING_DEFAULTS.ledClearance),
    channelDepth: double('channelDepth', RING_DEFAULTS.channelDepth),
    segmented: bool('segmented', false),
    jointFit: double('jointFit', 0.3),
    reflectedLED: bool('reflectedLED', false),
    stripWidth: double('stripWidth', 3.5),
    stripThickness: double('stripThickness', 3),
  };
}

/** The computed properties of RingParameters as the core contract's `RingDerived`. */
export function ringDerived(p: RingParameters): RingDerived {
  return {
    diameterRange: diameterRange(p),
    heightRange: heightRange(p),
    cordRange: cordRange(p),
    maximumBandWidth: maximumBandWidth(p),
    continuousCords: continuousCords(p),
    fitsP2S: fitsP2S(p),
    channelWidth: channelWidth(p),
    minimumBandWidth: minimumBandWidth(p),
    maximumChannelDepth: maximumChannelDepth(p),
    innerRadius: innerRadius(p),
    channelOuterRadius: channelOuterRadius(p),
    channelInnerRadius: channelInnerRadius(p),
    flangeOuterRadius: flangeOuterRadius(p),
    holeRadius: holeRadius(p),
    channelRadius: channelRadius(p),
    stripPathLength: stripPathLength(p),
    balloonSpacing: balloonSpacing(p),
    floorThickness: floorThickness(p),
    ledWallRadius: ledWallRadius(p),
    ledShelfZ: ledShelfZ(p),
    ledShelfRadius: ledShelfRadius(p),
    reflectorRise: reflectorRise(p),
    reflectorToeRadius: reflectorToeRadius(p),
    reflectorInnerRadius: reflectorInnerRadius(p),
    totalHeight: totalHeight(p),
    outerProfile: outerProfile(p),
    filename: filename(p),
  };
}

export const RingGenerator = {
  /**
   * A continuous annular solid with six alternating attachment holes:
   * suspension at 0°/120°/240°, balloons at 60°/180°/300°.
   * Uplight holes have bevelled entries on both sides.
   */
  generate(input: RingParameters, quality: RingQuality = 'preview'): BalloonMesh {
    const p = normalized(input);
    const tau = 2 * PI;
    const bevel = p.reflectedLED ? 0.8 : 0;
    const half = (p.cordClearance + 2 * bevel) / Math.sqrt(2);
    const span = atan(half / holeRadius(p));
    const holeCount = 6;
    const centers: number[] = [];
    for (let i = 0; i < holeCount; i++) centers.push((i * tau) / holeCount);
    const wrapped = (angle: number): number => truncatingRemainder(angle + tau, tau);
    const distance = (a: number, b: number): number => Math.abs(atan2(sin(a - b), cos(a - b)));
    const samples = quality === 'export' ? 720 : 360;
    const uniform: number[] = [];
    for (let i = 0; i < samples; i++) uniform.push((tau * i) / samples);
    const angles = uniform.filter((angle) => !centers.some((center) => distance(angle, center) < span + 1e-8));
    for (const center of centers) angles.push(wrapped(center - span), center, wrapped(center + span));
    sortDoubles(angles);
    // Keep circular boundaries finely sampled even beside the broad bore
    // patches. Small rings otherwise develop flat spots in the LED wall.
    const denseAngles: number[] = [];
    for (const angle of sortedDoubles(angles.concat(uniform))) {
      const last = denseAngles[denseAngles.length - 1];
      if (last === undefined || angle - last > 1e-9) denseAngles.push(angle);
    }
    const columns = angles.length;
    const holeColumns = centers.map((center) => {
      const column = angles.findIndex((angle) => Math.abs(angle - center) < 1e-8);
      if (column < 0) throw new RangeError('Ring hole centre is missing from the sampled angles');
      return column;
    });
    const sideColumns = new Set<number>();
    for (const column of holeColumns) {
      sideColumns.add((column + columns - 1) % columns);
      sideColumns.add((column + 1) % columns);
    }
    const radii = [innerRadius(p), holeRadius(p) - half, holeRadius(p), holeRadius(p) + half, flangeOuterRadius(p)];
    const vertices: Point3[] = [];
    const triangles: Triangle[] = [];
    const loopAngles = new Map<number, number[]>();
    const ring = (radius: number, z: number, straightenHole = false, dense = false): number[] => {
      const thetas = dense ? denseAngles : angles;
      const indices = thetas.map((theta, column) => {
        // Put the left/right diamond corners on a straight tangent,
        // so the requested inscribed clearance is exact, not a chord.
        const r = straightenHole && sideColumns.has(column) ? radius / cos(span) : radius;
        const index = vertices.length;
        vertices.push({ x: r * cos(theta), y: r * sin(theta), z });
        return index;
      });
      loopAngles.set(indices[0] as number, thetas);
      return indices;
    };
    const bottom = radii.map((radius, offset) => ring(radius, 0, offset === 2, p.reflectedLED && (offset === 0 || offset === 4)));
    const top = radii.map((radius, offset) => ring(radius, p.height, offset === 2, p.reflectedLED && (offset === 0 || offset === 4)));
    const join = (a: number[], b: number[], reversed = false): void => {
      const aa = loopAngles.get(a[0] as number) as number[];
      const ba = loopAngles.get(b[0] as number) as number[];
      let i = 0;
      let j = 0;
      const face = (x: number, y: number, z: number): void => {
        triangles.push({ a: x, b: reversed ? z : y, c: reversed ? y : z });
      };
      while (i < a.length || j < b.length) {
        const nextA = i < a.length ? (i + 1 < a.length ? (aa[i + 1] as number) : tau) : Infinity;
        const nextB = j < b.length ? (j + 1 < b.length ? (ba[j + 1] as number) : tau) : Infinity;
        const ai = a[i % a.length] as number;
        const bj = b[j % b.length] as number;
        if (Math.abs(nextA - nextB) < 1e-9) {
          const ak = a[(i + 1) % a.length] as number;
          const bk = b[(j + 1) % b.length] as number;
          face(ai, ak, bk);
          face(ai, bk, bj);
          i += 1;
          j += 1;
        } else if (nextA < nextB) {
          face(ai, a[(i + 1) % a.length] as number, bj);
          i += 1;
        } else {
          face(ai, b[(j + 1) % b.length] as number, bj);
          j += 1;
        }
      }
    };
    for (let row = 0; row < radii.length - 1; row++) {
      join(bottom[row] as number[], bottom[row + 1] as number[]);
      join(top[row] as number[], top[row + 1] as number[], true);
    }
    join(top[0] as number[], bottom[0] as number[]);
    // Trace the rest of the cross section around the outer rim and back
    // through the recessed channel; share its seams with the inner flange.
    const profile: number[][] = [
      bottom[bottom.length - 1] as number[],
      ...outerProfile(p).slice(1, -1).map((point) => ring(point.radius, point.z, false, p.reflectedLED)),
      top[top.length - 1] as number[],
    ];
    for (let row = 0; row < profile.length - 1; row++) join(profile[row] as number[], profile[row + 1] as number[]);
    const mesh = new BalloonMesh(vertices, triangles, 0);
    const pairs = holeColumns.map((column): [Patch, Patch] => [
      StringHoles.patch(2, column, columns, (r, c) => (bottom[r] as number[])[c] as number),
      StringHoles.patch(2, column, columns, (r, c) => (top[r] as number[])[c] as number),
    ]);
    if (bevel === 0) StringHoles.punch(mesh, pairs);
    else {
      for (const [lower, upper] of pairs) {
        mesh.triangles = mesh.triangles.filter(
          (t) => !(t.a === lower.center || t.b === lower.center || t.c === lower.center || t.a === upper.center || t.b === upper.center || t.c === upper.center),
        );
        mesh.triangles.push(
          { a: lower.bottomLeft, b: lower.bottom, c: lower.left },
          { a: lower.right, b: lower.topRight, c: lower.top },
          { a: upper.bottomLeft, b: upper.left, c: upper.bottom },
          { a: upper.right, b: upper.top, c: upper.topRight },
        );
        const center = mesh.vertices[lower.center] as Point3;
        const ratio = p.cordClearance / (p.cordClearance + 2 * bevel);
        const throat = (z: number): number[] =>
          patchLoop(lower).map((i) => {
            const v = mesh.vertices[i] as Point3;
            const index = mesh.vertices.length;
            mesh.vertices.push({ x: center.x + (v.x - center.x) * ratio, y: center.y + (v.y - center.y) * ratio, z });
            return index;
          });
        const loops = [patchLoop(lower), throat(bevel), throat(p.height - bevel), patchLoop(upper)];
        for (let level = 0; level < 3; level++) {
          for (let j = 0; j < 4; j++) {
            const k = (j + 1) % 4;
            const a = (loops[level] as number[])[j] as number;
            const b = (loops[level] as number[])[k] as number;
            const c = (loops[level + 1] as number[])[k] as number;
            const d = (loops[level + 1] as number[])[j] as number;
            mesh.triangles.push({ a, b, c }, { a, b: c, c: d });
          }
        }
      }
      StringHoles.compact(mesh);
    }
    return mesh;
  },
};

// StringHoles.swift (see SWIFT-DIFF at the top of the file).

export interface Patch {
  center: number;
  bottom: number;
  right: number;
  top: number;
  left: number;
  bottomLeft: number;
  topRight: number;
}

/** `patch.loop`. */
export function patchLoop(patch: Patch): number[] {
  return [patch.bottom, patch.right, patch.top, patch.left];
}

export const StringHoles = {
  patch(row: number, column: number, columns: number, index: (row: number, column: number) => number): Patch {
    const left = (column + columns - 1) % columns;
    const right = (column + 1) % columns;
    return {
      center: index(row, column),
      bottom: index(row - 1, column),
      right: index(row, right),
      top: index(row + 1, column),
      left: index(row, left),
      bottomLeft: index(row - 1, left),
      topRight: index(row + 1, right),
    };
  },
  punch(mesh: BalloonMesh, pairs: readonly (readonly [Patch, Patch])[]): void {
    const removed = new Set<number>();
    for (const [outer, inner] of pairs) {
      removed.add(outer.center);
      removed.add(inner.center);
    }
    mesh.triangles = mesh.triangles.filter((t) => !(removed.has(t.a) || removed.has(t.b) || removed.has(t.c)));
    for (const [outer, inner] of pairs) {
      mesh.triangles.push(
        { a: outer.bottomLeft, b: outer.bottom, c: outer.left },
        { a: outer.right, b: outer.topRight, c: outer.top },
        { a: inner.bottomLeft, b: inner.left, c: inner.bottom },
        { a: inner.right, b: inner.top, c: inner.topRight },
      );
      const outerLoop = patchLoop(outer);
      const innerLoop = patchLoop(inner);
      for (let j = 0; j < 4; j++) {
        const k = (j + 1) % 4;
        const a = outerLoop[j] as number;
        const b = outerLoop[k] as number;
        const c = innerLoop[k] as number;
        const d = innerLoop[j] as number;
        mesh.triangles.push({ a, b, c });
        mesh.triangles.push({ a, b: c, c: d });
      }
    }
    StringHoles.compact(mesh);
  },
  compact(mesh: BalloonMesh): void {
    const used = new Uint8Array(mesh.vertices.length);
    for (const t of mesh.triangles) {
      used[t.a] = 1;
      used[t.b] = 1;
      used[t.c] = 1;
    }
    const remap = new Int32Array(used.length);
    const vertices: Point3[] = [];
    for (let i = 0; i < used.length; i++) {
      if (used[i] === 1) {
        remap[i] = vertices.length;
        vertices.push(mesh.vertices[i] as Point3);
      }
    }
    const range = mesh.innerVertexRange;
    if (range !== undefined) {
      let first = -1;
      let last = -1;
      for (let i = range.lowerBound; i < range.upperBound; i++) {
        if (used[i] === 1) {
          if (first < 0) first = i;
          last = i;
        }
      }
      if (first >= 0) mesh.innerVertexRange = { lowerBound: remap[first] as number, upperBound: (remap[last] as number) + 1 };
    }
    mesh.triangles = mesh.triangles.map((t) => ({ a: remap[t.a] as number, b: remap[t.b] as number, c: remap[t.c] as number }));
    mesh.vertices = vertices;
  },
};
