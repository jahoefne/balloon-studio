// One parsed TTF: the only module that touches opentype.js (docs/plan.md, Abschnitt 7, WP-R3). It stands in for the
// CTFont calls of mac/Sources/BalloonStudio/BalloonText.swift:31-47 @ cbda68d (cmap lookup, advances, kerning and
// CTFontCreatePathForGlyph at 100 points).
import { type Font, parse } from 'opentype.js';
import { Path } from '../raster/path';

/** BalloonText.swift:31: CTFontCreateWithName(…, 100, nil). */
export const FONT_SIZE = 100;

export class FontFile {
  readonly postScriptName: string;
  readonly unitsPerEm: number;
  private readonly font: Font;
  private readonly glyphPaths = new Map<number, Path>();
  /** The GPOS `kern` lookups for Latin text. A font with GPOS but without that feature falls through to the legacy table. */
  private readonly gposKerning: unknown[] | null;

  private constructor(font: Font) {
    this.font = font;
    this.unitsPerEm = font.unitsPerEm;
    const names = font.names;
    this.postScriptName = names.postScriptName?.en ?? names.windows?.postScriptName?.en ?? names.macintosh?.postScriptName?.en ?? '';
    // opentype.js defaults to DFLT, but CoreText shapes Latin with `latn` where a font has it (Gelasio keeps `kern` only there).
    const latin = font.position.getKerningTables('latn');
    const tables = latin !== undefined && latin.length > 0 ? latin : font.position.defaultKerningTables;
    this.gposKerning = tables !== undefined && tables.length > 0 ? tables : null;
  }

  /** Throws on a file opentype.js cannot read. The bytes are not modified or kept. */
  static parse(bytes: Uint8Array | ArrayBuffer): FontFile {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
    return new FontFile(parse(buffer));
  }

  /** The cmap lookup; 0 (.notdef) when the font has no glyph for the codepoint. */
  glyphIndex(codepoint: number): number {
    return this.font.charToGlyphIndex(String.fromCodePoint(codepoint));
  }

  /** Horizontal advance in points at FONT_SIZE. */
  advance(glyph: number): number {
    return ((this.font.glyphs.get(glyph).advanceWidth ?? 0) * FONT_SIZE) / this.unitsPerEm;
  }

  /** Pair adjustment in points at FONT_SIZE: GPOS `kern` if the font has it, otherwise the legacy `kern` table. */
  kerning(left: number, right: number): number {
    const units =
      this.gposKerning !== null
        ? this.font.position.getKerningValue(this.gposKerning, left, right)
        : (this.font.kerningPairs[`${left},${right}`] ?? 0);
    return (units * FONT_SIZE) / this.unitsPerEm;
  }

  /**
   * CTFontCreatePathForGlyph at FONT_SIZE, y up. TrueType outlines stay quads, so `Path.pathBounds()` is
   * `boundingBoxOfPath` and `Path.controlBounds()` is `boundingBox`. Cached; do not mutate the result.
   */
  glyphPath(glyph: number): Path {
    const cached = this.glyphPaths.get(glyph);
    if (cached !== undefined) return cached;
    const k = FONT_SIZE / this.unitsPerEm;
    const path = new Path();
    for (const c of this.font.glyphs.get(glyph).path.commands) {
      const x = (c.x ?? 0) * k;
      const y = (c.y ?? 0) * k;
      switch (c.type) {
        case 'M':
          path.moveTo(x, y);
          break;
        case 'L':
          path.lineTo(x, y);
          break;
        case 'Q':
          path.quadTo((c.x1 ?? 0) * k, (c.y1 ?? 0) * k, x, y);
          break;
        case 'C':
          path.cubicTo((c.x1 ?? 0) * k, (c.y1 ?? 0) * k, (c.x2 ?? 0) * k, (c.y2 ?? 0) * k, x, y);
          break;
        case 'Z':
          path.close();
          break;
      }
    }
    this.glyphPaths.set(glyph, path);
    return path;
  }
}
