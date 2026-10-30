// Winding scanline rasterizer: the fill step behind CGContext.fillPath/clip for the deterministic canvas
// (docs/plan.md, Abschnitt 7, WP-R2). Replaces what CoreGraphics does for NightFlight.swift:8-240,
// SummitCableCar.swift (`fill`, `clip`, stroker output filled with nonzero) and BalloonText.swift:58-66
// (`setShouldAntialias(false)`, fill).
//
// Measured on CoreGraphics (macOS 26.6.2, probes in web/tests/fixtures/README.md): device coordinates are rounded
// to 1/256 px, coverage is the exact area of the nonzero/even-odd union with 1/256 resolution in x and y (two
// overlapping edges inside one pixel give the union, not the sum), and without antialiasing every pixel the fill
// touches is set, not every pixel whose centre it contains.
//
// So a pixel row is cut into bands at each vertex inside it. Between two vertices no edge starts or ends, every
// union span is a trapezoid, and each side adds its exact area to a coverage row through a difference array.
// Only when two edges swap order inside a band does the band fall back to S = 16 sub-bands, whose order is read at
// their middle. A band therefore costs less than 16 sample lines unless a crossing forces them.
//
// SWIFT-DIFF: the coverage bytes differ from CoreGraphics' private rounding by up to 1 gray level, more where a
// crossing falls inside a sub-band (raster/primitives.test.ts).
// SWIFT-DIFF: without antialiasing, an edge less than 1/512 px past a pixel boundary snaps onto it here and sets no
// further pixels; CoreGraphics still sets them on the far side of its y-up device space. A vertex lands there about
// once in 256, and it moves a mask boundary by one pixel at most.
import { type Affine } from './affine';
import { Verb, type Path } from './path';

/** Sub-bands per pixel row where edges cross (docs/plan.md "Feste Konstanten"). */
export const S = 16;
/** Vertices are rounded to this fraction of a pixel before the edge table is built. */
export const SNAP = 256;
/**
 * Curves are bisected at t = 1/2 until no coordinate of a second difference of the control polygon exceeds this many
 * device pixels. Fitted to CoreGraphics' fills of circles from r = 2 to r = 320 (quarter circles get 4, 8, 8, 16, 16,
 * 32, 32, 64 chords, the same as here) and free cubics.
 */
export const CURVE_FLATNESS = 0.0685;
/** Slack when comparing edge positions at band limits: the shared end point of two edges may differ in the last bits. */
const CROSSING_EPSILON = 1e-9;

/** Rounds a device coordinate to the 1/256 px grid. */
export function snapCoordinate(v: number): number {
  return Math.floor(v * SNAP + 0.5) / SNAP;
}

/** Pixel rectangle, half-open: x0 ≤ x < x1, y0 ≤ y < y1. Empty when x1 ≤ x0 or y1 ≤ y0. */
export interface PixelRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Intersection of two pixel rectangles; may be empty. */
export function intersectPixelRects(a: PixelRect, b: PixelRect): PixelRect {
  return {
    x0: a.x0 > b.x0 ? a.x0 : b.x0,
    y0: a.y0 > b.y0 ? a.y0 : b.y0,
    x1: a.x1 < b.x1 ? a.x1 : b.x1,
    y1: a.y1 < b.y1 ? a.y1 : b.y1,
  };
}

export function isEmptyPixelRect(r: PixelRect): boolean {
  return r.x1 <= r.x0 || r.y1 <= r.y0;
}

/** CGPathFillRule. */
export type FillRule = 'nonzero' | 'evenodd';

export interface RasterizeOptions {
  /** false = pixel-centre rule, coverage 0 or 255 (BalloonText.swift:59). */
  readonly antialias: boolean;
  readonly rule: FillRule;
}

/**
 * Edge table in typed arrays, reused between primitives. Edges keep their snapped device coordinates and
 * direction: +1 when the source segment runs towards larger y, −1 otherwise. Horizontal edges never cross a
 * sample row and are dropped.
 */
