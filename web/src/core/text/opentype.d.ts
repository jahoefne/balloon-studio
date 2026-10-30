// The part of opentype.js 2.0.0 that fontFile.ts uses; the package ships no types.
declare module 'opentype.js' {
  export interface PathCommand {
    type: 'M' | 'L' | 'Q' | 'C' | 'Z';
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }
  export interface Glyph {
    advanceWidth?: number;
    path: { commands: PathCommand[] };
  }
  export interface Font {
    unitsPerEm: number;
    numGlyphs: number;
    names: { postScriptName?: Record<string, string>; windows?: { postScriptName?: Record<string, string> }; macintosh?: { postScriptName?: Record<string, string> } };
    glyphs: { get(index: number): Glyph };
    kerningPairs: Record<string, number>;
    position: {
      defaultKerningTables?: unknown[];
      getKerningTables(script: string): unknown[] | undefined;
      getKerningValue(tables: unknown[], left: number, right: number): number;
    };
    charToGlyphIndex(character: string): number;
  }
  export function parse(buffer: ArrayBuffer): Font;
}
