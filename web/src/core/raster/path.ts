// CoreGraphics CGPath / CGMutablePath for the deterministic rasterizer (docs/plan.md, Abschnitt 7, WP-R0).
//
// Reproduces the path calls of mac/Sources/BalloonStudio/SummitCableCar.swift:14-120
// (`path.copy(using:&t)`, `applyWithBlock` in `warp`, `CGMutablePath.move/addLine/closeSubpath`),
// NightFlight.swift:8-100 (`move/addLine/addCurve/addQuadCurve/addArc/closeSubpath`) and
// BalloonText.swift:28-66 (`path.addPath(glyph, transform:)`, `path.boundingBoxOfPath`).
//
// Data model: one verb per element plus flat coordinates (x0, y0, x1, y1, …) in element order;
// a Quad stores (control, end), a Cubic (control1, control2, end), like CGPathElement.points.
//
// Building rules, measured on CoreGraphics (macOS 26.6.2, Swift 6.3.3, 2026-10-29) and mirrored here:
// - moveTo right after a Move replaces that Move (M1 M2 L → M2 L); addPath appends raw (M + M L → M M L).
// - lineTo/quadTo/cubicTo without a current point (empty path) are ignored, as CoreGraphics does.
// - close on an empty path or right after a Close is ignored; `M Z` is kept.
// - After a Close the current point is the subpath start; a following segment starts there with no
//   implicit Move element (applyWithBlock reports `Z L`).
// - Every non-empty path therefore starts with a Move.
// - A trailing lone Move is kept and counts in both bounding boxes; an empty path has no bounds
//   (CGRect.null → null).
// - boundingBox includes control points; boundingBoxOfPath is the tight bound of the curves.
// - Arcs, ellipses and rounded rects: see addArc/addEllipse/addRoundedRect (WP-R1).
//   docs/plan.md §7 calls boundingBoxOfPath "inkl. Kontrollpunkte"; CoreGraphics says otherwise
//   (quad (0,0)–c(5,10)–(10,0): boundingBox 10×10, boundingBoxOfPath 10×5). BalloonText.swift:47 uses
//   boundingBoxOfPath → port it with pathBounds(), not controlBounds().
import { cos, PI, sin } from '../swift/dmath';
import { type Affine, type Point } from './affine';

const TAU = 2 * PI;
const HALF_PI = PI / 2;
/** CoreGraphics' circle constant, ten digits, measured on addEllipse. */
const KAPPA = 0.5522847498;

/** CGPathElementType. */
export const Verb = { Move: 0, Line: 1, Quad: 2, Cubic: 3, Close: 4 } as const;
export type Verb = (typeof Verb)[keyof typeof Verb];

/** Points stored per verb (Move 1, Line 1, Quad 2, Cubic 3, Close 0). */
export const POINTS_PER_VERB: readonly number[] = [1, 1, 2, 3, 0];

/** CGRect (origin + size). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** CGPathElement as seen by `applyWithBlock`: `type` and `points` (Quad: control, end; Cubic: c1, c2, end). */
export interface PathElement {
  readonly type: Verb;
  readonly points: readonly Point[];
}

export class Path {
  private readonly verbList: Verb[] = [];
  private readonly coordList: number[] = [];
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;

  /** Verbs in element order (read-only view for hot loops; do not mutate). */
  get verbs(): readonly Verb[] {
    return this.verbList;
  }

  /** Flat coordinates (x, y pairs) in element order (read-only view for hot loops; do not mutate). */
  get coords(): readonly number[] {
    return this.coordList;
  }

  /** CGPath.isEmpty. */
  isEmpty(): boolean {
    return this.verbList.length === 0;
  }

  /** CGPath.currentPoint; null for an empty path (CoreGraphics returns .zero there). */
  get currentPoint(): Point | null {
    return this.isEmpty() ? null : { x: this.currentX, y: this.currentY };
  }

