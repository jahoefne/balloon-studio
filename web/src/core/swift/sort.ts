// Ported from Swift standard-library semantics used by mac/Sources/BalloonStudio @ cbda68d
// (docs/plan.md, Abschnitt 3). Measured with web/tests/fixtures/swift/probes/arith.swift.
//
// Swift's `sort`/`sorted(by:)` is stable. For a strict weak ordering every stable sort yields
// the same permutation, so Array.prototype.sort (stable since ES2019) with a comparator built
// from the Swift predicate reproduces Swift's order, ties included (CableClamp:317,
// SurfaceQuery:59). Bare `.sort()` without a comparator is banned in the core by lint: it
// compares strings. Predicates must be strict weak orderings (no NaN keys), as in Swift.

/** Turns a Swift `areInIncreasingOrder` predicate into a JS comparator. */
export function comparator<T>(lessThan: (a: T, b: T) => boolean): (a: T, b: T) => number {
  return (a, b) => (lessThan(a, b) ? -1 : lessThan(b, a) ? 1 : 0);
}

/** Swift `array.sorted(by: lessThan)`: a stably sorted copy. */
export function stableSorted<T>(array: readonly T[], lessThan: (a: T, b: T) => boolean): T[] {
  return array.slice().sort(comparator(lessThan));
}

/** Swift `array.sort(by: lessThan)`: stable, in place. */
export function stableSort<T>(array: T[], lessThan: (a: T, b: T) => boolean): void {
  array.sort(comparator(lessThan));
}

const ascending = (a: number, b: number): number => (a < b ? -1 : b < a ? 1 : 0);

/** Swift `[Double].sorted()` (and `[Int].sorted()`): ascending by `<`, stable, so `0.0` and `-0.0` keep their order. */
export function sortedDoubles(values: ArrayLike<number>): number[] {
  return Array.from(values).sort(ascending);
}

/** Swift `doubles.sort()` in place. */
export function sortDoubles(values: number[]): void {
  values.sort(ascending);
}

const INSERTION_LIMIT = 16;

/**
 * Stable in-place sort of `order[start..<end]` by `keys[order[i]·stride + offset]` with `<`,
 * the typed-array form of Swift `order[start..<end].sort { key($0) < key($1) }` for hot paths
 * (SurfaceQuery.build). Merge sort with insertion-sorted runs; no closures, no allocation
 * beyond the optional `scratch` buffer (length ≥ end - start).
 */
export function stableSortIndexRange(
  order: Int32Array,
  start: number,
  end: number,
  keys: Float64Array,
  stride = 1,
  offset = 0,
  scratch?: Int32Array,
): void {
  const n = end - start;
  if (n < 2) return;
  if (n <= INSERTION_LIMIT) {
    insertionSort(order, start, end, keys, stride, offset);
    return;
  }
  const buffer = scratch !== undefined && scratch.length >= n ? scratch : new Int32Array(n);
  mergeSort(order, start, end, keys, stride, offset, buffer);
}

function insertionSort(order: Int32Array, start: number, end: number, keys: Float64Array, stride: number, offset: number): void {
  for (let i = start + 1; i < end; i++) {
    const v = order[i] as number;
    const kv = keys[v * stride + offset] as number;
    let j = i - 1;
    while (j >= start) {
      const w = order[j] as number;
      if (!(kv < (keys[w * stride + offset] as number))) break;
      order[j + 1] = w;
      j--;
    }
    order[j + 1] = v;
  }
}

function mergeSort(order: Int32Array, start: number, end: number, keys: Float64Array, stride: number, offset: number, buffer: Int32Array): void {
  if (end - start <= INSERTION_LIMIT) {
    insertionSort(order, start, end, keys, stride, offset);
    return;
  }
  const middle = (start + end) >>> 1;
  mergeSort(order, start, middle, keys, stride, offset, buffer);
  mergeSort(order, middle, end, keys, stride, offset, buffer);
  // Already ordered: the last of the left run does not exceed the first of the right run.
  if (!((keys[(order[middle] as number) * stride + offset] as number) < (keys[(order[middle - 1] as number) * stride + offset] as number))) return;
  const leftLength = middle - start;
  for (let i = 0; i < leftLength; i++) buffer[i] = order[start + i] as number;
  let i = 0;
  let j = middle;
  let k = start;
  while (i < leftLength && j < end) {
    const right = order[j] as number;
    const left = buffer[i] as number;
    // Take from the right only when strictly smaller: equal keys keep their input order.
    if ((keys[right * stride + offset] as number) < (keys[left * stride + offset] as number)) {
      order[k++] = right;
      j++;
    } else {
      order[k++] = left;
      i++;
    }
  }
  while (i < leftLength) order[k++] = buffer[i++] as number;
}
