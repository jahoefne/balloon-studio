// The clip of a CGContext gstate for the deterministic canvas (docs/plan.md, Abschnitt 7, WP-R2).
// Reproduces `c.saveGState(); c.addPath(…); c.clip(); …; c.restoreGState()` in NightFlight.swift:23-28,
// :117-123, :171-174, :202-212, :229-231 and SummitCableCar.swift:101-117, :140, whose clips nest
// (`clip(o) {clip(snow) {clip(deep) {…}}}`, SummitCableCar.swift:202-205).
//
// A mask is a pixel rectangle plus, unless it is a plain pixel-aligned rectangle, 8-bit coverage over exactly
// that rectangle, so the cost follows the clip's bounding box and not the canvas. Masks are immutable: a
// gstate keeps a reference and `restore` just goes back to the previous one. Intersection multiplies
// coverage, round(a·b/255).
import { type Affine } from './affine';
import { type Path } from './path';
import {
  addPathEdges,
  EdgeTable,
  edgeBounds,
  intersectPixelRects,
  isEmptyPixelRect,
  rasterizeRows,
  type FillRule,
  type PixelRect,
} from './scanline';

/** round(a·b/255) for a, b in 0…255 (a·b/255 is never a tie, so floor(+0.5) is the plain rounding). */
export function multiplyCoverage(a: number, b: number): number {
  return Math.floor((a * b) / 255 + 0.5);
}

export class ClipMask {
  /** Pixels outside `rect` are fully clipped. */
  readonly rect: PixelRect;
  /** Coverage per pixel of `rect`, row by row; null = 255 everywhere. */
  readonly coverage: Uint8Array | null;

  private constructor(rect: PixelRect, coverage: Uint8Array | null) {
    this.rect = rect;
    this.coverage = coverage;
  }

  /** The clip of a fresh context: the whole bitmap. */
  static full(width: number, height: number): ClipMask {
    return new ClipMask({ x0: 0, y0: 0, x1: width, y1: height }, null);
  }

  get isEmpty(): boolean {
    return isEmptyPixelRect(this.rect);
  }

  /** CGContext.clip(to: rect) for a rectangle with integer device edges. */
  clipPixelRect(rect: PixelRect): ClipMask {
    const next = intersectPixelRects(this.rect, rect);
    if (isEmptyPixelRect(next)) return new ClipMask(next, null);
    if (this.coverage === null) return new ClipMask(next, null);
    const { x0, y0, x1, y1 } = next;
    const width = x1 - x0;
    const stride = this.rect.x1 - this.rect.x0;
    const out = new Uint8Array(width * (y1 - y0));
    for (let y = y0; y < y1; y++) {
      const from = (y - this.rect.y0) * stride + x0 - this.rect.x0;
      out.set(this.coverage.subarray(from, from + width), (y - y0) * width);
    }
    return new ClipMask(next, out);
  }

  /** CGContext.clip(using:) with `edges` as the current path: every pixel's coverage multiplies in. */
  clipEdges(edges: EdgeTable, antialias: boolean, rule: FillRule): ClipMask {
    const next = intersectPixelRects(this.rect, edgeBounds(edges));
    if (isEmptyPixelRect(next)) return new ClipMask({ x0: 0, y0: 0, x1: 0, y1: 0 }, null);
    const width = next.x1 - next.x0;
    const out = new Uint8Array(width * (next.y1 - next.y0));
    const previous = this.coverage;
    const stride = this.rect.x1 - this.rect.x0;
    rasterizeRows(edges, next, { antialias, rule }, (y, x0, x1, coverage) => {
      const target = (y - next.y0) * width - next.x0;
      if (previous === null) {
        out.set(coverage.subarray(0, x1 - x0), target + x0);
        return;
      }
      const source = (y - this.rect.y0) * stride - this.rect.x0;
      for (let x = x0; x < x1; x++) {
        out[target + x] = multiplyCoverage(coverage[x - x0] as number, previous[source + x] as number);
      }
    });
    return new ClipMask(next, out);
  }

  /** `path` mapped by `m`, flattened in device space, as a new clip level. Scratch edges come from the caller. */
  clip(path: Path, m: Affine, antialias: boolean, rule: FillRule, edges: EdgeTable = new EdgeTable()): ClipMask {
    edges.clear();
    addPathEdges(edges, path, m);
    return this.clipEdges(edges, antialias, rule);
  }
}
