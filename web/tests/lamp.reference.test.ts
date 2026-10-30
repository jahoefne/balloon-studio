// The lamp kits against the Swift references (WP-K4a acceptance): each kit's ZIP, entry by entry,
// through the harness. Texts, SVG, JSON, Tier A parts and every
// hash are checked without the pack; what only the pack could settle warns. A libm tie flip that
// keeps the body passes as `equivalent` only for the entries in harness/equivalentCases.ts.
import { describe, it } from 'vitest';
import { allCases, expectNormalized, expectReference, type ReferenceCase } from '../harness';
import { encodeCloudParameters, filename, normalized } from '../src/core/lamp/cloudGeometry';
import { CloudKit } from '../src/core/lamp/cloudKit';
import { wallLampDefaults } from '../src/core/lamp/sunGeometry';
import { check } from '../src/core/testing/check';
import { decodedCase, LIBM_FLIPPED_FRONTS, waitsFor, type GridCase } from './support/lamp';

const lampCases = allCases().filter((c) => c.part === 'cloud' || c.part === 'sun');
const isSculpted = (c: ReferenceCase): boolean => (c.parameters as { surface?: string } | null | undefined)?.surface === 'sculpted';
const runKit = (c: ReferenceCase): void => {
  const p = normalized(decodedCase(c as unknown as GridCase, wallLampDefaults));
  expectNormalized(c.id, encodeCloudParameters(p));
  if ('filename' in c) check(filename(p) === c.filename, `${c.id}: kit name`);
  const started = Date.now();
  const bytes = new CloudKit(p, c.quality).archive();
  const tsMs = Date.now() - started;
  const flipped = LIBM_FLIPPED_FRONTS[c.id];
  expectReference(c.id, bytes, { allowUnverified: true, tsMs, ...(flipped === undefined ? {} : { skipEntries: [flipped] }) });
};

describe('flat lamp kits against the Swift references', () => {
  it.each(lampCases.filter((c) => !isSculpted(c)).map((c) => [c.id, c] as const))('%s', (_, c) => runKit(c), 120_000);
});

// Two of these have a front that passes only in lampSurface.reference.test.ts.
describe.skipIf(waitsFor.k4c)('sculpted lamp kits against the Swift references', () => {
  it.each(lampCases.filter(isSculpted).map((c) => [c.id, c] as const))('%s', (_, c) => runKit(c), 300_000);
});
