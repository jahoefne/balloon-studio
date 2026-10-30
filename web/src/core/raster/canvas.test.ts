import { describe, expect, it } from 'vitest';
import { fixtureText, probeSection } from '../../../tests/support/swiftProbe';
import { translation } from './affine';
import { composite, ellipsePath, GrayCanvas, installStrokeGeometry, rectPath, type StrokeGeometry } from './canvas';
import { GRADIENT_DITHER, GrayGradient } from './gradient';
import { decodePGM } from './pgm';
import { Path } from './path';

const probes = fixtureText('primitives/probes/cg-raster.txt.gz');

const pixelOf = (c: GrayCanvas, x: number, y: number): number => c.pixels[y * c.width + x] as number;

function triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): Path {
  const p = new Path();
  p.moveTo(x0, y0);
  p.lineTo(x1, y1);
  p.lineTo(x2, y2);
  p.close();
  return p;
}

describe('compositing', () => {
  it('follows dst = floor(dst + (gray·255 − dst)·a/255 + 0.5)', () => {
    expect(composite(0, 255, 255)).toBe(255);
    expect(composite(100, 200, 0)).toBe(100);
    expect(composite(51, 255, 128)).toBe(Math.floor(51 + ((255 - 51) * 128) / 255 + 0.5));
    expect(composite(200, 100, 128)).toBe(Math.floor(200 + ((100 - 200) * 128) / 255 + 0.5));
  });

  it('turns gray 0.7 into 179 and repaints instead of adding in the interior', () => {
    const c = new GrayCanvas(8, 8);
    c.setFillGray(0.7);
    c.fillRect({ x: 1, y: 1, width: 6, height: 6 });
    expect(pixelOf(c, 3, 3)).toBe(179);
    c.setFillGray(0.2);
    c.fillRect({ x: 2, y: 2, width: 2, height: 2 });
    expect(pixelOf(c, 3, 3)).toBe(51);
    expect(pixelOf(c, 1, 1)).toBe(179);
  });

  it('partial coverage mixes with what is there', () => {
    const c = new GrayCanvas(4, 1);
    c.setFillGray(0.2);
    c.fillRect({ x: 0, y: 0, width: 4, height: 1 });
    c.setFillGray(1);
    c.fillRect({ x: 1.5, y: 0, width: 2.5, height: 1 });
    expect(Array.from(c.pixels)).toEqual([51, composite(51, 255, 128), 255, 255]);
  });
});

describe('no conflation', () => {
  it('a path holding the same circle twice equals the circle once, byte for byte', () => {
    const rect = { x: 12, y: 12, width: 40, height: 40 };
    const once = new GrayCanvas(64, 64);
    once.setFillGray(0.7);
    once.fillPath(ellipsePath(rect));
    const twice = new GrayCanvas(64, 64);
    twice.setFillGray(0.7);
    const p = ellipsePath(rect);
    p.addPath(ellipsePath(rect));
    twice.fillPath(p);
    expect(twice.pixels).toEqual(once.pixels);
  });

  it('a circle drawn twice in two primitives composites twice, like an 8-bit context', () => {
    const rect = { x: 12, y: 12, width: 40, height: 40 };
    const once = new GrayCanvas(64, 64);
    once.setFillGray(0.7);
    once.fillEllipseIn(rect);
    const twice = new GrayCanvas(64, 64);
    twice.setFillGray(0.7);
    twice.fillEllipseIn(rect);
    twice.fillEllipseIn(rect);
    let darker = 0;
    for (let i = 0; i < once.pixels.length; i++) {
      const a = once.pixels[i] as number;
      const b = twice.pixels[i] as number;
      expect(b).toBeGreaterThanOrEqual(a);
      if (a === 0 || a === 179) expect(b).toBe(a);
      else if (b > a) darker++;
    }
    expect(darker).toBeGreaterThan(100);
  });
});

