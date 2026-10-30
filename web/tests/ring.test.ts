// Ported from mac/Tests/GeometryTests.swift @ 04553ee: checkRings :275-342, checkSplitRings :344-460,
// checkLightShield :479-507, checkSolidUplight :509-599.
//
// The swept groups have 65, 65, 129 and 130 cases. The first 8 of each always run; the rest need
// FULL=1 (`FULL=1 npx vitest run tests/ring.test.ts`).
//
// SWIFT-DIFF: the Swift tests also write sample files to .build/test-output; these write nothing.
// The calls that produced those files still run, so a throw there still fails the test.
import { describe, expect, it } from 'vitest';
import { BalloonMesh } from '../src/core/geometry/mesh';
import { cross, dot, length, sub, type Point3 } from '../src/core/geometry/point3';
import { binarySTL } from '../src/core/io/binaryStl';
import {
  channelInnerRadius,
  channelOuterRadius,
  channelRadius,
  channelWidth,
  continuousCords,
  decodeRingParameters,
  encodeRingParameters,
  filename,
  fitsP2S,
  flangeOuterRadius,
  floorThickness,
  holeRadius,
  innerRadius,
  ledFaces,
  ledShelfRadius,
  ledShelfZ,
  ledWallRadius,
  minimumBandWidth,
  normalized,
  reflectorInnerRadius,
  reflectorRise,
  reflectorToeRadius,
  RING_LARGE,
  RING_SOLID,
  RingGenerator,
  ringParameters,
  totalHeight,
} from '../src/core/ring/ringGeometry';
import { SegmentedRingKit } from '../src/core/ring/segmentedRing';
import { arrayMax, arrayMin } from '../src/core/swift/minmax';
import { check } from '../src/core/testing/check';
import { verticalHits } from '../src/core/testing/hits';
import { ray } from '../src/core/testing/ray';
import { parseSTL } from '../src/core/testing/stl';
import { zipEntries } from '../src/core/testing/zipReader';
import type { RingParameters } from '../src/core/types';
import { FULL as full } from './support/tier';

const FAST = 8;
const TIMEOUT = 120_000;
const PI = Math.PI;
const { abs, cos, sin } = Math;
const pow2 = (x: number): number => x * x;

/** Registers the first 8 cases always and the rest only with FULL=1, under the Swift case indices. */
function sweep<T>(name: string, cases: readonly T[], run: (input: T, index: number) => void): void {
  describe(name, () => {
    cases.slice(0, FAST).forEach((input, index) => {
      it(`case ${index}`, () => run(input, index), TIMEOUT);
    });
  });
  describe.skipIf(!full)(`${name} (FULL)`, () => {
    cases.slice(FAST).forEach((input, offset) => {
      const index = FAST + offset;
      it(`case ${index}`, () => run(input, index), TIMEOUT);
    });
  });
}

/** Swift `==` on RingParameters (synthesized over the stored properties). */
function same(a: RingParameters, b: RingParameters): boolean {
  return (
    a.diameter === b.diameter && a.bandWidth === b.bandWidth && a.height === b.height && a.cordClearance === b.cordClearance &&
    a.ledClearance === b.ledClearance && a.channelDepth === b.channelDepth && a.segmented === b.segmented && a.jointFit === b.jointFit &&
    a.reflectedLED === b.reflectedLED && a.stripWidth === b.stripWidth && a.stripThickness === b.stripThickness
  );
}
/** `JSONDecoder().decode(RingParameters.self, from: JSONEncoder().encode(p))`. */
const roundTrip = (p: RingParameters): RingParameters => decodeRingParameters(JSON.parse(encodeRingParameters(p)));
const decode = (text: string): RingParameters => decodeRingParameters(JSON.parse(text));

function volume(mesh: BalloonMesh): number {
  return mesh.triangles.reduce((sum, t) => sum + dot(mesh.vertices[t.a] as Point3, cross(mesh.vertices[t.b] as Point3, mesh.vertices[t.c] as Point3)) / 6, 0);
}
const xs = (mesh: BalloonMesh): number[] => mesh.vertices.map((v) => v.x);
const ys = (mesh: BalloonMesh): number[] => mesh.vertices.map((v) => v.y);
const zs = (mesh: BalloonMesh): number[] => mesh.vertices.map((v) => v.z);
const euler = (mesh: BalloonMesh): number => mesh.vertices.length - Math.trunc(mesh.triangles.length / 2);

