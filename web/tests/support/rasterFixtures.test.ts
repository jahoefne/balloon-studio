import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeFloat32LE, encodePGM } from '../../src/core/raster/pgm';
import { float32BitDifference } from '../../src/core/testing/raster';
import {
  fixtureBytes,
  fixtureFloat32,
  fixturePGM,
  fixtureText,
  hasRasterPack,
  loadPrimitive,
  loadPrimitiveIndex,
  loadReliefDump,
  loadTextDump,
  primitiveNames,
  probeSection,
  rasterCaseIds,
  rasterHash,
  rasterPackDir,
} from './rasterFixtures';

afterEach(() => {
  vi.unstubAllEnvs();
});

function temporary(): string {
  return mkdtempSync(join(tmpdir(), 'raster-fixtures-'));
}

describe('committed fixtures', () => {
  // The readers take a path relative to tests/fixtures; these test files stay outside the repository.
  const fromFixtures = (path: string): string => relative(fileURLToPath(new URL('../fixtures/', import.meta.url)), path);

  it('reads PGM and Float32, plain and gzipped', () => {
    const dir = temporary();
    try {
      const image = { width: 2, height: 2, pixels: Uint8Array.of(0, 1, 254, 255) };
      const field = Float32Array.of(0.25, -0, 1e-40);
      writeFileSync(join(dir, 'a.pgm'), encodePGM(image));
      writeFileSync(join(dir, 'a.pgm.gz'), gzipSync(encodePGM(image)));
      writeFileSync(join(dir, 'a.f32'), encodeFloat32LE(field));
      writeFileSync(join(dir, 'a.f32.gz'), gzipSync(encodeFloat32LE(field)));
      for (const name of ['a.pgm', 'a.pgm.gz']) expect(fixturePGM(fromFixtures(join(dir, name)))).toEqual(image);
      for (const name of ['a.f32', 'a.f32.gz']) expect(float32BitDifference(fixtureFloat32(fromFixtures(join(dir, name)), 3), field)).toBeNull();
      expect(() => fixtureFloat32(fromFixtures(join(dir, 'a.f32')), 4)).toThrow('expected 4');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('offers the probe dump of WP-R2 through probeSection', () => {
    const probes = fixtureText('primitives/probes/cg-raster.txt.gz');
    expect(probeSection(probes, 'DITHER').length).toBeGreaterThan(0);
    expect(() => probeSection(probes, 'NO_SUCH_SECTION')).toThrow('missing probe section');
    expect(fixtureBytes('primitives/probes/cg-raster.txt.gz').length).toBe(new TextEncoder().encode(probes).length);
  });
});

describe('primitives (Tier A)', () => {
  it('has the 14 canvases of the exporter, 64 × 64', () => {
    const names = primitiveNames();
    expect(names).toHaveLength(14);
    expect(names).toContain('moon-r24');
    expect(names).not.toContain('index');
    for (const name of names) {
      const image = loadPrimitive(name);
      expect([image.width, image.height], name).toEqual([64, 64]);
      expect(image.pixels.some((p) => p !== 0), name).toBe(true);
    }
  });

  it('reads the index with the commands', () => {
    const index = loadPrimitiveIndex() as { primitives: unknown[] };
    expect(index.primitives).toHaveLength(14);
  });

  it('fails on an unknown name', () => {
    expect(() => loadPrimitive('no-such-canvas')).toThrow('No primitive file no-such-canvas.pgm');
  });
});

describe('pack resolution', () => {
  it('follows REFS_PACK_DIR on every call, with or without a trailing slash', () => {
    vi.stubEnv('REFS_PACK_DIR', '/some/pack');
    expect(rasterPackDir()).toBe('/some/pack/rasters/');
    vi.stubEnv('REFS_PACK_DIR', '/other/pack/');
    expect(rasterPackDir()).toBe('/other/pack/rasters/');
  });

  it('defaults to references/pack/<release> at the repo root', () => {
    vi.stubEnv('REFS_PACK_DIR', '');
    expect(rasterPackDir()).toMatch(/\/references\/pack\/refs-v2\/rasters\/$/);
  });

  it('says what to do when the pack is missing', () => {
    const dir = temporary();
    try {
      vi.stubEnv('REFS_PACK_DIR', dir);
      expect(hasRasterPack()).toBe(false);
      expect(() => loadTextDump('text-rounded-f')).toThrow('fetch the pack');
      expect(() => loadReliefDump('relief-summit-round')).toThrow('fetch the pack');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('refuses a damaged dump instead of handing it to a comparison', () => {
    const dir = temporary();
    try {
      mkdirSync(join(dir, 'rasters'));
      writeFileSync(join(dir, 'rasters', 'text-rounded-f.json'), '{"damaged":true}');
      vi.stubEnv('REFS_PACK_DIR', dir);
      expect(hasRasterPack()).toBe(true);
      expect(() => loadTextDump('text-rounded-f')).toThrow('Corrupt raster text-rounded-f.json');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('refuses a case without dumps', () => {
    expect(() => loadReliefDump('clip-default')).toThrow('Case clip-default has no raster clip-default.json');
    expect(() => loadReliefDump('no-such-case')).toThrow('Unknown reference case');
  });
});

describe('case ids', () => {
  it('lists the dumped cases by group', () => {
    const relief = rasterCaseIds('relief');
    const text = rasterCaseIds('text');
    expect(relief).toHaveLength(9);
    expect(relief.every((id) => id.startsWith('relief-'))).toBe(true);
    expect(text).toHaveLength(22);
    expect(text.every((id) => id.startsWith('text-'))).toBe(true);
    expect(new Set(rasterCaseIds())).toEqual(new Set([...relief, ...text]));
  });
});

describe('text dumps with the bundled fonts', () => {
  // The 20 comparison cases of WP-R3 are committed; `東京` and the Milo migration have their TTF dump in the pack only.
  for (const id of rasterCaseIds('text').filter((c) => c !== 'text-rounded-tokyo' && c !== 'text-legacy-milo')) {
    it(`${id}: the committed dump matches its JSON and the manifest`, () => {
      const { meta, mask } = loadTextDump(id, 'ttf');
      expect(meta.case).toBe(id);
      expect(meta.fontSource).toMatch(/^file:/);
      expect(mask.pixels.every((p) => p === 0 || p === 255)).toBe(true);
      expect(mask.pixels.some((p) => p === 255)).toBe(true);
    });
  }

  it('has none for the tokyo case', () => {
    expect(() => loadTextDump('text-rounded-tokyo', 'ttf')).toThrow('tests/fixtures/text/text-rounded-tokyo.ttf.json is not committed');
  });
});

describe('pack dumps', () => {
  const pack = hasRasterPack();

  for (const id of rasterCaseIds('relief')) {
    it.skipIf(!pack)(`${id}: bitmap, field and JSON belong together`, () => {
      const { meta, raw, field } = loadReliefDump(id);
      expect(meta.case).toBe(id);
      expect(raw.pixels.length).toBe(meta.columns * meta.rows);
      expect(field.length).toBe(meta.columns * meta.rows);
      expect(meta.crest.every((r) => Number.isFinite(r) && r > 0)).toBe(true);
      expect(meta.blurVerified).toBe(true);
      expect(rasterHash(encodeFloat32LE(field))).toBe(meta.fieldSha256);
      expect(rasterHash(encodePGM(raw))).toBe(meta.rawSha256);
      // The artwork is 0…255 mapped to 0…1; the blur averages that in Float32, so it can overshoot by rounding.
      let low = Infinity;
      let high = -Infinity;
      for (const v of field) {
        if (v < low) low = v;
        if (v > high) high = v;
      }
      expect(low).toBeGreaterThanOrEqual(-1e-5);
      expect(high).toBeLessThanOrEqual(1 + 1e-5);
      expect(high).toBeGreaterThan(low);
    });
  }

  for (const id of rasterCaseIds('text')) {
    it.skipIf(!pack)(`${id}: the mask is 0 or 255 and matches its JSON`, () => {
      const { meta, mask } = loadTextDump(id);
      expect(meta.case).toBe(id);
      expect(meta.antialias).toBe(false);
      expect(mask.pixels.every((p) => p === 0 || p === 255)).toBe(true);
      expect(mask.pixels.some((p) => p === 255)).toBe(true);
      expect(meta.glyphCount).toBeGreaterThan(0);
      expect(rasterHash(encodePGM(mask))).toBe(meta.sha256);
    });
  }
});
