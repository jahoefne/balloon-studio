// Ported from Swift/Foundation number formatting used by mac/Sources/BalloonStudio @ cbda68d
// (docs/plan.md, Abschnitt 3). Measured with web/tests/fixtures/swift/probes/format.swift on
// macOS 26 / Swift 6.3.3; the fixture format.tsv.gz holds 2708 values × 13 formats.
//
// Three different Swift formatters are in play, and they disagree:
//
// 1. `"\(x)"` / `x.description` (3MF coordinates, `balloon-studio.txt`, `String(Double)`):
//    shortest round-trip digits; decimal layout with a mandatory fraction (`25.0`, `-0.0`) for
//    1e-4 ≤ |x| ≤ 2^53, otherwise exponent form with at least two exponent digits (`1e-05`,
//    `1e+16`, `9.007199254740994e+15`). → swiftDescription
//
// 2. `String(format: "%.1f" / "%g", locale: Locale(identifier: "en_US_POSIX"), x)` (every kit
//    text, SVG and file name in the core): with a locale, CoreFoundation formats through ICU.
//    ICU starts from the *shortest* round-trip digits and rounds that decimal string half to
//    even, so `0.45 → "0.4"` and `0.35 → "0.4"` although the binary values are 0.4500…01 and
//    0.3499…98; `2.675 → "2.68"`. Non-finite values print as `NaN`, `INF`, `-INF`; `%g` uses an
//    upper-case `E` and switches to exponent form for |x| < 1e-4 or |x| > 10^precision
//    (`1e6 → "1000000"`, `1234567 → "1.23457E+06"`). → formatFixed, formatG
//    SWIFT-DIFF: docs/plan.md §3 describes `%.1f` as "correctly rounded on the exact binary
//    value"; the measurements above contradict that (0.35, 0.45, 2.675, 4.35, 1.15), so this
//    module follows the measurements.
//
// 3. C `printf` semantics (`JSONSerialization` doubles use `%.17g`; `String(format:)` without a
//    locale): correctly rounded on the exact binary value, exact ties to even, `inf`/`nan`,
//    lower-case `e`. → printfFixed, printfG, implemented over the exact BigInt expansion.

interface Digits {
  /** Significant decimal digits without leading or trailing zeros ("0" never occurs). */
  digits: string;
  /** Scientific exponent: value = d.ddd… × 10^exponent. */
  exponent: number;
}

/**
 * Shortest round-trip digits of a finite, non-zero magnitude, from Number.prototype.toString
 * (shortest digits closest to the exact value in every engine, the same set Swift prints).
 */
function shortestDigits(magnitude: number): Digits {
  const s = magnitude.toString();
  const e = s.indexOf('e');
  if (e >= 0) {
    const mantissa = s.slice(0, e).replace('.', '');
    return { digits: stripTrailingZeros(mantissa), exponent: Number.parseInt(s.slice(e + 1), 10) };
  }
  const point = s.indexOf('.');
  const integer = point >= 0 ? s.slice(0, point) : s;
  const fraction = point >= 0 ? s.slice(point + 1) : '';
  if (integer !== '0') {
    return { digits: stripTrailingZeros(integer + fraction), exponent: integer.length - 1 };
  }
  let zeros = 0;
  while (fraction.charCodeAt(zeros) === 48) zeros++;
  return { digits: stripTrailingZeros(fraction.slice(zeros)), exponent: -(zeros + 1) };
}

function stripTrailingZeros(digits: string): string {
  let end = digits.length;
  while (end > 1 && digits.charCodeAt(end - 1) === 48) end--;
  return digits.slice(0, end);
}

/**
 * Keeps the first `keep` digits of a decimal digit string, rounding the rest half to even.
 * Returns the kept digits (possibly with a carry into a new leading digit) and whether the
 * carry added a digit. `keep ≤ 0` rounds against an implicit leading zero.
 */
function roundDigitsHalfEven(digits: string, keep: number): { digits: string; carry: number } {
  if (keep >= digits.length) return { digits, carry: 0 };
  if (keep < 0) return { digits: '', carry: 0 };
  const first = digits.charCodeAt(keep) - 48;
  let up = first > 5;
  if (first === 5) {
    let rest = false;
    for (let i = keep + 1; i < digits.length; i++) {
      if (digits.charCodeAt(i) !== 48) {
        rest = true;
        break;
      }
    }
    const previousOdd = keep > 0 && (digits.charCodeAt(keep - 1) - 48) % 2 === 1;
    up = rest || previousOdd;
  }
  const head = digits.slice(0, keep);
  if (!up) return { digits: head, carry: 0 };
  return incrementDigits(head);
}

