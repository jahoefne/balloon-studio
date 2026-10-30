// Ported from mac/Tests/CableOutletTests.swift @ cbda68d: the outlet logic of checkChainedOutlets
// (:6-51). The chained kits (:52-117) follow once the fittings exist (WP-K4b).
import { describe, it } from 'vitest';
import { cableSides, encodeCloudParameters, filename, normalized, selectCableSide, setCableOutletCount, withCableSides } from '../src/core/lamp/cloudGeometry';
import { decodeLampSettings } from '../src/core/lamp/lampSettingsFile';
import { wallLampDefaults } from '../src/core/lamp/sunGeometry';
import { check } from '../src/core/testing/check';
import { CABLE_SIDES, type CableSide, type CloudParameters, type WallLampKind } from '../src/core/types';
import { decoded, sameParameters } from './support/lamp';

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
