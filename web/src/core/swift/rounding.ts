// Ported from Swift standard-library semantics used by mac/Sources/BalloonStudio @ cbda68d
// (docs/plan.md, Abschnitt 3). Measured with web/tests/fixtures/swift/probes/arith.swift.
//
// Swift → TS:
//   x.rounded()                         → rounded(x)        (halves away from zero, -0 kept)
//   x.rounded(.up/.down/.towardZero)    → Math.ceil/floor/trunc (allowed directly)
//   x.remainder(dividingBy: y)          → ieeeRemainder(x, y) (quotient rounded half to even)
//   x.truncatingRemainder(dividingBy: y)→ truncatingRemainder(x, y) = x % y
//   Int(x), Int(floor(x)), Int(x.rounded(.up)), Int(x.rounded())
//                                       → intTrunc, intFloor, intCeil, intRounded (trap on non-finite)
//   a / b, a % b on Int                 → intDiv, intRem (truncating, trap on zero)
//   stride(from:through:by:)            → strideThrough (from + i·by, multiplicative)

const TWO_63 = 9223372036854775808;
const TWO_M1021 = 4.450147717014403e-308; // 2^-1021: below this, p/2 is not exact
const TWO_1023 = 8.98846567431158e307; // 2^1023: from here on, p+p overflows

/** Swift `x.rounded()` (`.toNearestOrAwayFromZero`, C `round`). `-0.4 → -0`, `-2.5 → -3`. */
export function rounded(x: number): number {
  if (!Number.isFinite(x)) return x;
  const t = Math.trunc(x);
  const f = x - t; // exact: the fractional part of a double is representable
  if (f >= 0.5) return t + 1;
  if (f <= -0.5) return t - 1;
  return t;
}

/**
 * Swift `x.remainder(dividingBy: y)`: IEEE 754 remainder `x - y·n` with `n` the quotient
 * rounded to nearest, ties to even (`2.5.remainder(dividingBy: 3) == -0.5`). Exact for all
 * inputs; a port of fdlibm's `__ieee754_remainder`. A zero result carries the sign of `x`.
 */
export function ieeeRemainder(x: number, y: number): number {
  if (Number.isNaN(x) || Number.isNaN(y) || !Number.isFinite(x) || y === 0) return NaN;
  if (!Number.isFinite(y)) return x;
  const negative = x < 0 || Object.is(x, -0);
  let p = Math.abs(y);
  let r = x;
  if (p < TWO_1023) r = r % (p + p); // now |r| < 2p, sign of x
  r = Math.abs(r);
  if (r === p) return negative ? -0 : 0;
  if (p < TWO_M1021) {
    if (r + r > p) {
      r -= p;
      if (r + r >= p) r -= p;
    }
  } else {
    const half = 0.5 * p;
    if (r > half) {
      r -= p;
      if (r >= half) r -= p;
    }
  }
  // fdlibm flips the sign bit of |r'| by the sign of x (so a zero keeps the sign of x).
  if (r === 0) return negative ? -0 : 0;
  return negative ? -r : r;
}

/** Swift `x.truncatingRemainder(dividingBy: y)`, identical to JS `%` (C `fmod`). */
export function truncatingRemainder(x: number, y: number): number {
  return x % y;
}

function trapUnlessInt(x: number, what: string): void {
  if (!Number.isFinite(x) || x >= TWO_63 || x < -TWO_63) {
    throw new RangeError(`${what}: ${x} cannot be converted to Int`);
  }
}

/** Swift `Int(x)`: truncation toward zero; traps on NaN, ±∞ and out-of-range. Never returns -0. */
export function intTrunc(x: number): number {
  trapUnlessInt(x, 'Int(x)');
  return Math.trunc(x) + 0;
}

/** Swift `Int(floor(x))` / `Int(x.rounded(.down))`. Never returns -0. */
export function intFloor(x: number): number {
  trapUnlessInt(x, 'Int(floor(x))');
  return Math.floor(x) + 0;
}

/** Swift `Int(x.rounded(.up))` / `Int(ceil(x))`. Never returns -0. */
export function intCeil(x: number): number {
  trapUnlessInt(x, 'Int(ceil(x))');
  return Math.ceil(x) + 0;
}

/** Swift `Int(x.rounded())`. Never returns -0. */
export function intRounded(x: number): number {
  trapUnlessInt(x, 'Int(x.rounded())');
  return rounded(x) + 0;
}

/** Swift `Int / Int`: truncating division; traps on division by zero. Exact for safe integers. */
export function intDiv(a: number, b: number): number {
  if (b === 0) throw new RangeError('Int division by zero');
  return (a - (a % b)) / b + 0;
}

/** Swift `Int % Int`: remainder with the sign of the dividend; traps on zero. Never returns -0. */
export function intRem(a: number, b: number): number {
  if (b === 0) throw new RangeError('Int remainder by zero');
  return (a % b) + 0;
}

/**
 * Swift `Array(stride(from:through:by:))`. Elements are `from + Double(i)·by` (Swift computes
 * floating-point strides multiplicatively, not by repeated addition); `through` is included
 * only when an element hits it exactly. Works for Int strides as well.
 */
export function strideThrough(from: number, through: number, by: number): number[] {
  if (by === 0 || Number.isNaN(by)) throw new RangeError('Stride size must not be zero');
  const out: number[] = [];
  for (let i = 0; ; i++) {
    const value = i === 0 ? from : from + i * by;
    if (by > 0 ? value >= through : value <= through) {
      if (value === through) out.push(value);
      return out;
    }
    out.push(value);
  }
}
