// Ported from mac/Sources/BalloonStudio/NightFlight.swift @ 04553ee
//
// The drawing helpers of NightFlightArtwork.draw (:15-34), on GrayCanvas instead of a captured CGContext, for the
// relief artworks. Summit (WP-R5) warps its paths first and then draws them with these same canvas calls
// (SummitCableCar.swift:84-86, :105-119).
import { GrayCanvas } from '../raster/canvas';
import { type Point } from '../raster/affine';
import { type GradientOptions, GrayGradient } from '../raster/gradient';
import { Path, Verb } from '../raster/path';

/**
 * The context set up at NightFlight.swift:9-14: a `columns × rows` canvas whose user space is the artwork in mm.
 * SWIFT-DIFF: the flip (translateBy(0, rows) + scaleBy(1, −1)) is left out; canvas row 0 is the artwork bottom, as
 * memory row 0 is in Swift (docs/plan.md §7).
 */
export function artworkCanvas(width: number, height: number, columns: number, rows: number): GrayCanvas {
  const c = new GrayCanvas(columns, rows);
  c.scaleBy(columns / width, rows / height);
  return c;
}

/** NightFlight.swift:15-18. */
export function ellipse(c: GrayCanvas, x: number, y: number, rx: number, ry: number, level: number): void {
  c.setFillGray(level);
  c.fillEllipseIn({ x: x - rx, y: y - ry, width: rx * 2, height: ry * 2 });
}

/** NightFlight.swift:19-21. */
export function fill(c: GrayCanvas, path: Path, level: number): void {
  c.setFillGray(level);
  c.fillPath(path);
}

/**
 * NightFlight.swift:22-29, `high` at the center and `low` from `radius` on. Summit's `rounded` is the same draw with a
 * translate + scale between the clip and the gradient (SummitCableCar.swift:105-112), so it uses `radialGradient`.
 */
export function roundedFill(c: GrayCanvas, path: Path, center: Point, radius: number, high: number, low: number): void {
  c.save();
  c.clip(path);
  radialGradient(c, center, radius, high, low);
  c.restore();
}

/** The gradient of NightFlight.swift:24-27 inside the current clip. */
export function radialGradient(c: GrayCanvas, center: Point, radius: number, high: number, low: number): void {
  c.drawRadialGradient(new GrayGradient([high, low], [0, 1]), center.x, center.y, radius, AFTER_END);
}

const AFTER_END: GradientOptions = { drawsAfterEndLocation: true };

/** NightFlight.swift:30-33. The color, width and cap stay set afterwards, as they do in the Swift gstate. */
export function stroke(c: GrayCanvas, points: readonly Point[], level: number, line: number): void {
  c.setStrokeGray(level);
  c.setLineWidth(line);
  c.setLineCap('round');
  const path = new Path();
  const first = points[0] as Point;
  path.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = points[i] as Point;
    path.lineTo(p.x, p.y);
  }
  c.strokePath(path);
}

// ---- dashes --------------------------------------------------------------------------------------------------------

/**
 * Second difference (mm) below which a piece of a cubic counts as one chord. Fitted, not read from CoreGraphics: the
 * best value differs per envelope (classic 0.67, round 0.72, tall 0.73), so the true test is something close to this.
 * 0.72 has the smallest worst block over the three; see cgDashPath.
 */
const DASH_FLATNESS = 0.72;

type Cubic = readonly [number, number, number, number, number, number, number, number];

/**
 * CGPath.copy(dashingWithPhase: 0, lengths: [on, off]) (the same bytes as setLineDash + strokePath, measured) for paths
 * of moves and cubics, keeping the curves as cubics. Stroke the result with no dash set.
 *
 * SWIFT-DIFF: raster/dash.ts takes true arc length, which puts Night Flight's dashes up to 4 px off by the end of a
 * trail. CoreGraphics' length of a curve from t0 to t is the sum of the chords of a bisection of that piece, so it
 * falls short where the curve bends, and it starts again at t0 = t where a dash starts (but not where it ends). Measured
 * on macOS 26.6.2 with a scan of dash lengths on one cubic (residual ≤ 0.0026 mm with the right number of chords). When
 * CoreGraphics bisects is not known exactly; DASH_FLATNESS is a fit, and dash ends stay within 0.25 mm (about 1 px, pinned
 * against tests/fixtures/swift/cg-dash-trail.txt). CoreGraphics also stops its search for t at ~0.002 mm, not reproduced.
 */