/** Surface area of the faces a highlight colors. */
function highlightArea(mesh: BalloonMesh, colors: readonly number[]): number {
  return mesh.triangles.reduce((sum, t, i) => {
    const a = mesh.vertices[t.a] as Point3;
    return sum + (colors[i] === 1 ? length(cross(sub(mesh.vertices[t.b] as Point3, a), sub(mesh.vertices[t.c] as Point3, a))) / 2 : 0);
  }, 0);
}

function product(...axes: readonly (readonly number[])[]): number[][] {
  return axes.reduce<number[][]>((rows, axis) => rows.flatMap((row) => axis.map((value) => [...row, value])), [[]]);
}

// checkRings (:275-342)

const ringCases: readonly (readonly [string, RingParameters])[] = (() => {
  const cases: [string, RingParameters][] = [['default', ringParameters()]];
  for (const [diameter, height, cord, band, allowance, depth] of product([140.0, 240.0], [4.0, 10.0], [2.0, 5.0], [0.0, 28.0], [0.2, 1.0], [0.6, 3.0]) as [number, number, number, number, number, number][]) {
    cases.push([`bounds-${cases.length}`, ringParameters({ diameter, bandWidth: band, height, cordClearance: cord, ledClearance: allowance, channelDepth: depth })]);
  }
  return cases;
})();

describe('checkRings', () => {
  it('has the 65 Swift cases', () => {
    expect(ringCases.length).toBe(65);
  });
  it('normalizes invalid input and persists settings', () => {
    const invalid = normalized(ringParameters({ diameter: NaN, bandWidth: -1, height: Infinity, cordClearance: 100, ledClearance: -1, channelDepth: 100 }));
    check(invalid.diameter === 240 && invalid.height === 6 && invalid.cordClearance === 5 && invalid.ledClearance === 0.2 && invalid.channelDepth === 3 && invalid.bandWidth === minimumBandWidth(invalid), 'Ring input normalization failed');
    RingGenerator.generate(invalid).validate();
    check(same(roundTrip(invalid), invalid), 'Ring settings did not persist');
  });
});

sweep('checkRings sweep', ringCases, ([name, input]) => {
  const p = normalized(input);
  RingGenerator.generate(p).validate();
  const mesh = RingGenerator.generate(p, 'export');
  const parsed = parseSTL(binarySTL(mesh));
  parsed.validate();
  const d = parsed.dimensions;
  check(abs(d.x - p.diameter) < 0.001 && abs(d.y - p.diameter) < 0.001 && abs(d.z - p.height) < 0.001, `Ring dimensions changed: ${name}`);
  check(parsed.vertices.every((v) => v.z >= 0), 'Ring extends below bed');
  check(euler(parsed) === -12, 'Ring must have one central opening and six through-holes');
  check(floorThickness(p) >= 3 && p.diameter + 16 <= 256, 'Ring floor or bed clearance too small');
  const expected =
    PI * (pow2(p.diameter / 2) - pow2(innerRadius(p))) * p.height -
    PI * (pow2(channelOuterRadius(p)) - pow2(channelInnerRadius(p))) * p.channelDepth -
    6 * pow2(p.cordClearance) * p.height;
  check(abs(volume(parsed) - expected) / expected < 0.001, `Unexpected ring volume: ${name}`);
  check(verticalHits(parsed, 0, 0).length === 0, 'Ring centre is blocked');
  for (let hole = 0; hole < 6; hole++) {
    const theta = (hole * PI) / 3;
    for (let sample = 0; sample < 17; sample++) {
      const angle = (sample * PI) / 8;
      const offset = sample === 16 ? 0 : p.cordClearance * 0.49;
      const x = holeRadius(p) * cos(theta) + offset * cos(angle);
      const y = holeRadius(p) * sin(theta) + offset * sin(angle);
      check(verticalHits(parsed, x, y).length === 0, `Ring cord bore obstructed: ${name}, hole ${hole}`);
    }
  }
  for (let sample = 0; sample < 18; sample++) {
    const theta = ((sample + 0.37) * PI) / 9;
    for (const offset of [-0.48, 0, 0.48]) {
      const r = channelRadius(p) + channelWidth(p) * offset;
      const hits = verticalHits(parsed, r * cos(theta), r * sin(theta));
      check(hits.length === 2 && abs(hits[0] as number) < 0.001 && abs((hits[1] as number) - floorThickness(p)) < 0.001, `LED channel width/depth or floor incorrect: ${name}`);
    }
    for (const r of [innerRadius(p) + 0.8, channelInnerRadius(p) - 0.8, p.diameter / 2 - 0.8]) {
      const hits = verticalHits(parsed, r * cos(theta), r * sin(theta));
      check(hits.length === 2 && abs((hits[1] as number) - p.height) < 0.001, `Missing ring rim: ${name}`);
    }
  }
});

