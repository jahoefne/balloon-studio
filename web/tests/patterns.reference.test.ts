// WP-K3: the 3MF exports against the Swift references (references/manifest.json), the 41 cases
// `part: "pattern"`, plus blur and summed-area tables bit for bit. Relief and text cases get the Swift rasters
// through core/patterns/fileRaster, which proves the mesh side independently of the rasterizer.
//
// Where the rasters come from: the pack (`rasters/`), and tests/fixtures/patterns for the four migration
// cases the pack has no dump for (same exporter, `--rasters`). Without the pack (CI so far) the 10 identity and
// those 4 cases still run: Tier A covers everything but the model, and PINNED_MODELS covers the model. The six
// big reliefs (85-198 MB each) run with FULL=1.
//
// Rounding noise decides a few refinement edges (TIE_FLIPS): those cases cannot pass the harness's
// line-by-line rule with our libm. With Apple's values for sin, cos, atan, atan2 and hypot all 41 3MF files
// are byte-identical to Swift's (tests/patterns.replay.test.ts repeats that).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareCase, expectNormalized, expectReference, getCase, hasPack, isExported, loadCaseBody, loadManifest, packDir, type CaseResult, type ExportedCase } from '../harness';
import { generate } from '../src/core/balloon/balloonGenerator';
import { classic, filename, fromValue, normalized as normalizedParameters, toJSON } from '../src/core/balloon/balloonParameters';
import { sha256 } from '../src/core/io/sha256';
import { makePatternSettings, normalized, normalizedPurge, PaintedBalloon, patternFromValue, patternToJSON, purgeFromValue, purgeToJSON, PURGE_DEFAULTS } from '../src/core/patterns/balloonPatterns';
import { fileReliefRasterizers, fileTextRasterizers, NO_RASTERIZERS, parseDumpInfo, type ReliefDumpInfo } from '../src/core/patterns/fileRaster';
import { NightFlightRelief } from '../src/core/patterns/nightFlightRelief';
import type { PatternRasterizers } from '../src/core/patterns/raster';
import { threeMF } from '../src/core/patterns/threeMF';
import { zipEntries } from '../src/core/testing/zipReader';
import { compareRefinedModels } from './support/refinementFlips';
import { fixtureBytes } from './support/swiftProbe';

const FULL = process.env['FULL'] !== undefined && process.env['FULL'] !== '';
const MODEL = '3D/3dmodel.model';

const cases = loadManifest().cases.filter((c): c is ExportedCase => c.part === 'pattern' && isExported(c));
const identity = cases.filter((c) => c.group === 'identity');
const reliefCases = cases.filter((c) => c.group === 'relief');
const textCases = cases.filter((c) => c.group === 'text');

/** Dumps the pack lacks: their cases had no `rasters` flag when refs-v1 was made. */
const FIXTURE_RASTERS = new Set(['relief-night-flight-legacy', 'relief-night-flight-v2', 'relief-summit-saved', 'text-legacy-milo']);
const BIG_RELIEFS = new Set(reliefCases.filter((c) => !FIXTURE_RASTERS.has(c.id)).map((c) => c.id));

/**
 * SHA-256 of the TS model where the file differs from Swift's by rounding noise only. The pack verified
 * each of them once; with the pack the comparison runs and the pin is checked as well.
 */
