import { describe, expect, it } from 'vitest';
import { encodeFloat32LE } from '../raster/pgm';
import { decodeFloat32LE, float32BitDifference, rasterHash } from './raster';

describe('rasterHash', () => {
  it('gives the SHA-256 in lower-case hex', () => {
    expect(rasterHash(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(rasterHash(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('decodeFloat32LE', () => {
  it('reads little-endian bytes at any offset', () => {
    const bytes = encodeFloat32LE(Float32Array.of(1.5, -0, 1e-40));
    const shifted = new Uint8Array(bytes.length + 1);
    shifted.set(bytes, 1);
    const field = decodeFloat32LE(shifted.subarray(1), 3);
    expect(float32BitDifference(field, Float32Array.of(1.5, -0, 1e-40))).toBeNull();
    expect(() => decodeFloat32LE(bytes, 2)).toThrow('expected 2');
  });
});

describe('float32BitDifference', () => {
  it('returns null for identical arrays, also on subarrays', () => {
    const a = Float32Array.of(9, 0.1, -0, Number.NaN, 2);
    const b = Float32Array.of(0.1, -0, Number.NaN, 2);
    expect(float32BitDifference(a.subarray(1), b)).toBeNull();
  });

  it('tells +0 from -0 and counts every difference', () => {
    expect(float32BitDifference(Float32Array.of(0, 1, 2), Float32Array.of(-0, 1, 2.5))).toEqual({
      count: 2,
      firstIndex: 0,
      firstA: 0,
      firstB: -0,
      maxAbsolute: 0.5,
    });
  });

  it('reports a NaN against a number as NaN', () => {
    const difference = float32BitDifference(Float32Array.of(1, Number.NaN, 3), Float32Array.of(1, 2, 1000));
    expect(difference?.firstIndex).toBe(1);
    expect(difference?.maxAbsolute).toBeNaN();
    expect(float32BitDifference(Float32Array.of(Number.NaN, 3), Float32Array.of(2, 1000))?.maxAbsolute).toBeNaN();
  });

  it('refuses arrays of different length', () => {
    expect(() => float32BitDifference(new Float32Array(2), new Float32Array(3))).toThrow('2 values against 3');
  });
});