// checkSplitRings (:344-460) and checkLightShield (:479-507)

function boreVolume(clearance: number, bevel: number, height: number): number {
  const opening = clearance + 2 * bevel;
  return clearance * clearance * (height - 2 * bevel) + ((2 * bevel) / 3) * (opening * opening + opening * clearance + clearance * clearance);
}

function checkLightShield(kit: SegmentedRingKit, full: boolean): void {
  const p = kit.parameters;
  const mesh = kit.guided;
  const z = ledShelfZ(p) + p.stripWidth / 2;
  const front: Point3 = { x: ledWallRadius(p) - p.stripThickness - 0.05, y: 0, z };
  const inward = ray(mesh, front, { x: -1, y: 0, z: 0 });
  check(inward !== undefined && inward[1].x > 0.7 && inward[1].z > 0.7, 'LED must face the rising 45 degree reflector');
  check(ray(mesh, front, { x: 0, y: 0, z: 1 }) === undefined, 'Uplight opening blocked');
  check(ray(mesh, front, { x: 0, y: 0, z: -1 }) !== undefined, 'Missing opaque floor beneath LEDs');
  const area = highlightArea(mesh, kit.ledFaces(mesh));
  check(abs(area - (PI / 3) * ledWallRadius(p) * channelWidth(p)) / area < 0.001, 'LED mounting highlight area');
  // Check the actual assembled solids across seams, at lower/upper LED edges.
  if (full) {
    const assembly = kit.assembly();
    for (const theta of [0.0, PI / 6 - 0.001, PI / 6 + 0.001]) {
      for (const height of [ledShelfZ(p) + 0.05, ledShelfZ(p) + p.stripWidth - 0.05]) {
        const r = ledWallRadius(p) - p.stripThickness - 0.05;
        const origin: Point3 = { x: r * cos(theta), y: r * sin(theta), z: height + 4 };
        for (let i = 0; i < 16; i++) {
          for (const drop of [0.01, 0.5, 3.0]) {
            const a = (i * PI) / 8;
            check(ray(assembly, origin, { x: cos(a), y: sin(a), z: -drop }) !== undefined, 'Direct view from below remains at a seam');
          }
        }
      }
    }
  }
}

function splitRingCases(reflector: boolean): RingParameters[] {
  const cases = [reflector ? { ...RING_LARGE } : ringParameters({ diameter: 450, bandWidth: 24, height: 12, cordClearance: 6, segmented: true })];
  if (reflector) {
    for (const [diameter, width, height, cord, strip, thickness, fit] of product([300.0, 600.0], [0.0, 60.0], [8.0, 16.0], [4.0, 8.0], [3.5, 12.0], [1.0, 6.0], [0.2, 0.6]) as [number, number, number, number, number, number, number][]) {
      cases.push(ringParameters({ diameter, bandWidth: width, height, cordClearance: cord, ledClearance: 1, segmented: true, jointFit: fit, reflectedLED: true, stripWidth: strip, stripThickness: thickness }));
    }
  } else {
    for (const [diameter, width, height, cord, depth, fit] of product([300.0, 600.0], [0.0, 36.0], [8.0, 16.0], [4.0, 8.0], [0.6, 3.0], [0.2, 0.6]) as [number, number, number, number, number, number][]) {
      cases.push(ringParameters({ diameter, bandWidth: width, height, cordClearance: cord, ledClearance: 1, channelDepth: depth, segmented: true, jointFit: fit }));
    }
  }
  return cases;
}

