// Curve flattening for the deterministic rasterizer (docs/plan.md, Abschnitt 7, WP-R1).
//
// CoreGraphics flattens internally when it fills and strokes; there is no public API to mirror. The evaluation
// order is SummitCableCar.swift:50 (quad) and :56 (cubic), the only place the Swift code flattens by hand.
// Segment counts are Wang's formula with the fixed constants of docs/plan.md §7: n = clamp(ceil(sqrt(c·dd/tol)),
// 1, 256), dd = largest second difference of the control polygon, c = 0.75 for a cubic and 0.25 for a quad.
// The default tolerance is the plan's 0.1 px for paths already in device space.
import { hypot } from '../swift/dmath';
import { swiftMax } from '../swift/minmax';
import { type Path, Verb } from './path';

export const DEFAULT_FLATTEN_TOLERANCE = 0.1;
export const MAX_CURVE_SEGMENTS = 256;

/** One subpath as a polyline. A closed polyline does not repeat its first point at the end. */
export interface Polyline {
  /** Flat x, y pairs. */
  readonly points: number[];
  readonly closed: boolean;
}

function segments(c: number, dd: number, tol: number): number {
  const n = Math.ceil(Math.sqrt((c * dd) / tol));
  if (n < 1) return 1;
  return n > MAX_CURVE_SEGMENTS ? MAX_CURVE_SEGMENTS : n;
}

/** Segment count of the quad a–b–d: sqrt(0.25·dd/tol). */
export function quadSegments(ax: number, ay: number, bx: number, by: number, dx: number, dy: number, tol: number): number {
  return segments(0.25, hypot(ax - 2 * bx + dx, ay - 2 * by + dy), tol);
}

/** Segment count of the cubic a–b–q–d: sqrt(0.75·dd/tol). */
export function cubicSegments(ax: number, ay: number, bx: number, by: number, qx: number, qy: number, dx: number, dy: number, tol: number): number {
  const dd = swiftMax(hypot(ax - 2 * bx + qx, ay - 2 * by + qy), hypot(bx - 2 * qx + dx, by - 2 * qy + dy));
  return segments(0.75, dd, tol);
}

/**
 * One polyline per subpath, curves replaced by chords. A lone Move gives a single-point open polyline, `M Z` a
 * single-point closed one; a segment after a Close (no implicit Move element) opens a new polyline at the
 * closed subpath's start.
 */
export function flatten(path: Path, tol: number = DEFAULT_FLATTEN_TOLERANCE): Polyline[] {
  const verbs = path.verbs;
  const coords = path.coords;
  const out: Polyline[] = [];
  let points: number[] | null = null;
  let startX = 0;
  let startY = 0;
  let x0 = 0;
  let y0 = 0;
  let k = 0;
  const open = (): number[] => {
    if (points === null) points = [startX, startY];
    return points;
  };
  for (let i = 0; i < verbs.length; i++) {
    switch (verbs[i]) {
      case Verb.Move:
        if (points !== null) out.push({ points, closed: false });
        startX = coords[k] as number;
        startY = coords[k + 1] as number;
        x0 = startX;
        y0 = startY;
        points = [startX, startY];
        k += 2;
        break;
      case Verb.Line: {
        const line = open();
        x0 = coords[k] as number;
        y0 = coords[k + 1] as number;
        line.push(x0, y0);
        k += 2;
        break;
      }
      case Verb.Quad: {
        const line = open();
        const bx = coords[k] as number;
        const by = coords[k + 1] as number;
        const dx = coords[k + 2] as number;
        const dy = coords[k + 3] as number;
        const n = quadSegments(x0, y0, bx, by, dx, dy, tol);
        for (let j = 1; j <= n; j++) {
          const f = j / n;
          const u = 1 - f;
          line.push(u * u * x0 + 2 * u * f * bx + f * f * dx, u * u * y0 + 2 * u * f * by + f * f * dy);
        }
        x0 = dx;
        y0 = dy;
        k += 4;
        break;
      }
      case Verb.Cubic: {
        const line = open();
        const bx = coords[k] as number;
        const by = coords[k + 1] as number;
        const qx = coords[k + 2] as number;
        const qy = coords[k + 3] as number;
        const dx = coords[k + 4] as number;
        const dy = coords[k + 5] as number;
        const n = cubicSegments(x0, y0, bx, by, qx, qy, dx, dy, tol);
        for (let j = 1; j <= n; j++) {
          const f = j / n;
          const u = 1 - f;
          line.push(
            u * u * u * x0 + 3 * u * u * f * bx + 3 * u * f * f * qx + f * f * f * dx,
            u * u * u * y0 + 3 * u * u * f * by + 3 * u * f * f * qy + f * f * f * dy,
          );
        }
        x0 = dx;
        y0 = dy;
        k += 6;
        break;
      }
      case Verb.Close:
        out.push({ points: open(), closed: true });
        points = null;
        x0 = startX;
        y0 = startY;
        break;
    }
  }
  if (points !== null) out.push({ points, closed: false });
  return out;
}
