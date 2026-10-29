// Minimal Swift-semantics helpers for the stub core (plan §3).
// TODO(WP-K1): replace with core/swift/{minmax,rounding,format,text}.ts once they land;
// these are stand-ins with the same semantics for the value ranges the stub formats.

/** Swift `min(x, y)`: `y < x ? y : x` (returns x on ties). */
export const swiftMin = (x: number, y: number): number => (y < x ? y : x);
/** Swift `max(x, y)`: `y >= x ? y : x` (returns y on ties, so `max(0, -0) = -0`). */
export const swiftMax = (x: number, y: number): number => (y >= x ? y : x);
export const swiftMin3 = (x: number, y: number, z: number): number => swiftMin(swiftMin(x, y), z);
export const swiftMax3 = (x: number, y: number, z: number): number => swiftMax(swiftMax(x, y), z);

/** Swift `.rounded()` / Foundation `round`: halves away from zero, sign of zero kept. */
export const rounded = (x: number): number => {
  const whole = Math.trunc(x);
  const fraction = Math.abs(x - whole);
  if (fraction < 0.5) return whole;
  return x < 0 ? whole - 1 : whole + 1;
};

/** Swift `Int(x)`: truncation; traps on non-finite values. */
export const intTrunc = (x: number): number => {
  if (!Number.isFinite(x)) throw new Error(`Int(${x}) is not representable`);
  return Math.trunc(x) + 0;
};

// Exact decimal digits of |x|: `toFixed(100)` is exact for 2^-47 <= |x| < 1e21, which covers
// every value the stub formats. K1's BigInt formatter removes that limit.
const exactDecimal = (x: number): { int: string; frac: string } => {
  const [int = '0', frac = ''] = Math.abs(x).toFixed(100).split('.');
  return { int, frac };
};

/** Adds one unit in the last place of a string of decimal digits. */
const incrementDigits = (digits: string): string => {
  const out = digits.split('');
  let i = out.length - 1;
  while (i >= 0) {
    if (out[i] === '9') {
      out[i] = '0';
      i -= 1;
    } else {
      out[i] = String.fromCharCode((out[i] ?? '0').charCodeAt(0) + 1);
      return out.join('');
    }
  }
  return '1' + out.join('');
};

/** printf rounding of `kept` given the dropped digits: round half to even on exact ties. */
const roundsUp = (kept: string, dropped: string): boolean => {
  const first = dropped[0] ?? '0';
  if (first > '5') return true;
  if (first < '5') return false;
  if (/[1-9]/.test(dropped.slice(1))) return true;
  const last = kept[kept.length - 1] ?? '0';
  return (last.charCodeAt(0) - 48) % 2 === 1;
};

/** `String(format: "%.<n>f", locale: en_US_POSIX, x)`: exact value, ties to even, `-0.0` kept. */
export const printfFixed = (x: number, digits: number): string => {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  const negative = x < 0 || Object.is(x, -0);
  const { int, frac } = exactDecimal(x);
  let kept = int + frac.slice(0, digits);
  if (roundsUp(kept, frac.slice(digits))) kept = incrementDigits(kept);
  const intLength = kept.length - digits;
  const body = digits > 0 ? `${kept.slice(0, intLength)}.${kept.slice(intLength)}` : kept;
  return negative ? `-${body}` : body;
};

/** `String(format: "%g")`: 6 significant digits, trailing zeros stripped, exponent form below 1e-4 or from 1e6 (upper-case E, plan §3). */
export const printfG = (x: number, precision = 6): string => {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  const sign = x < 0 || Object.is(x, -0) ? '-' : '';
  if (x === 0) return `${sign}0`;
  const { int, frac } = exactDecimal(x);
  const all = int + frac;
  const first = all.search(/[1-9]/);
  let exponent = int.length - first - 1;
  let significant = all.slice(first, first + precision).padEnd(precision, '0');
  if (roundsUp(significant, all.slice(first + precision))) {
    significant = incrementDigits(significant);
    if (significant.length > precision) {
      significant = significant.slice(0, precision);
      exponent += 1;
    }
  }
  const strip = (s: string): string => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
  if (exponent < -4 || exponent >= precision) {
    const mantissa = strip(`${significant[0]}.${significant.slice(1)}`);
    const e = Math.abs(exponent);
    return `${sign}${mantissa}E${exponent < 0 ? '-' : '+'}${e < 10 ? '0' : ''}${e}`;
  }
  if (exponent >= 0) return sign + strip(`${significant.slice(0, exponent + 1)}.${significant.slice(exponent + 1)}`);
  return sign + strip(`0.${'0'.repeat(-exponent - 1)}${significant}`);
};

/** `"\(Double)"`-style shortest digits as JSONEncoder writes them: whole values without `.0`, exponent below 1e-4 or from 1e16 (`1e-05`). */
export const jsonNumber = (x: number): string => {
  if (!Number.isFinite(x)) throw new Error(`JSONEncoder cannot encode ${x}`);
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  const [mantissa = '0', exp = '0'] = x.toExponential().split('e');
  const e = Number(exp);
  if (e < -4 || e >= 16) return `${mantissa}e${e < 0 ? '-' : '+'}${Math.abs(e) < 10 ? '0' : ''}${Math.abs(e)}`;
  return String(x);
};

let segmenter: Intl.Segmenter | undefined;
/** Swift `Character`s: extended grapheme clusters. */
export const swiftCharacters = (text: string): string[] => {
  segmenter ??= new Intl.Segmenter('en', { granularity: 'grapheme' });
  return Array.from(segmenter.segment(text), (s) => s.segment);
};
/** Swift `Character.isWhitespace`: the first scalar has the Unicode White_Space property. */
export const isSwiftWhitespace = (character: string): boolean => /^\p{White_Space}/u.test(character);
