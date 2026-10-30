// The bundled replacements for the Apple fonts of mac/Sources/BalloonStudio/BalloonText.swift:5-17 @ cbda68d
// (docs/plan.md, Abschnitt 7). The raw values of BalloonTextFont stay as they are; only the file behind each changes.
import { BALLOON_TEXT_FONTS, type BalloonTextFont } from '../patterns/raster';
import { FontFile } from './fontFile';

export interface BundledFont {
  /** File name under web/public/fonts/. */
  readonly file: string;
  readonly postScriptName: string;
}

export const BUNDLED_FONTS: Readonly<Record<BalloonTextFont, BundledFont>> = {
  Rounded: { file: 'Nunito-Bold.ttf', postScriptName: 'Nunito-Bold' },
  'Sans serif': { file: 'Arimo-Bold.ttf', postScriptName: 'Arimo-Bold' },
  Serif: { file: 'Gelasio-Bold.ttf', postScriptName: 'Gelasio-Bold' },
  Handwritten: { file: 'ComicNeue-Bold.ttf', postScriptName: 'ComicNeue-Bold' },
  Monospaced: { file: 'DejaVuSansMono-Bold.ttf', postScriptName: 'DejaVuSansMono-Bold' },
};

/** Fetches one file by its name in BUNDLED_FONTS: `fetch` in the worker, `readFile` in tests. */
export type FontLoader = (file: string) => Promise<Uint8Array | ArrayBuffer>;

export class FontSet {
  private readonly files: ReadonlyMap<BalloonTextFont, FontFile>;

  constructor(files: ReadonlyMap<BalloonTextFont, FontFile>) {
    this.files = files;
  }

  font(font: BalloonTextFont): FontFile {
    const file = this.files.get(font);
    if (file === undefined) throw new Error(`font not loaded: ${font}`);
    return file;
  }

  /**
   * SWIFT-DIFF: stands in for CoreText's system fallback: the chosen font, then the other bundled fonts in
   * CaseIterable order. Anything none of them has is `missing` in the shaper.
   */
  chain(font: BalloonTextFont): FontFile[] {
    return [this.font(font), ...BALLOON_TEXT_FONTS.filter((other) => other !== font).map((other) => this.font(other))];
  }
}

/** Loads and parses all five files once. Rejects if one cannot be fetched or parsed, or is not the expected font. */
export async function loadFontSet(loader: FontLoader): Promise<FontSet> {
  const entries = await Promise.all(
    BALLOON_TEXT_FONTS.map(async (font): Promise<[BalloonTextFont, FontFile]> => {
      const { file, postScriptName } = BUNDLED_FONTS[font];
      const parsed = FontFile.parse(await loader(file));
      if (parsed.postScriptName !== postScriptName) throw new Error(`${file}: expected ${postScriptName}, found ${parsed.postScriptName}`);
      return [font, parsed];
    }),
  );
  return new FontSet(new Map(entries));
}