  /** CGMutablePath.move(to:). Replaces a trailing Move. */
  moveTo(x: number, y: number): void {
    const n = this.verbList.length;
    if (n > 0 && this.verbList[n - 1] === Verb.Move) {
      this.coordList[this.coordList.length - 2] = x;
      this.coordList[this.coordList.length - 1] = y;
    } else {
      this.verbList.push(Verb.Move);
      this.coordList.push(x, y);
    }
    this.startX = x;
    this.startY = y;
    this.currentX = x;
    this.currentY = y;
  }

  /** CGMutablePath.addLine(to:). Ignored without a current point. */
  lineTo(x: number, y: number): void {
    if (this.isEmpty()) return;
    this.verbList.push(Verb.Line);
    this.coordList.push(x, y);
    this.currentX = x;
    this.currentY = y;
  }

  /** CGMutablePath.addQuadCurve(to:control:) — note the argument order: control first, like the stored points. */
  quadTo(cx: number, cy: number, x: number, y: number): void {
    if (this.isEmpty()) return;
    this.verbList.push(Verb.Quad);
    this.coordList.push(cx, cy, x, y);
    this.currentX = x;
    this.currentY = y;
  }

  /** CGMutablePath.addCurve(to:control1:control2:) — controls first, like the stored points. */
  cubicTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (this.isEmpty()) return;
    this.verbList.push(Verb.Cubic);
    this.coordList.push(c1x, c1y, c2x, c2y, x, y);
    this.currentX = x;
    this.currentY = y;
  }

  /** CGMutablePath.closeSubpath(). Ignored on an empty path and right after a Close. */
  close(): void {
    const n = this.verbList.length;
    if (n === 0 || this.verbList[n - 1] === Verb.Close) return;
    this.verbList.push(Verb.Close);
    this.currentX = this.startX;
    this.currentY = this.startY;
  }

  /** CGMutablePath.addPath(_:transform:): appends every element of `p`, mapped by `m` (identity if omitted). */
  addPath(p: Path, m?: Affine): void {
    const verbs = p.verbList;
    const coords = p.coordList;
    let k = 0;
    for (let i = 0; i < verbs.length; i++) {
      const verb = verbs[i] as Verb;
      this.verbList.push(verb);
      const count = POINTS_PER_VERB[verb] as number;
      for (let j = 0; j < count; j++, k += 2) {
        const x = coords[k] as number;
        const y = coords[k + 1] as number;
        if (m === undefined) {
          this.coordList.push(x, y);
        } else {
          this.coordList.push(m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty);
        }
      }
      const end = this.coordList.length;
      if (verb === Verb.Move) {
        this.startX = this.coordList[end - 2] as number;
        this.startY = this.coordList[end - 1] as number;
        this.currentX = this.startX;
        this.currentY = this.startY;
      } else if (verb === Verb.Close) {
        this.currentX = this.startX;
        this.currentY = this.startY;
      } else {
        this.currentX = this.coordList[end - 2] as number;
        this.currentY = this.coordList[end - 1] as number;
      }
    }
  }

  /** CGPath.copy(): an exact copy. */
  copy(): Path {
    const out = new Path();
    out.addPath(this);
    return out;
  }

  /** CGPath.copy(using: &t): every point (control points included) mapped by `m`. */
  transformed(m: Affine): Path {
    const out = new Path();
    out.addPath(this, m);
    return out;
  }

  /** CGPath.applyWithBlock: one element per verb, in order. */
  forEach(visitor: (element: PathElement) => void): void {
    const verbs = this.verbList;
    const coords = this.coordList;
    let k = 0;
    for (let i = 0; i < verbs.length; i++) {
      const type = verbs[i] as Verb;
      const count = POINTS_PER_VERB[type] as number;
      const points: Point[] = [];
      for (let j = 0; j < count; j++, k += 2) {
        points.push({ x: coords[k] as number, y: coords[k + 1] as number });
      }
      visitor({ type, points });
    }
  }

  /** CGPath.boundingBox: smallest rect around every stored point, control points included; null if empty. */
  controlBounds(): Rect | null {
    const coords = this.coordList;
    if (coords.length === 0) return null;
    let minX = coords[0] as number;
    let minY = coords[1] as number;
    let maxX = minX;
    let maxY = minY;
    for (let k = 2; k < coords.length; k += 2) {
      const x = coords[k] as number;
      const y = coords[k + 1] as number;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * CGPath.boundingBoxOfPath: tight bound of the path itself (Move points, segment ends and the
   * axis extrema of every curve), control points excluded; null if empty. The extrema are found by
   * solving the derivative per axis and evaluating the Bernstein form in SummitCableCar.swift:50,56
   * order. Bit-identical to CoreGraphics on the moon path; the tests assert 1e-12 (path.test.ts).
   */
  pathBounds(): Rect | null {
    const verbs = this.verbList;
    const coords = this.coordList;
    if (verbs.length === 0) return null;
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const include = (x: number, y: number): void => {
      if (x < box.minX) box.minX = x;
      if (x > box.maxX) box.maxX = x;
      if (y < box.minY) box.minY = y;
      if (y > box.maxY) box.maxY = y;
    };
    let startX = 0;
    let startY = 0;
    let x0 = 0;
    let y0 = 0;
    let k = 0;
    for (let i = 0; i < verbs.length; i++) {
      const verb = verbs[i] as Verb;
      switch (verb) {
        case Verb.Move:
        case Verb.Line: {
          x0 = coords[k] as number;
          y0 = coords[k + 1] as number;
          if (verb === Verb.Move) {
            startX = x0;
            startY = y0;
          }
          include(x0, y0);
          k += 2;
          break;
        }
        case Verb.Quad: {
          const bx = coords[k] as number;
          const by = coords[k + 1] as number;
          const dx = coords[k + 2] as number;
          const dy = coords[k + 3] as number;
          for (const f of quadExtrema(x0, bx, dx)) include(quadAt(x0, bx, dx, f), quadAt(y0, by, dy, f));
          for (const f of quadExtrema(y0, by, dy)) include(quadAt(x0, bx, dx, f), quadAt(y0, by, dy, f));
          include(dx, dy);
          x0 = dx;
          y0 = dy;
          k += 4;
          break;
        }
        case Verb.Cubic: {
          const bx = coords[k] as number;
          const by = coords[k + 1] as number;
          const qx = coords[k + 2] as number;
          const qy = coords[k + 3] as number;
          const dx = coords[k + 4] as number;
          const dy = coords[k + 5] as number;
          for (const f of cubicExtrema(x0, bx, qx, dx)) include(cubicAt(x0, bx, qx, dx, f), cubicAt(y0, by, qy, dy, f));
          for (const f of cubicExtrema(y0, by, qy, dy)) include(cubicAt(x0, bx, qx, dx, f), cubicAt(y0, by, qy, dy, f));
          include(dx, dy);
          x0 = dx;
          y0 = dy;
          k += 6;
          break;
        }
        case Verb.Close:
          x0 = startX;
          y0 = startY;
          break;
      }
    }
    return { x: box.minX, y: box.minY, width: box.maxX - box.minX, height: box.maxY - box.minY };
  }

  // ---- WP-R1 -------------------------------------------------------------------------------------
  // path.test.ts keeps CoreGraphics' element list for the moon (NightFlight.swift:84-93,
  // SummitCableCar.swift:417-419), which is the acceptance test for the arc rules.

  /**
   * CGMutablePath.addArc(center:radius:startAngle:endAngle:clockwise:transform:).
   *
   * Angles in radians from +x towards +y; clockwise=false sweeps increasing angles (y-up sense).
   * If the path has a current point (also a lone Move or after a Close) a Line goes to the arc start,
   * otherwise a Move; a lone Move is not replaced. Sweep Δ = end − start, normalised like CoreGraphics:
   * ccw with Δ < 0 → Δ = fmod(Δ, 2π) + 2π; cw with Δ > 0 → Δ = fmod(Δ, 2π) − 2π; |Δ| > 2π is not
   * clamped (0→4π ccw draws two turns); Δ = 0 adds only the Move/Line. The arc is cubics of exactly π/2
   * from the start angle plus one shorter remainder cubic, κ = 0.5522847498 for quarter turns and
   * 4·(1 − cos(θ/2)) / (3·sin(θ/2)) for the remainder θ. Points are mapped by `m` (identity if omitted).
   *
   * Measured details, all on arm64 (macOS 26.6.2, tests/fixtures/swift/probes/cg-arcs.swift):
   * - A normalised cw arc rotates from end − Δ, not from `startAngle` (0→0.5 cw starts at sin(2π)).
   * - cw with fmod(Δ, 2π) = 0 is empty when there is a current point, and a full turn when there is not.
   * - CoreGraphics contracts to FMA: x' = fma(−b, y, a·x) + cx, y' = fma(b, x, a·y) + cy, control =
   *   fma(±k, tangent, end point). Reproduced by `fused`; the moon depends on it in the last bit.
   * - An arc without a current point takes its second control from the unit circle instead:
   *   (fma(a, u, −b·v) + cx, fma(b, u, a·v) + cy) with (u, v) = (fma(±k, y, x), fma(∓k, x, y)).
   *
   * SWIFT-DIFF: CoreGraphics gives different last bits for the same call depending on what surrounds it:
   * a lone arc in an otherwise empty path, the same arc once something is appended, and an arc after a
   * current point all differ. This port has the last two forms only (the moon needs both), so a lone arc
   * and some other sweeps differ from CoreGraphics by a few ULP (at most 4, path.test.ts against the
   * cg-arcs fixture). CoreGraphics also
   * reports a `currentPoint` that can differ from the last element's end by ULPs; this port never does.
   * The raster snaps to 1/256 px, so none of this reaches a pixel.
   */
  addArc(center: Point, radius: number, startAngle: number, endAngle: number, clockwise: boolean, m?: Affine): void {
    const hadPoint = !this.isEmpty();
    let start = startAngle;
    let sweep = endAngle - startAngle;
    if (clockwise) {
      if (sweep > 0) {
        const rest = sweep % TAU;
        if (rest === 0 && !hadPoint) {
          sweep = -TAU;
        } else {
          sweep = rest === 0 ? 0 : rest - TAU;
          start = endAngle - sweep;
        }
      }
    } else if (sweep < 0) {
      sweep = (sweep % TAU) + TAU;
    }

    const cx = center.x;
    const cy = center.y;
    const a = radius * cos(start);
    const b = radius * sin(start);
    const pointX = (x: number, y: number): number => fused(-b, y, a * x) + cx;
    const pointY = (x: number, y: number): number => fused(b, x, a * y) + cy;
    const vectorX = (x: number, y: number): number => fused(-b, y, a * x);
    const vectorY = (x: number, y: number): number => fused(b, x, a * y);
    const sign = sweep < 0 ? -1 : 1;

    const arcStart = mapped(m, pointX(1, 0), pointY(1, 0));
    if (hadPoint) this.lineTo(arcStart[0], arcStart[1]);
    else this.moveTo(arcStart[0], arcStart[1]);
    if (sweep === 0) return;

    const cubic = (x0: number, y0: number, x1: number, y1: number, k: number): void => {
      const c1 = mapped(m, fused(k, vectorX(-sign * y0, sign * x0), pointX(x0, y0)), fused(k, vectorY(-sign * y0, sign * x0), pointY(x0, y0)));
      let c2: [number, number];
      if (hadPoint) {
        c2 = mapped(m, fused(-k, vectorX(-sign * y1, sign * x1), pointX(x1, y1)), fused(-k, vectorY(-sign * y1, sign * x1), pointY(x1, y1)));
      } else {
        const ux = fused(sign * k, y1, x1);
        const uy = fused(-sign * k, x1, y1);
        c2 = mapped(m, fused(a, ux, -b * uy) + cx, fused(b, ux, a * uy) + cy);
      }
      const end = mapped(m, pointX(x1, y1), pointY(x1, y1));
      this.cubicTo(c1[0], c1[1], c2[0], c2[1], end[0], end[1]);
    };
    let x = 1;
    let y = 0;
    let remaining = Math.abs(sweep);
    while (remaining >= HALF_PI) {
      const nextX = -sign * y;
      const nextY = sign * x;
      cubic(x, y, nextX, nextY, KAPPA);
      x = nextX;
      y = nextY;
      remaining -= HALF_PI;
    }
    if (remaining > 0) {
      cubic(x, y, cos(sweep), sin(sweep), (4 * (1 - cos(remaining / 2))) / (3 * sin(remaining / 2)));
    }
  }

  /**
   * CGMutablePath.addEllipse(in:transform:) / CGPath(ellipseIn:transform:).
   *
   * The rect is standardised (negative sizes flipped). moveTo (maxX, midY) — a trailing lone Move is
   * replaced — then 4 cubics counter-clockwise in y-up (first to (midX, maxY)) with κ = 0.5522847498
   * (CoreGraphics' constant; not 0.5522847498307936), then Close. Points mapped by `m`.
   */
  addEllipse(rect: Rect, m?: Affine): void {
    const { minX, minY, maxX, maxY } = standardized(rect);
    const rx = (maxX - minX) / 2;
    const ry = (maxY - minY) / 2;
    const midX = minX + rx;
    const midY = minY + ry;
    const kx = KAPPA * rx;
    const ky = KAPPA * ry;
    const start = mapped(m, maxX, midY);
    this.moveTo(start[0], start[1]);
    this.addMappedCubic(m, maxX, midY + ky, midX + kx, maxY, midX, maxY);
    this.addMappedCubic(m, midX - kx, maxY, minX, midY + ky, minX, midY);
    this.addMappedCubic(m, minX, midY - ky, midX - kx, minY, midX, minY);
    this.addMappedCubic(m, midX + kx, minY, maxX, midY - ky, maxX, midY);
    this.close();
  }

  /**
   * CGMutablePath.addRoundedRect(in:cornerWidth:cornerHeight:transform:) /
   * CGPath(roundedRect:cornerWidth:cornerHeight:transform:).
   *
   * moveTo (maxX, midY), Line (maxX, maxY − ch), corner cubic, Line (minX + cw, maxY), cubic,
   * Line (minX, minY + ch), cubic, Line (maxX − cw, minY), cubic, Close: counter-clockwise in y-up,
   * corners are elliptical quarter arcs with κ = 0.5522847498. cw = ch = 0 degrades to CGPath(rect:):
   * moveTo (minX, minY), Line (maxX, minY), Line (maxX, maxY), Line (minX, maxY), Close.
   * Callers keep cw ≤ width/2 and ch ≤ height/2 (SummitCableCar.swift `rect` clamps to w/2 − 0.01).
   *
   * SWIFT-DIFF: CoreGraphics leaves ~1e-15 of rotation noise in the coordinates
   * (L(3, 10.000000000000002)); these are the exact values without that noise.
   */
  addRoundedRect(rect: Rect, cornerWidth: number, cornerHeight: number, m?: Affine): void {
    const { minX, minY, maxX, maxY } = standardized(rect);
    const line = (x: number, y: number): void => {
      const q = mapped(m, x, y);
      this.lineTo(q[0], q[1]);
    };
    if (cornerWidth === 0 && cornerHeight === 0) {
      const corner = mapped(m, minX, minY);
      this.moveTo(corner[0], corner[1]);
      line(maxX, minY);
      line(maxX, maxY);
      line(minX, maxY);
      this.close();
      return;
    }
    const cw = cornerWidth;
    const ch = cornerHeight;
    const kx = KAPPA * cw;
    const ky = KAPPA * ch;
    const start = mapped(m, maxX, minY + (maxY - minY) / 2);
    this.moveTo(start[0], start[1]);
    line(maxX, maxY - ch);
    this.addMappedCubic(m, maxX, maxY - ch + ky, maxX - cw + kx, maxY, maxX - cw, maxY);
    line(minX + cw, maxY);
    this.addMappedCubic(m, minX + cw - kx, maxY, minX, maxY - ch + ky, minX, maxY - ch);
    line(minX, minY + ch);
    this.addMappedCubic(m, minX, minY + ch - ky, minX + cw - kx, minY, minX + cw, minY);
    line(maxX - cw, minY);
    this.addMappedCubic(m, maxX - cw + kx, minY, maxX, minY + ch - ky, maxX, minY + ch);
    this.close();
  }

  private addMappedCubic(m: Affine | undefined, c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    const c1 = mapped(m, c1x, c1y);
    const c2 = mapped(m, c2x, c2y);
    const end = mapped(m, x, y);
    this.cubicTo(c1[0], c1[1], c2[0], c2[1], end[0], end[1]);
  }

  /** CGPath(ellipseIn:transform:). */
  static ellipse(rect: Rect, m?: Affine): Path {
    const p = new Path();
    p.addEllipse(rect, m);
    return p;
  }

  /** CGPath(roundedRect:cornerWidth:cornerHeight:transform:). */
  static roundedRect(rect: Rect, cornerWidth: number, cornerHeight: number, m?: Affine): Path {
    const p = new Path();
    p.addRoundedRect(rect, cornerWidth, cornerHeight, m);
    return p;
  }
}

function mapped(m: Affine | undefined, x: number, y: number): [number, number] {
  return m === undefined ? [x, y] : [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty];
}

function standardized(rect: Rect): { minX: number; minY: number; maxX: number; maxY: number } {
  const x1 = rect.x + rect.width;
  const y1 = rect.y + rect.height;
  return {
    minX: rect.width < 0 ? x1 : rect.x,
    minY: rect.height < 0 ? y1 : rect.y,
    maxX: rect.width < 0 ? rect.x : x1,
    maxY: rect.height < 0 ? rect.y : y1,
  };
}

/**
 * fma(a, b, c) from basic operations (Dekker product plus Knuth sum), which is what CoreGraphics' arm64 build
 * computes where it writes a·b + c. The final sum can round twice in rare ties; path.test.ts bounds this against
 * an exact BigInt evaluation. Identical in every engine.
 */
export function fused(a: number, b: number, c: number): number {
  const p = a * b;
  const splitA = 134217729 * a;
  const aHigh = splitA - (splitA - a);
  const aLow = a - aHigh;
  const splitB = 134217729 * b;
  const bHigh = splitB - (splitB - b);
  const bLow = b - bHigh;
  const error = aHigh * bHigh - p + aHigh * bLow + aLow * bHigh + aLow * bLow;
  const sum = p + c;
  const shifted = sum - p;
  const rest = p - (sum - shifted) + (c - shifted);
  return sum + (rest + error);
}

// Bernstein evaluation in the order of SummitCableCar.swift:50 (quad) and :56 (cubic).
function quadAt(a: number, b: number, d: number, f: number): number {
  const u = 1 - f;
  return u * u * a + 2 * u * f * b + f * f * d;
}

function cubicAt(a: number, b: number, q: number, d: number, f: number): number {
  const u = 1 - f;
  return u * u * u * a + 3 * u * u * f * b + 3 * u * f * f * q + f * f * f * d;
}

// Parameters in (0, 1) where the derivative of one coordinate vanishes.
function quadExtrema(a: number, b: number, d: number): number[] {
  const denominator = a - 2 * b + d;
  if (denominator === 0) return [];
  const t = (a - b) / denominator;
  return t > 0 && t < 1 ? [t] : [];
}

function cubicExtrema(a: number, b: number, q: number, d: number): number[] {
  // B'(t)/3 = e0·(1−t)² + 2·e1·(1−t)·t + e2·t² = (e0 − 2e1 + e2)·t² + 2(e1 − e0)·t + e0;
  // the roots use the cancellation-free form q = −(B + sign(B)·√D)/2, t = q/A and t = C/q.
  const e0 = b - a;
  const e1 = q - b;
  const e2 = d - q;
  const qa = e0 - 2 * e1 + e2;
  const qb = 2 * (e1 - e0);
  const qc = e0;
  const roots: number[] = [];
  if (qa === 0) {
    if (qb !== 0) roots.push(-qc / qb);
  } else {
    const discriminant = qb * qb - 4 * qa * qc;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const s = qb < 0 ? -root : root;
      const half = -0.5 * (qb + s);
      if (half !== 0) roots.push(half / qa, qc / half);
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}
