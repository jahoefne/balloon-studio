// Pure helpers for the raster tests (docs/plan.md §7, WP-R6). Bytes in, values out: no node:, no DOM, so the same code
// runs in the Node tests and in the browser run of tests/hashes.test.ts. File access is in tests/support/rasterFixtures.ts.
import { sha256 } from '../io/sha256';

export { decodeFloat32LE } from '../raster/pgm';

/** SHA-256 in lower-case hex, the form of tests/fixtures/hashes.json. Hash a field with `rasterHash(encodeFloat32LE(field))`. */
export function rasterHash(bytes: Uint8Array): string {
  return Array.from(sha256(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** What `float32BitDifference` found. `count` is the number of values whose bits differ. */
export interface Float32BitDifference {
  readonly count: number;
  readonly firstIndex: number;
  /** The two values at `firstIndex`. */
  readonly firstA: number;
  readonly firstB: number;
  /** Largest |a − b| over the differing values; NaN if a differing value is NaN. */
  readonly maxAbsolute: number;
}

/**
 * Compares two Float32 arrays bit by bit, so +0 and -0 differ and NaN equals only the same NaN. Null means identical;
 * `expect(float32BitDifference(ts, swift)).toBeNull()` shows the difference when it fails. Arrays of different length throw.
 */
export function float32BitDifference(a: Float32Array, b: Float32Array): Float32BitDifference | null {
  if (a.length !== b.length) throw new Error(`float32BitDifference: ${a.length} values against ${b.length}`);
  const bitsA = new Uint32Array(a.buffer, a.byteOffset, a.length);
  const bitsB = new Uint32Array(b.buffer, b.byteOffset, b.length);
  let count = 0;
  let firstIndex = -1;
  let maxAbsolute = 0;
  for (let i = 0; i < a.length; i++) {
    if (bitsA[i] === bitsB[i]) continue;
    if (count === 0) firstIndex = i;
    count++;
    const difference = Math.abs((a[i] as number) - (b[i] as number));
    if (!(difference <= maxAbsolute) && !Number.isNaN(maxAbsolute)) maxAbsolute = difference;
  }
  if (count === 0) return null;
  return { count, firstIndex, firstA: a[firstIndex] as number, firstB: b[firstIndex] as number, maxAbsolute };
}
