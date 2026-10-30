// The bundled TTFs (docs/plan.md, Abschnitt 7, WP-R3): each file parses, is the expected font and covers what the
// text pattern needs. Three fonts have gaps in Latin Extended-A; those are pinned here and filled by the fallback chain.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BALLOON_TEXT_FONTS } from '../src/core/patterns/raster';
import { Verb } from '../src/core/raster/path';
import { BUNDLED_FONTS, loadFontSet } from '../src/core/text/fontSet';
import { FontFile } from '../src/core/text/fontFile';
import { bundledFontBytes, fontLoader } from './support/textFonts';

const RANGES: readonly (readonly [number, number])[] = [
  [0x20, 0x7e],
  [0xa0, 0xff],
  [0x100, 0x17f],
];
const REQUIRED = [...'ëéüß€&<3'];

/** Upstream files, untouched: the SHA-256 of what was downloaded (sources in public/fonts/LICENSES.md). */
const SHA256: Readonly<Record<string, string>> = {
  'Nunito-Bold.ttf': 'f922b74ed5cca7c8675d352fd5ed197e0f38b3ac4a427c15b7a3db039dc6294c',
  'Arimo-Bold.ttf': 'd7a8b187cf8444d4cfee102e8eae9e3043682fd5106d5d33ed677fe268a0e2ba',
  'Gelasio-Bold.ttf': 'e0ef3addf1acf35f5c6aef2be00d0a2c01363bf70a5950e16650976051a0c462',
  'ComicNeue-Bold.ttf': '3e7e5fccfd7e0788f317b43312151c1bd5cf058c9697a8d83eac3939050bd61e',
  'DejaVuSansMono-Bold.ttf': 'bce60f1b4421acd9ea51ba6623d7024ecbe6817a953e3654df62a5e6bdf8f769',
};

/** What each font lacks in RANGES. The plan assumed none; the fallback chain draws all of them. */
const GAPS: Readonly<Record<string, readonly number[]>> = {
  'Nunito-Bold.ttf': [0x133, 0x17f],
  'Arimo-Bold.ttf': [],
  'Gelasio-Bold.ttf': [0xad, 0x149],
  'ComicNeue-Bold.ttf': [
    0x100, 0x10a, 0x10b, 0x112, 0x113, 0x114, 0x115, 0x116, 0x117, 0x11e, 0x11f, 0x120, 0x121, 0x122, 0x123, 0x126, 0x127, 0x128, 0x129, 0x12a,
    0x12b, 0x12c, 0x12d, 0x12e, 0x12f, 0x130, 0x132, 0x133, 0x136, 0x137, 0x138, 0x13b, 0x13c, 0x13f, 0x140, 0x145, 0x146, 0x149, 0x14a, 0x14b,
    0x14c, 0x14d, 0x14e, 0x14f, 0x156, 0x157, 0x162, 0x166, 0x167, 0x168, 0x169, 0x16a, 0x16b, 0x172, 0x173, 0x174, 0x175, 0x176, 0x177, 0x17f,
  ],
  'DejaVuSansMono-Bold.ttf': [],
};

describe.each(BALLOON_TEXT_FONTS.map((font) => [font, BUNDLED_FONTS[font]] as const))('%s', (_font, { file, postScriptName }) => {
  const bytes = bundledFontBytes(file);
  const parsed = FontFile.parse(bytes);

  it('is the unmodified upstream file', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SHA256[file]);
  });

  it('parses and has the expected PostScript name', () => {
    expect(parsed.postScriptName).toBe(postScriptName);
    expect(parsed.unitsPerEm).toBeGreaterThan(0);
  });

  it('covers U+0020–007E, U+00A0–00FF, U+0100–017F except for its pinned gaps', () => {
    const gaps: number[] = [];
    for (const [first, last] of RANGES) {
      for (let c = first; c <= last; c++) if (parsed.glyphIndex(c) === 0) gaps.push(c);
    }
    expect(gaps).toEqual(GAPS[file]);
  });

  it('has the characters of the text cases', () => {
    for (const character of REQUIRED) expect(parsed.glyphIndex(character.codePointAt(0) as number), character).not.toBe(0);
  });

  it('has TrueType outlines made of lines and quads, closed', () => {
    const path = parsed.glyphPath(parsed.glyphIndex(0x38));
    expect(path.verbs).toContain(Verb.Quad);
    expect(path.verbs).not.toContain(Verb.Cubic);
    expect(path.verbs[path.verbs.length - 1]).toBe(Verb.Close);
  });
});

describe('loadFontSet', () => {
  it('asks for each file once and maps the raw values', async () => {
    const asked: string[] = [];
    const fonts = await loadFontSet((file) => {
      asked.push(file);
      return fontLoader(file);
    });
    expect(asked).toEqual(BALLOON_TEXT_FONTS.map((font) => BUNDLED_FONTS[font].file));
    for (const font of BALLOON_TEXT_FONTS) expect(fonts.font(font).postScriptName).toBe(BUNDLED_FONTS[font].postScriptName);
  });

  it('takes an ArrayBuffer as well as a view into a larger buffer', async () => {
    const fonts = await loadFontSet(async (file) => {
      const bytes = bundledFontBytes(file);
      const padded = new Uint8Array(bytes.length + 7);
      padded.set(bytes, 3);
      return file === 'Arimo-Bold.ttf' ? padded.subarray(3, 3 + bytes.length) : (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer);
    });
    expect(fonts.font('Sans serif').postScriptName).toBe('Arimo-Bold');
  });

  it('rejects a file that is another font', async () => {
    await expect(loadFontSet((file) => fontLoader(file === 'Gelasio-Bold.ttf' ? 'Arimo-Bold.ttf' : file))).rejects.toThrow('expected Gelasio-Bold, found Arimo-Bold');
  });

  it('rejects a file that is no font', async () => {
    await expect(loadFontSet(async () => new Uint8Array(16))).rejects.toThrow();
  });

  it('starts every chain with the chosen font and leaves none out', async () => {
    const fonts = await loadFontSet(fontLoader);
    for (const font of BALLOON_TEXT_FONTS) {
      const chain = fonts.chain(font);
      expect(chain[0]).toBe(fonts.font(font));
      expect(new Set(chain).size).toBe(BALLOON_TEXT_FONTS.length);
    }
  });
});