export function cgDashPath(path: Path, on: number, off: number): Path {
  const out = new Path();
  let drawing = true;
  let remaining = on;
  const coords = path.coords;
  let c = 0;
  let x = 0;
  let y = 0;
  for (const verb of path.verbs) {
    if (verb === Verb.Move) {
      x = coords[c] as number;
      y = coords[c + 1] as number;
      c += 2;
      drawing = true;
      remaining = on;
      out.moveTo(x, y);
    } else if (verb === Verb.Cubic) {
      const curve: Cubic = [x, y, coords[c] as number, coords[c + 1] as number, coords[c + 2] as number, coords[c + 3] as number, coords[c + 4] as number, coords[c + 5] as number];
      c += 6;
      x = curve[6];
      y = curve[7];
      // The length so far is measured from `base`, where the last dash on this curve started.
      let base = 0;
      let done = 0;
      for (;;) {
        const target = done + remaining;
        const total = chordLength(curve, base, 1);
        if (total <= target) {
          remaining = target - total;
          if (drawing) addPiece(out, curve, base, 1);
          break;
        }
        let lo = base;
        let hi = 1;
        for (let i = 0; i < 40; i++) {
          const m = (lo + hi) / 2;
          if (chordLength(curve, base, m) < target) lo = m;
          else hi = m;
        }
        const t = (lo + hi) / 2;
        if (drawing) {
          addPiece(out, curve, base, t);
          drawing = false;
          remaining = off;
          done = target;
        } else {
          drawing = true;
          remaining = on;
          base = t;
          done = 0;
          const u = 1 - t;
          out.moveTo(
            u * u * u * curve[0] + 3 * u * u * t * curve[2] + 3 * u * t * t * curve[4] + t * t * t * curve[6],
            u * u * u * curve[1] + 3 * u * u * t * curve[3] + 3 * u * t * t * curve[5] + t * t * t * curve[7],
          );
        }
      }
    } else {
      throw new Error('cgDashPath: only moves and cubics');
    }
  }
  return out;
}

// CoreGraphics' length of the piece t0…t1, see cgDashPath.
function chordLength(curve: Cubic, t0: number, t1: number): number {
  const p = piece(curve, t0, t1);
  return bisectedChords(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], 0);
}

function bisectedChords(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, depth: number): number {
  const ax = x0 - 2 * x1 + x2;
  const ay = y0 - 2 * y1 + y2;
  const bx = x1 - 2 * x2 + x3;
  const by = y1 - 2 * y2 + y3;
  const limit = DASH_FLATNESS * DASH_FLATNESS;
  if (depth === 8 || (ax * ax + ay * ay <= limit && bx * bx + by * by <= limit)) {
    const dx = x3 - x0;
    const dy = y3 - y0;
    return Math.sqrt(dx * dx + dy * dy);
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
  return bisectedChords(x0, y0, x01, y01, x012, y012, mx, my, depth + 1) + bisectedChords(mx, my, x123, y123, x23, y23, x3, y3, depth + 1);
}

// The control points of the piece t0…t1 (blossoms).
function piece(curve: Cubic, t0: number, t1: number): Cubic {
  const blossom = (i: number, u: number, v: number, w: number): number => {
    const a = (curve[i] as number) + ((curve[i + 2] as number) - (curve[i] as number)) * u;
    const b = (curve[i + 2] as number) + ((curve[i + 4] as number) - (curve[i + 2] as number)) * u;
    const d = (curve[i + 4] as number) + ((curve[i + 6] as number) - (curve[i + 4] as number)) * u;
    const e = a + (b - a) * v;
    const f = b + (d - b) * v;
    return e + (f - e) * w;
  };
  return [
    blossom(0, t0, t0, t0),
    blossom(1, t0, t0, t0),
    blossom(0, t0, t0, t1),
    blossom(1, t0, t0, t1),
    blossom(0, t0, t1, t1),
    blossom(1, t0, t1, t1),
    blossom(0, t1, t1, t1),
    blossom(1, t1, t1, t1),
  ];
}

function addPiece(out: Path, curve: Cubic, t0: number, t1: number): void {
  const p = piece(curve, t0, t1);
  out.cubicTo(p[2], p[3], p[4], p[5], p[6], p[7]);
}