describe('antialias off', () => {
  it('sets a triangle to 0 or the fill level, on every pixel it touches', () => {
    const c = new GrayCanvas(64, 64);
    c.setShouldAntialias(false);
    c.setFillGray(1);
    c.fillPath(triangle(6.3, 8.6, 58.2, 20.4, 21.7, 57.1));
    expect(new Set(c.pixels)).toEqual(new Set([0, 255]));
    // Row 13 of the triangle spans 7.70…30.05 over its height (a centre rule would end at 27.85).
    expect(pixelOf(c, 7, 13)).toBe(255);
    expect(pixelOf(c, 6, 13)).toBe(0);
    expect(pixelOf(c, 30, 13)).toBe(255);
    expect(pixelOf(c, 31, 13)).toBe(0);
    // Row 8 holds only the tip at y = 8.6 and row 57 the lowest tip, whose centres are outside the triangle.
    expect(pixelOf(c, 7, 8)).toBe(255);
    expect(pixelOf(c, 21, 57)).toBe(255);
  });
});

describe('clips', () => {
  it('multiply nested path clips and match CoreGraphics', () => {
    // cg-raster.swift `nested("paths")`: vertical edges at 3.5/12 and 3.25/11.5 on non-rectangular shapes.
    const column = (x0: number, x1: number): Path => {
      const p = new Path();
      p.moveTo(x0, -4);
      p.lineTo(x1, -4);
      p.lineTo(x1, 8);
      p.lineTo((x0 + x1) / 2, 9);
      p.lineTo(x0, 8);
      p.close();
      return p;
    };
    const c = new GrayCanvas(16, 4);
    c.setFillGray(0.2);
    c.fillRect({ x: 0, y: 0, width: 16, height: 4 });
    c.clip(column(3.5, 12));
    c.clip(column(3.25, 11.5));
    c.setFillGray(1);
    c.fillRect({ x: 0, y: 0, width: 16, height: 4 });
    const line = probeSection(probes, 'CLIP_NESTED').find((l) => l.startsWith('paths ')) as string;
    const expected = line.split(' ').slice(1).map(Number);
    Array.from(c.pixels.subarray(16, 32)).forEach((v, x) => expect(Math.abs(v - (expected[x] as number)), `x=${x}`).toBeLessThanOrEqual(1));
  });

  it('restore brings the previous clip back', () => {
    const c = new GrayCanvas(8, 8);
    c.setFillGray(1);
    c.save();
    c.clip(rectPath({ x: 0, y: 0, width: 2, height: 2 }));
    c.fillRect({ x: 0, y: 0, width: 8, height: 8 });
    c.restore();
    expect(pixelOf(c, 1, 1)).toBe(255);
    expect(pixelOf(c, 5, 5)).toBe(0);
    c.fillRect({ x: 4, y: 4, width: 4, height: 4 });
    expect(pixelOf(c, 5, 5)).toBe(255);
  });

  it('clips gradients and draws nothing with an empty clip', () => {
    const c = new GrayCanvas(8, 8);
    c.clipRect({ x: 2, y: 2, width: 2, height: 2 });
    c.clipRect({ x: 5, y: 5, width: 1, height: 1 });
    c.drawLinearGradient(new GrayGradient([1, 1]), 0, 0, 8, 0, { drawsBeforeStartLocation: true, drawsAfterEndLocation: true });
    c.setFillGray(1);
    c.fillRect({ x: 0, y: 0, width: 8, height: 8 });
    expect(c.pixels.every((v) => v === 0)).toBe(true);
  });

  it('takes a rectangle clip under a CTM through the coverage path when its edges are fractional', () => {
    const c = new GrayCanvas(8, 2);
    c.setFillGray(1);
    c.scaleBy(0.5, 1);
    c.clipRect({ x: 3, y: 0, width: 4, height: 2 });
    c.fillRect({ x: 0, y: 0, width: 16, height: 2 });
    expect(Array.from(c.pixels.subarray(0, 8))).toEqual([0, 128, 255, 128, 0, 0, 0, 0]);
  });
});

