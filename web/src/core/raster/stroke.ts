// CGPath.copy(strokingWithWidth:lineCap:lineJoin:miterLimit:) and the stroke step of CGContext.strokePath for the
// deterministic rasterizer (docs/plan.md, Abschnitt 7, WP-R1). Callers: SummitCableCar.swift:87-94 and :438-448,
// NightFlight.swift:30-33, :44-51, :154, :184-185, :200-201.
//
// The outline is not one contour but a union of parts, each a closed polygon of positive signed area (CCW in
// y-up): a rectangle per segment, a wedge per join, a disc per round cap. WP-R2 fills with exact winding, so
// nonzero gives the union with no conflation at the overlaps.
//
// SWIFT-DIFF: CoreGraphics returns a single contour with curves. The filled area agrees up to `tol`; the element
// list does not, and nothing in the Swift code reads it (the warp only maps its points).
//
// Measured on CoreGraphics (macOS 26.6.2; source: tests/fixtures/swift/probes/cg-stroke-dash.swift):
// - A lone Move draws nothing with any cap.
// - A zero-length subpath (M L to the same point, M Z, M L Z) draws nothing with butt caps, a disc of radius w/2
//   with round caps and, with square caps, a square of side w standing on its corner (bounding box w·√2).
// - A U-turn draws a half disc with a round join and nothing extra with miter (the limit is exceeded) or bevel.
// Miter rule as in PostScript: miter length / width = 1/cos(θ/2) for the turn angle θ, bevel above the limit.
import { acos, cos, PI, sin } from '../swift/dmath';
import { DEFAULT_FLATTEN_TOLERANCE, flatten } from './flatten';
import { Path } from './path';

export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'miter' | 'round' | 'bevel';

/** Stroke parameters; defaults as in a fresh CGContext (butt, miter, limit 10). */
export interface StrokeOptions {
  readonly width: number;
  readonly cap?: LineCap;
  readonly join?: LineJoin;
  readonly miterLimit?: number;
}

const MIN_DISC_SEGMENTS = 8;
const MAX_DISC_SEGMENTS = 64;

/** Chords of a full circle with sagitta `tol`: max(8, ceil(π/acos(1 − tol/r))) ≤ 64. */
export function discSegments(radius: number, tol: number): number {
  if (tol >= radius) return MIN_DISC_SEGMENTS;
  const n = Math.ceil(PI / acos(1 - tol / radius));
  if (n < MIN_DISC_SEGMENTS) return MIN_DISC_SEGMENTS;
  return n > MAX_DISC_SEGMENTS ? MAX_DISC_SEGMENTS : n;
}

function addPolygon(out: Path, points: readonly number[]): void {
  out.moveTo(points[0] as number, points[1] as number);
  for (let i = 2; i < points.length; i += 2) out.lineTo(points[i] as number, points[i + 1] as number);
  out.close();
}

function addDisc(out: Path, x: number, y: number, radius: number, segments: number): void {
  const points: number[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * PI * i) / segments;
    points.push(x + radius * cos(angle), y + radius * sin(angle));
  }
  addPolygon(out, points);
}

/** The rectangle around a–b with half width h, as a CCW polygon; (nx, ny) is the left unit normal of a→b. */
function addBand(out: Path, ax: number, ay: number, bx: number, by: number, nx: number, ny: number, h: number): void {
  addPolygon(out, [ax - nx * h, ay - ny * h, bx - nx * h, by - ny * h, bx + nx * h, by + ny * h, ax + nx * h, ay + ny * h]);
}

/**
 * The outer side of the join at (x, y) between unit directions d0 and d1, as a CCW polygon: pivot, outer corner of
 * the earlier edge in CCW order, the join's shape, the other outer corner.
 */
