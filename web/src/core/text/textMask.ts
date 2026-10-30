// Ported from mac/Sources/BalloonStudio/BalloonText.swift:28-69 @ cbda68d (BalloonTextMask.init). The summed-area
// table and `contains`/`crossesBoundary` belong to WP-K3 (core/patterns/textLayout.ts).
//
// SWIFT-DIFF: the context's flip (translateBy(0, height) + scaleBy(1, −1), :63) is left out, GrayCanvas row 0 is
// the bottom of the glyphs as in the Swift bitmap. Bundled fonts replace the Apple ones (fontSet.ts).
import type { BalloonTextFont, TextMask, TextRasterizer } from '../patterns/raster';
import { GrayCanvas } from '../raster/canvas';
import { swiftMax, swiftMin } from '../swift/minmax';
import { intCeil } from '../swift/rounding';
import type { FontSet } from './fontSet';
import { shapeText } from './shaper';

// CharacterSet.whitespacesAndNewlines, measured on macOS 26.6.2 over all of Unicode (includes U+200B, excludes
// U+FEFF and U+180E, unlike String.prototype.trim).
function isTrimmed(unit: number): boolean {
  return (
    (unit >= 0x09 && unit <= 0x0d) ||
    unit === 0x20 ||
    unit === 0x85 ||
    unit === 0xa0 ||
    unit === 0x1680 ||
    (unit >= 0x2000 && unit <= 0x200b) ||
    unit === 0x2028 ||
    unit === 0x2029 ||
    unit === 0x202f ||
    unit === 0x205f ||
    unit === 0x3000
  );
}

/** `text.trimmingCharacters(in: .whitespacesAndNewlines)`. All members are in the BMP, so UTF-16 units will do. */
export function trimmingWhitespaceAndNewlines(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isTrimmed(text.charCodeAt(start))) start++;
  while (end > start && isTrimmed(text.charCodeAt(end - 1))) end--;
  return text.slice(start, end);
}

/** BalloonTextMask.init(text:font:): null for blank text or a mask without ink. */
export function balloonTextMask(text: string, font: BalloonTextFont, fonts: FontSet): TextMask | null {
  const message = trimmingWhitespaceAndNewlines(text);
  if (message.length === 0) return null;
  const path = shapeText(message, fonts.chain(font)).path;
  const bounds = path.pathBounds();
  if (bounds === null || !(bounds.width > 0) || !(bounds.height > 0)) return null;
  const aspect = bounds.width / bounds.height;
  const scale = swiftMin(256 / bounds.height, 8192 / bounds.width);
  const width = swiftMax(1, intCeil(bounds.width * scale));
  const height = swiftMax(1, intCeil(bounds.height * scale));
  const canvas = new GrayCanvas(width, height);
  canvas.setShouldAntialias(false);
  canvas.setFillGray(1);
  canvas.scaleBy(width / bounds.width, height / bounds.height);
  canvas.translateBy(-bounds.x, -bounds.y);
  canvas.fillPath(path);
  if (!canvas.pixels.some((pixel) => pixel > 0)) return null;
  return { width, height, aspect, pixels: canvas.pixels };
}

/** The TextRasterizer of the seam in core/patterns/raster.ts. */
export function createTextRasterizer(fonts: FontSet): TextRasterizer {
  return (text, font) => balloonTextMask(text, font, fonts);
}

/** The hint for BalloonPreview.missingGlyphs: characters of `text` that no bundled font can draw. */
export function missingGlyphs(text: string, font: BalloonTextFont, fonts: FontSet): string[] {
  return [...shapeText(trimmingWhitespaceAndNewlines(text), fonts.chain(font)).missing];
}