describe('gstate', () => {
  it('save/restore covers CTM, colours, antialiasing and stroke parameters', () => {
    const c = new GrayCanvas(8, 8);
    c.setFillGray(0.5);
    c.setLineWidth(3);
    c.save();
    c.translateBy(2, 3);
    c.setFillGray(1);
    c.setShouldAntialias(false);
    c.setLineWidth(5);
    c.setLineCap('round');
    c.setLineJoin('bevel');
    c.setMiterLimit(2);
    c.setLineDash(1, [2, 3]);
    c.restore();
    expect(c.ctm).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    c.fillRect({ x: 0, y: 0, width: 1.5, height: 1 });
    expect(pixelOf(c, 0, 0)).toBe(128);
    expect(pixelOf(c, 1, 0)).toBe(composite(0, 127.5, 128));
    const seen: unknown[] = [];
    installStrokeGeometry(recording(seen));
    c.strokePath(rectPath({ x: 0, y: 0, width: 1, height: 1 }));
    expect(seen).toEqual([{ width: 3, cap: 'butt', join: 'miter', miterLimit: 10 }]);
  });

  it('ignores a restore without a save', () => {
    const c = new GrayCanvas(2, 2);
    c.translateBy(1, 1);
    c.restore();
    expect(c.ctm.tx).toBe(1);
  });

  it('applies the CTM in Swift order: the last call acts first on a point', () => {
    const c = new GrayCanvas(16, 16);
    c.setFillGray(1);
    c.translateBy(4, 8);
    c.scaleBy(2, 0.5);
    c.fillRect({ x: 1, y: 2, width: 3, height: 4 });
    // x: 4 + 2·[1, 4] = [6, 12]; y: 8 + 0.5·[2, 6] = [9, 11].
    expect(pixelOf(c, 5, 10)).toBe(0);
    expect(pixelOf(c, 6, 9)).toBe(255);
    expect(pixelOf(c, 11, 10)).toBe(255);
    expect(pixelOf(c, 12, 10)).toBe(0);
    expect(pixelOf(c, 8, 11)).toBe(0);
  });

  it('rejects a bad size', () => {
    expect(() => new GrayCanvas(0, 5)).toThrow();
    expect(() => new GrayCanvas(2.5, 5)).toThrow();
  });
});

describe('strokePath', () => {
  it('outlines in user space with a tolerance divided by the largest CTM scale and dashes first', () => {
    const calls: { tolerance: number; style?: unknown; lengths?: readonly number[]; phase?: number }[] = [];
    installStrokeGeometry({
      strokePath(path, style, tolerance) {
        calls.push({ tolerance, style });
        return path;
      },
      dashPath(path, lengths, phase, tolerance) {
        calls.push({ tolerance, lengths, phase });
        return path;
      },
    });
    const c = new GrayCanvas(16, 16);
    c.scaleBy(4, 1);
    c.setLineWidth(2);
    c.setLineCap('round');
    c.setLineDash(0.5, [3, 2]);
    c.strokePath(rectPath({ x: 1, y: 1, width: 2, height: 2 }));
    expect(calls).toEqual([
      { tolerance: 0.01 / 4, lengths: [3, 2], phase: 0.5 },
      { tolerance: 0.03 / 4, style: { width: 2, cap: 'round', join: 'miter', miterLimit: 10 } },
    ]);
    c.setLineDash(0, []);
    c.strokePath(rectPath({ x: 1, y: 1, width: 2, height: 2 }));
    expect(calls).toHaveLength(3);
  });
});