const PINNED_MODELS: Readonly<Record<string, string>> = {
  'pattern-stripes': '9a95f45b2740df87f2463d651fe4870f6e5f65457682ec413220a3cd228d2980',
  'pattern-hearts': '0c95d839fd5b25a8a3507757944d7734a089b7e35cbeea75aacd15b0ec7a2abf',
  'pattern-dots': 'acfb6b149574ff0873b6cb94fdaa1a43cb6f1a3eb0e481aff6a308f54ffeb554',
  'pattern-diamonds': 'f5e93ec30a429dc75d5e6a4f5332ff574dc47c45b466c2d3f13228165b341306',
  'pattern-stripes-24-rigged': '15aa095a4563c55c8ca40f0b1016595929d2f682f66edbf3166564c5b0098cb0',
  'pattern-dots-one-row': 'd12411758306809c67d09dd1cfb250d4d9169b5a2c389cf347aa00fc5189899c',
  'pattern-hearts-dense': '5137013370a5dc40b0123692874e7af6d7e44e9b1cc72b8cac787047112d3e0e',
  'pattern-purge': 'd4883222098e1353c18c88b4afc4d35fa937fd359084d5c8ab8263d61672096c',
  'pattern-hearts-same-colors': 'b827f62c3757fd99d26f0bb9f606880cd32433e19168913622eecaa7f1278629',
  'pattern-legacy-hearts': 'd89fcd41aa409d594cc8766a1be3f5915c3b783aa502e082aad17f8a2af6065b',
  'relief-night-flight-legacy': '38fd001b53dbc317183e1b2ec1649479e2bd13a5f415380ba18d7ea9c1e159a7',
  'relief-night-flight-v2': '457954fef31305af19e765a9f7b69b5912e1a4addc4a0501de5cae613c5a7757',
  'relief-summit-saved': 'deb57b2cb8668ab4256022812d6f1ea067cfac7506920386ec3d5b87f4ba0cb3',
  'text-legacy-milo': '979328202ba1f19717ed0f40feb0f45c59054e93d81a6a4359012d6f1aef22f2',
};

/**
 * Cases whose refinement differs in a few edges. A vertex on a meridian can land exactly on a pixel
 * column of the mask or the field: `floor(x * columns)` in crossesBoundary and occupied then depends on the
 * last bit of atan2 and of the sin and cos behind the vertex, in Swift as here. A flip subdivides a few
 * more or fewer faces, which renumbers the vertices after them, so the model is compared by position.
 * Measured at most: 52 vertices and 201 triangles without a partner, 1.4e-7 mm between matched vertices
 * (a Float(u) in NightFlightRelief.sample rounding the other way), 1.3e-8 relative volume.
 */
const TIE_FLIPS: ReadonlySet<string> = new Set([
  'text-sans-hello',
  'text-serif-zoe-lea',
  'text-mono-hello',
  'relief-night-flight-classic',
  'relief-night-flight-round',
  'relief-night-flight-tall',
  'relief-summit-classic',
  'relief-summit-round',
  'relief-summit-tall',
  'relief-night-flight-legacy',
  'relief-night-flight-v2',
  'relief-summit-saved',
]);
const TIE_FLIP_LIMITS = { vertices: 200, triangles: 800, maxDistance: 1e-6, volumeDifference: 1e-5 };

function rasterBytes(c: ExportedCase, name: string): Uint8Array | null {
  if (FIXTURE_RASTERS.has(c.id)) return fixtureBytes(`patterns/${name}${name.endsWith('.json') ? '' : '.gz'}`);
  const path = resolve(packDir(), 'rasters', name);
  return existsSync(path) ? new Uint8Array(readFileSync(path)) : null;
}

function rasterizersOf(c: ExportedCase): PatternRasterizers | null {
  if (c.group === 'identity') return NO_RASTERIZERS;
  if (c.group === 'relief') {
    const raw = rasterBytes(c, `${c.id}.raw.pgm`);
    return raw === null ? null : fileReliefRasterizers(raw);
  }
  const pgm = rasterBytes(c, `${c.id}.pgm`);
  const info = rasterBytes(c, `${c.id}.json`);
  return pgm === null || info === null ? null : fileTextRasterizers(pgm, info);
}

function settingsOf(c: ExportedCase) {
  const grid = getCase(c.id);
  const p = normalizedParameters(grid.parameters === undefined || grid.parameters === null ? classic : fromValue(grid.parameters));
  const settings = normalized(grid.pattern === undefined || grid.pattern === null ? makePatternSettings() : patternFromValue(grid.pattern), p);
  const purge = normalizedPurge(grid.purge === undefined || grid.purge === null ? PURGE_DEFAULTS : purgeFromValue(grid.purge));
  return { p, settings, purge };
}

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const results: string[] = [];

function report(result: CaseResult, note: string): void {
  results.push(`${result.id}: ${result.status} maxUlp ${result.maxUlp} ulpCount ${result.ulpCount} ts ${Math.round(result.tsMs ?? 0)} ms swift ${result.swiftMs} ms ${note}`);
}

