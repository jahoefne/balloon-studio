// Ported from mac/ReferenceExporter/main.swift @ 41a2ab1 (`dumpRasters`, the reading side; references/PACK.md).
// Fills the raster seam (patterns/raster.ts) from the Swift dumps. It proves the mesh side independently of the rasterizer: with
// these rasters the 3MF has to match the Mac's. Bytes in, no file access: tests read the pack.
import { decodePGM } from '../raster/pgm';
import { utf8Decode } from '../swift/text';
import { fieldFromBytes, type BalloonTextFont, type PatternRasterizers, type ReliefArtwork, type TextRasterizer } from './raster';

/** `<id>.json` of a relief dump (NightFlightRelief's properties, the crest and the blur radii). */
export interface ReliefDumpInfo {
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
  readonly bottom: number;
  readonly depth: number;
  readonly diameter: number;
  readonly crest: readonly number[];
  readonly style: string;
  readonly blurRadius: { readonly horizontal: number; readonly vertical: number };
}

/** `<id>.json` of a text dump. */
export interface TextDumpInfo {
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
  readonly text: string;
  readonly font: BalloonTextFont;
}

export function parseDumpInfo<T extends ReliefDumpInfo | TextDumpInfo>(json: Uint8Array): T {
  return JSON.parse(utf8Decode(json)) as T;
}

/** A ReliefArtwork that returns `<id>.raw.pgm` after Swift's `/255`, for exactly the raster it was dumped at. */
export function fileReliefArtwork(rawPgm: Uint8Array): ReliefArtwork {
  const image = decodePGM(rawPgm);
  return (_width, _height, _diameter, columns, rows) => {
    if (columns !== image.width || rows !== image.height) {
      throw new Error(`The dump is ${image.width}×${image.height}, the relief asks for ${columns}×${rows}`);
    }
    return fieldFromBytes(image.pixels);
  };
}

/** A TextRasterizer that returns `<id>.pgm`, for exactly the text and font it was dumped with. */
export function fileTextRasterizer(pgm: Uint8Array, infoJson: Uint8Array): TextRasterizer {
  const image = decodePGM(pgm);
  const info = parseDumpInfo<TextDumpInfo>(infoJson);
  return (text, font) => {
    if (text !== info.text || font !== info.font) throw new Error(`The dump is ${JSON.stringify(info.text)} in ${info.font}, not ${JSON.stringify(text)} in ${font}`);
    return { width: image.width, height: image.height, aspect: info.aspect, pixels: image.pixels };
  };
}

const unavailable =
  (what: string) =>
  (): never => {
    throw new Error(`${what} has no raster here`);
  };

/** Rasterizers for a pattern that draws nothing (stripes, motifs, solid); a call throws. */
export const NO_RASTERIZERS: PatternRasterizers = Object.freeze({
  artworks: Object.freeze({ nightFlight: unavailable('Night Flight'), summitCableCar: unavailable('Summit Cable Car') }),
  textRasterizer: unavailable('Text'),
});

/** The one artwork of a relief case, for both styles. */
export function fileReliefRasterizers(rawPgm: Uint8Array): PatternRasterizers {
  const artwork = fileReliefArtwork(rawPgm);
  return { ...NO_RASTERIZERS, artworks: { nightFlight: artwork, summitCableCar: artwork } };
}

export function fileTextRasterizers(pgm: Uint8Array, infoJson: Uint8Array): PatternRasterizers {
  return { ...NO_RASTERIZERS, textRasterizer: fileTextRasterizer(pgm, infoJson) };
}
