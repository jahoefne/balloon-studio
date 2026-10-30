// Ported from mac/Sources/BalloonStudio/LampSurface.swift @ cbda68d.
//
// `LampSurface` and its title are LAMP_SURFACES and LAMP_SURFACE_TITLE in core/types.ts.
// `CloudGenerator.generate` calls `sculpt`. A change of a signature is a small PR of its own, with
// the K4 sessions told. See cloudGeometry.ts for the rule on module-level reads across this cluster.

import type { Quality } from '../api';
import { BalloonMesh } from '../geometry/mesh';
import { add, length, scale, sub, type Point3, type Triangle } from '../geometry/point3';
import { SurfaceQuery } from '../geometry/surfaceQuery';
import { atan2, hypot, pow } from '../swift/dmath';
import { arrayMax, swiftMax, swiftMin } from '../swift/minmax';
import { sortedDoubles } from '../swift/sort';
import type { CloudParameters } from '../types';
import { CloudConstants, CloudGenerator, lampProfile, verticalScale, type CloudProfile } from './cloudGeometry';
import { SunGeometry } from './sunGeometry';

// Outline chords run just inside the exact curve; the domes start there.
const RIM = 0.15;
// 0.5 is an ellipsoid, flat on top. Higher values give a rounder crown
// and a tighter roll at the outline.
const CROWN = 0.7;
// Higher values keep a firmer crease where two domes meet.
const CREASE = 16.0;
// The cloud's base melts into its puffs without a line of its own.
const SOFT = 5.0;
// A sun's dome meets its rays in a line.
const SEAM = 24.0;

class Field {
  readonly p: CloudParameters;
  readonly profile: CloudProfile;
  readonly verticalScale: number;
  readonly lobeWeights: readonly number[];

  constructor(parameters: CloudParameters) {
    this.p = parameters;
    this.profile = lampProfile(this.p);
    this.verticalScale = verticalScale(this.p);
    // Lobes stand as tall as they are wide, like the puffs of a cloud.
    const largest = arrayMax(this.profile.lobes.map((lobe) => lobe[2])) ?? 1;
    this.lobeWeights = this.profile.lobes.map((lobe) => lobe[2] / largest);
  }

  /**
   * A sun, as unit height. Level lines of `star` are the outline
   * scaled towards the middle: every ray gets a ridge from its tip
   * inwards and every notch a valley, both fading towards the middle.
   */
  sun(x: number, y: number): number {
    const p = this.p, profile = this.profile;
    const w = p.width, rim = RIM, r = hypot(x, y), style = p.sunStyle;
    const star = (crown: number, roll: number, twist = 0, spread = 0): number => {
      if (!(r > 1e-9)) return 1;
      const angle = atan2(y, x) + twist;
      let radius = CloudGenerator.radius(angle, rim, w, 1, profile);
      if (spread > 0) {
        // A weighted mean over a small angle rounds ridge and
        // valley. Many steps, or each would leave a line.
        const table = SunGeometry.outline(style), steps = 16;
        let mean = 0.0;
        for (let step = -steps; step <= steps; step++) {
          mean += (steps + 1 - Math.abs(step)) * table.radius(angle + (step * spread) / steps);
        }
        radius += w * (mean / ((steps + 1) * (steps + 1)) - table.radius(angle));
      }
      return pow(1 - pow(swiftMin(1, r / radius), crown), roll);
    };
    // The dome stays small: surface depth is a fraction of the
    // width, and a wide dome of that height is a flat lens.
    const dome = (radius: number, roll: number): number => {
      const q = 1 - (r * r) / (radius * radius);
      return q > 0 ? pow(q, roll) : 0;
    };
    const join = (values: readonly number[]): number => {
      let total = 0;
      for (const value of values) total = total + pow(value, SEAM);
      return pow(total, 1 / SEAM);
    };
    switch (style) {
      case 'soft-star':
        return join([0.78 * star(2, 0.6), dome(0.21 * w, 0.5)]);
      case 'bold-eight':
        return join([0.7 * star(1.25, 0.75), dome(0.22 * w, 0.5)]);
      case 'pinwheel': {
        // Inside the notches the ridges turn, further towards the
        // middle. Out on the rays they are sharp lines along the
        // mesh. Where they turn they cross it, and are rounded, so
        // the shell below keeps its thickness.
        const turn = swiftMax(0, 1 - r / (profile.lobes[0]![2] * w - rim));
        return star(2, 0.6, 0.9 * turn * turn, 0.3 * turn);
      }
      case 'cones': {
        // The root of the product of the clearances to both flanks
        // is half a cone, with its point at the tip of the ray.
        const radius = 0.215 * w;
        const rays = profile.polygons.map((polygon) => {
          const a = polygon.planes[0]!, b = polygon.planes[2]!, tip = polygon.points[0]!;
          const t = { x: tip.x / SunGeometry.tipRadius, y: tip.y / SunGeometry.tipRadius };
          // Beyond the middle the wedge between the flanks belongs to other rays.
          if (!(t.x * x + t.y * y > 0)) return 0;
          const first = a.offset * w - rim - a.x * x - a.y * y, second = b.offset * w - rim - b.x * x - b.y * y;
          if (!(first > 0 && second > 0)) return 0;
          const atDome = (a.offset * w - rim - (a.x * t.x + a.y * t.y) * radius) * (b.offset * w - rim - (b.x * t.x + b.y * t.y) * radius);
          return 0.48 * Math.sqrt((first * second) / atDome);
        });
        return join([...rays, dome(radius, 0.5)]);
      }
    }
  }

