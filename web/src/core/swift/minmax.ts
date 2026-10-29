// Ported from Swift standard-library semantics used by mac/Sources/BalloonStudio @ cbda68d
// (docs/plan.md, Abschnitt 3). Measured with web/tests/fixtures/swift/probes/arith.swift.
//
// Swift's `min`/`max` resolve ties and signed zeros differently from Math.min/Math.max:
// `min(x, y)` returns `x` on equality, `max(x, y)` returns `y`, so `max(0.0, -0.0) == -0.0`
// (Math.max gives +0, a different STL byte). `Sequence.min()/max()` and `min(by:)/max(by:)`
// keep the first of equal elements. Math.min/Math.max are banned in the core by lint.

/** Swift `min(x, y)`: `y < x ? y : x`. */
export function swiftMin(x: number, y: number): number {
  return y < x ? y : x;
}

/** Swift `max(x, y)`: `y >= x ? y : x`. */
export function swiftMax(x: number, y: number): number {
  return y >= x ? y : x;
}

/** Swift `min(x, y, z)`: `min(min(x, y), z)`. */
export function swiftMin3(x: number, y: number, z: number): number {
  return swiftMin(swiftMin(x, y), z);
}

/** Swift `max(x, y, z)`: `max(max(x, y), z)`. */
export function swiftMax3(x: number, y: number, z: number): number {
  return swiftMax(swiftMax(x, y), z);
}

/** Swift `Sequence.min()`: first of equal minima; `undefined` for an empty sequence. */
export function arrayMin(values: ArrayLike<number>): number | undefined {
  if (values.length === 0) return undefined;
  let result = values[0] as number;
  for (let i = 1; i < values.length; i++) {
    const e = values[i] as number;
    if (e < result) result = e;
  }
  return result;
}

/** Swift `Sequence.max()`: first of equal maxima; `undefined` for an empty sequence. */
export function arrayMax(values: ArrayLike<number>): number | undefined {
  if (values.length === 0) return undefined;
  let result = values[0] as number;
  for (let i = 1; i < values.length; i++) {
    const e = values[i] as number;
    if (result < e) result = e;
  }
  return result;
}

/** Swift `Sequence.min(by: areInIncreasingOrder)`: replaces only when `e` orders strictly before. */
export function minBy<T>(values: readonly T[], areInIncreasingOrder: (a: T, b: T) => boolean): T | undefined {
  if (values.length === 0) return undefined;
  let result = values[0] as T;
  for (let i = 1; i < values.length; i++) {
    const e = values[i] as T;
    if (areInIncreasingOrder(e, result)) result = e;
  }
  return result;
}

/** Swift `Sequence.max(by: areInIncreasingOrder)`: replaces only when `e` orders strictly after. */
export function maxBy<T>(values: readonly T[], areInIncreasingOrder: (a: T, b: T) => boolean): T | undefined {
  if (values.length === 0) return undefined;
  let result = values[0] as T;
  for (let i = 1; i < values.length; i++) {
    const e = values[i] as T;
    if (areInIncreasingOrder(result, e)) result = e;
  }
  return result;
}
