// Replays Apple's libm through the dmath mock of tests/patterns.replay.test.ts: a table keyed by the exact
// bits of the arguments, filled by tests/fixtures/swift/probes/libmReplay.swift.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const doubles = new Float64Array(2);
const words = new Uint32Array(doubles.buffer);

class PairTable {
  a: Float64Array;
  b: Float64Array;
  values: Float64Array;
  used: Uint8Array;
  mask: number;
  size = 0;

  constructor(capacity = 1 << 16) {
    this.a = new Float64Array(capacity);
    this.b = new Float64Array(capacity);
    this.values = new Float64Array(capacity);
    this.used = new Uint8Array(capacity);
    this.mask = capacity - 1;
  }

  slot(x: number, y: number): number {
    doubles[0] = x;
    doubles[1] = y;
    let s = (Math.imul(words[0] as number, 0x9e3779b1) ^ Math.imul(words[1] as number, 0x85ebca77) ^ Math.imul(words[2] as number, 0xc2b2ae3d) ^ Math.imul(words[3] as number, 0x27d4eb2f)) >>> 0;
    s = (s ^ (s >>> 15)) & this.mask;
    while (this.used[s] === 1 && !(Object.is(this.a[s], x) && Object.is(this.b[s], y))) s = (s + 1) & this.mask;
    return s;
  }

  set(x: number, y: number, value: number): void {
    if ((this.size + 1) * 2 > this.mask) this.grow();
    const s = this.slot(x, y);
    if (this.used[s] === 0) this.size++;
    this.used[s] = 1;
    this.a[s] = x;
    this.b[s] = y;
    this.values[s] = value;
  }

  private grow(): void {
    const { a, b, values, used } = this;
    const capacity = a.length * 2;
    this.a = new Float64Array(capacity);
    this.b = new Float64Array(capacity);
    this.values = new Float64Array(capacity);
    this.used = new Uint8Array(capacity);
    this.mask = capacity - 1;
    this.size = 0;
    for (let i = 0; i < a.length; i++) if (used[i] === 1) this.set(a[i] as number, b[i] as number, values[i] as number);
  }
}

export interface LibmReplay {
  /** Apple's value where known, otherwise records the arguments and returns the fallback. */
  call(x: number, y: number): number;
  /** Writes the recorded arguments to `<fn>.miss`; returns how many. */
  flush(): number;
}

export function makeReplay(dir: string, fn: string, fallback: (x: number, y: number) => number): LibmReplay {
  const table = new PairTable(1 << 20);
  const path = `${dir}/${fn}.bin`;
  if (existsSync(path)) {
    const raw = readFileSync(path);
    const data = new Float64Array(raw.buffer, raw.byteOffset, raw.length / 8);
    for (let i = 0; i < data.length; i += 3) table.set(data[i] as number, data[i + 1] as number, data[i + 2] as number);
  }
  const missing = new PairTable();
  return {
    call(x, y) {
      const s = table.slot(x, y);
      if (table.used[s] === 1) return table.values[s] as number;
      missing.set(x, y, 0);
      return fallback(x, y);
    },
    flush() {
      const out = new Float64Array(missing.size * 2);
      let n = 0;
      for (let i = 0; i < missing.a.length; i++) {
        if (missing.used[i] === 1) {
          out[n++] = missing.a[i] as number;
          out[n++] = missing.b[i] as number;
        }
      }
      writeFileSync(`${dir}/${fn}.miss`, new Uint8Array(out.buffer));
      return missing.size;
    },
  };
}
