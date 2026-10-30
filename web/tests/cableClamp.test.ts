// Ported from mac/Tests/CableClampTests.swift @ cbda68d: checkClampSettings (:307-341) and the opt-in
// suite `clamp`, checkClamps (:210-305, without the files written to .build/test-output :291-298,
// plan §8). checkCableClamp is in support/lampFeatures.ts.
import { describe, it } from 'vitest';
import { binarySTL } from '../src/core/io/binaryStl';
import { CableClamp, CableClampGenerator, FlatRegion } from '../src/core/lamp/cableClamp';
import { CableOutlet } from '../src/core/lamp/cableSeal';
import { CloudConstants, cloudParameters, displayName, filename, height, Layout, ledCenterY, minimumWidth, nailCenterY, normalized, totalDepth } from '../src/core/lamp/cloudGeometry';
import { CloudKit } from '../src/core/lamp/cloudKit';
import { wallLampDefaults } from '../src/core/lamp/sunGeometry';
import { strideThrough } from '../src/core/swift/rounding';
import { check } from '../src/core/testing/check';
import { parseSTL } from '../src/core/testing/stl';
import { CABLE_SIDES, CLOUD_STYLES, SUN_STYLES, type CableSide, type CloudParameters, type WallLampKind } from '../src/core/types';
import { decoded, roundTripped, sameParameters } from './support/lamp';
import { checkCableClamp, checkLEDLayout } from './support/lampFeatures';
import { FULL, shardOf } from './support/tier';


const designs = (): CloudParameters[] => [
  ...CLOUD_STYLES.flatMap((style) => [false, true].map((mirrored) => ({ ...cloudParameters(), style, mirrored }))),
  ...SUN_STYLES.map((sunStyle) => ({ ...wallLampDefaults('sun'), sunStyle })),
];
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, i) => value === b[i]);