function checkSplitRing(input: RingParameters, caseIndex: number, reflector: boolean): void {
  const kit = new SegmentedRingKit(input, 'export');
  const p = kit.parameters;
  const preview = new SegmentedRingKit(input);
  for (const mesh of [preview.guided, preview.plain, preview.plate, preview.pin]) mesh.validate();
  kit.printParts.forEach((part, i) => {
    const parsed = parseSTL(binarySTL(part.mesh));
    parsed.validate();
    check(euler(parsed) === ([-4, -2, -2, 2] as const)[i], `Wrong number of holes in split part ${part.name}`);
    const d = parsed.dimensions;
    check(d.x + 16 <= 256.001 && d.y + 16 <= 256.001 && d.z <= 256, 'Split ring part exceeds bed with brim');
    check(abs(arrayMin(zs(parsed)) as number) < 0.001, 'Split part not on bed');
    for (const coordinate of [xs(parsed), ys(parsed)]) {
      check(abs((arrayMin(coordinate) as number) + (arrayMax(coordinate) as number)) < 0.001, 'Exported part not centred');
    }
  });
  let ledVolume: number;
  if (reflector) {
    const rise = p.stripWidth + p.ledClearance + 2;
    // Independent annular prisms and a triangular swept ramp.
    ledVolume =
      PI * (pow2(p.diameter / 2) - pow2(ledWallRadius(p))) * rise +
      PI * (pow2(ledWallRadius(p)) - pow2(ledShelfRadius(p))) +
      PI * (pow2(reflectorInnerRadius(p)) - pow2(flangeOuterRadius(p))) * rise +
      PI * reflectorInnerRadius(p) * rise * rise + (PI * rise * rise * rise) / 3;
  } else ledVolume = -PI * (pow2(channelOuterRadius(p)) - pow2(channelInnerRadius(p))) * p.channelDepth;
  const ringVolume =
    PI * (pow2(p.diameter / 2) - pow2(innerRadius(p))) * p.height + ledVolume -
    12 * boreVolume(4 + p.jointFit, 0.4, p.height) - 3 * boreVolume(p.cordClearance, 0.8, p.height);
  check(abs(3 * (volume(kit.guided) + volume(kit.plain)) - ringVolume) / ringVolume < 0.001, 'Split ring volume or channel mismatch');
  // Every guide and registration pin has an unobstructed vertical path,
  // with the same pin positions on the section and its underside plate.
  const theta = PI / 6 - kit.pinAngle;
  const bores: readonly (readonly [BalloonMesh, number, number])[] = [
    [kit.guided, 0.0, p.cordClearance],
    [kit.guided, theta, 4 + p.jointFit],
    [kit.plain, -theta, 4 + p.jointFit],
    [kit.plate, kit.pinAngle, 4 + p.jointFit],
    [kit.plate, -kit.pinAngle, 4 + p.jointFit],
  ];
  for (const [mesh, angle, clearance] of bores) {
    for (let sample = 0; sample < 17; sample++) {
      const phi = (sample * PI) / 8;
      const offset = sample === 16 ? 0 : clearance * 0.49;
      check(verticalHits(mesh, holeRadius(p) * cos(angle) + offset * cos(phi), holeRadius(p) * sin(angle) + offset * sin(phi)).length === 0, `Blocked guide or pin bore in split case ${caseIndex}`);
    }
  }
  for (let i = 0; i < 6; i++) {
    const seam = ((i + 0.5) * PI) / 3;
    for (const sign of [-1.0, 1.0]) {
      const pinTheta = seam + sign * kit.pinAngle;
      const neighbour = i + (sign > 0 ? 1 : 0);
      const sectionTheta = (neighbour * PI) / 3 - sign * theta;
      check(abs(cos(pinTheta) - cos(sectionTheta)) + abs(sin(pinTheta) - sin(sectionTheta)) < 1e-9, 'Plate and section pins do not align');
    }
  }
  for (const mesh of [kit.guided, kit.plain]) {
    for (const angle of [-PI / 6, -0.23, 0.0, 0.23, PI / 6]) {
      const samples: readonly (readonly [number, number])[] = reflector
        ? [
            [(reflectorToeRadius(p) + ledShelfRadius(p)) / 2, p.height],
            [(ledShelfRadius(p) + ledWallRadius(p)) / 2, ledShelfZ(p)],
            [reflectorToeRadius(p) - reflectorRise(p) / 2, p.height + reflectorRise(p) / 2],
            [(flangeOuterRadius(p) + reflectorInnerRadius(p)) / 2, totalHeight(p)],
            [(ledWallRadius(p) + p.diameter / 2) / 2, totalHeight(p)],
          ]
        : [-0.48, 0, 0.48].map((offset) => [channelRadius(p) + offset * channelWidth(p), floorThickness(p)] as const);
      for (const [r, expected] of samples) {
        const hits = verticalHits(mesh, r * cos(angle), r * sin(angle));
        check(hits.length === 2 && abs(hits[0] as number) < 0.001 && abs((hits[1] as number) - expected) < 0.01, `Light mount profile must continue through both ends, case ${caseIndex}`);
      }
    }
  }
  const assembled = kit.assembly().dimensions;
  check(abs(assembled.x - p.diameter) < 0.001 && abs(assembled.y - p.diameter) < 0.001 && abs(assembled.z - totalHeight(p) - 4) < 0.001, 'Assembly dimensions mismatch');
  check(kit.assemblyFaceColors.length === kit.assembly().triangles.length, 'Assembly highlight indexing');
  if (reflector) checkLightShield(kit, caseIndex === 0);
  if (caseIndex === 0) {
    kit.archive();
    kit.entries();
  }
}