describe('gradients on the canvas', () => {
  it('leave the outside alone without the extend flags and paint the end colours with them', () => {
    const g = new GrayGradient([0.2, 1]);
    const bare = new GrayCanvas(32, 1);
    bare.drawLinearGradient(g, 8, 0, 24, 0);
    expect(pixelOf(bare, 7, 0)).toBe(0);
    expect(pixelOf(bare, 8, 0)).toBeGreaterThan(0);
    expect(pixelOf(bare, 23, 0)).toBeGreaterThan(0);
    expect(pixelOf(bare, 24, 0)).toBe(0);
    const both = new GrayCanvas(32, 1);
    both.drawLinearGradient(g, 8, 0, 24, 0, { drawsBeforeStartLocation: true, drawsAfterEndLocation: true });
    expect(pixelOf(both, 0, 0)).toBe(51);
    expect(pixelOf(both, 31, 0)).toBe(255);
  });

  it('is elliptical under an anisotropic CTM: equal gray levels at 2.2 times the distance along x', () => {
    const c = new GrayCanvas(128, 64);
    c.translateBy(64, 32);
    c.scaleBy(2.2, 1);
    c.drawRadialGradient(new GrayGradient([1, 0]), 0, 0, 20, { drawsAfterEndLocation: true });
    // Mean of the dither away: compare 8×8 averages at the same t.
    const mean = (cx: number, cy: number): number => {
      let sum = 0;
      for (let y = cy - 8; y < cy + 8; y++) for (let x = cx - 8; x < cx + 8; x++) sum += pixelOf(c, x, y);
      return sum / 256;
    };
    expect(pixelOf(c, 64, 32)).toBeGreaterThan(240);
    expect(pixelOf(c, 64 + 44 + 4, 32)).toBe(0);
    const atX = mean(64 + 22, 32);
    const mirrored = mean(64 - 22, 32);
    expect(Math.abs(atX - mirrored)).toBeLessThan(2);
    // Along y the gradient ends at 20 px: row 32 + 21 is black at the centre column, column 64 + 21 is not.
    expect(pixelOf(c, 64, 32 + 21)).toBe(0);
    expect(pixelOf(c, 64 + 21, 32)).toBeGreaterThan(100);
    // The same t along both axes.
    const u = new GrayCanvas(64, 64);
    u.translateBy(32, 32);
    u.drawRadialGradient(new GrayGradient([1, 0]), 0, 0, 20, { drawsAfterEndLocation: true });
    expect(Math.abs(pixelOf(c, 64 + 22, 32) - pixelOf(u, 32 + 10, 32))).toBeLessThanOrEqual(16);
  });

  it('dithers from the clip origin, as CoreGraphics does', () => {
    const lines = probeSection(probes, 'DITHER_CLIP').filter((l) => l !== '');
    const bytes = (hex: string): number[] => Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(2 * i, 2 * i + 2), 16));
    const clips: Record<string, (c: GrayCanvas) => void> = {
      none: () => {},
      'rect-4-14': (c) => c.clipRect({ x: 4, y: 14, width: 20, height: 20 }),
      'rect-3-5': (c) => c.clipRect({ x: 3, y: 5, width: 20, height: 20 }),
      'rect-off-canvas': (c) => c.clipRect({ x: -5, y: -7, width: 20, height: 20 }),
      'nested-rects': (c) => {
        c.clipRect({ x: 4, y: 14, width: 20, height: 20 });
        c.clipRect({ x: 7, y: 16, width: 20, height: 20 });
      },
      'fractional-rect': (c) => c.clipRect({ x: 3.5, y: 5.5, width: 20, height: 20 }),
      'two-ellipses': (c) => {
        c.clip(ellipsePath({ x: 6, y: 10, width: 20, height: 24 }));
        c.clip(ellipsePath({ x: 13, y: 6, width: 20, height: 24 }));
      },
    };
    expect(lines).toHaveLength(Object.keys(clips).length);
    for (const line of lines) {
      const [name, hex] = line.split(' ') as [string, string];
      const clip = clips[name];
      if (clip === undefined) throw new Error(`no clip for ${name}`);
      const c = new GrayCanvas(40, 40);
      clip(c);
      c.drawLinearGradient(new GrayGradient([0.5, 0.5]), 0, 0, 16, 0, { drawsBeforeStartLocation: true, drawsAfterEndLocation: true });
      const expected = bytes(hex);
      let exact = 0;
      let within = 0;
      expected.forEach((v, i) => {
        const d = Math.abs(v - (c.pixels[i] as number));
        if (d === 0) exact++;
        if (d <= 2) within++;
      });
      // Edge pixels of the ellipses round differently; nearly everything else is the same byte.
      expect(within, name).toBeGreaterThanOrEqual(1600 - 2);
      expect(exact / 1600, name).toBeGreaterThanOrEqual(0.97);
    }
  });

  it('uses each tile entry as floor(value + (256 − k)/256)', () => {
    const c = new GrayCanvas(16, 16);
    const g = 100.5 / 255;
    c.drawLinearGradient(new GrayGradient([g, g]), 0, 0, 16, 0, { drawsBeforeStartLocation: true, drawsAfterEndLocation: true });
    for (let i = 0; i < 256; i++) expect(c.pixels[i]).toBe((GRADIENT_DITHER[i] as number) <= 128 ? 101 : 100);
  });
});

describe('export', () => {
  it('writes the bitmap as PGM with row 0 first', () => {
    const c = new GrayCanvas(3, 2);
    c.setFillGray(1);
    c.fillRect({ x: 0, y: 0, width: 3, height: 1 });
    expect(decodePGM(c.toPGM())).toEqual({ width: 3, height: 2, pixels: new Uint8Array([255, 255, 255, 0, 0, 0]) });
  });
});

function recording(seen: unknown[]): StrokeGeometry {
  return {
    strokePath(path, style) {
      seen.push(style);
      return path.transformed(translation(0, 0));
    },
    dashPath(path) {
      return path;
    },
  };
}
