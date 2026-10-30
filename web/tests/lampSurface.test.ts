// Ported from mac/Tests/LampSurfaceTests.swift @ cbda68d, without the files written to
// .build/test-output (:62-65, plan §8), and checked against mac/Probes/LampSurface (fixtures in
// fixtures/swift/lampSurface). The kits against the references are in lamp.reference.test.ts and
// lampSurface.reference.test.ts. Without FULL the sweep of kits runs one cloud and one sun, variants
// 0 and 1, at preview quality, with the cloud's variant 0 at export quality too (Swift's
// `surface-smoke` is the first of these).
import { describe, it } from 'vitest';
import type { Quality } from '../src/core/api';
import { BalloonMesh } from '../src/core/geometry/mesh';
import { add, cross, scale, sub, unit, type Point3, type Triangle } from '../src/core/geometry/point3';
import { SurfaceQuery } from '../src/core/geometry/surfaceQuery';
import { binarySTL } from '../src/core/io/binaryStl';
import {
  CloudConstants,
  CloudGenerator,
  cloudParameters,
  cloudParametersCodec,
  displayName,
  filename,
  height as lampHeight,
  lampProfile,
  maximumSurfaceDepth,
  minimumWidth,
  normalized,
  totalDepth,
  verticalScale,
} from '../src/core/lamp/cloudGeometry';
import { CloudKit } from '../src/core/lamp/cloudKit';
import { LampSurfaceGenerator } from '../src/core/lamp/lampSurface';
import { sunNotchAngles, sunNotchRadius, sunSector, wallLampDefaults } from '../src/core/lamp/sunGeometry';
import { atan2, cos, hypot, PI, sin } from '../src/core/swift/dmath';
import { arrayMax, arrayMin, swiftMin3 } from '../src/core/swift/minmax';
import { strideThrough } from '../src/core/swift/rounding';
import { check } from '../src/core/testing/check';
import { ray } from '../src/core/testing/ray';
import { parseSTL } from '../src/core/testing/stl';
import { CABLE_SIDES, CLOUD_STYLES, SUN_STYLES, WALL_LAMP_KINDS, type CloudParameters } from '../src/core/types';
import { decoded, roundTripped, sameParameters } from './support/lamp';
import { checkCloudFeatures } from './support/lampFeatures';
import { fixtureBytes, fixtureText } from './support/swiftProbe';
import { FULL, shardOf } from './support/tier';


// --- Against Swift: mac/Probes/LampSurface --------------------------------------------------------

/**
 * Largest relative difference of a field value from Swift's. The field is `pow` on `pow`, and
 * fdlibm's `pow` is not Apple's. Measured: 893 of 1259 raised values are the same Float64, the worst
 * is 115 ULP (2.4e-14 relative), and all are the same Float32.
 */
const FIELD_TOLERANCE = 5e-14;
/** Plan §14. */
const NORMAL_DOT = 1 - 1e-4;

interface Probe {
  fieldSets: { parameters: string; points: number }[];
  meshes: { name: string; parameters: string; quality: Quality; inputTriangles: number; triangles: number; vertices: number }[];
}
const probe = JSON.parse(fixtureText('swift/lampSurface/probe.json')) as Probe;

/** `fieldPoints` of the probe. */
const fieldPoints = (p: CloudParameters): Point3[] => {
  const points: Point3[] = [];
  const columns = 17, rows = 13;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = -0.54 + (1.08 * column) / (columns - 1), y = -0.54 + (1.08 * row) / (rows - 1);
      points.push({ x: x * p.width, y: y * p.width * verticalScale(p), z: 0 });
    }
  }
  points.push({ x: 0, y: 0, z: 0 }, { x: 1e-10, y: 0, z: 0 }, { x: p.width, y: p.width, z: 0 });
  return points;
};

type Outline = readonly (readonly [number, number])[];