  /** Unit height: 0 on the outline, about 1 on the tallest dome. */
  value(point: Point3): number {
    const p = this.p, profile = this.profile;
    const x = point.x, y = point.y / this.verticalScale, w = p.width, rim = RIM;
    if (p.kind === 'sun') return this.sun(x, y);
    let sum = 0.0, base = 0.0;
    // An order-independent smooth maximum. Outside its footprint a
    // dome contributes nothing, so the outline itself stays at zero.
    const lobes = profile.lobes;
    for (let index = 0; index < lobes.length; index++) {
      const lobe = lobes[index]!;
      const r = lobe[2] * w - rim;
      if (!(r > 0)) continue;
      // SWIFT-DIFF: pow(d, 2) is d*d (plan §3); LLVM folds Swift's own pow(d, 2.0) to the same.
      const dx = x - lobe[0] * w, dy = y - lobe[1] * w;
      const weight = this.lobeWeights[index]!, q = 1 - (dx * dx + dy * dy) / (r * r);
      if (q > 0 && weight > 0) sum += pow(weight * pow(q, CROWN), CREASE);
    }
    if (p.kind === 'cloud') {
      // A long roll along the flat base, ending inside the outer lobes.
      // The large lobes cover its crown; its lower flank shows.
      const body = profile.body;
      const rx = ((body.x1 - body.x0) * w) / 2 - rim, ry = ((body.y1 - body.y0) * w) / 2 - rim;
      if (rx > 0 && ry > 0) {
        const sx = (x - ((body.x0 + body.x1) * w) / 2) / rx, sy = (y - ((body.y0 + body.y1) * w) / 2) / ry;
        if (Math.abs(sx) < 1 && Math.abs(sy) < 1) {
          base = 0.65 * pow((1 - pow(Math.abs(sx), 2.5)) * (1 - sy * sy), CROWN);
        }
      }
    }
    return pow(pow(sum, SOFT / CREASE) + pow(base, SOFT), 1 / SOFT);
  }
}

// Swift `enum Face: UInt8 { case other, outer, ceiling }`
const OTHER = 0, OUTER = 1, CEILING = 2;

/**
 * The visible face, and the cavity ceiling inside the skirt. The seating
 * ledge shares the ceiling's plane but is separated from it by the skirt.
 */
const classify = (mesh: BalloonMesh, thickness: number): number[] => {
  const vertices = mesh.vertices;
  const level = (t: Triangle, z: number): boolean =>
    Math.abs(vertices[t.a]!.z - z) < 1e-9 && Math.abs(vertices[t.b]!.z - z) < 1e-9 && Math.abs(vertices[t.c]!.z - z) < 1e-9;
  const parents = new Int32Array(vertices.length);
  for (let i = 0; i < parents.length; i++) parents[i] = i;
  const root = (value: number): number => {
    let i = value;
    while (parents[i] !== i) {
      parents[i] = parents[parents[i]!]!;
      i = parents[i]!;
    }
    return i;
  };
  let center = -1;
  for (const t of mesh.triangles) {
    if (!level(t, thickness)) continue;
    parents[root(t.b)] = root(t.a);
    parents[root(t.c)] = root(t.a);
    for (const i of [t.a, t.b, t.c]) {
      const v = vertices[i]!;
      if (center < 0 || hypot(vertices[center]!.x, vertices[center]!.y) > hypot(v.x, v.y)) center = i;
    }
  }
  const cavity = center < 0 ? -1 : root(center);
  return mesh.triangles.map((t) => {
    if (level(t, 0)) return OUTER;
    return level(t, thickness) && root(t.a) === cavity ? CEILING : OTHER;
  });
};

