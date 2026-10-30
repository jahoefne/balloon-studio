// Ported from mac/Tests/CableOutletTests.swift @ cbda68d: checkChainedOutlets (:6-115), without the
// files written to .build/test-output (:101-106, plan §8). Without FULL the kits run in one design
// each and at preview quality; the sculpted variants wait for WP-K4c.
import { describe, it } from 'vitest';
import { binarySTL } from '../src/core/io/binaryStl';
import { CableClamp } from '../src/core/lamp/cableClamp';
import { cableConfigurations, cableSides, cloudParameters, displayName, encodeCloudParameters, filename, height, minimumWidth, normalized, selectCableSide, setCableOutletCount, withCableSides } from '../src/core/lamp/cloudGeometry';
import { CloudKit } from '../src/core/lamp/cloudKit';
import { decodeLampSettings } from '../src/core/lamp/lampSettingsFile';
import { wallLampDefaults } from '../src/core/lamp/sunGeometry';
import { check } from '../src/core/testing/check';
import { parseSTL } from '../src/core/testing/stl';
import { CABLE_SIDE_TITLE, CABLE_SIDES, CLOUD_STYLES, SUN_STYLES, type CableSide, type CloudParameters, type WallLampKind } from '../src/core/types';
import { decoded, sameParameters, waitsFor } from './support/lamp';
import { checkCableClamp, checkCableOutlet, checkLEDLayout } from './support/lampFeatures';
import { FULL, shardOf } from './support/tier';


const same = (a: readonly CableSide[], b: readonly CableSide[]): boolean => a.length === b.length && a.every((side, i) => side === b[i]);

const all = CABLE_SIDES;
const subsets = (size: number, start: number): CableSide[][] => {
  if (size === 0) return [[]];
  const result: CableSide[][] = [];
  for (let i = start; i < all.length; i++) {
    for (const rest of subsets(size - 1, i + 1)) result.push([all[i]!, ...rest]);
  }
  return result;
};
const sets = [2, 3, 4].flatMap((size) => subsets(size, 0));

describe('chained outlets: the outlet logic', () => {
  it('has the sets of two, three and four sides', () => {
    check(sets.length === 11, 'Sets of outlets changed');
  });

  it.each(['cloud', 'sun'] as WallLampKind[])('%s', (kind) => {
    const legacy = decoded(`{"kind":"${kind}","cableSide":"top"}`);
    check(same(cableSides(legacy), ['top']) && legacy.secondCableSide === null, 'Legacy lamp acquired a second outlet');
    const pair = decoded(`{"kind":"${kind}","cableSide":"top","secondCableSide":"left"}`);
    check(same(cableSides(pair), ['top', 'left']) && pair.thirdCableSide === null && pair.fourthCableSide === null, 'Lamp with two outlets changed');
    const saved = encodeCloudParameters(pair);
    check(!saved.includes('third') && !saved.includes('fourth'), 'Settings of two outlets gained keys');
    const names = new Set<string>();
    for (const set of sets) {
      let p = withCableSides(wallLampDefaults(kind), set);
      const restored = decodeLampSettings(encodeCloudParameters(p));
      check(sameParameters(restored, p) && sameParameters(normalized(p), p) && same(cableSides(restored), set), 'Every cable side must persist in exported settings');
      check(!names.has(filename(p)), 'Different sets of outlets share a kit name');
      names.add(filename(p));
      // Moving the first outlet onto another's side swaps the two.
      p = selectCableSide(p, set[set.length - 1]!);
      check(
        same(cableSides(p), [set[set.length - 1]!, ...set.slice(1, -1), set[0]!]) && filename(p) === filename(restored),
        'Selecting a used side must swap outlets',
      );
      p = selectCableSide(p, set[set.length - 1]!, set.length - 1);
      check(same(cableSides(p), set), 'Selecting a used side for a later outlet must swap outlets');
      let duplicate: CloudParameters = { ...p };
      let unique = wallLampDefaults(kind);
      if (set.length < 4) {
        duplicate.fourthCableSide = duplicate.cableSide;
        unique = withCableSides(unique, set);
      } else {
        duplicate.thirdCableSide = duplicate.secondCableSide;
        unique = withCableSides(unique, [set[0]!, set[1]!, set[3]!]);
      }
      duplicate = normalized(duplicate);
      check(sameParameters(duplicate, unique), 'Duplicate sides must not create coincident fittings');
      if (set.length === 3) {
        // A gap closes up: the third outlet becomes the second.
        const gap: CloudParameters = { ...p, secondCableSide: null };
        check(same(cableSides(normalized(gap)), [set[0]!, set[2]!]) && normalized(gap).thirdCableSide === null, 'An outlet after a gap was lost');
      }
      const more = setCableOutletCount(p, 4);
      check(
        cableSides(more).length === 4 && new Set(cableSides(more)).size === 4 && same(cableSides(more).slice(0, set.length), set),
        'Adding outlets moved the others',
      );
      p = setCableOutletCount(p, set.length - 1);
      check(same(cableSides(p), set.slice(0, -1)), 'Turning off the last outlet changed the others');
      p = setCableOutletCount(p, 1);
      check(same(cableSides(p), [set[0]!]) && p.secondCableSide === null && p.thirdCableSide === null && p.fourthCableSide === null, 'Turning off the outlets lost the first');
    }
    let single = wallLampDefaults(kind);
    const steps: [number, CableSide[]][] = [
      [2, ['right', 'left']],
      [3, ['right', 'left', 'bottom']],
      [4, ['right', 'left', 'bottom', 'top']],
    ];
    for (const [count, expected] of steps) {
      single = setCableOutletCount(single, count);
      check(same(cableSides(single), expected), `New outlets start on unexpected sides: ${cableSides(single).join(', ')}`);
    }
  });
});