export class EdgeTable {
  /** Per edge: x at yTop, slope dx/dy, yTop, yBottom. Valid for the first `count` edges. */
  xTop = new Float64Array(256);
  slope = new Float64Array(256);
  yTop = new Float64Array(256);
  yBottom = new Float64Array(256);
  winding = new Int8Array(256);
  count = 0;
  /** Bounds of all vertices added since `clear`, snapped. Infinite while empty. */
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;

  clear(): void {
    this.count = 0;
    this.minX = Infinity;
    this.minY = Infinity;
    this.maxX = -Infinity;
    this.maxY = -Infinity;
  }

  /** Adds the segment (x0, y0)→(x1, y1); the coordinates are snapped here. */
  addLine(x0: number, y0: number, x1: number, y1: number): void {
    const ax = Math.floor(x0 * SNAP + 0.5) / SNAP;
    const ay = Math.floor(y0 * SNAP + 0.5) / SNAP;
    const bx = Math.floor(x1 * SNAP + 0.5) / SNAP;
    const by = Math.floor(y1 * SNAP + 0.5) / SNAP;
    if (ax < this.minX) this.minX = ax;
    if (ax > this.maxX) this.maxX = ax;
    if (bx < this.minX) this.minX = bx;
    if (bx > this.maxX) this.maxX = bx;
    if (ay < this.minY) this.minY = ay;
    if (ay > this.maxY) this.maxY = ay;
    if (by < this.minY) this.minY = by;
    if (by > this.maxY) this.maxY = by;
    if (ay === by) return;
    if (this.count === this.xTop.length) this.grow();
    const i = this.count++;
    if (ay < by) {
      this.xTop[i] = ax;
      this.yTop[i] = ay;
      this.yBottom[i] = by;
      this.winding[i] = 1;
    } else {
      this.xTop[i] = bx;
      this.yTop[i] = by;
      this.yBottom[i] = ay;
      this.winding[i] = -1;
    }
    this.slope[i] = (bx - ax) / (by - ay);
  }

  private grow(): void {
    const capacity = this.xTop.length * 2;
    const xTop = new Float64Array(capacity);
    const slope = new Float64Array(capacity);
    const yTop = new Float64Array(capacity);
    const yBottom = new Float64Array(capacity);
    const winding = new Int8Array(capacity);
    xTop.set(this.xTop);
    slope.set(this.slope);
    yTop.set(this.yTop);
    yBottom.set(this.yBottom);
    winding.set(this.winding);
    this.xTop = xTop;
    this.slope = slope;
    this.yTop = yTop;
    this.yBottom = yBottom;
    this.winding = winding;
  }
}

function addCubicEdges(
  edges: EdgeTable,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  depth: number,
): void {
  const ax = x0 - 2 * x1 + x2;
  const ay = y0 - 2 * y1 + y2;
  const bx = x1 - 2 * x2 + x3;
  const by = y1 - 2 * y2 + y3;
  if (
    depth === MAX_CURVE_DEPTH ||
    (Math.abs(ax) <= CURVE_FLATNESS && Math.abs(ay) <= CURVE_FLATNESS && Math.abs(bx) <= CURVE_FLATNESS && Math.abs(by) <= CURVE_FLATNESS)
  ) {
    edges.addLine(x0, y0, x3, y3);
    return;
  }
  const x01 = (x0 + x1) / 2;
  const y01 = (y0 + y1) / 2;
  const x12 = (x1 + x2) / 2;
  const y12 = (y1 + y2) / 2;
  const x23 = (x2 + x3) / 2;
  const y23 = (y2 + y3) / 2;
  const x012 = (x01 + x12) / 2;
  const y012 = (y01 + y12) / 2;
  const x123 = (x12 + x23) / 2;
  const y123 = (y12 + y23) / 2;
  const mx = (x012 + x123) / 2;
  const my = (y012 + y123) / 2;
  addCubicEdges(edges, x0, y0, x01, y01, x012, y012, mx, my, depth + 1);
  addCubicEdges(edges, mx, my, x123, y123, x23, y23, x3, y3, depth + 1);
}

