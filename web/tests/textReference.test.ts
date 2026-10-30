// The 20 text masks against CoreText + CoreGraphics drawing the same TTFs (docs/plan.md, Abschnitt 7, WP-R3):
// size ±1 px, aspect ±1 %, IoU ≥ 0.97. The dumps are committed under tests/fixtures/text (the release pack has them only
// after its next rebuild), checked against the hashes in references/manifest.json. The masks themselves are pinned too.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALLOON_TEXT_FONTS, type BalloonTextFont } from '../src/core/patterns/raster';
import { decodePGM } from '../src/core/raster/pgm';
import { BUNDLED_FONTS, loadFontSet } from '../src/core/text/fontSet';
import { shapeText } from '../src/core/text/shaper';
import { balloonTextMask } from '../src/core/text/textMask';
import { iou } from './support/compare';
import { fontLoader, textFixture } from './support/textFonts';

interface Dump {
  case: string;
  text: string;
  font: BalloonTextFont;
  fontSource: string;
  fontPostScriptName: string;
  width: number;
  height: number;
  aspect: number;
  glyphCount: number;
  bounds: { x: number; y: number; width: number; height: number };
  runs: { font: string; glyphs: number[]; positions: [number, number][] }[];
}
interface ManifestCase {
  id: string;
  rasters?: { name: string; sha256: string }[];
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const references = new URL('../../references/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', references), 'utf8')) as { cases: ManifestCase[] };
const hashFile = new URL('./fixtures/text/mask-hashes.json', import.meta.url);
const pinned = JSON.parse(readFileSync(hashFile, 'utf8')) as Record<string, string>;
const measured: Record<string, string> = {};

const FONT_STEMS: Readonly<Record<BalloonTextFont, string>> = {
  Rounded: 'rounded',
  'Sans serif': 'sans',
  Serif: 'serif',
  Handwritten: 'handwritten',
  Monospaced: 'mono',
};
const CASES = BALLOON_TEXT_FONTS.flatMap((font) => ['f', 'hello', 'o', 'zoe-lea'].map((text) => `text-${FONT_STEMS[font]}-${text}`));

const fonts = await loadFontSet(fontLoader);

describe.each(CASES.map((id) => [id] as const))('%s', (id) => {
  const dump = JSON.parse(new TextDecoder().decode(textFixture(`${id}.ttf.json`))) as Dump;
  const pgmBytes = textFixture(`${id}.ttf.pgm.gz`);
  const reference = decodePGM(pgmBytes);
  const mask = balloonTextMask(dump.text, dump.font, fonts);
  if (mask === null) throw new Error(`no mask for ${id}`);

  it('dump is the one the manifest lists, drawn with the bundled font', () => {
    const rasters = manifest.cases.find((c) => c.id === id)?.rasters ?? [];
    expect(rasters.find((r) => r.name === `${id}.ttf.pgm`)?.sha256).toBe(sha256(pgmBytes));
    expect(dump.fontSource).toBe(`file:${BUNDLED_FONTS[dump.font].file}`);
    expect(dump.fontPostScriptName).toBe(BUNDLED_FONTS[dump.font].postScriptName);
  });

  it('dump in the local pack matches', () => {
    const inPack = new URL(`pack/refs-v2/rasters/${id}.ttf.pgm`, references);
    if (existsSync(inPack)) expect(sha256(readFileSync(inPack))).toBe(sha256(pgmBytes));
  });

  it('size ±1 px, aspect ±1 %', () => {
    expect(Math.abs(mask.width - reference.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(mask.height - reference.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(mask.aspect / dump.aspect - 1)).toBeLessThanOrEqual(0.01);
  });

  it('IoU ≥ 0.97', () => {
    expect(iou(mask, reference)).toBeGreaterThanOrEqual(0.97);
  });

  it('shapes like CoreText: same glyphs, positions and bounds', () => {
    const shaped = shapeText(dump.text, fonts.chain(dump.font));
    expect(shaped.missing).toEqual([]);
    const expected = dump.runs.flatMap((run) => run.glyphs.map((glyph, i) => ({ font: run.font, glyph, x: run.positions[i]?.[0] as number })));
    expect(shaped.glyphs.map((g) => [g.font.postScriptName, g.glyph])).toEqual(expected.map((e) => [e.font, e.glyph]));
    shaped.glyphs.forEach((g, i) => expect(g.x).toBeCloseTo(expected[i]?.x as number, 9));
    const bounds = shaped.path.pathBounds();
    expect(bounds?.x).toBeCloseTo(dump.bounds.x, 9);
    expect(bounds?.y).toBeCloseTo(dump.bounds.y, 9);
    expect(bounds?.width).toBeCloseTo(dump.bounds.width, 9);
    expect(bounds?.height).toBeCloseTo(dump.bounds.height, 9);
  });

  it('mask bytes are pinned', () => {
    measured[id] = sha256(mask.pixels);
    if (process.env['UPDATE_TEXT_HASHES'] !== '1') expect(measured[id]).toBe(pinned[id]);
  });
});

if (process.env['UPDATE_TEXT_HASHES'] === '1') {
  describe('hash refresh', () => {
    it('writes mask-hashes.json', () => {
      writeFileSync(hashFile, `${JSON.stringify(measured, null, 2)}\n`);
    });
  });
}