const flatSplitCases = splitRingCases(false);
const reflectorSplitCases = splitRingCases(true);

describe('checkSplitRings', () => {
  it('has the Swift case counts', () => {
    expect(flatSplitCases.length).toBe(65);
    expect(reflectorSplitCases.length).toBe(129);
  });
  // The closing checks of checkSplitRings, which Swift runs once per flavour.
  it('keeps legacy settings, round-trips and normalizes', () => {
    const restoredLegacy = decode('{"diameter":220,"bandWidth":18,"height":6,"cordClearance":3,"ledClearance":0.4,"channelDepth":1.5}');
    check(!restoredLegacy.segmented && restoredLegacy.diameter === 220 && restoredLegacy.jointFit === 0.3 && !restoredLegacy.reflectedLED && restoredLegacy.stripWidth === 3.5, 'Legacy ring settings changed');
    check(same(roundTrip(RING_LARGE), RING_LARGE), 'Split settings did not round-trip');
    const invalid = normalized(ringParameters({ diameter: NaN, bandWidth: Infinity, height: NaN, cordClearance: NaN, ledClearance: NaN, channelDepth: NaN, segmented: true, jointFit: NaN }));
    check(invalid.diameter === 450 && invalid.bandWidth === 24 && invalid.height === 12 && invalid.cordClearance === 6 && invalid.jointFit === 0.3, 'Split normalization failed');
    const badLight = normalized({ ...RING_LARGE, stripWidth: NaN, stripThickness: Infinity, bandWidth: NaN });
    check(badLight.stripWidth === 8 && badLight.stripThickness === 3 && badLight.bandWidth === 40, 'Light settings normalization');
  });
});

sweep('checkSplitRings flat', flatSplitCases, (input, index) => checkSplitRing(input, index, false));
sweep('checkSplitRings reflector', reflectorSplitCases, (input, index) => checkSplitRing(input, index, true));

// checkSolidUplight (:509-599)

const solidCases: readonly RingParameters[] = (() => {
  const cases: RingParameters[] = [{ ...RING_SOLID }, { ...RING_SOLID, diameter: 240 }];
  for (const [diameter, band, height, cord, strip, thickness, allowance] of product([140.0, 600.0], [0.0, 60.0], [8.0, 16.0], [4.0, 8.0], [3.5, 12.0], [1.0, 6.0], [0.2, 1.0]) as [number, number, number, number, number, number, number][]) {
    cases.push(ringParameters({ diameter, bandWidth: band, height, cordClearance: cord, ledClearance: allowance, reflectedLED: true, stripWidth: strip, stripThickness: thickness }));
  }
  return cases;
})();

