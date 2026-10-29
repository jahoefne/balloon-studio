import { describe, expect, it } from 'vitest';
import {
  BALLOON_TEXT_FONTS,
  type PatternRasterizers,
  type ReliefMeshInput,
  type TextMask,
  fieldFromBytes,
} from './raster';

describe('pattern raster seam', () => {
  it('converts artwork bytes like `Float($0)/255`', () => {
    const field = fieldFromBytes(Uint8Array.of(0, 1, 128, 254, 255));
    expect(field[0]).toBe(0);
    expect(field[1]).toBe(Math.fround(1 / 255));
    expect(field[2]).toBe(Math.fround(128 / 255));
    expect(field[4]).toBe(1);
    const all = fieldFromBytes(Uint8Array.from({ length: 256 }, (_, b) => b));
    for (let b = 1; b < 256; b++) expect(all[b - 1]!).toBeLessThan(all[b]!);
  });

  it('keeps the BalloonTextFont raw values and order', () => {
    expect(BALLOON_TEXT_FONTS).toEqual(['Rounded', 'Sans serif', 'Serif', 'Handwritten', 'Monospaced']);
  });

  it('accepts structural meshes and injected rasterizers', () => {
    const withRange: ReliefMeshInput = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      triangles: [{ a: 0, b: 1, c: 2 }],
      maxOverhang: 0,
      innerVertexRange: { lowerBound: 1, upperBound: 3 },
    };
    const withoutRange: ReliefMeshInput = { vertices: [], triangles: [], maxOverhang: 0, innerVertexRange: null };
    const mask: TextMask = { width: 1, height: 1, aspect: 1, pixels: Uint8Array.of(255) };
    const rasterizers: PatternRasterizers = {
      artworks: {
        nightFlight: (_w, _h, _d, columns, rows) => new Float32Array(columns * rows),
        summitCableCar: (_w, _h, _d, columns, rows, radius) => new Float32Array(columns * rows).fill(radius(0) > 0 ? 1 : 0),
      },
      textRasterizer: (text) => (text.trim() === '' ? null : mask),
    };
    expect(withRange.innerVertexRange?.upperBound).toBe(3);
    expect(withoutRange.innerVertexRange).toBeNull();
    expect(rasterizers.artworks.summitCableCar(10, 5, 3, 4, 2, () => 1)).toHaveLength(8);
    expect(rasterizers.textRasterizer('  ', 'Serif')).toBeNull();
    expect(rasterizers.textRasterizer('F', 'Rounded')).toBe(mask);
  });
});
