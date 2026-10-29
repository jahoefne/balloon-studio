// Raster dump formats shared with the Swift reference exporter (docs/plan.md, Abschnitt 7 and 8, WP-R0).
//
// Mirrors the bytes the Mac side produces from its CGContext bitmaps: NightFlight.swift:8-12 and
// SummitCableCar.swift:14-21 (`CGContext(data:width:height:bitsPerComponent:8,bytesPerRow:columns,
// space:DeviceGray)`, memory row 0 = artwork bottom after the flip), BalloonText.swift:54-62 (text mask,
// same layout) and NightFlight.swift:243-300 (`[Float]` height field after the blur).
//
// - P5 PGM, maxval 255, one byte per pixel. Rows are written in memory order, so file row 0 is memory
//   row 0 — the bottom of the artwork. Nothing is flipped on read or write.
// - Raw little-endian Float32 arrays without header (`.field.f32`).
// Bytes in, bytes out: no node:fs, so the module runs in the worker, in Node and in the browser.

/** An 8-bit gray bitmap; pixel (x, y) is pixels[y * width + x]. */
export interface GrayImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

/** Writes `P5\n<width> <height>\n255\n` followed by the pixels. */
export function encodePGM(image: GrayImage): Uint8Array {
  const { width, height, pixels } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`PGM: invalid size ${width}×${height}`);
  }
  if (pixels.length !== width * height) {
    throw new Error(`PGM: ${pixels.length} pixels for ${width}×${height}`);
  }
  const header = `P5\n${width} ${height}\n255\n`;
  const out = new Uint8Array(header.length + pixels.length);
  for (let i = 0; i < header.length; i++) out[i] = header.charCodeAt(i);
  out.set(pixels, header.length);
  return out;
}

/**
 * Reads a binary PGM (P5, maxval 255). Accepts any PNM whitespace and `#` comments in the header,
 * as the format allows; exactly one whitespace byte separates maxval from the pixels.
 */
export function decodePGM(bytes: Uint8Array): GrayImage {
  let pos = 0;
  const isSpace = (b: number): boolean => b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d || b === 0x0b || b === 0x0c;
  const skipSpaceAndComments = (): void => {
    while (pos < bytes.length) {
      const b = bytes[pos] as number;
      if (isSpace(b)) {
        pos++;
      } else if (b === 0x23) {
        while (pos < bytes.length && bytes[pos] !== 0x0a && bytes[pos] !== 0x0d) pos++;
      } else {
        return;
      }
    }
  };
  const readInt = (what: string): number => {
    skipSpaceAndComments();
    let value = 0;
    let digits = 0;
    while (pos < bytes.length) {
      const b = bytes[pos] as number;
      if (b < 0x30 || b > 0x39) break;
      value = value * 10 + (b - 0x30);
      digits++;
      pos++;
    }
    if (digits === 0) throw new Error(`PGM: missing ${what}`);
    return value;
  };

  if (bytes[0] !== 0x50 || bytes[1] !== 0x35) throw new Error('PGM: not a binary PGM (P5)');
  pos = 2;
  const width = readInt('width');
  const height = readInt('height');
  const maxval = readInt('maxval');
  if (width <= 0 || height <= 0) throw new Error(`PGM: invalid size ${width}×${height}`);
  if (maxval !== 255) throw new Error(`PGM: maxval ${maxval}, expected 255`);
  if (pos >= bytes.length || !isSpace(bytes[pos] as number)) throw new Error('PGM: no whitespace after maxval');
  pos++;
  const count = width * height;
  if (bytes.length - pos !== count) {
    throw new Error(`PGM: ${bytes.length - pos} pixel bytes for ${width}×${height}`);
  }
  return { width, height, pixels: bytes.slice(pos, pos + count) };
}

/** Raw little-endian Float32 bytes of `values` (the Swift `[Float]` field dumped as `.field.f32`). */
export function encodeFloat32LE(values: Float32Array): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  for (let i = 0; i < values.length; i++) view.setFloat32(i * 4, values[i] as number, true);
  return out;
}

/**
 * Reads raw little-endian Float32 bytes; `expectedCount` (e.g. columns·rows) is checked if given.
 * Bit-exact for every non-NaN value (NaN payloads may be canonicalised by DataView).
 */
export function decodeFloat32LE(bytes: Uint8Array, expectedCount?: number): Float32Array {
  if (bytes.length % 4 !== 0) throw new Error(`f32: ${bytes.length} bytes is not a multiple of 4`);
  const count = bytes.length / 4;
  if (expectedCount !== undefined && count !== expectedCount) {
    throw new Error(`f32: ${count} values, expected ${expectedCount}`);
  }
  const out = new Float32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}