describe('checkSolidUplight', () => {
  it('has the 130 Swift cases', () => {
    expect(solidCases.length).toBe(130);
  });
  it('keeps the fallback dimensions with cord routing', () => {
    const invalid = normalized({ ...RING_SOLID, height: NaN, cordClearance: NaN });
    check(invalid.height === 12 && invalid.cordClearance === 6, 'Solid uplight fallback dimensions changed with cord routing');
  });
});

sweep('checkSolidUplight sweep', solidCases, (input, index) => {
  const p = normalized(input);
  check(!p.segmented && p.reflectedLED && !continuousCords(p), 'Solid uplight must use separate ceiling and balloon attachments');
  const preview = RingGenerator.generate(p);
  preview.validate();
  const mesh = RingGenerator.generate(p, 'export');
  const parsed = parseSTL(binarySTL(mesh));
  parsed.validate();
  for (const m of [preview, parsed]) {
    check(euler(m) === -12, 'Solid uplight must have the central opening plus three ceiling and three balloon holes');
  }
  const dims = parsed.dimensions;
  check(abs(dims.x - p.diameter) < 0.001 && abs(dims.y - p.diameter) < 0.001 && abs(dims.z - totalHeight(p)) < 0.001, 'Solid uplight dimensions changed');
  check(abs(arrayMin(zs(parsed)) as number) < 0.001, 'Solid ring is not on bed');
  for (const axis of [xs(parsed), ys(parsed)]) {
    check(abs((arrayMin(axis) as number) + (arrayMax(axis) as number)) < 0.001, 'Solid ring is not centred');
  }
  check(fitsP2S(p) === (p.diameter <= 240), 'Solid bed-fit notice is wrong');
  check(filename(p).endsWith('solid.stl'), 'Solid ring exported as a kit');
  const rise = p.stripWidth + p.ledClearance + 2;
  const opening = p.cordClearance + 1.6;
  const bore = p.cordClearance * p.cordClearance * (p.height - 1.6) + (1.6 / 3) * (opening * opening + opening * p.cordClearance + p.cordClearance * p.cordClearance);
  const expected =
    PI * (pow2(p.diameter / 2) - pow2(innerRadius(p))) * p.height +
    PI * (pow2(p.diameter / 2) - pow2(ledWallRadius(p))) * rise +
    PI * (pow2(ledWallRadius(p)) - pow2(ledShelfRadius(p))) +
    PI * (pow2(reflectorInnerRadius(p)) - pow2(flangeOuterRadius(p))) * rise +
    PI * reflectorInnerRadius(p) * rise * rise + (PI * rise * rise * rise) / 3 - 6 * bore;
  const error = abs(volume(parsed) - expected) / expected;
  check(error < 0.001, `Solid uplight volume differs from independent swept profile: ${index}, error ${error}`);
  check(verticalHits(parsed, 0, 0).length === 0, 'Solid ring centre is blocked');
  // Even indices are the original ceiling holes; odd indices are
  // the added balloon holes, midway between the ceiling holes.
  for (let hole = 0; hole < 6; hole++) {
    const theta = (hole * PI) / 3;
    for (let sample = 0; sample < 17; sample++) {
      const a = (sample * PI) / 8;
      const offset = sample === 16 ? 0 : p.cordClearance * 0.49;
      check(verticalHits(parsed, holeRadius(p) * cos(theta) + offset * cos(a), holeRadius(p) * sin(theta) + offset * sin(a)).length === 0, `Solid ring attachment is blocked: ${index}, ${hole % 2 === 0 ? 'ceiling' : 'balloon'} hole ${hole}`);
    }
  }
  const sectionSamples: readonly (readonly [number, number])[] = [
    [(reflectorToeRadius(p) + ledShelfRadius(p)) / 2, p.height],
    [(ledShelfRadius(p) + ledWallRadius(p)) / 2, ledShelfZ(p)],
    [reflectorToeRadius(p) - rise / 2, p.height + rise / 2],
    [(flangeOuterRadius(p) + reflectorInnerRadius(p)) / 2, totalHeight(p)],
    [(ledWallRadius(p) + p.diameter / 2) / 2, totalHeight(p)],
  ];
  for (const theta of [0.0, 0.0001, 0.31, PI / 3, (2 * PI) / 3, PI, (4 * PI) / 3, (5 * PI) / 3, 2 * PI - 0.0001]) {
    for (const [r, z] of sectionSamples) {
      const hits = verticalHits(parsed, r * cos(theta), r * sin(theta));
      check(hits.length === 2 && abs(hits[0] as number) < 0.001 && abs((hits[1] as number) - z) < 0.015, `Solid light profile discontinuity: ${index}`);
    }
  }
  for (const m of [preview, mesh]) {
    const front: Point3 = { x: ledWallRadius(p) - p.stripThickness - 0.05, y: 0, z: ledShelfZ(p) + p.stripWidth / 2 };
    const hit = ray(m, front, { x: -1, y: 0, z: 0 });
    check(hit !== undefined && hit[1].x > 0.7 && hit[1].z > 0.7, 'Solid LED does not face its reflector');
    check(ray(m, front, { x: 0, y: 0, z: 1 }) === undefined, 'Solid uplight opening is blocked');
    check(ray(m, front, { x: 0, y: 0, z: -1 }) !== undefined, 'Solid LED has no floor');
    const area = highlightArea(m, ledFaces(p, m));
    check(abs(area - 2 * PI * ledWallRadius(p) * channelWidth(p)) / area < 0.001, 'Solid LED highlight missing or on wrong face');
  }
  if (index < 2) {
    for (const theta of [0.0, 0.1, PI / 3, (2 * PI) / 3, PI, (4 * PI) / 3, (5 * PI) / 3]) {
      for (const z of [ledShelfZ(p) + 0.05, ledShelfZ(p) + p.stripWidth - 0.05]) {
        const r = ledWallRadius(p) - p.stripThickness - 0.05;
        const origin: Point3 = { x: r * cos(theta), y: r * sin(theta), z };
        for (let sample = 0; sample < 16; sample++) {
          for (const drop of [0.01, 0.5, 3.0]) {
            const a = (sample * PI) / 8;
            check(ray(parsed, origin, { x: cos(a), y: sin(a), z: -drop }) !== undefined, 'Solid LED has a direct sightline from below');
          }
        }
      }
    }
  }
  check(same(normalized(roundTrip(p)), p), 'Solid settings did not round-trip');
});

