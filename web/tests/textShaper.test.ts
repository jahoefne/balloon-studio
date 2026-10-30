// Shaping against CoreText with the same TTFs, on strings the 20 text dumps do not exercise
// (tests/fixtures/text/ct-shaping.swift). Runs that CoreText and the shaper treat differently by design are listed.
import { describe, expect, it } from 'vitest';
import { BALLOON_TEXT_FONTS, type BalloonTextFont } from '../src/core/patterns/raster';
import { BUNDLED_FONTS, loadFontSet } from '../src/core/text/fontSet';
import { shapeText } from '../src/core/text/shaper';
import { missingGlyphs } from '../src/core/text/textMask';
import { fontLoader, textFixture } from './support/textFonts';

interface ProbeRun {
  font: string;
  glyphs: number[];
  x: number[];
}
interface Probe {
  font: string;
  text: string;
  runs: ProbeRun[];
}

const fonts = await loadFontSet(fontLoader);
const probes = JSON.parse(new TextDecoder().decode(textFixture('ct-shaping.json'))) as Probe[];
const fontOf = (postScriptName: string): BalloonTextFont =>
  BALLOON_TEXT_FONTS.find((font) => BUNDLED_FONTS[font].postScriptName === postScriptName) as BalloonTextFont;

// SWIFT-DIFF cases: CoreText's ligatures, tab stops and system fallback (also for an unknown ZWJ or variation selector).
const ligature = (p: Probe): boolean => p.text === 'office fi fl' && (p.font === 'Nunito-Bold' || p.font === 'Gelasio-Bold');
const tab = (p: Probe): boolean => p.text.includes('\t');
const systemFallback = (p: Probe): boolean => p.runs.some((r) => !Object.values(BUNDLED_FONTS).some((b) => b.postScriptName === r.font));
const joiner = (p: Probe): boolean => /[‍️]/u.test(p.text);

describe('against CoreText', () => {
  const comparable = probes.filter((p) => !ligature(p) && !tab(p) && !systemFallback(p) && !joiner(p));

  it('compares the bulk of the probes', () => {
    expect(comparable.length).toBeGreaterThanOrEqual(50);
  });

  it.each(comparable.map((p) => [p.font, p.text, p] as const))('%s %j', (_font, text, probe) => {
    const shaped = shapeText(text, fonts.chain(fontOf(probe.font)));
    const expected = probe.runs.flatMap((run) => run.glyphs.map((glyph, i) => ({ font: run.font, glyph, x: run.x[i] as number })));
    expect(shaped.glyphs.map((g) => [g.font.postScriptName, g.glyph])).toEqual(expected.map((e) => [e.font, e.glyph]));
    shaped.glyphs.forEach((g, i) => expect(g.x).toBeCloseTo(expected[i]?.x as number, 9));
    expect(shaped.missing).toEqual([]);
  });

  it('applies kerning where the fonts have it, so the comparison above means something', () => {
    const kerned = BALLOON_TEXT_FONTS.filter((font) =>
      ['AVATAR', 'To Wave, Ty. LT', 'Tokyo Yves'].some((text) => {
        let pen = 0;
        return shapeText(text, fonts.chain(font)).glyphs.some((g) => {
          const moved = g.x !== pen;
          pen = g.x + g.font.advance(g.glyph);
          return moved;
        });
      }),
    );
    // Gelasio's `kern` covers only the L group against two special glyphs; DejaVu Sans Mono has none.
    expect(kerned).toEqual(['Rounded', 'Sans serif', 'Handwritten']);
  });

  it('does not form ligatures', () => {
    for (const font of ['Rounded', 'Serif'] as const) {
      expect(shapeText('fi', fonts.chain(font)).glyphs).toHaveLength(2);
      expect(probes.find((p) => p.text === 'office fi fl' && p.font === BUNDLED_FONTS[font].postScriptName)?.runs[0]?.glyphs.length).toBeLessThan(12);
    }
  });
});