/** Bisection limit of a curve: 2^10 chords. */
const MAX_CURVE_DEPTH = 10;

/**
 * Adds `path`, mapped by `m` and flattened in device space, to `edges`. Open subpaths are closed implicitly,
 * as a fill does (CGContextFillPath); a Move or the end of the path closes the running subpath.
 */
export function addPathEdges(edges: EdgeTable, path: Path, m: Affine): void {
  const verbs = path.verbs;
  const coords = path.coords;
  const { a, b, c, d, tx, ty } = m;
  let startX = 0;
  let startY = 0;
  let x0 = 0;
  let y0 = 0;
  let open = false;
  let k = 0;
  for (let i = 0; i < verbs.length; i++) {
    const verb = verbs[i] as Verb;
    switch (verb) {
      case Verb.Move: {
        if (open) edges.addLine(x0, y0, startX, startY);
        const ux = coords[k] as number;
        const uy = coords[k + 1] as number;
        startX = a * ux + c * uy + tx;
        startY = b * ux + d * uy + ty;
        x0 = startX;
        y0 = startY;
        open = true;
        k += 2;
        break;
      }
      case Verb.Line: {
        const ux = coords[k] as number;
        const uy = coords[k + 1] as number;
        const x = a * ux + c * uy + tx;
        const y = b * ux + d * uy + ty;
        edges.addLine(x0, y0, x, y);
        x0 = x;
        y0 = y;
        open = true;
        k += 2;
        break;
      }
      case Verb.Quad: {
        const u1 = coords[k] as number;
        const v1 = coords[k + 1] as number;
        const u2 = coords[k + 2] as number;
        const v2 = coords[k + 3] as number;
        const x1 = a * u1 + c * v1 + tx;
        const y1 = b * u1 + d * v1 + ty;
        const x2 = a * u2 + c * v2 + tx;
        const y2 = b * u2 + d * v2 + ty;
        // Degree elevation: a quad is a cubic with controls 2/3 of the way to its control point.
        addCubicEdges(edges, x0, y0, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x2 + ((x1 - x2) * 2) / 3, y2 + ((y1 - y2) * 2) / 3, x2, y2, 0);
        x0 = x2;
        y0 = y2;
        open = true;
        k += 4;
        break;
      }
      case Verb.Cubic: {
        const u1 = coords[k] as number;
        const v1 = coords[k + 1] as number;
        const u2 = coords[k + 2] as number;
        const v2 = coords[k + 3] as number;
        const u3 = coords[k + 4] as number;
        const v3 = coords[k + 5] as number;
        const x3 = a * u3 + c * v3 + tx;
        const y3 = b * u3 + d * v3 + ty;
        addCubicEdges(edges, x0, y0, a * u1 + c * v1 + tx, b * u1 + d * v1 + ty, a * u2 + c * v2 + tx, b * u2 + d * v2 + ty, x3, y3, 0);
        x0 = x3;
        y0 = y3;
        open = true;
        k += 6;
        break;
      }
      case Verb.Close:
        edges.addLine(x0, y0, startX, startY);
        x0 = startX;
        y0 = startY;
        open = false;
        break;
    }
  }
  if (open) edges.addLine(x0, y0, startX, startY);
}

/** The pixel rectangle holding every vertex of `edges`; empty for an empty table. */
export function edgeBounds(edges: EdgeTable): PixelRect {
  if (edges.minX > edges.maxX) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0: Math.floor(edges.minX), y0: Math.floor(edges.minY), x1: Math.ceil(edges.maxX), y1: Math.ceil(edges.maxY) };
}

/** Called once per row that has coverage: `coverage[x − x0]` is the 0…255 coverage of pixel (x, y) for x0 ≤ x < x1. */
export type RowSink = (y: number, x0: number, x1: number, coverage: Uint8Array) => void;

