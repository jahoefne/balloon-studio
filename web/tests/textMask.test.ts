// The mask and shaping side of PatternTests.swift:88-170 (checkTextPatterns). The rest of that test needs
// PaintedBalloon and BalloonTextLayout and belongs to WP-K3.
import { describe, expect, it } from 'vitest';
import { BALLOON_TEXT_FONTS, type TextMask } from '../src/core/patterns/raster';
import { loadFontSet } from '../src/core/text/fontSet';
import { balloonTextMask, createTextRasterizer, missingGlyphs, trimmingWhitespaceAndNewlines } from '../src/core/text/textMask';
import { fontLoader } from './support/textFonts';

const fonts = await loadFontSet(fontLoader);
const rasterize = createTextRasterizer(fonts);

const mask = (text: string, font: (typeof BALLOON_TEXT_FONTS)[number]): TextMask => {
  const result = rasterize(text, font);
  if (result === null) throw new Error(`no mask for ${text}`);
  return result;
};

/** BalloonTextMask.contains (BalloonText.swift:82-85); the production copy is WP-K3's. */
function contains(m: TextMask, x: number, y: number): boolean {
  if (!(x >= 0 && x < 1 && y >= 0 && y < 1)) return false;
  const row = Math.min(m.height - 1, Math.trunc(y * m.height));
  const column = Math.min(m.width - 1, Math.trunc(x * m.width));
  return (m.pixels[row * m.width + column] as number) > 0;
}

describe('checkTextPatterns: masks', () => {
  it.each(BALLOON_TEXT_FONTS.map((font) => [font] as const))('%s: F has more ink in its upper half and its stem on the left', (font) => {
    const m = mask('F', font);
    let count = 0;
    let centerX = 0;
    let centerY = 0;
    m.pixels.forEach((pixel, i) => {
      if (pixel === 0) return;
      count++;
      centerX += (i % m.width) / m.width;
      centerY += Math.floor(i / m.width) / m.height;
    });
    expect(centerX / count).toBeLessThan(0.5);
    expect(centerY / count).toBeGreaterThan(0.52);
  });

  it('gives every font different lettering', () => {
    const masks = new Set(BALLOON_TEXT_FONTS.map((font) => Array.from(mask('F', font).pixels).join()));
    expect(masks.size).toBe(BALLOON_TEXT_FONTS.length);
  });

  it('keeps glyph counters open', () => {
    const ring = mask('O', 'Sans serif');
    expect(contains(ring, 0.5, 0.5)).toBe(false);
    expect(contains(ring, 0.05, 0.5)).toBe(true);
  });

  it('keeps accented text', () => {
    expect(rasterize('Zoë & Léa', 'Serif')).not.toBeNull();
  });

  // SWIFT-DIFF: CoreText falls back to PingFang for 東京 (PatternTests.swift:128). Without a CJK font the characters
  // are reported instead, and text made of nothing else has no mask (the plan's optional WP-R8 would add one).
  it('reports CJK instead of drawing it', () => {
    expect(rasterize('東京', 'Rounded')).toBeNull();
    expect(missingGlyphs('東京', 'Rounded', fonts)).toEqual(['東', '京']);
    expect(rasterize('Hi 東京', 'Rounded')?.aspect).toBeCloseTo(mask('Hi', 'Rounded').aspect, 9);
  });

  it('has no mask for blank text', () => {
    for (const blank of ['', '   ', '\n\t ', '  ​']) expect(rasterize(blank, 'Serif')).toBeNull();
  });

  it('has no mask for text that leaves no ink', () => {
    expect(rasterize('­', 'Sans serif')).toBeNull();
    expect(rasterize('a', 'Sans serif')).not.toBeNull();
  });
});

describe('balloonTextMask', () => {
  it('fills to 0 or 255 only, row 0 at the bottom of the glyphs', () => {
    for (const font of BALLOON_TEXT_FONTS) {
      const m = mask('Hello', font);
      expect(m.pixels).toHaveLength(m.width * m.height);
      expect(new Set(m.pixels)).toEqual(new Set([0, 255]));
    }
    // An underscore sits at the very bottom; a top row that had the ink would mean a flip.
    const under = mask('_H', 'Sans serif');
    const inkOnRow = (m: TextMask, row: number): number => m.pixels.subarray(row * m.width, (row + 1) * m.width).reduce((sum, p) => sum + (p > 0 ? 1 : 0), 0);
    expect(inkOnRow(under, 0)).toBeGreaterThan(under.width / 3);
    expect(inkOnRow(under, under.height - 1)).toBeLessThan(under.width / 3);
  });

  it('scales to 256 rows, or 8192 columns for long text', () => {
    expect(mask('Hello', 'Serif').height).toBe(256);
    const long = mask('Wide message '.repeat(5), 'Sans serif');
    expect(long.width).toBeLessThanOrEqual(8192);
    expect(long.height).toBeLessThanOrEqual(256);
    expect(long.width).toBeGreaterThanOrEqual(8191);
    expect(long.height).toBeLessThan(256);
    expect(Math.abs(long.width / long.height / long.aspect - 1)).toBeLessThan(0.01);
  });

  it('trims like the Swift string, not like String.prototype.trim', () => {
    expect(trimmingWhitespaceAndNewlines('​\u0085 a b \t')).toBe('a b');
    expect(trimmingWhitespaceAndNewlines('﻿ a ᠎')).toBe('﻿ a ᠎');
    expect(trimmingWhitespaceAndNewlines(' \n ')).toBe('');
    expect(mask('  Hello\n', 'Rounded').pixels).toEqual(mask('Hello', 'Rounded').pixels);
  });

  it('gives the same bytes every time', () => {
    const fresh = createTextRasterizer(fonts);
    expect(fresh('Zoë & Léa <3', 'Serif')?.pixels).toEqual(rasterize('Zoë & Léa <3', 'Serif')?.pixels);
  });
});
