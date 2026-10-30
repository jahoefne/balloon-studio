// Shaping for mac/Sources/BalloonStudio/BalloonText.swift:33-49 @ cbda68d: CTLineCreateWithAttributedString, its glyph
// runs and the combined glyph path (docs/plan.md, Abschnitt 7).
//
// SWIFT-DIFF: no ligatures, contextual alternates or mark positioning. CoreText applies a font's `liga` (`fi` in
// Nunito and Gelasio) and GPOS `mark`; here every codepoint after NFC is exactly one glyph. Text the app's fonts draw
// with precomposed letters comes out the same.
// SWIFT-DIFF: fallback goes through the bundled fonts only, one codepoint at a time; see FontSet.chain.
import { Path } from '../raster/path';
import { translation } from '../raster/affine';
import { isSwiftWhitespace } from '../swift/text';
import type { FontFile } from './fontFile';

export interface ShapedGlyph {
  readonly font: FontFile;
  readonly glyph: number;
  /** Pen position in points at FONT_SIZE; CTRunGetPositions, whose y is 0 here. */
  readonly x: number;
}

export interface ShapedText {
  readonly glyphs: readonly ShapedGlyph[];
  /** Characters no font of the chain has, each once, in text order. They take no space and leave no ink. */
  readonly missing: readonly string[];
  /** All glyph outlines at their positions. */
  readonly path: Path;
}

// Zero-width controls and format characters are invisible in CoreText whichever font it picks, so they are neither
// drawn from a fallback font (Nunito's soft hyphen is a visible glyph) nor reported missing.
const INVISIBLE = /^[\p{Default_Ignorable_Code_Point}\p{Cc}]$/u;

/** `chain[0]` is the chosen font. Kerning applies between neighbours of the same font only. */
export function shapeText(text: string, chain: readonly FontFile[]): ShapedText {
  const primary = chain[0];
  if (primary === undefined) throw new Error('shapeText needs at least one font');
  const glyphs: ShapedGlyph[] = [];
  const missing: string[] = [];
  const path = new Path();
  let pen = 0;
  let previous: { font: FontFile; glyph: number } | null = null;
  for (const character of text.normalize('NFC')) {
    const codepoint = character.codePointAt(0) as number;
    const invisible = INVISIBLE.test(character);
    let font: FontFile | null = null;
    let glyph = 0;
    if (!invisible) {
      for (const candidate of chain) {
        glyph = candidate.glyphIndex(codepoint);
        if (glyph !== 0) {
          font = candidate;
          break;
        }
      }
    }
    if (font === null) {
      if (isSwiftWhitespace(character) && !invisible) {
        // A space no bundled font has still separates words; use the chosen font's own.
        pen += primary.advance(primary.glyphIndex(0x20));
        previous = null;
      } else if (!invisible && !missing.includes(character)) {
        missing.push(character);
      }
      continue;
    }
    if (previous !== null && previous.font === font) pen += font.kerning(previous.glyph, glyph);
    glyphs.push({ font, glyph, x: pen });
    path.addPath(font.glyphPath(glyph), translation(pen, 0));
    pen += font.advance(glyph);
    previous = { font, glyph };
  }
  return { glyphs, missing, path };
}