// SWIFT-DIFF: `Edge` is the number a*2^26+b with a < b, not a struct: the order of two keys is
// Swift's sort of :254 (`a`, then `b`), and 2^26 vertices are far beyond what a front reaches.
const EDGE_BASE = 67108864;
const edgeKey = (x: number, y: number): number => (x < y ? x * EDGE_BASE + y : y * EDGE_BASE + x);

/**
 * Share midpoints across both neighboring triangles, preserving the exact
 * existing perimeter chords and clip geometry when refining the face.
 * Returns the faces of the refined `mesh`.
 */
const refine = (mesh: BalloonMesh, input: number[], field: Field, spacing: number, deviation: number, shortest: number): number[] => {
  let faces = input;
  const vertices = mesh.vertices;
  const depth = field.p.surfaceDepth;
  const heights = vertices.map((v) => depth * field.value(v));
  // A triangle that is fine enough stays so until a neighbor splits it.
  let settled = faces.map((face) => face === OTHER);
  for (;;) {
    const marked = new Set<number>();
    const triangleCount = mesh.triangles.length;
    for (let index = 0; index < triangleCount; index++) {
      if (settled[index]) continue;
      const t = mesh.triangles[index]!;
      const ids = [t.a, t.b, t.c] as const;
      const lengths = [
        length(sub(vertices[ids[0]]!, vertices[ids[1]]!)),
        length(sub(vertices[ids[1]]!, vertices[ids[2]]!)),
        length(sub(vertices[ids[2]]!, vertices[ids[0]]!)),
      ] as const;
      // Swift `(0..<3).max { lengths[$0] < lengths[$1] }`: the first of equals.
      let longest = 0;
      if (lengths[longest]! < lengths[1]) longest = 1;
      if (lengths[longest]! < lengths[2]) longest = 2;
      // Measure across the surface: a dome leaves the outline
      // steeply, where a vertical tolerance would never be met.
      let needsDetail = lengths[longest]! > spacing;
      if (!needsDetail && lengths[longest]! > shortest) {
        for (let j = 0; j < 3 && !needsDetail; j++) {
          const a = ids[j]!, b = ids[(j + 1) % 3]!, midpoint = scale(add(vertices[a]!, vertices[b]!), 0.5);
          const slope = (heights[a]! - heights[b]!) / swiftMax(lengths[j]!, 1e-9);
          needsDetail = lengths[j]! > shortest
            && Math.abs(depth * field.value(midpoint) - (heights[a]! + heights[b]!) * 0.5) > deviation * Math.sqrt(1 + slope * slope);
        }
      }
      if (needsDetail) {
        // Bisect the longest edge even when curvature was detected
        // on a shorter one, preventing repeated sliver refinement.
        marked.add(edgeKey(ids[longest]!, ids[(longest + 1) % 3]!));
      } else settled[index] = true;
    }
    if (marked.size === 0) break;
    const mids = new Map<number, number>();
    for (const key of sortedDoubles(Array.from(marked))) {
      mids.set(key, vertices.length);
      const a = Math.floor(key / EDGE_BASE), b = key - a * EDGE_BASE;
      const point = scale(add(vertices[a]!, vertices[b]!), 0.5);
      vertices.push(point);
      heights.push(depth * field.value(point));
    }
    const triangles: Triangle[] = [], kinds: number[] = [], done: boolean[] = [];
    for (let index = 0; index < triangleCount; index++) {
      const t = mesh.triangles[index]!;
      const face = faces[index]!;
      const push = (a: number, b: number, c: number): void => {
        triangles.push({ a, b, c });
        kinds.push(face);
        done.push(face === OTHER);
      };
      const v = [t.a, t.b, t.c] as const;
      const m = [mids.get(edgeKey(v[0], v[1])), mids.get(edgeKey(v[1], v[2])), mids.get(edgeKey(v[2], v[0]))] as const;
      const count = (m[0] === undefined ? 0 : 1) + (m[1] === undefined ? 0 : 1) + (m[2] === undefined ? 0 : 1);
      if (count === 0) {
        triangles.push(t);
        kinds.push(face);
        done.push(settled[index]!);
      } else if (count === 3) {
        push(v[0], m[0]!, m[2]!);
        push(m[0]!, v[1], m[1]!);
        push(m[2]!, m[1]!, v[2]);
        push(m[0]!, m[1]!, m[2]!);
      } else if (count === 1) {
        const i = m[0] !== undefined ? 0 : m[1] !== undefined ? 1 : 2;
        push(v[i]!, m[i]!, v[(i + 2) % 3]!);
        push(m[i]!, v[(i + 1) % 3]!, v[(i + 2) % 3]!);
      } else {
        const i = m[0] !== undefined && m[2] !== undefined ? 0 : m[1] !== undefined && m[0] !== undefined ? 1 : 2;
        const a = v[i]!, b = v[(i + 1) % 3]!, c = v[(i + 2) % 3]!, ab = m[i]!, ca = m[(i + 2) % 3]!;
        push(a, ab, ca);
        // Use the shorter diagonal. A fixed diagonal can keep
        // producing long slivers across a ray's curved shoulder.
        if (length(sub(vertices[ab]!, vertices[c]!)) <= length(sub(vertices[b]!, vertices[ca]!))) {
          push(ab, b, c);
          push(ab, c, ca);
        } else {
          push(ab, b, ca);
          push(b, c, ca);
        }
      }
    }
    mesh.triangles = triangles;
    faces = kinds;
    settled = done;
  }
  return faces;
};