// Beyond the Swift suite: contract details the port has to keep.

describe('ring settings codec', () => {
  it('treats absent and null as the default and rejects wrong types, as JSONDecoder does', () => {
    check(same(decodeRingParameters({}), ringParameters()), 'Empty settings must decode to the defaults');
    check(decodeRingParameters({ diameter: null }).diameter === 240, 'null must decode to the default');
    expect(() => decodeRingParameters({ diameter: '240' })).toThrow(TypeError);
    expect(() => decodeRingParameters({ segmented: 1 })).toThrow(TypeError);
    expect(() => decodeRingParameters({ diameter: Infinity })).toThrow(TypeError);
    expect(() => decodeRingParameters([])).toThrow(TypeError);
  });
  it('refuses to encode a non-finite value, as JSONEncoder does', () => {
    expect(() => encodeRingParameters(ringParameters({ diameter: NaN }))).toThrow();
  });
});

describe('SegmentedRingKit', () => {
  it('writes the entries in the Swift order and an exploded assembly with the same faces', () => {
    const kit = new SegmentedRingKit({ ...RING_LARGE });
    const entries = zipEntries(kit.archive());
    expect(entries.map((entry) => entry.name)).toEqual(['A-cord-guide-print-3.stl', 'B-plain-section-print-3.stl', 'C-underside-plate-print-6.stl', 'D-alignment-pin-print-12.stl', 'kit-manifest.json', 'ASSEMBLY.md']);
    expect(kit.assembly(true).triangles.length).toBe(kit.assembly().triangles.length);
    expect(kit.assembly(true).dimensions.z).toBeGreaterThan(kit.assembly().dimensions.z);
  });
  it('forces the segmented flag, whatever the input says', () => {
    expect(new SegmentedRingKit({ ...RING_SOLID }).parameters.segmented).toBe(true);
  });
});
