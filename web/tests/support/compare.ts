// Raster comparison metrics for the rasterizer tests (docs/plan.md, Abschnitt 7 "Verifikation (R)", WP-R0).
// They compare a TS raster with the CoreGraphics dump of the same scene (web/tests/fixtures/README.md):
// the TS rasterizer is checked by tolerance, never byte for byte, against CoreGraphics; determinism across
// engines is checked separately by hashes.
//
// Test support only (not part of web/src/core), so plain Math is fine here.

/** A gray raster or mask; pixel (x, y) is pixels[y * width + x]. */
export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly pixels: ArrayLike<number>;
}

/** Thresholds from docs/plan.md §7. Pixel values in bytes (0…255), heights in mm. */
export const THRESHOLDS = {
  /** Artwork raster vs CoreGraphics: share of pixels within ±2 and within ±16 gray levels. */
  pixelAgreement: [
    { tolerance: 2, min: 0.97 },
    { tolerance: 16, min: 0.995 },
  ],
  /** Worst 8×8 block: |mean(TS) − mean(CG)| ≤ 8 gray levels. */
  blockMean: { block: 8, max: 8 },
  /** Height field after the blur, scaled by the relief depth. */
  heightfield: { depthMm: 2.4, rms: 0.03, p999: 0.15, max: 0.4 },
  /** Text masks: size ±1 px, aspect ±1 %, IoU after nearest-neighbour resampling. */
  textMask: { sizePx: 1, aspectRelative: 0.01, iou: 0.97 },
  /** Calibration primitives: share of pixels within ±2 gray levels. */
  primitives: { tolerance: 2, min: 0.98 },
} as const;

function requireSameLength(a: ArrayLike<number>, b: ArrayLike<number>): void {
  if (a.length !== b.length) throw new Error(`compare: ${a.length} vs ${b.length} pixels`);
  if (a.length === 0) throw new Error('compare: empty raster');
}

/** Share of pixels with |a − b| ≤ tolerance (same units as the pixels; bytes → 2 and 16). */
export function pixelAgreement(a: ArrayLike<number>, b: ArrayLike<number>, tolerance: number): number {
  requireSameLength(a, b);
  let agree = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs((a[i] as number) - (b[i] as number)) <= tolerance) agree++;
  }
  return agree / a.length;
}

/**
 * Largest |mean(a) − mean(b)| over `block × block` tiles of a `width × height` raster (edge tiles use the
 * pixels they have). Catches local shifts and thickness errors that per-pixel agreement forgives.
 */
export function blockMeanDifference(a: ArrayLike<number>, b: ArrayLike<number>, width: number, height: number, block = 8): number {
  requireSameLength(a, b);
  if (a.length !== width * height) throw new Error(`compare: ${a.length} pixels for ${width}×${height}`);
  let worst = 0;
  for (let y0 = 0; y0 < height; y0 += block) {
    for (let x0 = 0; x0 < width; x0 += block) {
      const y1 = Math.min(height, y0 + block);
      const x1 = Math.min(width, x0 + block);
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) sum += (a[y * width + x] as number) - (b[y * width + x] as number);
      }
      worst = Math.max(worst, Math.abs(sum / ((y1 - y0) * (x1 - x0))));
    }
  }
  return worst;
}

export interface HeightfieldStats {
  /** Root mean square of the height difference in mm. */
  readonly rms: number;
  /** 99.9th percentile (nearest rank) of |difference| in mm. */
  readonly p999: number;
  /** Largest |difference| in mm. */
  readonly max: number;
}

/** Height-field difference in mm for fields in 0…1 scaled by `depthMm` (2.4 mm in the plan). */
export function heightfieldStats(a: ArrayLike<number>, b: ArrayLike<number>, depthMm: number): HeightfieldStats {
  requireSameLength(a, b);
  const diffs = new Float64Array(a.length);
  let squares = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(((a[i] as number) - (b[i] as number)) * depthMm);
    diffs[i] = d;
    squares += d * d;
  }
  diffs.sort();
  const rank = Math.max(1, Math.ceil((999 * diffs.length) / 1000));
  return { rms: Math.sqrt(squares / diffs.length), p999: diffs[rank - 1] as number, max: diffs[diffs.length - 1] as number };
}

/** Nearest-neighbour resampling of `source` to `width × height` (pixel centres mapped proportionally). */
export function resampleNearest(source: Raster, width: number, height: number): Raster {
  const pixels = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(source.height - 1, Math.floor(((y + 0.5) * source.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(source.width - 1, Math.floor(((x + 0.5) * source.width) / width));
      pixels[y * width + x] = source.pixels[sy * source.width + sx] as number;
    }
  }
  return { width, height, pixels };
}

/**
 * Intersection over union of the ink (pixel > 0) of two masks. `a` is resampled (nearest neighbour) to the
 * size of `b`, the reference, first. Two empty masks count as identical (1).
 */
export function iou(a: Raster, b: Raster): number {
  const resampled = a.width === b.width && a.height === b.height ? a : resampleNearest(a, b.width, b.height);
  let both = 0;
  let either = 0;
  for (let i = 0; i < b.pixels.length; i++) {
    const inkA = (resampled.pixels[i] as number) > 0;
    const inkB = (b.pixels[i] as number) > 0;
    if (inkA && inkB) both++;
    if (inkA || inkB) either++;
  }
  return either === 0 ? 1 : both / either;
}
