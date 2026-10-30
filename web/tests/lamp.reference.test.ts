// The lamp kits against the Swift references (WP-K4a acceptance): each kit's ZIP, entry by entry,
// through the harness. A kit waits for WP-K4b, a sculpted front also for WP-K4c. Texts, SVG, JSON,
// Tier A parts and every hash are checked without the pack; what only the pack could settle warns.
import { describe, it } from 'vitest';
import { allCases, expectNormalized, expectReference, hasPack, loadEntryBody, type ExportedCase, type ReferenceCase } from '../harness';
import { encodeCloudParameters, filename, normalized } from '../src/core/lamp/cloudGeometry';
import { CloudKit } from '../src/core/lamp/cloudKit';
import { wallLampDefaults } from '../src/core/lamp/sunGeometry';
import { check } from '../src/core/testing/check';
import { parseSTL } from '../src/core/testing/stl';
import { zipEntries } from '../src/core/testing/zipReader';
import { decodedCase, waitsFor, type GridCase } from './support/lamp';

// With Apple's sin, cos, atan2, … substituted for dmath, every vertex of every flat kit is bit-identical
// to Swift's. These cases differ only through fdlibm against Apple's libm, in the two ways the
// harness has no tolerance for (see the PR). Their STLs are compared by `expectSameSolid` instead.
const LIBM_NEAR_ZERO = ['cloud-small-100-16', 'cloud-width-125', 'cloud-legacy-100', 'cloud-fixture-cloud-lamp-100', 'cloud-fixture-cloud-lamp-100-led-rows'];
// CableClamp.annulus (CableClamp.swift:361-363): a post's corner lies exactly between two points of the
// hole, so rounding noise picks where the fan of the post's top starts. Same vertices, same faces' count.
const LIBM_ANNULUS_TIE = ['cloud-drift', 'sun-cable-bottom'];

/** The same vertices within 1e-5 mm, whatever their order, and as many triangles. */
const expectSameSolid = (id: string, expected: Uint8Array, actual: Uint8Array, name: string): void => {
  const a = parseSTL(expected), b = parseSTL(actual);
  check(a.triangles.length === b.triangles.length && a.vertices.length === b.vertices.length, `${id}/${name}: other topology`);
  const byPosition = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }): number =>
    Math.round(p.x * 1e5) - Math.round(q.x * 1e5) || Math.round(p.y * 1e5) - Math.round(q.y * 1e5) || Math.round(p.z * 1e5) - Math.round(q.z * 1e5);
  const sortedA = [...a.vertices].sort(byPosition), sortedB = [...b.vertices].sort(byPosition);
  sortedA.forEach((p, i) => {
    const q = sortedB[i]!;
    check(Math.abs(p.x - q.x) < 1e-5 && Math.abs(p.y - q.y) < 1e-5 && Math.abs(p.z - q.z) < 1e-5, `${id}/${name}: vertex ${i} moved`);
  });
};

const lampCases = allCases().filter((c) => c.part === 'cloud' || c.part === 'sun');
const isSculpted = (c: ReferenceCase): boolean => (c.parameters as { surface?: string } | null | undefined)?.surface === 'sculpted';
const entryNames = (c: ReferenceCase, pattern: RegExp): string[] => (c as ExportedCase).entries!.map((e) => e.name).filter((name) => pattern.test(name));
const runKit = (c: ReferenceCase): void => {
  const p = normalized(decodedCase(c as unknown as GridCase, wallLampDefaults));
  expectNormalized(c.id, encodeCloudParameters(p));
  if ('filename' in c) check(filename(p) === c.filename, `${c.id}: kit name`);
  const started = Date.now();
  const bytes = new CloudKit(p, c.quality).archive();
  const tsMs = Date.now() - started;
  const skipEntries = LIBM_NEAR_ZERO.includes(c.id) ? entryNames(c, /^[AB]-/) : LIBM_ANNULUS_TIE.includes(c.id) ? entryNames(c, /^A-/) : [];
  expectReference(c.id, bytes, { allowUnverified: true, tsMs, skipEntries });
  if (skipEntries.length === 0 || !hasPack()) return;
  const actual = zipEntries(bytes);
  for (const name of skipEntries) {
    const entry = (c as ExportedCase).entries!.find((e) => e.name === name)!;
    expectSameSolid(c.id, loadEntryBody(c as ExportedCase, entry)!, actual.find((e) => e.name === name)!.data, name);
  }
};

describe.skipIf(waitsFor.k4b)('flat lamp kits against the Swift references', () => {
  it.each(lampCases.filter((c) => !isSculpted(c)).map((c) => [c.id, c] as const))('%s', (_, c) => runKit(c), 120_000);
});

describe.skipIf(waitsFor.k4b || waitsFor.k4c)('sculpted lamp kits against the Swift references', () => {
  it.each(lampCases.filter(isSculpted).map((c) => [c.id, c] as const))('%s', (_, c) => runKit(c), 300_000);
});
