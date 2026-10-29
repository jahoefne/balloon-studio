// Ported from the Hashable-keyed vertex dictionaries in mac/Sources/BalloonStudio @ cbda68d:
// CloudMeshBuilder.vertex (CloudGeometry.swift:1033-1041, `[Key(x,y,z: Int64): Int]` over
// `(p·1e7).rounded()`), CableClamp.stand, and STLImport.parse (STLImport.swift:89-100,
// `[Key(x,y,z: Double): Int]`). Open addressing on typed arrays, no string keys (WP-K9).
// Only lookups go through the table; insertion order — and with it vertex numbering — stays
// with the caller, exactly as in Swift.

const EMPTY = -1;
const scratch = new Float64Array(1);
const scratchWords = new Uint32Array(scratch.buffer);

function mix(h: number, word: number): number {
  return Math.imul(h ^ word, 0x9e3779b1) ^ (h >>> 15);
}

/** 32-bit words of an exact integer key up to ±2^53 (Swift Int64 keys of the sizes used). */
function intHash(x: number, y: number, z: number): number {
  let h = 0x811c9dc5;
  h = mix(h, x | 0);
  h = mix(h, Math.floor(x / 4294967296) | 0);
  h = mix(h, y | 0);
  h = mix(h, Math.floor(y / 4294967296) | 0);
  h = mix(h, z | 0);
  h = mix(h, Math.floor(z / 4294967296) | 0);
  return h ^ (h >>> 16);
}

/** Bit-pattern hash of doubles, with -0 folded onto +0 (Swift: `-0.0 == 0.0`, equal hashes). */
function doubleHash(x: number, y: number, z: number): number {
  let h = 0x811c9dc5;
  scratch[0] = x === 0 ? 0 : x;
  h = mix(h, scratchWords[0] as number);
  h = mix(h, scratchWords[1] as number);
  scratch[0] = y === 0 ? 0 : y;
  h = mix(h, scratchWords[0] as number);
  h = mix(h, scratchWords[1] as number);
  scratch[0] = z === 0 ? 0 : z;
  h = mix(h, scratchWords[0] as number);
  h = mix(h, scratchWords[1] as number);
  return h ^ (h >>> 16);
}

abstract class Key3Map {
  protected keys: Float64Array;
  protected values: Int32Array;
  protected mask: number;
  size = 0;

  constructor(expected = 64) {
    let capacity = 16;
    while (capacity < expected * 2) capacity *= 2;
    this.keys = new Float64Array(capacity * 3);
    this.values = new Int32Array(capacity).fill(EMPTY);
    this.mask = capacity - 1;
  }

  protected abstract hash(x: number, y: number, z: number): number;

  private slot(x: number, y: number, z: number): number {
    let slot = this.hash(x, y, z) & this.mask;
    for (;;) {
      if (this.values[slot] === EMPTY) return slot;
      const k = 3 * slot;
      if (this.keys[k] === x && this.keys[k + 1] === y && this.keys[k + 2] === z) return slot;
      slot = (slot + 1) & this.mask;
    }
  }

  /** Swift `dictionary[key]`: the stored value, or -1 when absent. */
  get(x: number, y: number, z: number): number {
    return this.values[this.slot(x, y, z)] as number;
  }

  has(x: number, y: number, z: number): boolean {
    return this.get(x, y, z) !== EMPTY;
  }

  /** Swift `dictionary[key] = value` for a non-negative Int value. */
  set(x: number, y: number, z: number, value: number): void {
    if (value < 0 || !Number.isInteger(value)) throw new RangeError(`Key3Map stores non-negative Int values, got ${value}`);
    let slot = this.slot(x, y, z);
    if (this.values[slot] === EMPTY) {
      if ((this.size + 1) * 2 > this.values.length) {
        this.grow();
        slot = this.slot(x, y, z);
      }
      const k = 3 * slot;
      this.keys[k] = x;
      this.keys[k + 1] = y;
      this.keys[k + 2] = z;
      this.size++;
    }
    this.values[slot] = value;
  }

  private grow(): void {
    const keys = this.keys;
    const values = this.values;
    const capacity = values.length * 2;
    this.keys = new Float64Array(capacity * 3);
    this.values = new Int32Array(capacity).fill(EMPTY);
    this.mask = capacity - 1;
    for (let s = 0; s < values.length; s++) {
      const v = values[s] as number;
      if (v === EMPTY) continue;
      const x = keys[3 * s] as number;
      const y = keys[3 * s + 1] as number;
      const z = keys[3 * s + 2] as number;
      const slot = this.slot(x, y, z);
      this.keys[3 * slot] = x;
      this.keys[3 * slot + 1] = y;
      this.keys[3 * slot + 2] = z;
      this.values[slot] = v;
    }
  }
}

/**
 * `[Key(x: Int64, y: Int64, z: Int64): Int]`: exact integer keys (|k| ≤ 2^53), e.g.
 * CloudMeshBuilder's `rounded(p·1e7)` or the Float32 bit patterns of an STL parser.
 */
export class IntKey3Map extends Key3Map {
  protected hash(x: number, y: number, z: number): number {
    return intHash(x, y, z);
  }

  override set(x: number, y: number, z: number, value: number): void {
    if (!(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z))) throw new RangeError(`IntKey3Map keys must be integers, got (${x}, ${y}, ${z})`);
    super.set(x + 0, y + 0, z + 0, value);
  }
}

/**
 * `[Key(x: Double, y: Double, z: Double): Int]`: exact Double keys. `-0.0` and `0.0` are the
 * same key (Swift Double equality and hashing); NaN keys never match, as in Swift.
 */
export class ExactPointMap extends Key3Map {
  protected hash(x: number, y: number, z: number): number {
    return doubleHash(x, y, z);
  }
}
