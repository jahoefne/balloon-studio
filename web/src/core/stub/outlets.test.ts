// Outlet logic after CloudGeometry.swift:139-178, ported from CableOutletTests.checkChainedOutlets
// (CableOutletTests.swift:6-53) without the kit meshes.

import { describe, expect, it } from 'vitest';
import { CABLE_SIDES, type CableSide, type CloudParameters, type WallLampKind } from '../types';
import { core } from './index';

const cloud = core.cloud;
const sidesOf = (p: CloudParameters) => cloud.derived(p).cableSides;

const subsets = (size: number, start: number): CableSide[][] =>
  size === 0 ? [[]] : CABLE_SIDES.slice(start).flatMap((side, i) => subsets(size - 1, start + i + 1).map((rest) => [side, ...rest]));
const sets = [2, 3, 4].flatMap((size) => subsets(size, 0));

describe.each(['cloud', 'sun'] as WallLampKind[])('%s outlets', (kind) => {
  it('covers the six pairs, four triples and the four sides', () => {
    expect(sets.length).toBe(11);
  });

  it.each(sets.map((set) => [set.join('+'), set] as const))('%s: persists, swaps, adds and removes like Swift', (_, set) => {
    let p = cloud.withCableSides(cloud.defaults(kind), set);
    const restored = core.lampSettings.decode(cloud.codec.encode(p));
    expect(restored).toEqual(p);
    expect(cloud.normalize(p)).toEqual(p);
    expect(sidesOf(restored)).toEqual(set);

    // Moving the first outlet onto another's side swaps the two.
    p = cloud.selectCableSide(p, set[set.length - 1]!);
    expect(sidesOf(p)).toEqual([set[set.length - 1], ...set.slice(1, -1), set[0]]);
    expect(cloud.filename(p)).toBe(cloud.filename(restored));
    p = cloud.selectCableSide(p, set[set.length - 1]!, set.length - 1);
    expect(sidesOf(p)).toEqual(set);

    // Duplicate sides do not create coincident fittings.
    let duplicate: CloudParameters, unique: CloudParameters;
    if (set.length < 4) {
      duplicate = { ...p, fourthCableSide: p.cableSide };
      unique = cloud.withCableSides(cloud.defaults(kind), set);
    } else {
      duplicate = { ...p, thirdCableSide: p.secondCableSide };
      unique = cloud.withCableSides(cloud.defaults(kind), [set[0]!, set[1]!, set[3]!]);
    }
    expect(cloud.normalize(duplicate)).toEqual(unique);

    if (set.length === 3) {
      // A gap closes up: the third outlet becomes the second.
      const gap = cloud.normalize({ ...p, secondCableSide: null });
      expect(sidesOf(gap)).toEqual([set[0], set[2]]);
      expect(gap.thirdCableSide).toBeNull();
    }

    const more = cloud.setCableOutletCount(p, 4);
    expect(sidesOf(more).length).toBe(4);
    expect(new Set(sidesOf(more)).size).toBe(4);
    expect(sidesOf(more).slice(0, set.length)).toEqual(set);

    p = cloud.setCableOutletCount(p, set.length - 1);
    expect(sidesOf(p)).toEqual(set.slice(0, -1));
    p = cloud.setCableOutletCount(p, 1);
    expect(sidesOf(p)).toEqual([set[0]]);
    expect([p.secondCableSide, p.thirdCableSide, p.fourthCableSide]).toEqual([null, null, null]);
  });

  it('starts new outlets opposite the previous one, then bottom, top, right, left', () => {
    let single = cloud.defaults(kind);
    for (const [count, expected] of [
      [2, ['right', 'left']],
      [3, ['right', 'left', 'bottom']],
      [4, ['right', 'left', 'bottom', 'top']],
    ] as const) {
      single = cloud.setCableOutletCount(single, count);
      expect(sidesOf(single)).toEqual(expected);
    }
    const fromTop = { ...cloud.defaults(kind), cableSide: 'top' as const };
    expect(sidesOf(cloud.setCableOutletCount(fromTop, 3))).toEqual(['top', 'bottom', 'right']);
    expect(sidesOf(cloud.setCableOutletCount(fromTop, 4))).toEqual(['top', 'bottom', 'right', 'left']);
  });

  it('mirrors the editor toggle setCableOutlet(index, enabled)', () => {
    // CloudEditor.swift:68-73: on adds up to index+1 outlets, off keeps the first `index`.
    const setCableOutlet = (p: CloudParameters, index: number, enabled: boolean) => cloud.setCableOutletCount(p, enabled ? index + 1 : index);
    let p = cloud.defaults(kind);
    p = setCableOutlet(p, 1, true);
    p = setCableOutlet(p, 2, true);
    expect(sidesOf(p)).toEqual(['right', 'left', 'bottom']);
    p = setCableOutlet(p, 1, false);
    expect(sidesOf(p)).toEqual(['right']);
    expect(cloud.setCableOutletCount(p, 0)).toEqual(p);
  });

  it('ignores an outlet index that does not exist', () => {
    const p = cloud.defaults(kind);
    expect(cloud.selectCableSide(p, 'top', 2)).toEqual(p);
    expect(sidesOf(cloud.selectCableSide(p, 'top'))).toEqual(['top']);
  });

  it('splits into single-outlet configurations', () => {
    const p = cloud.withCableSides(cloud.defaults(kind), ['bottom', 'left']);
    expect(cloud.cableConfigurations(p).map(sidesOf)).toEqual([['bottom'], ['left']]);
  });
});
