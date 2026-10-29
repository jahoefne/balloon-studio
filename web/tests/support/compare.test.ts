import { describe, expect, it } from 'vitest';
import { THRESHOLDS, blockMeanDifference, heightfieldStats, iou, pixelAgreement, resampleNearest } from './compare';

function image(width: number, height: number, f: (x: number, y: number) => number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[y * width + x] = f(x, y);
  return out;
}

function disk(width: number, height: number, cx: number, cy: number, r: number): Uint8Array {
  return image(width, height, (x, y) => ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r ? 255 : 0));
}

describe('pixelAgreement', () => {
  it('is 1 for identical images and counts pixels outside the tolerance', () => {
    const a = image(10, 10, (x, y) => (x * 25 + y) % 256);
    expect(pixelAgreement(a, a, 0)).toBe(1);
    const b = Uint8Array.from(a);
    b[42] = (b[42] as number) + 3;
    b[43] = (b[43] as number) + 2;
    expect(pixelAgreement(a, b, 2)).toBeCloseTo(0.99, 12);
    expect(pixelAgreement(a, b, 16)).toBe(1);
  });

  it('works on 0…1 fields with the tolerance in the same unit', () => {
    const a = Float32Array.of(0, 0.5, 1, 0.25);
    const b = Float32Array.of(0, 0.5 + 1 / 255, 1, 0.5);
    expect(pixelAgreement(a, b, 2 / 255)).toBe(0.75);
  });

  it('rejects mismatched sizes', () => {
    expect(() => pixelAgreement(new Uint8Array(3), new Uint8Array(4), 2)).toThrow('3 vs 4');
  });
});

describe('blockMeanDifference', () => {
  it('reports the worst block and ignores zero-mean noise', () => {
    const a = image(16, 16, () => 100);
    const noisy = image(16, 16, (x, y) => ((x + y) % 2 === 0 ? 101 : 99));
    expect(blockMeanDifference(a, noisy, 16, 16)).toBe(0);
    const shifted = image(16, 16, (x, y) => (x >= 8 && y < 8 ? 108 : 100));
    expect(blockMeanDifference(a, shifted, 16, 16)).toBe(8);
    expect(blockMeanDifference(a, shifted, 16, 16, 16)).toBe(2);
  });

  it('averages partial edge blocks over their own pixels', () => {
    const a = image(10, 9, () => 0);
    const b = image(10, 9, (x, y) => (x >= 8 && y >= 8 ? 40 : 0));
    // Corner block is 2×1 pixels, both off by 40.
    expect(blockMeanDifference(a, b, 10, 9)).toBe(40);
  });
});

describe('heightfieldStats', () => {
  it('measures rms, p99.9 (nearest rank) and max in mm', () => {
    const a = new Float32Array(1000);
    const b = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) b[i] = i < 998 ? 0.005 : 0.01;
    b[999] = 0.1; // one outlier
    const stats = heightfieldStats(a, b, 2.4);
    expect(stats.max).toBeCloseTo(0.1 * 2.4, 6);
    expect(stats.p999).toBeCloseTo(0.01 * 2.4, 6); // rank 999 of 1000 skips only the outlier
    const expectedRms = Math.sqrt((998 * (0.005 * 2.4) ** 2 + (0.01 * 2.4) ** 2 + (0.1 * 2.4) ** 2) / 1000);
    expect(stats.rms).toBeCloseTo(expectedRms, 6);
    expect(heightfieldStats(a, a, 2.4)).toEqual({ rms: 0, p999: 0, max: 0 });
  });

  it('uses the plan thresholds', () => {
    expect(THRESHOLDS.heightfield).toEqual({ depthMm: 2.4, rms: 0.03, p999: 0.15, max: 0.4 });
  });
});

describe('iou', () => {
  it('is 1 for identical masks and for two empty masks', () => {
    const d = disk(32, 32, 16, 16, 10);
    expect(iou({ width: 32, height: 32, pixels: d }, { width: 32, height: 32, pixels: d })).toBe(1);
    const empty = new Uint8Array(16);
    expect(iou({ width: 4, height: 4, pixels: empty }, { width: 4, height: 4, pixels: empty })).toBe(1);
  });

  it('measures overlap of shifted shapes', () => {
    const a = image(10, 1, (x) => (x < 6 ? 255 : 0));
    const b = image(10, 1, (x) => (x >= 2 && x < 8 ? 255 : 0));
    expect(iou({ width: 10, height: 1, pixels: a }, { width: 10, height: 1, pixels: b })).toBeCloseTo(4 / 8, 12);
  });

  it('resamples to the reference size with nearest neighbour', () => {
    const reference = disk(20, 12, 10, 6, 5);
    const doubled = image(40, 24, (x, y) => reference[Math.floor(y / 2) * 20 + Math.floor(x / 2)] as number);
    expect(iou({ width: 40, height: 24, pixels: doubled }, { width: 20, height: 12, pixels: reference })).toBe(1);
    const back = resampleNearest({ width: 40, height: 24, pixels: doubled }, 20, 12);
    expect(Array.from(back.pixels)).toEqual(Array.from(reference));
    // The same shape rendered one pixel wider and taller (the ±1 px the plan tolerates) still overlaps
    // almost fully once resampled; masks are scaled to fill their canvas, so the shape scales with it.
    const ellipse = (w: number, h: number): Uint8Array =>
      image(w, h, (x, y) => (((x + 0.5) / w - 0.5) ** 2 + ((y + 0.5) / h - 0.5) ** 2 <= 0.16 ? 255 : 0));
    const target = { width: 60, height: 36, pixels: ellipse(60, 36) };
    expect(iou({ width: 61, height: 37, pixels: ellipse(61, 37) }, target)).toBeGreaterThan(0.95);
    expect(iou({ width: 59, height: 35, pixels: ellipse(59, 35) }, target)).toBeGreaterThan(0.95);
  });
});
