// Stand-in rasters for the pattern structure tests (WP-K3). The Swift checks these tests port do not depend
// on what is drawn, only that something is: flat-topped motifs all around the panorama and clear margins
// under the cap. The real artwork and glyph checks belong to WP-R3, R4 and R5.
import { fieldFromBytes, type BalloonTextFont, type PatternRasterizers, type ReliefArtwork, type TextMask } from '../../src/core/patterns/raster';

/** Six rounded blobs and a few thin bars, wrapping across the seam, with 12 % free above and below. */
export const standInArtwork: ReliefArtwork = (_width, _height, _diameter, columns, rows) => {
  const bytes = new Uint8Array(columns * rows);
  for (let y = 0; y < rows; y++) {
    const v = y / rows;
    if (v < 0.12 || v > 0.88) continue;
    for (let x = 0; x < columns; x++) {
      const u = x / columns;
      const sector = Math.floor(u * 6);
      const du = (u * 6 - sector - 0.5) * 2;
      const dv = (v - 0.5) * 3.2;
      const inBlob = du * du + dv * dv < 0.7;
      const bar = sector % 2 === 0 && Math.abs(v - 0.8) < 0.01;
      if (inBlob || bar) bytes[y * columns + x] = inBlob ? 220 : 160;
    }
  }
  return fieldFromBytes(bytes);
};

/** A block-letter F: stem on the left, two bars; more ink in the upper half, row 0 at the bottom. */
export function standInF(width = 176, height = 256): TextMask {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const v = y / height;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const stem = u < 0.28;
      const top = v > 0.8;
      const middle = v > 0.42 && v < 0.6 && u < 0.85;
      if (stem || top || middle) pixels[y * width + x] = 255;
    }
  }
  return { width, height, aspect: 0.6854460093896714, pixels };
}

/** A block-letter O with an open counter. */
export function standInO(width = 240, height = 256): TextMask {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width - 0.5;
      const v = y / height - 0.5;
      const r = u * u + v * v;
      if (r < 0.25 && r > 0.07) pixels[y * width + x] = 255;
    }
  }
  return { width, height, aspect: 0.95, pixels };
}

/** BalloonTextMask.init: nil for blank text, otherwise a mask whose width grows with the character count. */
export function standInText(text: string, _font: BalloonTextFont): TextMask | null {
  const message = text.trim();
  if (message.length === 0) return null;
  if (message === 'O') return standInO();
  if (message === 'F') return standInF();
  const count = Array.from(message).length;
  const width = Math.min(8192, 128 * count);
  const height = 256;
  const pixels = new Uint8Array(width * height);
  for (let y = 40; y < height - 40; y++) {
    for (let x = 0; x < width; x++) {
      const inGlyph = x % 128 < 90;
      if (inGlyph) pixels[y * width + x] = 255;
    }
  }
  return { width, height, aspect: (count * 128) / 176, pixels };
}

export const STAND_IN_RASTERIZERS: PatternRasterizers = {
  artworks: { nightFlight: standInArtwork, summitCableCar: standInArtwork },
  textRasterizer: standInText,
};