function incrementDigits(head: string): { digits: string; carry: number } {
  const chars = head.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] === '9') {
      chars[i] = '0';
      i--;
    } else {
      chars[i] = String.fromCharCode((chars[i] as string).charCodeAt(0) + 1);
      return { digits: chars.join(''), carry: 0 };
    }
  }
  return { digits: '1' + chars.join(''), carry: 1 };
}

/** Lays out `digits` (value d.ddd × 10^exponent) in positional notation without exponent. */
function positional(digits: string, exponent: number): { integer: string; fraction: string } {
  if (exponent >= 0) {
    const all = digits.length > exponent + 1 ? digits : digits + '0'.repeat(exponent + 1 - digits.length);
    return { integer: all.slice(0, exponent + 1), fraction: all.slice(exponent + 1) };
  }
  return { integer: '0', fraction: '0'.repeat(-exponent - 1) + digits };
}

function exponentSuffix(letter: string, exponent: number): string {
  const magnitude = String(exponent < 0 ? -exponent : exponent);
  return letter + (exponent < 0 ? '-' : '+') + (magnitude.length < 2 ? '0' + magnitude : magnitude);
}

function isNegative(x: number): boolean {
  return x < 0 || Object.is(x, -0);
}

const TWO_53 = 9007199254740992;