describe('strain relief', () => {
  it.each(['cloud', 'sun'] as WallLampKind[])('%s: persistence, saved lamps, kit contents, guide and LED plan', (kind) => {
    const saved = decoded(`{"kind":"${kind}","width":188,"cableSide":"left"}`);
    check(saved.strainRelief && saved.cableSide === 'left' && saved.width === 188, 'A saved lamp must get the strain relief');
    for (const wanted of [true, false]) {
      for (const side of CABLE_SIDES) {
        const p: CloudParameters = { ...wallLampDefaults(kind), strainRelief: wanted, cableSide: side };
        const restored = roundTripped(p);
        check(sameParameters(restored, p) && restored.strainRelief === wanted && normalized(p).strainRelief === wanted, 'Strain relief did not persist');
        const other: CloudParameters = { ...p, strainRelief: !wanted };
        check(filename(p) === filename(other), 'Kits with and without the clamp fit each other: one name');
        const kit = new CloudKit(p), names = kit.entries().map(([name]) => name);
        check((kit.clamp !== null) === wanted, 'The default lamps have room for the strain relief on every side');
        check(
          names.includes(CloudConstants.barFilename) === wanted && names.includes(CloudConstants.anvilFilename) === wanted && names.filter((name) => name.endsWith('.stl')).length === (wanted ? 5 : 3),
          `Kit and strain relief: ${names.join(', ')}`,
        );
        const guide = kit.instructions;
        check(guide.includes('## Strain relief') === wanted && guide.includes('M3 × 10.0 mm') === wanted && guide.includes('until the bar\n   rests on both posts') === wanted, 'Guide and strain relief');
        check(guide.includes('secure the lead outside the lamp') !== wanted, 'Guide must say what holds the lead');
        check(kit.ledPlan.svg.includes('strain relief') === wanted, 'LED plan and strain relief');
        check(
          kit.assemblyColors.length === kit.assembly().triangles.length && kit.backColors.length === kit.backWithLEDGuides.triangles.length && kit.assemblyColors.length === kit.assembly(true).triangles.length,
          'Colors of the preview',
        );
        check((kit.clampPrintView !== null) === wanted, 'Print view of the clamp');
      }
    }
  }, 120_000);

  // Wanted, but without room: the kit says so.
  it('says so where there is no room', () => {
    const small: CloudParameters = { ...cloudParameters(), width: 100, cableSide: 'top' };
    const kit = new CloudKit(small);
    check(kit.clamp === null && kit.printedParts === 3 && kit.instructions.includes('no room for the screwed strain relief') && kit.instructions.includes('fix the lead to the wall'), 'A lamp without room for the clamp must say so');
    const least = CableClamp.minimumWidth(small) ?? 0;
    const wider: CloudParameters = { ...small, width: least }, narrower: CloudParameters = { ...small, width: least - 1 };
    check(least > 100 && least <= 160 && CableClamp.create(normalized(wider)) !== null && CableClamp.create(normalized(narrower)) === null, 'Width from which the clamp fits');
  });

  // A region with holes, laid out in triangles.
  it('lays out a plate with two holes', () => {
    const points: [number, number][] = [[0, 0], [5, 0], [10, 0], [10, 4], [10, 8], [4, 8], [0, 8], [0, 3], [2, 2], [4, 2], [4, 6], [2, 6], [6, 2], [8, 2], [8, 6], [6, 6]];
    const faces = FlatRegion.triangles([0, 1, 2, 3, 4, 5, 6, 7], [[11, 10, 9, 8], [15, 14, 13, 12]], points);
    check(faces !== null, 'No triangles for a plate with two holes');
    const area = faces.reduce((sum, f) => {
      const a = points[f[0]]!, b = points[f[1]]!, c = points[f[2]]!, twice = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      check(twice > 1e-9, 'A triangle is turned over or flat');
      return sum + twice / 2;
    }, 0.0);
    check(Math.abs(area - (80 - 2 * 8)) < 1e-9 && faces.length === points.length + 2 * 2 - 2, `Triangles do not cover the plate: ${area}`);
  });

  it('lays the preview parts in the back', () => {
    const p = normalized(cloudParameters()), c = new CableClamp(p);
    const screw = CableClampGenerator.screw();
    screw.validate();
    check(screw.vertices.length - screw.triangles.length / 2 === 2, 'A screw is one closed body');
    check(Math.abs(screw.dimensions.z - (CableClamp.headHeight - 0.2 + CableClamp.screwLength)) < 1e-9, 'Length of a screw');
    const screws = CableClampGenerator.placedScrews(p);
    check(screws.vertices.length === 2 * screw.vertices.length && screws.triangles.length === 2 * screw.triangles.length, 'Two screws');
    const [x, y] = c.outlet.point(c.screwT, c.screwH);
    check(screws.vertices.some((v) => Math.abs(v.x - x) < 1e-9 && Math.abs(v.y - y) < 1e-9 && Math.abs(v.z - (c.postTop + CableClamp.bar - CableClamp.screwLength)) < 1e-9), 'The tip of a screw is on its axis');
    const lifted = CableClampGenerator.placedScrews(p, 28);
    check(lifted.vertices.every((v, i) => Math.abs(v.z - screws.vertices[i]!.z - 28) < 1e-9), 'Exploded screws wait above the posts');
    const bar = CableClampGenerator.bar(p), anvil = CableClampGenerator.anvil(p), view = CableClampGenerator.printView(bar, anvil);
    check(view.triangles.length === bar.triangles.length + anvil.triangles.length && bar.triangles.every((t, i) => t.a === view.triangles[i]!.a), 'Print view of bar and anvil');
    const gap = bar.dimensions.y / 2 + anvil.dimensions.x / 2 + 6;
    check(view.dimensions.z === Math.max(bar.dimensions.z, anvil.dimensions.z) && Math.abs(view.dimensions.y - (bar.dimensions.y / 2 + anvil.dimensions.x / 2 + gap)) < 1e-9, 'Both parts side by side, 6 mm apart');
  });
});

