// Number display and entry for the UI, after ParameterControl in
// mac/Sources/BalloonStudio/BalloonStudioApp.swift:635-684.
//
// Display matches Swift's `value.formatted(.number.precision(.fractionLength(0...n)))`:
// round half to even on the shortest round-trip digits (0.25 → "0.2", 0.35 → "0.4",
// 2.675 → "2.68"; checked against Foundation on 2026-10-29). Documented deviation
// (docs/plan.md, Abschnitt 6): always "." and never a thousands separator, where the Mac
// follows the system locale ("1,500" or "1.500").

const formatters = new Map<number, Intl.NumberFormat>();

/** Formats `value` with up to `maxDigits` fraction digits, en-US, no grouping. */
export function formatNumber(value: number, maxDigits: number): string {
  let formatter = formatters.get(maxDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDigits,
      useGrouping: false,
      roundingMode: 'halfEven',
    });
    formatters.set(maxDigits, formatter);
  }
  return formatter.format(value);
}

/**
 * `max(0, Int(ceil(-log10(step))))`: 1 → 0, 0.5 → 1, 0.1 → 1, 0.05 → 2, 0.01 → 2, 10 → 0.
 * The 1e-9 guard keeps exact powers of ten from gaining a digit when an engine's
 * `log10` misses the integer by one ULP.
 */
export function fractionDigitsForStep(step: number): number {
  return Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
}

/** `fractionLength(0...1)`, as in RingEditor `number(_:)`. */
export function number01(value: number): string {
  return formatNumber(value, 1);
}

/** `fractionLength(0...2)`, as in CableClipEditor `number(_:)`. */
export function number02(value: number): string {
  return formatNumber(value, 2);
}

/** Swift `Double.rounded()`: halves round away from zero, `-0.4 → -0`. */
export function roundHalfAwayFromZero(x: number): number {
  const whole = Math.trunc(x);
  // x - whole is exact, so the tie test needs no tolerance.
  return Math.abs(x - whole) >= 0.5 ? whole + Math.sign(x) : whole;
}

/**
 * Swift `min(upper, max(lower, x))`. Swift's `max` returns its second argument on ties
 * and `min` its first unless the second is smaller, so `-0` entered at a lower bound of
 * `0` stays `-0` exactly as on the Mac.
 */
export function clampToRange(x: number, lower: number, upper: number): number {
  const atLeastLower = x >= lower ? x : lower;
  return atLeastLower < upper ? atLeastLower : upper;
}

const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Parses what a person typed into a number field: trims, accepts "," as the decimal
 * separator, returns `null` for anything that is not a finite decimal number.
 */
export function parseDecimal(text: string): number | null {
  const input = text.trim().replaceAll(',', '.');
  if (!decimal.test(input)) return null;
  const number = Number(input);
  return Number.isFinite(number) ? number : null;
}