/** `front` of the probe. */
const front = (outline: Outline, thickness: number, center: readonly [number, number], ledge: number, inner: number): BalloonMesh => {
  const skirt = thickness + CloudConstants.skirt;
  const rings = [[1, 0], [1, thickness], [ledge, thickness], [ledge, skirt], [inner, skirt], [inner, thickness]] as const;
  const count = outline.length;
  const vertices: Point3[] = [{ x: center[0], y: center[1], z: 0 }];
  for (const ring of rings) {
    for (const q of outline) vertices.push({ x: center[0] + (q[0] - center[0]) * ring[0], y: center[1] + (q[1] - center[1]) * ring[0], z: ring[1] });
  }
  vertices.push({ x: center[0], y: center[1], z: thickness });
  const last = vertices.length - 1;
  const at = (ring: number, i: number): number => 1 + ring * count + (i % count);
  const triangles: Triangle[] = [];
  for (let i = 0; i < count; i++) {
    triangles.push({ a: 0, b: at(0, i + 1), c: at(0, i) });
    for (let ring = 0; ring < rings.length - 1; ring++) {
      triangles.push({ a: at(ring, i), b: at(ring + 1, i + 1), c: at(ring + 1, i) });
      triangles.push({ a: at(ring, i), b: at(ring, i + 1), c: at(ring + 1, i + 1) });
    }
    triangles.push({ a: at(rings.length - 1, i), b: at(rings.length - 1, i + 1), c: last });
  }
  return new BalloonMesh(vertices, triangles, 0);
};

/** `meshCases` of the probe. */
const OCTAGON: Outline = [[-24, -6], [-6, -12], [6, -12], [24, -6], [24, 6], [6, 14], [-6, 14], [-24, 6]];
const PATCH: Outline = [[8, -9], [30, -7], [52, -2], [52, 2], [30, 7], [8, 9]];
const MIDDLE: Outline = [[-11, -11], [11, -11], [11, 11], [-11, 11]];
const NARROW: Outline = [[-3, -16], [3, -16], [3, 16], [-3, 16]];
const TINY: Outline = [[199.75, -0.2], [200.25, -0.2], [200.25, 0.2], [199.75, 0.2]];
const INPUTS: Readonly<Record<string, (thickness: number) => BalloonMesh>> = {
  'cloud-octagon-preview': (t) => front(OCTAGON, t, [1.5, 2.25], 0.92, 0.85),
  'sun-ray-export': (t) => front(PATCH, t, [26, 0.5], 0.98, 0.95),
  'sun-middle-preview': (t) => front(MIDDLE, t, [0.5, 0.25], 0.92, 0.85),
  'sun-middle-export': (t) => front(MIDDLE, t, [0.5, 0.25], 0.92, 0.85),
  'cloud-ties-export': (t) => front(NARROW, t, [0, 0], 0.92, 0.85),
  'tiny-flat': (t) => front(TINY, t, [200.0625, 0.03125], 0.92, 0.85),
};

const dotOfNormals = (a: DataView, b: DataView, offset: number): number =>
  a.getFloat32(offset, true) * b.getFloat32(offset, true) + a.getFloat32(offset + 4, true) * b.getFloat32(offset + 4, true) + a.getFloat32(offset + 8, true) * b.getFloat32(offset + 8, true);

describe('LampSurface against the Swift probe', () => {
  it('has the height field of each set', () => {
    const bytes = fixtureBytes('swift/lampSurface/field.f64.gz');
    const swift = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0, compared = 0, raised = 0;
    for (const set of probe.fieldSets) {
      const p = cloudParametersCodec.decode(set.parameters);
      const points = fieldPoints(p);
      check(points.length === set.points, 'Probe and test disagree on the points');
      for (const point of points) {
        const expected = swift.getFloat64(offset, true), actual = LampSurfaceGenerator.height(point, p);
        offset += 8;
        compared++;
        if (expected !== 0) raised++;
        // A zero is a guard taken or a dome missed, and neither depends on the last bits.
        const close = expected === 0 ? actual === 0 : Math.abs(actual - expected) <= FIELD_TOLERANCE * Math.abs(expected);
        check(close, `Field differs: ${displayName(p)} ${p.width} mm at (${point.x}, ${point.y}): ${actual}, Swift ${expected}`);
      }
    }
    check(offset === bytes.byteLength, 'Field fixture has more values than the test reads');
    check(compared === 4032 && raised > 1000, `Field fixture compares too little: ${compared}, ${raised} raised`);
  });

  it('is zero everywhere on a flat lamp', () => {
    check(LampSurfaceGenerator.height({ x: 0, y: 0, z: 0 }, cloudParameters()) === 0, 'A flat lamp has a relief');
  });

  it.each(probe.meshes.map((c) => [c.name, c] as const))('sculpts %s to the same corners', (name, c) => {
    const p = cloudParametersCodec.decode(c.parameters);
    const input = INPUTS[name]!(p.diffuserThickness);
    check(input.triangles.length === c.inputTriangles, `${name}: the test builds another mesh than the probe`);
    const before = binarySTL(new BalloonMesh(input.vertices, input.triangles, 0));
    const sculpted = LampSurfaceGenerator.sculpt(input, p, c.quality);
    check(binarySTL(input).every((value, i) => value === before[i]), `${name}: sculpt changed its input`);
    check(sculpted.triangles.length === c.triangles && sculpted.vertices.length === c.vertices, `${name}: ${sculpted.triangles.length} triangles, ${sculpted.vertices.length} vertices, Swift ${c.triangles}, ${c.vertices}`);
    const expected = fixtureBytes(`swift/lampSurface/${name}.stl.gz`), actual = binarySTL(sculpted);
    check(expected.length === actual.length, `${name}: STL length`);
    for (let i = 0; i < 84; i++) check(expected[i] === actual[i], `${name}: STL header byte ${i}`);
    const e = new DataView(expected.buffer, expected.byteOffset, expected.byteLength), a = new DataView(actual.buffer, actual.byteOffset, actual.byteLength);
    for (let t = 0; t < c.triangles; t++) {
      const record = 84 + 50 * t;
      // Corners and attribute: every bit.
      for (let i = record + 12; i < record + 50; i++) check(expected[i] === actual[i], `${name}: triangle ${t}, byte ${i - record}`);
      check(dotOfNormals(e, a, record) >= NORMAL_DOT, `${name}: normal of triangle ${t}`);
    }
  });
});