function addJoin(out: Path, x: number, y: number, d0x: number, d0y: number, d1x: number, d1y: number, h: number, join: LineJoin, miterLimit: number, discChords: number): void {
  const cross = d0x * d1y - d0y * d1x;
  const dot = d0x * d1x + d0y * d1y;
  if (cross === 0 && dot > 0) return;
  // Unit normals of the outer side: right of the path on a left turn, left of it on a right turn. `from` → `to`
  // runs counter-clockwise around the pivot.
  const left = cross > 0 || (cross === 0 && dot < 0);
  const fromX = left ? d0y : -d1y;
  const fromY = left ? -d0x : d1x;
  const toX = left ? d1y : -d0y;
  const toY = left ? -d1x : d0x;
  const points = [x, y, x + fromX * h, y + fromY * h];
  if (join === 'round') {
    const turn = acos(dot < -1 ? -1 : dot > 1 ? 1 : dot);
    const chords = Math.ceil((discChords * turn) / (2 * PI));
    for (let i = 1; i < chords; i++) {
      const angle = (turn * i) / chords;
      const c = cos(angle);
      const s = sin(angle);
      points.push(x + (fromX * c - fromY * s) * h, y + (fromX * s + fromY * c) * h);
    }
  } else if (join === 'miter' && 1 + dot > 0 && 2 / (1 + dot) <= miterLimit * miterLimit) {
    points.push(x + ((fromX + toX) * h) / (1 + dot), y + ((fromY + toY) * h) / (1 + dot));
  }
  points.push(x + toX * h, y + toY * h);
  if (cross !== 0 || points.length > 6) addPolygon(out, points);
}

/**
 * The stroke of `path` as a line-only path of positively oriented parts whose nonzero fill is the stroked area.
 * `tol` is the flatness in the path's own space (docs/plan.md §7: 0.1 px / largest CTM scale on the canvas, 0.02 mm
 * for Summit's local strokes). Curves are flattened with the same tolerance.
 */
export function strokePath(path: Path, options: StrokeOptions, tol: number = DEFAULT_FLATTEN_TOLERANCE): Path {
  const out = new Path();
  const width = options.width;
  if (!(width > 0)) return out;
  const cap = options.cap ?? 'butt';
  const join = options.join ?? 'miter';
  const miterLimit = options.miterLimit ?? 10;
  const h = width / 2;
  const chords = discSegments(h, tol);

  for (const line of flatten(path, tol)) {
    const raw = line.points;
    if (raw.length === 2 && !line.closed) continue;

    // Segments between distinct points; a closed polyline also gets the way back to its first point.
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const x = raw[i] as number;
      const y = raw[i + 1] as number;
      const n = xs.length;
      if (n === 0 || x !== xs[n - 1] || y !== ys[n - 1]) {
        xs.push(x);
        ys.push(y);
      }
    }
    if (line.closed && xs.length > 1 && xs[0] === xs[xs.length - 1] && ys[0] === ys[ys.length - 1]) {
      xs.pop();
      ys.pop();
    }

    const count = xs.length;
    const x0 = xs[0] as number;
    const y0 = ys[0] as number;
    if (count === 1) {
      if (cap === 'round') {
        addDisc(out, x0, y0, h, chords);
      } else if (cap === 'square') {
        const r = h * Math.SQRT2;
        addPolygon(out, [x0 + r, y0, x0, y0 + r, x0 - r, y0, x0, y0 - r]);
      }
      continue;
    }

    const segmentCount = line.closed ? count : count - 1;
    const dx: number[] = [];
    const dy: number[] = [];
    for (let i = 0; i < segmentCount; i++) {
      const j = (i + 1) % count;
      const ex = (xs[j] as number) - (xs[i] as number);
      const ey = (ys[j] as number) - (ys[i] as number);
      const length = Math.sqrt(ex * ex + ey * ey);
      const ux = ex / length;
      const uy = ey / length;
      dx.push(ux);
      dy.push(uy);
      addBand(out, xs[i] as number, ys[i] as number, xs[j] as number, ys[j] as number, -uy, ux, h);
    }
    const firstJoin = line.closed ? 0 : 1;
    for (let i = firstJoin; i < segmentCount; i++) {
      const previous = (i + segmentCount - 1) % segmentCount;
      addJoin(out, xs[i] as number, ys[i] as number, dx[previous] as number, dy[previous] as number, dx[i] as number, dy[i] as number, h, join, miterLimit, chords);
    }
    if (line.closed) continue;

    const xn = xs[count - 1] as number;
    const yn = ys[count - 1] as number;
    if (cap === 'round') {
      addDisc(out, x0, y0, h, chords);
      addDisc(out, xn, yn, h, chords);
    } else if (cap === 'square') {
      const ax = dx[0] as number;
      const ay = dy[0] as number;
      const bx = dx[segmentCount - 1] as number;
      const by = dy[segmentCount - 1] as number;
      addBand(out, x0 - ax * h, y0 - ay * h, x0, y0, -ay, ax, h);
      addBand(out, xn, yn, xn + bx * h, yn + by * h, -by, bx, h);
    }
  }
  return out;
}