// Scratch shared by all rasterize calls; the module is single-threaded per worker. Kept between calls so a
// scene of hundreds of primitives does not allocate per fill.
let cells = new Float32Array(0);
let row = new Uint8Array(0);
let bucketHead = new Int32Array(0);
let bucketNext = new Int32Array(0);
let active = new Int32Array(0);
let parked = new Int32Array(0);
let bandTop = new Float64Array(0);
let bandBottom = new Float64Array(0);
let bandMiddle = new Float64Array(0);
// Band limits inside one pixel row, as multiples of 1/SNAP; a row has at most SNAP + 1 of them.
const limits = new Int32Array(SNAP + 2);
const limitSeen = new Uint8Array(SNAP + 1);

function ensureScratch(width: number, rows: number, edgeCount: number): void {
  if (cells.length < width + 2) {
    cells = new Float32Array(width + 2);
    row = new Uint8Array(width + 2);
  }
  if (bucketHead.length < rows) bucketHead = new Int32Array(rows);
  if (bucketNext.length < edgeCount) {
    bucketNext = new Int32Array(edgeCount);
    active = new Int32Array(edgeCount);
    parked = new Int32Array(edgeCount);
    bandTop = new Float64Array(edgeCount);
    bandBottom = new Float64Array(edgeCount);
    bandMiddle = new Float64Array(edgeCount);
  }
}

/**
 * Streams the coverage of `edges` inside `bounds` row by row. Rows without coverage are skipped; `coverage`
 * is scratch, valid during the call only, and only `[x0, x1)` of the row is reported.
 */
