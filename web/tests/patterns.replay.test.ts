// WP-K3: with Apple's values for sin, cos, atan, atan2 and hypot the 3MF of a pattern case has to be
// byte-identical to Swift's: anything that vanishes here is libm noise and not the port (the K4a recipe).
// Opt-in, on a Mac with the pack:
//
//   K3_CASE=relief-summit-tall REPLAY_DIR=/tmp/replay/relief-summit-tall npx vitest run tests/patterns.replay.test.ts
//   tests/fixtures/swift/probes/libmReplay /tmp/replay/relief-summit-tall
//
// Repeat the pair until `<REPLAY_DIR>/result.txt` says `misses 0` (3 to 6 rounds, tables up to 170 MB per
// relief): every argument the run makes then has Apple's value, including those of the generator.
// Result on 2026-10-30: 41 of 41 cases `identical`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { compareCase, getCase, isExported, packDir, statusLabel, type ExportedCase } from '../harness';
import { generate } from '../src/core/balloon/balloonGenerator';
import { classic, fromValue, normalized as normalizedParameters } from '../src/core/balloon/balloonParameters';
import { makePatternSettings, normalized, normalizedPurge, PaintedBalloon, patternFromValue, purgeFromValue, PURGE_DEFAULTS } from '../src/core/patterns/balloonPatterns';
import { fileReliefRasterizers, fileTextRasterizers, NO_RASTERIZERS } from '../src/core/patterns/fileRaster';
import { threeMF } from '../src/core/patterns/threeMF';
import type * as Dmath from '../src/core/swift/dmath';
import type { LibmReplay } from './support/libmReplay';
import { fixtureBytes } from './support/swiftProbe';

const replays = vi.hoisted(() => ({ tables: {} as Record<string, LibmReplay> }));

vi.mock('../src/core/swift/dmath', async (original) => {
  const m = await original<typeof Dmath>();
  const dir = process.env['REPLAY_DIR'];
  if (dir === undefined) return m;
  const { makeReplay } = await import('./support/libmReplay');
  const tables = {
    sin: makeReplay(dir, 'sin', (x) => m.sin(x)),
    cos: makeReplay(dir, 'cos', (x) => m.cos(x)),
    atan: makeReplay(dir, 'atan', (x) => m.atan(x)),
    atan2: makeReplay(dir, 'atan2', (y, x) => m.atan2(y, x)),
    hypot: makeReplay(dir, 'hypot', (x, y) => m.hypot(x, y)),
  };
  replays.tables = tables;
  return {
    ...m,
    sin: (x: number) => tables.sin.call(x, 0),
    cos: (x: number) => tables.cos.call(x, 0),
    atan: (x: number) => tables.atan.call(x, 0),
    atan2: (y: number, x: number) => tables.atan2.call(y, x),
    hypot: (x: number, y: number) => tables.hypot.call(x, y),
  };
});

const dir = process.env['REPLAY_DIR'];
const id = process.env['K3_CASE'];

function raster(name: string): Uint8Array {
  const path = resolve(packDir(), 'rasters', name);
  return existsSync(path) ? new Uint8Array(readFileSync(path)) : fixtureBytes(`patterns/${name}${name.endsWith('.json') ? '' : '.gz'}`);
}

it.skipIf(dir === undefined || id === undefined)('a pattern case under Apple libm', { timeout: 600_000 }, () => {
  const c = getCase(id as string);
  if (!isExported(c)) throw new Error(`${id} has no export`);
  const exported: ExportedCase = c;
  const p = normalizedParameters(c.parameters === undefined || c.parameters === null ? classic : fromValue(c.parameters));
  const settings = normalized(c.pattern === undefined || c.pattern === null ? makePatternSettings() : patternFromValue(c.pattern), p);
  const purge = normalizedPurge(c.purge === undefined || c.purge === null ? PURGE_DEFAULTS : purgeFromValue(c.purge));
  const rasterizers = exported.group === 'relief' ? fileReliefRasterizers(raster(`${id}.raw.pgm`)) : exported.group === 'text' ? fileTextRasterizers(raster(`${id}.pgm`), raster(`${id}.json`)) : NO_RASTERIZERS;
  const bytes = threeMF(PaintedBalloon.make(generate(p, c.quality), p, settings, rasterizers), settings, purge);
  let misses = 0;
  for (const table of Object.values(replays.tables)) misses += table.flush();
  const result = compareCase(id as string, bytes);
  writeFileSync(`${dir}/result.txt`, `${id} misses ${misses} ${statusLabel(result)} maxUlp ${result.maxUlp} ulpCount ${result.ulpCount}\n`);
  if (misses === 0) expect(result.status).toBe('identical');
});
