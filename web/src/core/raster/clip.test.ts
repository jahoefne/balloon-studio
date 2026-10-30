import { describe, expect, it } from 'vitest';
import { IDENTITY } from './affine';
import { ClipMask, multiplyCoverage } from './clip';
import { ellipsePath, rectPath } from './canvas';
import { rasterize, EdgeTable, addPathEdges } from './scanline';

const coverageOf = (mask: ClipMask, x: number, y: number): number => {
  const { x0, y0, x1, y1 } = mask.rect;
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return 0;
  return mask.coverage === null ? 255 : (mask.coverage[(y - y0) * (x1 - x0) + x - x0] as number);
};

describe('ClipMask', () => {
  it('multiplies with round(a·b/255)', () => {
    expect(multiplyCoverage(255, 255)).toBe(255);
    expect(multiplyCoverage(255, 77)).toBe(77);
    expect(multiplyCoverage(128, 128)).toBe(64);
    expect(multiplyCoverage(0, 200)).toBe(0);
    for (let a = 0; a < 256; a += 5) {
      for (let b = 0; b < 256; b += 3) expect(multiplyCoverage(a, b)).toBe(Math.round((a * b) / 255));
    }
  });

  it('starts as a full rectangle without a coverage buffer', () => {
    const mask = ClipMask.full(8, 6);
    expect(mask.rect).toEqual({ x0: 0, y0: 0, x1: 8, y1: 6 });
    expect(mask.coverage).toBeNull();
    expect(mask.isEmpty).toBe(false);
  });

  it('keeps coverage only over the bounding box of the clip', () => {
    const mask = ClipMask.full(100, 100).clip(ellipsePath({ x: 10.5, y: 20.5, width: 9, height: 7 }), IDENTITY, true, 'nonzero');
    expect(mask.rect).toEqual({ x0: 10, y0: 20, x1: 20, y1: 28 });
    expect(mask.coverage).toHaveLength(10 * 8);
  });

  it('multiplies nested path clips and leaves the outer mask untouched', () => {
    const outer = ClipMask.full(16, 8).clip(rectPath({ x: 2.5, y: 0, width: 10, height: 8 }), IDENTITY, true, 'nonzero');
    const before = Array.from(outer.coverage as Uint8Array);
    const inner = outer.clip(rectPath({ x: 2.25, y: 0, width: 9.25, height: 8 }), IDENTITY, true, 'nonzero');
    expect(coverageOf(outer, 2, 4)).toBe(128);
    expect(coverageOf(inner, 2, 4)).toBe(multiplyCoverage(128, 191));
    expect(coverageOf(inner, 11, 4)).toBe(128);
    expect(coverageOf(inner, 12, 4)).toBe(0);
    expect(Array.from(outer.coverage as Uint8Array)).toEqual(before);
  });

  it('crops an existing mask to a pixel rectangle', () => {
    const mask = ClipMask.full(16, 8).clip(rectPath({ x: 2.5, y: 1.5, width: 10, height: 5 }), IDENTITY, true, 'nonzero');
    const cropped = mask.clipPixelRect({ x0: 2, y0: 2, x1: 5, y1: 4 });
    expect(cropped.rect).toEqual({ x0: 2, y0: 2, x1: 5, y1: 4 });
    expect(coverageOf(cropped, 2, 3)).toBe(128);
    expect(coverageOf(cropped, 3, 3)).toBe(255);
    expect(ClipMask.full(16, 8).clipPixelRect({ x0: 2, y0: 2, x1: 5, y1: 4 }).coverage).toBeNull();
  });

  it('becomes empty when the shapes do not meet, and for an empty path', () => {
    const a = ClipMask.full(16, 16).clip(rectPath({ x: 1, y: 1, width: 3, height: 3 }), IDENTITY, true, 'nonzero');
    expect(a.clip(rectPath({ x: 8, y: 8, width: 3, height: 3 }), IDENTITY, true, 'nonzero').isEmpty).toBe(true);
    expect(a.clipPixelRect({ x0: 8, y0: 8, x1: 9, y1: 9 }).isEmpty).toBe(true);
    const path = rectPath({ x: 1, y: 1, width: 0, height: 0 });
    expect(a.clip(path, IDENTITY, true, 'nonzero').isEmpty).toBe(true);
  });

  it('with antialias off clips to the touched pixels', () => {
    const mask = ClipMask.full(10, 8).clip(rectPath({ x: 2.5, y: 1.5, width: 5, height: 5 }), IDENTITY, false, 'nonzero');
    expect(mask.rect).toEqual({ x0: 2, y0: 1, x1: 8, y1: 7 });
    expect(new Set(mask.coverage)).toEqual(new Set([255]));
  });

  it('honours the even-odd rule', () => {
    const p = rectPath({ x: 1, y: 1, width: 8, height: 8 });
    p.addPath(rectPath({ x: 3, y: 3, width: 4, height: 4 }));
    const mask = ClipMask.full(10, 10).clip(p, IDENTITY, true, 'evenodd');
    expect(coverageOf(mask, 5, 5)).toBe(0);
    expect(coverageOf(mask, 2, 2)).toBe(255);
    const edges = new EdgeTable();
    addPathEdges(edges, p, IDENTITY);
    expect(rasterize(edges, mask.rect, { antialias: true, rule: 'evenodd' }).pixels).toEqual(mask.coverage);
  });
});