describe('chained outlets: the kits', () => {
  const designs: CloudParameters[] = [
    ...CLOUD_STYLES.flatMap((style) => [false, true].map((mirrored) => ({ ...cloudParameters(), style, mirrored }))),
    ...SUN_STYLES.map((sunStyle) => ({ ...wallLampDefaults('sun'), sunStyle })),
  ];
  const cases = designs.map((design, designIndex) => [displayName(design), design.mirrored, designIndex, design] as const);

  it.each(FULL ? shardOf(cases) : cases.filter(([, , designIndex]) => designIndex === 0 || designIndex === 12))('%s, mirrored %s', (_, __, designIndex, design) => {
    sets.forEach((set, setIndex) => {
      if (!FULL && setIndex !== 0 && set.length !== 4) return;
      for (let variant = 0; variant < 3; variant++) {
        // Each outlet comes first somewhere: the mesher takes them in turn.
        const turn = (designIndex + variant) % set.length;
        let p = withCableSides(design, [...set.slice(turn), ...set.slice(0, turn)]);
        if (variant === 0) p = { ...p, width: minimumWidth(p), depth: 16, cableDiameter: 6, nailHead: 10, nailShaft: 5, clipFit: 0.5 };
        if (variant === 2) p = { ...p, width: 500, depth: 40, cableDiameter: 2, strainRelief: false };
        // Exercise both print orientations, including both skirt notches.
        if (variant === 0 && (designIndex + setIndex) % 2 === 0) p = { ...p, surface: 'sculpted' };
        p = normalized(p);
        if (p.surface === 'sculpted' && waitsFor.k4c) continue;
        const label = `${displayName(p)}, ${Math.trunc(p.width)} mm, ${cableSides(p).join('+')}, ${p.surface}`;
        checkLEDLayout(p);
        for (const quality of FULL ? (['preview', 'export'] as const) : (['preview'] as const)) {
          const kit = new CloudKit(p, quality);
          const back = parseSTL(binarySTL(kit.back)), front = parseSTL(binarySTL(kit.front));
          back.validate();
          front.validate();
          check(back.vertices.length - back.triangles.length / 2 === 2 - 2 * set.length, `Back must have one cable through-path per outlet: ${label}`);
          check(front.vertices.length - front.triangles.length / 2 === 2, `Front must remain one closed shell: ${label}`);
          check(Math.abs(back.dimensions.x - p.width) < 0.003 && Math.abs(back.dimensions.y - height(p)) < 0.003, `Several outlets changed dimensions: ${label}`);
          check(kit.cables.length === set.length && kit.printedParts === 2 + set.length + 2 * kit.clampCount, 'Wrong parts count with several outlets');
          check(kit.clampCount === cableConfigurations(p).filter((q) => CableClamp.create(q) !== null).length, `A clamp lost its posts: ${label}`);
          check(kit.assembly().triangles.length === kit.assemblyColors.length, 'Assembly colors miss an outlet');
          check(kit.backWithLEDGuides.triangles.length === kit.backColors.length, 'Back preview colors miss an outlet');
          const placed = kit.placedFront();
          const clamps = kit.cables.flatMap((cable) => (cable.clamp === null ? [] : [cable.clamp]));
          for (const cable of kit.cables) {
            const seal = parseSTL(binarySTL(cable.seal));
            checkCableOutlet(cable.parameters, back, placed, seal, false, clamps);
            if (variant !== 2) checkCableClamp(cable.parameters, back, placed, cable.placedSeal(), false);
            check(kit.instructions.includes(cable.sealFilename), 'Assembly guide misses a seal');
            check(kit.instructions.includes(`## ${CABLE_SIDE_TITLE[cable.parameters.cableSide]} cable outlet`), 'Assembly guide misses an outlet');
            check(kit.ledPlan.svg.includes(CABLE_SIDE_TITLE[cable.parameters.cableSide]), 'LED plan misses an outlet');
          }
          if (variant === 1 && quality === 'export') {
            const entries = kit.entries();
            check(new Set(entries.map(([name]) => name)).size === entries.length, 'Outlet parts overwrite each other');
            check(entries.filter(([name]) => name.endsWith('.stl')).length === kit.printedParts, 'Wrong STL count');
            for (const cable of kit.cables) {
              check(entries.some(([name]) => name === cable.sealFilename), 'Export lacks a side-specific seal');
            }
          }
        }
      }
    });
  }, 3_600_000);
});