/**
 * Shapes the diffuser only. Each part of the silhouette is inflated into a
 * dome that leaves the side wall at the outline, so the front is a rounded
 * body rather than a relief on a plate. A sun's rays rise from their tips
 * towards a dome in the middle. The rim over the seating face is solid;
 * inside the skirt the shell follows the outside.
 */
export const LampSurfaceGenerator = {
  height(point: Point3, p: CloudParameters): number {
    return p.surface === 'sculpted' ? p.surfaceDepth * new Field(p).value(point) : 0;
  },
  /**
   * Input has its original face at Z=0, skirt pointing up, and assembly XY.
   * Output rests on its skirt tips with the sculpted face pointing up.
   */
  sculpt(input: BalloonMesh, p: CloudParameters, quality: Quality): BalloonMesh {
    // Swift `var mesh = input`: a value copy. No vertex is written in place below.
    const mesh = new BalloonMesh([...input.vertices], input.triangles, input.maxOverhang, input.innerVertexRange);
    const thickness = p.diffuserThickness, field = new Field(p), exported = quality === 'export';
    const faces = refine(mesh, classify(mesh, thickness), field,
      swiftMax(exported ? 3 : 5, p.width / (exported ? 75 : 45)),
      exported ? 0.02 : 0.06, exported ? 0.4 : 0.8);
    const original = [...mesh.vertices];
    const count = original.length;
    const outer = new Uint8Array(count), ceiling = new Uint8Array(count), edge = new Uint8Array(count);
    mesh.triangles.forEach((t, index) => {
      const flags = faces[index] === OUTER ? outer : faces[index] === CEILING ? ceiling : edge;
      flags[t.a] = 1;
      flags[t.b] = 1;
      flags[t.c] = 1;
    });
    // The outline stays in the seating plane, on the back's side wall.
    const heights = original.map((v, i) => (outer[i] && !edge[i] ? field.value(v) : 0));
    // Include the requested peak exactly at either tessellation resolution.
    const peak = arrayMax(heights) ?? 0;
    const factor = peak > 0 ? p.surfaceDepth / peak : 0;
    for (let i = 0; i < count; i++) {
      if (!outer[i]) continue;
      heights[i] = heights[i]! * factor;
      const v = mesh.vertices[i]!;
      mesh.vertices[i] = { x: v.x, y: v.y, z: -heights[i]! };
    }
    const outerFaces = mesh.triangles.filter((_, index) => faces[index] === OUTER);
    const outside = new SurfaceQuery(mesh.vertices, outerFaces);
    for (let i = 0; i < count; i++) {
      if (!ceiling[i]) continue;
      const v = original[i]!;
      const h = field.value(v) * factor;
      if (!(h > 1e-9)) continue;
      // Offset against actual outer triangles, not a vertically shifted
      // copy, which would become thin on slopes. The small allowance
      // protects the material between sample vertices. Never intrude
      // into the original LED cavity or alter the seating plane.
      const target = thickness + swiftMin(0.04, h * 0.1);
      let low = thickness - h, high = thickness;
      for (let step = 0; step < 14; step++) {
        const z = (low + high) / 2;
        if (outside.isCloserXYZ(target, v.x, v.y, z)) low = z;
        else high = z;
      }
      mesh.vertices[i] = { x: v.x, y: v.y, z: high };
    }
    // STL stores floats; calculate normals from those same coordinates so
    // very narrow triangles have consistent normals after serialization.
    mesh.vertices = mesh.vertices.map((v) => ({
      x: Math.fround(v.x),
      y: Math.fround(v.y),
      z: Math.fround(thickness + CloudConstants.skirt - v.z),
    }));
    mesh.triangles = mesh.triangles.map((t) => ({ a: t.a, b: t.c, c: t.b }));
    return mesh;
  },
};
