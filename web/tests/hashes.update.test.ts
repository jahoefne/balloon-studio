// Rewrites tests/fixtures/hashes.json from RASTER_SCENES after an intended rasterizer change or a new raster:
//   UPDATE_RASTER_HASHES=1 npx vitest run tests/hashes.update.test.ts
// Separate from hashes.test.ts because that one runs in browsers and cannot write. Skipped in every normal run.
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rasterHash } from '../src/core/testing/raster';
import { RASTER_SCENES } from './support/rasterScenes';

describe('refresh of hashes.json', () => {
  it.runIf(process.env['UPDATE_RASTER_HASHES'] === '1')('writes one hash per drawing', () => {
    const hashes = Object.fromEntries(Object.entries(RASTER_SCENES).map(([key, scene]) => [key, rasterHash(scene())]));
    writeFileSync(new URL('./fixtures/hashes.json', import.meta.url), `${JSON.stringify(hashes, null, 2)}\n`);
    expect(Object.keys(hashes).length).toBeGreaterThan(0);
  }, 120_000);
});