/** Swift `"\(x)"` / `x.description` for a `Double`. */
export function swiftDescription(x: number): string {
  if (Number.isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  const sign = isNegative(x) ? '-' : '';
  if (x === 0) return sign + '0.0';
  const magnitude = sign ? -x : x;
  const { digits, exponent } = shortestDigits(magnitude);
  if (exponent < -4 || magnitude > TWO_53) {
    const mantissa = digits.length > 1 ? digits[0] + '.' + digits.slice(1) : digits;
    return sign + mantissa + exponentSuffix('e', exponent);
  }
  const { integer, fraction } = positional(digits, exponent);
  return sign + integer + '.' + (fraction === '' ? '0' : fraction);
}

/**
 * Swift `String(format: "%.<fractionDigits>f", locale: Locale(identifier: "en_US_POSIX"), x)`:
 * the shortest round-trip digits rounded half to even (ICU), sign kept for values that round
 * to zero (`-0.04 → "-0.0"`), `NaN`/`INF`/`-INF`.
 */
export function formatFixed(x: number, fractionDigits: number): string {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'INF';
  if (x === -Infinity) return '-INF';
  const sign = isNegative(x) ? '-' : '';
  const zero = fractionDigits > 0 ? '0.' + '0'.repeat(fractionDigits) : '0';
  if (x === 0) return sign + zero;
  const { digits, exponent } = shortestDigits(sign ? -x : x);
  const r = roundDigitsHalfEven(digits, exponent + 1 + fractionDigits);
  if (r.digits === '' || /^0*$/.test(r.digits)) return sign + zero;
  const { integer, fraction } = positional(r.digits, exponent + r.carry);
  if (fractionDigits === 0) return sign + integer;
  const padded = fraction.length >= fractionDigits ? fraction.slice(0, fractionDigits) : fraction + '0'.repeat(fractionDigits - fraction.length);
  return sign + integer + '.' + padded;
}

/**
 * Swift `String(format: "%g", locale: Locale(identifier: "en_US_POSIX"), x)` (precision 6 by
 * default): shortest digits rounded half to even to `precision` significant digits, trailing
 * zeros dropped, exponent form `1.23457E+06` for |x| < 1e-4 or |x| > 10^precision.
 * Validated for precision 6 and 17 on the probe sample; for precision 17 ICU prints values
 * just below 1e-4 oddly (`0.09999999999999999E-03`), which is not reproduced (never used).
 */
export function formatG(x: number, precision = 6): string {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'INF';
  if (x === -Infinity) return '-INF';
  const sign = isNegative(x) ? '-' : '';
  if (x === 0) return sign + '0';
  const p = precision === 0 ? 1 : precision;
  const magnitude = sign ? -x : x;
  const { digits, exponent } = shortestDigits(magnitude);
  const r = roundDigitsHalfEven(digits, p);
  const rounded = stripTrailingZeros(r.digits);
  const e = exponent + r.carry;
  if (magnitude < 1e-4 || magnitude > Number(`1e${p}`)) {
    const mantissa = rounded.length > 1 ? rounded[0] + '.' + rounded.slice(1) : rounded;
    return sign + mantissa + exponentSuffix('E', e);
  }
  const { integer, fraction } = positional(rounded, e);
  return sign + integer + (fraction === '' ? '' : '.' + fraction);
}

// MARK: C printf semantics on the exact binary value

const scratch = new DataView(new ArrayBuffer(8));

/** Exact BigInt power by squaring (the `**` operator is banned in the core by lint). */
function bigPow(base: bigint, exponent: number): bigint {
  let result = 1n;
  let b = base;
  let e = exponent;
  while (e > 0) {
    if (e & 1) result *= b;
    b *= b;
    e >>>= 1;
  }
  return result;
}

/** Exact decimal expansion of a finite, non-zero magnitude: value = digits × 10^scale. */
function exactDecimal(magnitude: number): { digits: bigint; scale: number } {
  scratch.setFloat64(0, magnitude);
  const bits = scratch.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & 0xfffffffffffffn;
  let exponent: number;
  if (biased === 0) {
    exponent = -1074;
  } else {
    mantissa |= 0x10000000000000n;
    exponent = biased - 1075;
  }
  while ((mantissa & 1n) === 0n && exponent < 0) {
    mantissa >>= 1n;
    exponent++;
  }
  if (exponent >= 0) return { digits: mantissa << BigInt(exponent), scale: 0 };
  // m × 2^e = m × 5^-e × 10^e
  return { digits: mantissa * bigPow(5n, -exponent), scale: exponent };
}

/** Divides by 10^drop, rounding half to even on the exact remainder. */
function divideRoundHalfEven(value: bigint, drop: number): bigint {
  if (drop <= 0) return value;
  const divisor = bigPow(10n, drop);
  const quotient = value / divisor;
  const remainder = value - quotient * divisor;
  const twice = remainder * 2n;
  if (twice > divisor || (twice === divisor && (quotient & 1n) === 1n)) return quotient + 1n;
  return quotient;
}

/** C `printf("%.<fractionDigits>f", x)`: exact value, ties to even, `-0.0`, `inf`, `nan`. */
export function printfFixed(x: number, fractionDigits: number): string {
  if (Number.isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  const sign = isNegative(x) ? '-' : '';
  let scaled = 0n;
  if (x !== 0) {
    const { digits, scale } = exactDecimal(sign ? -x : x);
    // value × 10^fractionDigits = digits × 10^(scale + fractionDigits)
    const shift = scale + fractionDigits;
    scaled = shift >= 0 ? digits * bigPow(10n, shift) : divideRoundHalfEven(digits, -shift);
  }
  const text = scaled.toString();
  if (fractionDigits === 0) return sign + text;
  const padded = text.length > fractionDigits ? text : '0'.repeat(fractionDigits + 1 - text.length) + text;
  return sign + padded.slice(0, padded.length - fractionDigits) + '.' + padded.slice(padded.length - fractionDigits);
}

/**
 * C `printf("%.<precision>g", x)` (`%g` = precision 6): exact value rounded half to even to
 * `precision` significant digits; positional when -4 ≤ X < precision (X the decimal exponent
 * after rounding), else `d.ddde±XX`; trailing zeros removed. `JSONSerialization` writes every
 * double with `printfG(x, 17)` (`0.29999999999999999`, `4.9406564584124654e-324`).
 */
export function printfG(x: number, precision = 6): string {
  if (Number.isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  const sign = isNegative(x) ? '-' : '';
  if (x === 0) return sign + '0';
  const p = precision === 0 ? 1 : precision;
  const { digits, scale } = exactDecimal(sign ? -x : x);
  const text = digits.toString();
  let exponent = text.length - 1 + scale;
  let significant: string;
  if (text.length > p) {
    let q = divideRoundHalfEven(digits, text.length - p).toString();
    if (q.length > p) {
      q = q.slice(0, p);
      exponent++;
    }
    significant = q;
  } else {
    significant = text;
  }
  significant = stripTrailingZeros(significant);
  if (exponent < -4 || exponent >= p) {
    const mantissa = significant.length > 1 ? significant[0] + '.' + significant.slice(1) : significant;
    return sign + mantissa + exponentSuffix('e', exponent);
  }
  const { integer, fraction } = positional(significant, exponent);
  return sign + integer + (fraction === '' ? '' : '.' + fraction);
}
