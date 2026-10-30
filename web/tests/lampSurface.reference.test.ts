// The two sculpted clouds, whose fronts are not Swift's triangles on core/swift/dmath as it ships.
//
// A cell of the mesher's grid is often symmetric, so `refine` meets exact ties: two equal edges in
// `longest` (LampSurface.swift:237), two equal diagonals (:281). The input vertices then decide, and
// they carry libm noise. In these kits the noise of one `atan2` (classic: the outlet's angle,
// CableSeal.swift) or two (billow-min) is enough to split another edge there. The front then differs
// in a few vertices, and the shell above them follows that surface (about 0.01 mm).
//
// As they ship, these fronts pass as `equivalent-bounded`: lamp.reference.test.ts, with the limits in
// harness/equivalentCases.ts. This file is the proof named there: with Apple's value for exactly
// those arguments each kit passes the harness with every corner bit-identical, so everything apart
// from libm is an exact port.
// Found by replaying every libm argument of the four sculpted kits with Foundation, then by
// bisecting the arguments that differ (6534 and 5166 `atan2`s) down to these three.
import { describe, it, vi } from 'vitest';

vi.mock('../src/core/swift/dmath', async (original) => {
  const real = await original<typeof import('../src/core/swift/dmath')>();
  const table = new Map<string, number>([
    ['0.11,0.28', 0.37433361600758386],
    ['28.6,-3.582091887506008e-15', 1.5707963267948968],
    ['-3.6770320088189274,-3.3135231410269412', -2.304241283631431],
  ]);
  return { ...real, atan2: (y: number, x: number): number => table.get(`${y},${x}`) ?? real.atan2(y, x) };
});

import { expectReference, getCase, hasPack, type ReferenceCase } from '../harness';
import { normalized } from '../src/core/lamp/cloudGeometry';
import { CloudKit } from '../src/core/lamp/cloudKit';
import { wallLampDefaults } from '../src/core/lamp/sunGeometry';
import { check } from '../src/core/testing/check';
import { decodedCase, type GridCase } from './support/lamp';
import { FULL } from './support/tier';

// All at export quality: the `full` tier.
describe.skipIf(!FULL || !hasPack()).each(['cloud-sculpted-classic', 'cloud-sculpted-billow-min'])('%s', (id) => {
  it("with Apple's atan2 for three arguments, has Swift's corners in every entry", () => {
    const c = getCase(id) as ReferenceCase;
    const kit = new CloudKit(normalized(decodedCase(c as unknown as GridCase, wallLampDefaults)), c.quality);
    // Empty allowlists: under Apple's values no entry may need `equivalent` or `equivalent-bounded`.
    const result = expectReference(id, kit.archive(), { equivalentCases: [], boundedCases: [] });
    check(result.status === 'ulp' || result.status === 'identical', `${id}: ${result.status}`);
    check(result.ulpCount === 0, `${id}: ${result.ulpCount} corners differ in the last bit`);
  }, 120_000);
});