describe('shapeText', () => {
  it('composes to NFC first', () => {
    const decomposed = shapeText('Zoë', fonts.chain('Serif'));
    const composed = shapeText('Zoë', fonts.chain('Serif'));
    expect(decomposed.glyphs.map((g) => g.glyph)).toEqual(composed.glyphs.map((g) => g.glyph));
    expect(decomposed.glyphs).toHaveLength(3);
  });

  it('takes each codepoint from the first font of the chain that has it', () => {
    const glyphs = shapeText('aĳa', fonts.chain('Rounded')).glyphs;
    expect(glyphs.map((g) => g.font.postScriptName)).toEqual(['Nunito-Bold', 'Arimo-Bold', 'Nunito-Bold']);
  });

  it('does not kern across a font change', () => {
    const chain = fonts.chain('Rounded');
    const [a, ij, b] = shapeText('aĳa', chain).glyphs;
    if (a === undefined || ij === undefined || b === undefined) throw new Error('no glyphs');
    expect(ij.x).toBe(a.font.advance(a.glyph));
    expect(b.x).toBe(ij.x + ij.font.advance(ij.glyph));
  });

  it('draws nothing for zero-width characters, even when another font has a glyph', () => {
    for (const font of BALLOON_TEXT_FONTS) {
      const plain = shapeText('ab', fonts.chain(font));
      for (const invisible of ['­', '‍', '️']) {
        const shaped = shapeText(`a${invisible}b`, fonts.chain(font));
        expect(shaped.glyphs.map((g) => g.glyph), font).toEqual(plain.glyphs.map((g) => g.glyph));
        expect(shaped.missing).toEqual([]);
      }
    }
  });

  it('advances over a space none of the fonts has', () => {
    const shaped = shapeText('a b', fonts.chain('Handwritten'));
    expect(shaped.missing).toEqual([]);
    expect(shaped.glyphs).toHaveLength(2);
    const [a, b] = shaped.glyphs;
    if (a === undefined || b === undefined) throw new Error('no glyphs');
    expect(b.x).toBeGreaterThan(a.font.advance(a.glyph));
  });

  it('leaves empty text empty', () => {
    const shaped = shapeText('', fonts.chain('Serif'));
    expect(shaped.glyphs).toEqual([]);
    expect(shaped.path.isEmpty()).toBe(true);
  });
});

describe('missing', () => {
  const TEST_TEXTS = ['F', 'Hello', 'O', 'Zoë & Léa <3'];

  it.each(BALLOON_TEXT_FONTS.map((font) => [font] as const))('%s misses nothing in the text cases or the required ranges', (font) => {
    for (const text of TEST_TEXTS) expect(missingGlyphs(text, font, fonts), text).toEqual([]);
    for (const [first, last] of [[0x20, 0x7e], [0xa0, 0xff], [0x100, 0x17f]] as const) {
      for (let c = first; c <= last; c++) expect(shapeText(String.fromCodePoint(c), fonts.chain(font)).missing, c.toString(16)).toEqual([]);
    }
  });

  it.each(BALLOON_TEXT_FONTS.map((font) => [font] as const))('%s reports what no bundled font has, once each, in order', (font) => {
    expect(missingGlyphs('東京', font, fonts)).toEqual(['東', '京']);
    expect(missingGlyphs(' a東b😀東c ', font, fonts)).toEqual(['東', '😀']);
  });

  it('takes no space for a missing character', () => {
    const plain = shapeText('ab', fonts.chain('Sans serif'));
    const gap = shapeText('a東b', fonts.chain('Sans serif'));
    expect(gap.glyphs.map((g) => g.glyph)).toEqual(plain.glyphs.map((g) => g.glyph));
    expect(gap.glyphs.map((g) => g.x)).toEqual(plain.glyphs.map((g) => g.x));
  });
});
