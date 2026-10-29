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

/** Reusable buffers for stableSortIndexRange (grow on demand). */
export class IndexSortScratch {
  keys: Float64Array;
  keysTmp: Float64Array;
  indicesTmp: Int32Array;

  constructor(capacity = 0) {
    this.keys = new Float64Array(capacity);
    this.keysTmp = new Float64Array(capacity);
    this.indicesTmp = new Int32Array(capacity);
  }

  ensure(n: number): void {
    if (this.keys.length >= n) return;
    this.keys = new Float64Array(n);
    this.keysTmp = new Float64Array(n);
    this.indicesTmp = new Int32Array(n);
  }
}

/**
 * Stable in-place sort of `order[start..<end]` by `keys[order[i]·stride + offset]` with `<`,
 * the typed-array form of Swift `order[start..<end].sort { key($0) < key($1) }` for hot paths
 * (SurfaceQuery.build). The keys are gathered into a contiguous buffer first, then sorted
 * together with the indices (merge sort over insertion-sorted runs); no closures, and no
 * allocation when a large enough `scratch` is passed. Keys must not be NaN.
 */
export function stableSortIndexRange(
  order: Int32Array,
  start: number,
  end: number,
  keys: Float64Array,
  stride = 1,
  offset = 0,
  scratch: IndexSortScratch = new IndexSortScratch(),
): void {
  const n = end - start;
  if (n < 2) return;
  scratch.ensure(n);
  const k = scratch.keys;
  for (let i = 0; i < n; i++) k[i] = keys[(order[start + i] as number) * stride + offset] as number;
  const indices = order.subarray(start, end);
  mergeSort(k, indices, 0, n, scratch.keysTmp, scratch.indicesTmp);
}

function insertionSort(k: Float64Array, ix: Int32Array, start: number, end: number): void {
  for (let i = start + 1; i < end; i++) {
    const kv = k[i] as number;
    const v = ix[i] as number;
    let j = i - 1;
    while (j >= start && kv < (k[j] as number)) {
      k[j + 1] = k[j] as number;
      ix[j + 1] = ix[j] as number;
      j--;
    }
    k[j + 1] = kv;
    ix[j + 1] = v;
  }
}

function mergeSort(k: Float64Array, ix: Int32Array, start: number, end: number, kTmp: Float64Array, ixTmp: Int32Array): void {
  if (end - start <= INSERTION_LIMIT) {
    insertionSort(k, ix, start, end);
    return;
  }
  const middle = (start + end) >>> 1;
  mergeSort(k, ix, start, middle, kTmp, ixTmp);
  mergeSort(k, ix, middle, end, kTmp, ixTmp);
  // Already ordered: the first of the right run is not below the last of the left run.
  if (!((k[middle] as number) < (k[middle - 1] as number))) return;
  const leftLength = middle - start;
  for (let i = 0; i < leftLength; i++) {
    kTmp[i] = k[start + i] as number;
    ixTmp[i] = ix[start + i] as number;
  }
  let i = 0;
  let j = middle;
  let o = start;
  while (i < leftLength && j < end) {
    // Take from the right only when strictly smaller: equal keys keep their input order.
    if ((k[j] as number) < (kTmp[i] as number)) {
      k[o] = k[j] as number;
      ix[o++] = ix[j++] as number;
    } else {
      k[o] = kTmp[i] as number;
      ix[o++] = ixTmp[i++] as number;
    }
  }
  while (i < leftLength) {
    k[o] = kTmp[i] as number;
    ix[o++] = ixTmp[i++] as number;
  }
}