function checkCase(c: ExportedCase, rasterizers: PatternRasterizers): void {
  const { p, settings, purge } = settingsOf(c);
  expectNormalized(c.id, toJSON(p));
  expectNormalized(c.id, patternToJSON(settings), 'pattern');
  expectNormalized(c.id, purgeToJSON(purge), 'purge');
  const suffix = settings.style === 'Night Flight' ? '-night-flight' : settings.style === 'Summit Cable Car' ? '-summit-cable-car' : '-pattern';
  expect(filename(p).replace(/\.stl$/, `${suffix}.3mf`)).toBe(c.filename);
  const started = performance.now();
  const bytes = threeMF(PaintedBalloon.make(generate(p, c.quality), p, settings, rasterizers), settings, purge);
  const tsMs = performance.now() - started;
  const model = zipEntries(bytes).find((entry) => entry.name === MODEL)?.data as Uint8Array;
  const pin = PINNED_MODELS[c.id];
  if (pin !== undefined) expect(hex(sha256(model)), `${c.id}: model SHA-256 (rerun with the pack before changing the pin)`).toBe(pin);
  if (!TIE_FLIPS.has(c.id)) {
    const result = expectReference(c.id, bytes, { tsMs, allowUnverified: pin !== undefined });
    report(result, result.notes.at(-1) ?? '');
    return;
  }
  // A listed case: everything but the model through the harness, the model by position.
  const result = compareCase(c.id, bytes, { tsMs });
  if (result.status === 'identical' || result.status === 'ulp') {
    results.push(`${c.id}: ${result.status}, no flip this time: TIE_FLIPS is stale`);
    return;
  }
  const rest = compareCase(c.id, bytes, { tsMs, skipEntries: [MODEL] });
  expect(rest.status, `${c.id}: entries other than the model`).not.toBe('mismatch');
  const body = loadCaseBody(c);
  if (body === null) {
    // Without the pack the pin stands in for the model, as for the other pinned cases.
    results.push(`${c.id}: pinned, the tie flips were counted with the pack`);
    return;
  }
  const flips = compareRefinedModels(zipEntries(body).find((entry) => entry.name === MODEL)?.data as Uint8Array, model);
  const limits = TIE_FLIP_LIMITS;
  expect(flips.verticesOnlyTs, `${c.id}: ${JSON.stringify(flips)}`).toBeLessThanOrEqual(limits.vertices);
  expect(flips.verticesOnlyReference, `${c.id}: ${JSON.stringify(flips)}`).toBeLessThanOrEqual(limits.vertices);
  expect(flips.trianglesOnlyTs, `${c.id}: ${JSON.stringify(flips)}`).toBeLessThanOrEqual(limits.triangles);
  expect(flips.trianglesOnlyReference, `${c.id}: ${JSON.stringify(flips)}`).toBeLessThanOrEqual(limits.triangles);
  expect(flips.maxDistance, `${c.id}: ${JSON.stringify(flips)}`).toBeLessThanOrEqual(limits.maxDistance);
  expect(flips.volumeDifference, `${c.id}: ${JSON.stringify(flips)}`).toBeLessThanOrEqual(limits.volumeDifference);
  results.push(`${c.id}: tie flip ${JSON.stringify(flips)} ts ${Math.round(tsMs)} ms swift ${result.swiftMs} ms`);
}

describe('patterns against the Swift references', () => {
  it('has the 41 cases', () => {
    expect([identity.length, reliefCases.length, textCases.length]).toEqual([10, 9, 22]);
  });

  describe.each([...identity, ...textCases, ...reliefCases])('$id', (c) => {
    const available = hasPack() || c.group === 'identity' || FIXTURE_RASTERS.has(c.id);
    it.skipIf(!available || (BIG_RELIEFS.has(c.id) && !FULL))('exports the same 3MF', { timeout: 600_000 }, () => {
      checkCase(c, rasterizersOf(c) as PatternRasterizers);
    });
  });

  it('reports', () => {
    if (results.length > 0) process.stderr.write(`${results.map((line) => `[patterns.reference] ${line}`).join('\n')}\n`);
  });
});

/**
 * SHA-256 of NightFlightRelief.coverage and .boundaries as little-endian Int32, read from a Swift build by
 * Mirror (a throwaway probe next to the exporter; the dumps do not contain the tables).
 */
