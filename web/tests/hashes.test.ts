// The cross-engine gate of docs/plan.md §7: every raster in tests/fixtures/hashes.json and every text mask in
// tests/fixtures/text/mask-hashes.json is drawn again and must give the same SHA-256 in Node (npm test) and in Chromium,
// Firefox and WebKit (npm run test:browser). Imports core modules and bundled files only: no Node APIs, no pack. The last
// test logs one digest per engine, to compare runs at a glance.
import { describe, expect, it } from 'vitest';
import { rasterHash } from '../src/core/testing/raster';
import storedRasters from './fixtures/hashes.json';
import storedMasks from './fixtures/text/mask-hashes.json';
import { RASTER_SCENES, TEXT_MASK_SCENES } from './support/rasterScenes';

const rasters: Readonly<Record<string, string>> = storedRasters;
const masks: Readonly<Record<string, string>> = storedMasks;
// The worst-case scene takes about 0.25 s in every engine on a Mac; the margin is for shared CI runners.
const TIMEOUT_MS = 120_000;

describe('raster hashes', () => {
  const drawn = new Map<string, string>();

  it('has a drawing for every stored hash and a stored hash for every drawing', () => {
    // A key that only one side has: a line in tests/support/rasterScenes.ts, or a refresh (tests/fixtures/README.md, "Hashes").
    expect(Object.keys(rasters).sort()).toEqual(Object.keys(RASTER_SCENES).sort());
    expect(Object.keys(masks).sort()).toEqual(Object.keys(TEXT_MASK_SCENES).sort());
  });

  for (const [key, hash] of Object.entries(rasters)) {
    it(key, () => {
      const scene = RASTER_SCENES[key];
      if (scene === undefined) throw new Error(`hashes.json has ${key}, tests/support/rasterScenes.ts does not draw it`);
      const actual = rasterHash(scene());
      drawn.set(key, actual);
      expect(actual).toBe(hash);
    }, TIMEOUT_MS);
  }

  for (const [key, hash] of Object.entries(masks)) {
    it(`mask ${key}`, async () => {
      const scene = TEXT_MASK_SCENES[key];
      if (scene === undefined) throw new Error(`mask-hashes.json has ${key}, tests/support/rasterScenes.ts does not draw it`);
      const actual = rasterHash(await scene());
      drawn.set(key, actual);
      expect(actual).toBe(hash);
    }, TIMEOUT_MS);
  }

  it('logs the digest of this engine', () => {
    const lines = [...drawn].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, hash]) => `${key} ${hash}\n`);
    const digest = rasterHash(new TextEncoder().encode(lines.join('')));
    console.log(`raster hash digest ${digest} (${drawn.size} rasters) ${navigator.userAgent}`);
    expect(drawn.size).toBe(Object.keys(rasters).length + Object.keys(masks).length);
  });
});