/** Where the clamp fits, and what it leaves alone. `bash scripts/test.sh clamp` */
describe.skipIf(!FULL)('clamp', () => {
  it.each(shardOf(designs()).map((design) => [displayName(design), design.mirrored, design] as const))('room for it: %s, mirrored %s', (_, __, design) => {
    for (const side of CABLE_SIDES) {
      for (const width of strideThrough(minimumWidth(design), 500, 10)) {
        for (const cable of [2.0, 3, 6]) {
          for (const depth of [16.0, 40]) {
            const p = normalized({
              ...design, cableSide: side, width, cableDiameter: cable, depth,
              nailHead: cable === 2 ? 5 : cable === 3 ? 8 : 10, stripWidth: cable === 2 ? 3.5 : cable === 3 ? 8 : 12, clipFit: cable === 2 ? 0.2 : 0.5,
            });
            const label = `${displayName(p)} ${width} mm, cable ${cable} ${side}`;
            const clamp = CableClamp.create(p);
            if (clamp === null) {
              // Only small lamps have no room for it: at the top, where
              // the nail pocket is close, and in the narrow ends of a Twin.
              // Every sun has room on all four sides.
              const small = p.kind === 'cloud' && width < 190 && (side === 'top' || (p.style === 'twin' && side !== 'bottom' && width <= 135));
              check(small, `No room for the strain relief: ${label}`);
              continue;
            }
            check(clamp.top <= 16 - 0.4 && clamp.postTop >= 9 && clamp.holeDepth >= 7.8, `Height of the clamp: ${label}`);
            // The outlet itself stays as it is.
            const plain: CloudParameters = { ...p, strainRelief: false };
            const o = new CableOutlet(p), other = new CableOutlet(plain);
            check(o.angle === other.angle && o.seat === other.seat && o.landing === 12, `The strain relief moved the outlet: ${label}`);
            check(CableClamp.create(plain) === null, `A clamp that was not wanted: ${label}`);
            const l = new Layout(p), plainLayout = new Layout(plain);
            check(
              l.lowY === plainLayout.lowY && l.highY === plainLayout.highY && l.coreX === plainLayout.coreX && height(p) === height(plain) && ledCenterY(p) === ledCenterY(plain) && nailCenterY(p) === nailCenterY(plain),
              `The strain relief moved the fittings: ${label}`,
            );
          }
        }
      }
    }
  }, 900_000);

  // Backs on every silhouette and side, from the smallest lamp on.
  const kits = shardOf(designs().filter((design) => !design.mirrored)).flatMap((design) => (CABLE_SIDES as readonly CableSide[]).map((side) => [displayName(design), side, design] as const));

  it.each(kits)('kits: %s, cable at the %s', (_, side, design) => {
    const least = minimumWidth(design);
    [least, least + 20, least + 40, least + 70, design.width, 300, 500].forEach((width, index) => {
      for (const large of [false, true]) {
        let p: CloudParameters = {
          ...design, cableSide: side, width,
          cableDiameter: large ? 6 : 2, nailHead: large ? 10 : 5, nailShaft: large ? 5 : 2,
          stripWidth: large ? 12 : 3.5, clipFit: large ? 0.5 : 0.2,
          depth: large === (index % 2 === 0) ? 16 : 30,
        };
        if (index === 4 && !large) p = { ...design, cableSide: side };
        p = normalized(p);
        if (CableClamp.create(p) === null) continue;
        checkLEDLayout(p);
        const quality = index === 4 ? 'export' : 'preview';
        const kit = new CloudKit(p, quality);
        const back = parseSTL(binarySTL(kit.back));
        back.validate();
        check(back.vertices.length - back.triangles.length / 2 === 0, `The posts changed the back's topology: ${displayName(p)} ${width} ${side}`);
        const placed = kit.front.copy();
        placed.vertices = kit.front.vertices.map((v) => ({ x: v.x, y: -v.y, z: totalDepth(p) - v.z }));
        checkCableClamp(p, back, placed, kit.placedSeal(), index === 4 && !large);
        // Front and seal are the same without the strain relief.
        const plain: CloudParameters = { ...p, strainRelief: false };
        const other = new CloudKit(plain, quality);
        check(sameBytes(binarySTL(other.front), binarySTL(kit.front)) && sameBytes(binarySTL(other.seal), binarySTL(kit.seal)), `The strain relief changed the front or the seal: ${displayName(p)} ${width} ${side}`);
        check(other.clamp === null && other.bar === null && other.printedParts === 3 && kit.printedParts === 5, 'Parts of the kit');
        checkCableClamp(plain, parseSTL(binarySTL(other.back)), placed, kit.placedSeal(), false);
      }
    });
  }, 1_800_000);
});
