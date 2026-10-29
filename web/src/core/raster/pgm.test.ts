import { describe, expect, it } from 'vitest';
import { decodeFloat32LE, decodePGM, encodeFloat32LE, encodePGM } from './pgm';

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (ch) => ch.charCodeAt(0));
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

// Deterministic byte pattern without Math.random.
function pattern(count: number, seed: number): Uint8Array {
  const out = new Uint8Array(count);
  let state = seed >>> 0;
  for (let i = 0; i < count; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

describe('PGM (P5, maxval 255)', () => {
  it('round-trips byte-identically', () => {
    const image = { width: 37, height: 11, pixels: pattern(37 * 11, 7) };
    const bytes = encodePGM(image);
    expect(Array.from(bytes.subarray(0, 13), (b) => String.fromCharCode(b)).join('')).toBe('P5\n37 11\n255\n');
    const decoded = decodePGM(bytes);
    expect(decoded.width).toBe(37);
    expect(decoded.height).toBe(11);
    expect(decoded.pixels).toEqual(image.pixels);
    expect(encodePGM(decoded)).toEqual(bytes);
  });

  it('keeps file row 0 as pixel row 0 (no flip)', () => {
    const decoded = decodePGM(concatBytes(ascii('P5\n2 2\n255\n'), Uint8Array.of(1, 2, 3, 4)));
    expect(Array.from(decoded.pixels)).toEqual([1, 2, 3, 4]);
  });

  it('accepts other whitespace and comments in the header', () => {
    const decoded = decodePGM(concatBytes(ascii('P5 # CoreGraphics dump\n3\t1\r\n# maxval next\n255 '), Uint8Array.of(0, 128, 255)));
    expect(decoded).toEqual({ width: 3, height: 1, pixels: Uint8Array.of(0, 128, 255) });
  });

  it('rejects other formats and truncated data', () => {
    expect(() => decodePGM(ascii('P2\n1 1\n255\n0\n'))).toThrow('P5');
    expect(() => decodePGM(concatBytes(ascii('P5\n1 1\n65535\n'), Uint8Array.of(0, 0)))).toThrow('maxval');
    expect(() => decodePGM(concatBytes(ascii('P5\n2 2\n255\n'), Uint8Array.of(1, 2, 3)))).toThrow('pixel bytes');
    expect(() => encodePGM({ width: 2, height: 2, pixels: new Uint8Array(3) })).toThrow('pixels');
  });
});

describe('raw little-endian Float32', () => {
  it('round-trips byte-identically, including -0, subnormals and infinities', () => {
    const values = Float32Array.of(0, -0, 1, 1 / 255, Math.fround(0.1), 1.401298464324817e-45, -3.4028234663852886e38, Infinity, -Infinity);
    const bytes = encodeFloat32LE(values);
    expect(Array.from(bytes.subarray(4, 12))).toEqual([0, 0, 0, 0x80, 0, 0, 0x80, 0x3f]);
    const decoded = decodeFloat32LE(bytes, values.length);
    expect(new Uint8Array(decoded.buffer)).toEqual(new Uint8Array(values.buffer));
    expect(encodeFloat32LE(decoded)).toEqual(bytes);
  });

  it('keeps arbitrary bit patterns of non-NaN values', () => {
    const raw = pattern(4096, 3);
    const decoded = decodeFloat32LE(raw);
    let checked = 0;
    for (let i = 0; i < decoded.length; i++) {
      if (Number.isNaN(decoded[i])) continue;
      expect(Array.from(encodeFloat32LE(decoded.subarray(i, i + 1)))).toEqual(Array.from(raw.subarray(i * 4, i * 4 + 4)));
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('reads from an offset view and checks the length', () => {
    const backing = new Uint8Array(12);
    backing.set(encodeFloat32LE(Float32Array.of(0.5, 2)), 4);
    expect(Array.from(decodeFloat32LE(backing.subarray(4)))).toEqual([0.5, 2]);
    expect(() => decodeFloat32LE(new Uint8Array(5))).toThrow('multiple of 4');
    expect(() => decodeFloat32LE(new Uint8Array(8), 3)).toThrow('expected 3');
  });
});