export function rasterizeRows(edges: EdgeTable, bounds: PixelRect, options: RasterizeOptions, sink: RowSink): void {
  const clipped = intersectPixelRects(bounds, edgeBounds(edges));
  if (isEmptyPixelRect(clipped) || edges.count === 0) return;
  const { x0: left, x1: right, y0: top, y1: bottom } = clipped;
  const width = right - left;
  const rows = bottom - top;
  const count = edges.count;
  ensureScratch(width, rows, count);
  const { xTop, slope, yTop, yBottom, winding } = edges;
  const evenOdd = options.rule === 'evenodd';
  const antialias = options.antialias;
  const head = bucketHead;
  const next = bucketNext;
  head.fill(-1, 0, rows);
  for (let i = count - 1; i >= 0; i--) {
    const k = Math.floor((yTop[i] as number) - top);
    const first = k < 0 ? 0 : k;
    if (first >= rows) continue;
    next[i] = head[first] as number;
    head[first] = i;
  }
  const list = active;
  const rest = parked;
  const xa = bandTop;
  const xb = bandBottom;
  const xm = bandMiddle;
  let activeCount = 0;

  // Sorts the edges that span [ya, yb] by x at the middle of the band and leaves them at the front of the
  // active list; returns how many. Edges not spanning the band stay behind them for a later band.
  const prepareBand = (ya: number, yb: number): number => {
    const ym = (ya + yb) / 2;
    let n = 0;
    let parkedCount = 0;
    for (let i = 0; i < activeCount; i++) {
      const e = list[i] as number;
      if ((yTop[e] as number) > ya || (yBottom[e] as number) < yb) {
        rest[parkedCount++] = e;
        continue;
      }
      const t = yTop[e] as number;
      const x0 = xTop[e] as number;
      const m = slope[e] as number;
      const middle = x0 + (ym - t) * m;
      let j = n++;
      while (j > 0 && (xm[j - 1] as number) > middle) {
        xm[j] = xm[j - 1] as number;
        xa[j] = xa[j - 1] as number;
        xb[j] = xb[j - 1] as number;
        list[j] = list[j - 1] as number;
        j--;
      }
      xm[j] = middle;
      xa[j] = x0 + (ya - t) * m;
      xb[j] = x0 + (yb - t) * m;
      list[j] = e;
    }
    for (let i = 0; i < parkedCount; i++) list[n + i] = rest[i] as number;
    return n;
  };

  let low = width;
  let high = -1;

  // Adds the band's union spans to the coverage cells: every edge where the winding leaves or reaches 0 is one
  // trapezoid side.
  const accumulate = (n: number, height: number): void => {
    let wind = 0;
    for (let i = 0; i < n; i++) {
      const before = wind;
      wind = evenOdd ? wind ^ 1 : wind + (winding[list[i] as number] as number);
      if ((before === 0) === (wind === 0)) continue;
      addSide(xa[i] as number, xb[i] as number, before === 0 ? height : -height);
    }
  };

  // A side moving from x1 to x2 over the band: its step is spread evenly over that range. A step at position p
  // inside cell i adds (1 − f) to cell i and f to cell i + 1, which is linear in f, so one cell's share of the
  // range acts like a single step at its mean position; this makes the coverage the exact area of the trapezoid.
  const addSide = (x1: number, x2: number, mass: number): void => {
    let a = (x1 < x2 ? x1 : x2) - left;
    let b = (x1 < x2 ? x2 : x1) - left;
    if (a >= width) {
      // Past the window: nothing visible changes here, but a span open to its left runs up to the edge.
      high = width - 1;
      return;
    }
    if (b <= 0) {
      cells[0] = (cells[0] as number) + mass;
      if (low > 0) low = 0;
      if (high < 0) high = 0;
      return;
    }
    let m = mass;
    if (a < 0) {
      const outside = (m * -a) / (b - a);
      cells[0] = (cells[0] as number) + outside;
      m -= outside;
      a = 0;
    }
    if (b > width) {
      m = (m * (width - a)) / (b - a);
      b = width;
    }
    const first = Math.floor(a);
    if (first < low) low = first;
    const last = Math.ceil(b) - 1;
    const end = last < first ? first : last;
    if (end > high) high = end;
    if (end === first) {
      const f = (a + b) / 2 - first;
      cells[first] = (cells[first] as number) + m * (1 - f);
      cells[first + 1] = (cells[first + 1] as number) + m * f;
      return;
    }
    const density = m / (b - a);
    let u = a;
    for (let cell = first; cell <= end; cell++) {
      const v = cell + 1 < b ? cell + 1 : b;
      const share = density * (v - u);
      const f = (u + v) / 2 - cell;
      cells[cell] = (cells[cell] as number) + share * (1 - f);
      cells[cell + 1] = (cells[cell + 1] as number) + share * f;
      u = v;
    }
  };

  // Aliased: every pixel the union touches in this band.
  const markSpans = (n: number): void => {
    let wind = 0;
    let start = 0;
    for (let i = 0; i < n; i++) {
      const before = wind;
      wind = evenOdd ? wind ^ 1 : wind + (winding[list[i] as number] as number);
      if (before === 0 && wind !== 0) {
        start = i;
      } else if (before !== 0 && wind === 0) {
        const l = (xa[start] as number) < (xm[start] as number) ? (xa[start] as number) : (xb[start] as number);
        const r = (xa[i] as number) > (xm[i] as number) ? (xa[i] as number) : (xb[i] as number);
        if (r <= l) continue;
        let from = Math.floor(l) - left;
        let to = Math.ceil(r) - left;
        if (from < 0) from = 0;
        if (to > width) to = width;
        if (to <= from) continue;
        out.fill(255, from, to);
        if (from < low) low = from;
        if (to - 1 > high) high = to - 1;
      }
    }
  };

  const out = row;
  if (!antialias) out.fill(0, 0, width);
  for (let y = top; y < bottom; y++) {
    for (let e = head[y - top] as number; e >= 0; e = next[e] as number) {
      list[activeCount++] = e;
    }
    // Keep what reaches into this row and collect the vertices inside it: between two of them nothing starts
    // or ends, so a band is a stack of trapezoids.
    let kept = 0;
    let limitCount = 0;
    limits[limitCount++] = 0;
    for (let i = 0; i < activeCount; i++) {
      const e = list[i] as number;
      const bottomY = yBottom[e] as number;
      if (bottomY <= y) continue;
      list[kept++] = e;
      const inTop = ((yTop[e] as number) - y) * SNAP;
      if (inTop > 0 && inTop < SNAP && limitSeen[inTop] === 0) {
        limitSeen[inTop] = 1;
        limits[limitCount++] = inTop;
      }
      const inBottom = (bottomY - y) * SNAP;
      if (inBottom > 0 && inBottom < SNAP && limitSeen[inBottom] === 0) {
        limitSeen[inBottom] = 1;
        limits[limitCount++] = inBottom;
      }
    }
    activeCount = kept;
    if (activeCount === 0) continue;
    for (let i = 2; i < limitCount; i++) {
      const value = limits[i] as number;
      let j = i;
      while (j > 1 && (limits[j - 1] as number) > value) {
        limits[j] = limits[j - 1] as number;
        j--;
      }
      limits[j] = value;
    }
    limits[limitCount] = SNAP;
    low = width;
    high = -1;
    for (let band = 0; band < limitCount; band++) {
      const k = limits[band] as number;
      limitSeen[k] = 0;
      const ya = y + k / SNAP;
      const yb = y + (limits[band + 1] as number) / SNAP;
      const n = prepareBand(ya, yb);
      if (n === 0) continue;
      let crossing = false;
      for (let i = 1; i < n; i++) {
        if ((xa[i - 1] as number) > (xa[i] as number) + CROSSING_EPSILON || (xb[i - 1] as number) > (xb[i] as number) + CROSSING_EPSILON) {
          crossing = true;
          break;
        }
      }
      if (!crossing) {
        if (antialias) accumulate(n, yb - ya);
        else markSpans(n);
        continue;
      }
      // Two edges swap order inside the band, so the union's sides change there. Fall back to S sub-bands per
      // pixel row; inside each the order at its middle stands for the whole sub-band.
      const firstSub = Math.floor((ya - y) * S);
      const lastSub = Math.ceil((yb - y) * S);
      for (let sub = firstSub; sub < lastSub; sub++) {
        const sa = y + sub / S;
        const sb = y + (sub + 1) / S;
        const from = sa > ya ? sa : ya;
        const to = sb < yb ? sb : yb;
        const m = prepareBand(from, to);
        if (antialias) accumulate(m, to - from);
        else markSpans(m);
      }
    }
    if (high < 0) continue;
    const end = high + 1;
    if (antialias) {
      let sum = 0;
      const c = cells;
      for (let x = low; x < end; x++) {
        sum += c[x] as number;
        c[x] = 0;
        const v = Math.floor(sum * 255 + 0.5);
        out[x] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      // The cell past the last span holds the closing residue of the difference array.
      c[end] = 0;
      sink(y, left + low, left + end, out.subarray(low, end));
    } else {
      sink(y, left + low, left + end, out.subarray(low, end));
      out.fill(0, low, end);
    }
  }
}

/** Coverage bitmap of one rasterize call: pixel (x, y) is pixels[(y − y0)·(x1 − x0) + x − x0]. */
export interface Coverage {
  readonly rect: PixelRect;
  readonly pixels: Uint8Array;
}

/** Coverage 0…255 of `edges` for every pixel of `bounds` (allocates; canvas fills use rasterizeRows). */
export function rasterize(edges: EdgeTable, bounds: PixelRect, options: RasterizeOptions): Coverage {
  const width = bounds.x1 > bounds.x0 ? bounds.x1 - bounds.x0 : 0;
  const height = bounds.y1 > bounds.y0 ? bounds.y1 - bounds.y0 : 0;
  const pixels = new Uint8Array(width * height);
  rasterizeRows(edges, bounds, options, (y, x0, x1, coverage) => {
    pixels.set(coverage.subarray(0, x1 - x0), (y - bounds.y0) * width + x0 - bounds.x0);
  });
  return { rect: bounds, pixels };
}