// --- mac/Tests/LampSurfaceTests.swift ---------------------------------------------------------------

const suns = (): CloudParameters[] => SUN_STYLES.map((sunStyle) => ({ ...wallLampDefaults('sun'), sunStyle }));
const designs = (): CloudParameters[] => [
  ...CLOUD_STYLES.flatMap((style) => [false, true].map((mirrored) => ({ ...cloudParameters(), style, mirrored }))),
  ...suns(),
];

/**
 * The printed shell is held to a tight tolerance. A sun's preview has
 * a coarser mesh, which cuts the corner at a sharp seam or ridge that
 * crosses it: there the shown shell may be off by a little more.
 */
const checkDiffuserShell = (mesh: BalloonMesh, p: CloudParameters, label: string, exported = true): void => {
  const thickness = p.diffuserThickness, coarse = p.kind === 'sun' && !exported;
  const thin = coarse ? 0.2 : 0.08, thick = coarse ? 0.4 : 0.25;
  const corners = (t: Triangle): readonly [Point3, Point3, Point3] => [mesh.vertices[t.a]!, mesh.vertices[t.b]!, mesh.vertices[t.c]!];
  const outer = mesh.triangles.filter((t) => {
    const [a, b, c] = corners(t);
    return swiftMin3(a.z, b.z, c.z) >= 12 + thickness - 0.0001 && unit(cross(sub(b, a), sub(c, a))).z > 0.01;
  });
  const inner = mesh.triangles.filter((t) => {
    const [a, b, c] = corners(t);
    return swiftMin3(a.z, b.z, c.z) >= 12 - 0.0001 && unit(cross(sub(b, a), sub(c, a))).z < -0.01;
  });
  check(outer.length > 0 && inner.length > 0, 'Missing sculpted shell faces');
  const outside = new SurfaceQuery(mesh.vertices, outer);
  const step = Math.max(1, Math.trunc(inner.length / 1000));
  for (let index = 0; index < inner.length; index += step) {
    const [a, b, c] = corners(inner[index]!);
    for (const point of [a, scale(add(add(a, b), c), 1.0 / 3)]) {
      check(!outside.isCloser(thickness - thin, point), `Diffuser becomes thin on slopes: ${label}, (${point.x}, ${point.y}, ${point.z})`);
      // The rim over the seating ledge and skirt is solid. Inside
      // the skirt the light passes an even shell.
      const skirt = CloudGenerator.radius(atan2(point.y, point.x), CloudConstants.wall + p.clipFit + 2.0 + 0.5, p.width, verticalScale(p), lampProfile(p));
      if (hypot(point.x, point.y) < skirt) {
        check(outside.isCloser(thickness + thick, point), `Diffuser became a thick solid: ${label}, (${point.x}, ${point.y}, ${point.z})`);
      }
    }
  }
  const hit = ray(mesh, { x: 0.173, y: 0.217, z: 1 }, { x: 0, y: 0, z: 1 });
  check((hit?.[0] ?? 0) >= 10.99, 'Sculpted front filled the LED cavity');
};

const qualities = (variant: number, designIndex: number): Quality[] =>
  FULL || (variant === 0 && designIndex === 0) ? ['preview', 'export'] : ['preview'];