const SWIFT_TABLES: Readonly<Record<string, readonly [string, string]>> = {
  'relief-night-flight-classic': ['3f3e3fb00a9e28575b45c688e5895911b3cbb8593864240b5ecf65430f2d6aa4', 'fcbb1d0045f2ef077e05e04a74ccd73ab3e4880948c3f71ef500694000ced748'],
  'relief-night-flight-round': ['28e9f90ed99381368dda5b75aa3b0fd7e37ad93eadb40cb05a56a3aa792a665e', '87d3f22a266ba1fbc17048c2fc05baffa25eaff8bdf2ba4fb962396433caa985'],
  'relief-night-flight-tall': ['f54a7dd5a729d2adcbc72b560467a502560cf845066a068c36da339f41c7dcf8', '3ad8b3bd9786927b9b2fdebf0c66b25f29119acd9fe4cd492ea4d773485b7b2c'],
  'relief-summit-classic': ['843900235d9a45efa4cea5ae15138214a4d9931fda39bec819ef28e753575097', '8a8d372ac7a421ed77cc7ba819262e50b5f803b35c7a90cac0c04e23c39d0bd6'],
  'relief-summit-round': ['37c3eef1532d168c613b103b2aed309dd3ec5608786a8bb229cdc64c6f2e32af', '6903da0b6f6a48718ae6aa9a310f80a1d587f4aff0defd0e3dec28518ecbf770'],
  'relief-summit-tall': ['79039cccfb24b44e8853400805f308fe25e55f48b3dbac2ff6c8de2089799d27', 'ed390180f39862ac64e188429543a77cb5e6b1517ed0f6d1bddaeb2a8410255d'],
  'relief-night-flight-legacy': ['02b0d4413ed9ef95edf746c0b3fca1d88e82710be7094c1e254f6997f15cc798', '0c2e3e78114315ed0c045624c946cdb9c34c4b1d997d0750a3391513a644c52e'],
  'relief-night-flight-v2': ['f6ce5d182904351a88a7ebdab26edcf01f83a558f05092cf597bb535d515787d', '40a2fbd629f7232fef902fdedae04884e8f14b2833c02e86200ccb06392f82e5'],
  'relief-summit-saved': ['cf71877ff2200a4d57e3ffa40394d175dcf63f59f5267091bbb6e1a6414cbd02', '374cf10ce04b0a51c7aa0688349acb839780cff11551c88cbd0c718b58f762f7'],
};

describe('blur and summed-area tables against Swift, bit for bit', () => {
  describe.each(reliefCases)('$id', (c) => {
    const available = hasPack() || FIXTURE_RASTERS.has(c.id);
    it.skipIf(!available)('field, tables and crest', () => {
      const { p, settings } = settingsOf(c);
      const raw = rasterBytes(c, `${c.id}.raw.pgm`) as Uint8Array;
      const info = parseDumpInfo<ReliefDumpInfo & { fieldSha256: string }>(rasterBytes(c, `${c.id}.json`) as Uint8Array);
      const relief = new NightFlightRelief(settings, p, generate(p, c.quality), fileReliefRasterizers(raw));
      expect([relief.width, relief.height, relief.bottom, relief.depth, relief.columns, relief.rows]).toEqual([info.width, info.height, info.bottom, info.depth, info.columns, info.rows]);
      // Toleranz 0: the emulated Float32 blur against the height field Swift computed from the same bitmap.
      expect(hex(sha256(new Uint8Array(relief.pixels.buffer))), 'field SHA-256').toBe(info.fieldSha256);
      const field = FIXTURE_RASTERS.has(c.id) ? null : rasterBytes(c, `${c.id}.field.f32`);
      if (field !== null) expect(Buffer.from(relief.pixels.buffer).equals(field), 'field bytes').toBe(true);
      const tables = SWIFT_TABLES[c.id] as readonly [string, string];
      expect(hex(sha256(new Uint8Array(relief.coverage.buffer))), 'coverage').toBe(tables[0]);
      expect(hex(sha256(new Uint8Array(relief.boundaries.buffer))), 'boundaries').toBe(tables[1]);
      // The crest comes from hypot on the generator's vertices, so it carries libm noise.
      expect(relief.crest.length).toBe(info.crest.length);
      relief.crest.forEach((radius, i) => expect(Math.abs(radius - (info.crest[i] as number))).toBeLessThanOrEqual(1e-12 * radius));
    });
  });
});