describe('sculpted lamps', () => {
  it('migrates and limits the surface settings', () => {
    for (const kind of WALL_LAMP_KINDS) {
      const legacy = decoded(`{"kind":"${kind}","width":188}`);
      check(legacy.surface === 'flat' && legacy.surfaceDepth === 18 && legacy.width === 188, 'Legacy lamp gained a sculpted surface');
      const bad: CloudParameters = { ...wallLampDefaults(kind), surface: 'sculpted' };
      bad.width = minimumWidth(bad);
      bad.surfaceDepth = Infinity;
      check(normalized(bad).surfaceDepth === Math.min(18, maximumSurfaceDepth(bad)), 'Invalid depth has no safe default');
      bad.surfaceDepth = 100;
      check(normalized(bad).surfaceDepth === maximumSurfaceDepth(bad), 'Depth exceeds size limit');
      bad.surfaceDepth = -1;
      check(normalized(bad).surfaceDepth === 2, 'Negative surface depth accepted');
    }
  });

  const all = designs();
  const cases = all.map((design, designIndex) => [displayName(design), design.mirrored, designIndex, design] as const);
  it.each(FULL ? shardOf(cases) : cases.filter(([, , designIndex]) => designIndex === 0 || designIndex === 12))('%s, mirrored %s: both resolutions, shell thickness, clips and print orientation', (_, __, designIndex, design) => {
    for (const variant of FULL ? [0, 1, 2, 3] : [0, 1]) {
      let p: CloudParameters = { ...design, surface: 'sculpted' };
      if (variant === 1) {
        p = { ...p, width: minimumWidth(p), surfaceDepth: 30, diffuserThickness: 0.8, depth: 16, clipFit: 0.5, cableDiameter: 6, nailHead: 10 };
      } else if (variant === 2) {
        p = { ...p, width: 500, surfaceDepth: 30, diffuserThickness: 2, depth: 40 };
      } else if (variant === 3) {
        p = { ...p, surfaceDepth: 2, diffuserThickness: 2, depth: 16 };
      }
      p = { ...p, cableSide: CABLE_SIDES[(variant + designIndex + 1) % 4]! };
      p = normalized(p);
      check(sameParameters(normalized(p), p), 'Surface normalization is not idempotent');
      check(sameParameters(roundTripped(p), p), 'Surface settings did not persist');
      const flat: CloudParameters = { ...p, surface: 'flat' };
      check(filename(p) !== filename(flat) && filename(p).includes('-3d-'), 'Flat and sculpted export names collide');
      for (const quality of qualities(variant, designIndex)) {
        const kit = new CloudKit(p, quality);
        const shell = parseSTL(binarySTL(kit.front));
        shell.validate();
        check(shell.vertices.length - shell.triangles.length / 2 === 2, 'Sculpted face has extra shells or holes');
        const dimensions = shell.dimensions;
        check(Math.abs(dimensions.x - p.width) < 0.002 && Math.abs(dimensions.y - lampHeight(p)) < 0.002, 'Sculpting changed the silhouette');
        check(Math.abs(dimensions.z - (12 + p.diffuserThickness + p.surfaceDepth)) < 0.003, 'Sculpted front depth is incorrect');
        check(Math.abs(arrayMin(shell.vertices.map((v) => v.z))!) < 1e-6, 'Sculpted clips are not on the print bed');
        const placed = kit.placedFront();
        check(Math.abs(kit.assembly().dimensions.z - totalDepth(p)) < 0.003, 'Assembled depth readout is incorrect');
        check(Math.abs(arrayMin(placed.vertices.map((v) => v.z))! - (p.depth - 12)) < 0.003, 'Surface changed clip seating');
        const exploded = kit.placedFront(true);
        check(placed.vertices.every((v, i) => Math.abs(exploded.vertices[i]!.z - v.z - 32) < 1e-8), 'Exploded transform distorts the surface');
        checkCloudFeatures(p, kit.back, shell, variant === 1, kit.seal);
        checkDiffuserShell(shell, p, `${displayName(p)} ${p.width} ${quality}`, quality === 'export');
        if (variant === 0 && quality === 'export') {
          const backData = binarySTL(kit.back), flatData = binarySTL(CloudGenerator.generate(flat, false, quality));
          check(backData.length === flatData.length && backData.every((value, i) => value === flatData[i]), 'Sculpting changed the matching back');
          check(kit.instructions.includes('curved face up, clips down') && kit.instructions.includes('supports'), 'Sculpted kit has flat printing instructions');
          check(!kit.instructions.includes('printed face-down') && !kit.instructions.includes('flat print face'), 'Sculpted guide promises a flat print face');
        }
      }
    }
  }, 900_000);

  it('mirrors the relief with the silhouette', () => {
    // Mirror the relief with the silhouette; the sun's rays remain symmetric.
    for (const style of CLOUD_STYLES) {
      const a: CloudParameters = { ...cloudParameters(), surface: 'sculpted', style };
      const b: CloudParameters = { ...a, mirrored: true };
      for (const x of strideThrough(-110.0, 110, 7)) {
        for (const y of strideThrough(-40.0, 100, 7)) {
          const ha = LampSurfaceGenerator.height({ x, y, z: 0 }, a), hb = LampSurfaceGenerator.height({ x: -x, y, z: 0 }, b);
          check(Math.abs(ha - hb) < 1e-9, 'Mirroring changed cloud relief');
        }
      }
    }
  });

  it('keeps the rays of a sun alike', () => {
    for (const sun of suns()) {
      const p: CloudParameters = { ...sun, surface: 'sculpted' };
      for (const r of [0.0, 30, 55, 75, 85]) {
        for (let i = 0; i < 120; i++) {
          const a = (i * PI) / 60, b = a + sunSector(p.sunStyle);
          const ha = LampSurfaceGenerator.height({ x: r * cos(a), y: r * sin(a), z: 0 }, p);
          const hb = LampSurfaceGenerator.height({ x: r * cos(b), y: r * sin(b), z: 0 }, p);
          check(Math.abs(ha - hb) < 1e-8, 'Sculpted sun lost ray symmetry');
        }
      }
      const tip = LampSurfaceGenerator.height({ x: 80, y: 0, z: 0 }, p);
      check(tip > 0.2, `${displayName(p)} rays have no sculpted relief`);
    }
  });

  it('rolls up directly from the outline', () => {
    // The front is a rounded body, not a relief on a plate: it rolls up
    // directly from the outline, without a flat border around the domes.
    for (const design of designs()) {
      for (const width of [minimumWidth(design), design.width, 500]) {
        const p = normalized({ ...design, surface: 'sculpted', width });
        for (let i = 0; i < 360; i++) {
          const a = (i * PI) / 180;
          const r = CloudGenerator.radius(a, p.width * 0.03, p.width, verticalScale(p), lampProfile(p));
          const h = LampSurfaceGenerator.height({ x: r * cos(a), y: r * sin(a), z: 0 }, p);
          check(h > 0.12 * p.surfaceDepth, `${displayName(p)} ${width} has a flat border at ${i}°: ${h}`);
        }
      }
    }
  });

  it('gives puffs their own heights and a sun its middle and rays', () => {
    // Puffs of different sizes stand at different heights instead of
    // merging into one mound; a sun's center stands above its rays.
    for (const style of CLOUD_STYLES) {
      const p: CloudParameters = { ...cloudParameters(), surface: 'sculpted', style };
      const peaks = lampProfile(p).lobes.map((lobe) => LampSurfaceGenerator.height({ x: lobe[0] * p.width, y: lobe[1] * p.width, z: 0 }, p));
      check(arrayMax(peaks)! - arrayMin(peaks)! > 0.2 * p.surfaceDepth, `${style} cloud has no distinct puffs`);
    }
    // A sun's middle stands above its rays. Each ray is a body of its
    // own: its ridge stands well above the notches beside it, and it
    // falls towards its tip.
    for (const sun of suns()) {
      const p: CloudParameters = { ...sun, surface: 'sculpted' };
      const style = p.sunStyle;
      const height = (radius: number, angle: number): number =>
        LampSurfaceGenerator.height({ x: radius * p.width * cos(angle), y: radius * p.width * sin(angle), z: 0 }, p);
      const center = height(0, 0), root = height(sunNotchRadius(style), 0), middle = height((sunNotchRadius(style) + 0.5) / 2, 0);
      const valley = height(sunNotchRadius(style) - 0.01, sunNotchAngles(style)[0]!);
      check(center > 0.95 * p.surfaceDepth && root < 0.8 * center, `${displayName(p)} has no domed center above its rays`);
      check(root > 0.35 * p.surfaceDepth && root - valley > 0.2 * p.surfaceDepth, `${displayName(p)} has no rays standing above its notches`);
      check(middle > 0.12 * p.surfaceDepth && middle < 0.8 * root, `${displayName(p)} rays do not fall towards their tips`);
    }
  });
});
