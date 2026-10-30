// Ported from mac/Sources/BalloonStudio/SummitCableCar.swift @ 04553ee
//
// Summit Cable Car: two summits half a turn apart, a timber station on each peak and the cable swinging between them in
// two swags; a vintage Swiss cabin climbs each rise. Motifs are laid out in physical millimetres around their own meridian
// and warped onto the panorama, so they keep their proportions where the envelope narrows towards the neck. The scene was
// drawn 1:1 for the classic envelope. Other shapes scale heights with the artwork height and motif sizes with the smaller
// of height and circumference. Gray values are sculpted height, never filament colors: far things low, near things high.
// The order of the draw calls is the Swift order, because later layers paint over earlier ones and the gradient dither is
// anchored at each clip.
//
// SWIFT-DIFF: a CGContext has one current path; here fills, clips and strokes take the path as an argument, see
// raster/canvas.ts. The flip lines (:21) are left out; canvas row 0 is the artwork bottom, as memory row 0 is in Swift.
import { type ReliefArtwork, fieldFromBytes } from '../patterns/raster';
import { type Affine, type Point, IDENTITY, apply, concat, determinant, rotatedBy, scaledBy, translation } from '../raster/affine';
import { type LineCap, GrayCanvas } from '../raster/canvas';
import { GrayGradient } from '../raster/gradient';
import { Path, Verb } from '../raster/path';
import { strokePath as strokedPath } from '../raster/stroke';
import { acos, atan, atan2, cos, exp, hypot, PI, sin } from '../swift/dmath';
import { swiftMax, swiftMin } from '../swift/minmax';
import { intCeil, rounded as roundedHalfAway } from '../swift/rounding';
import { artworkCanvas, cgDashPath, radialGradient } from './helpers';

/** The classic envelope's artwork (:12). */
export const designWidth = 531.56;
export const designHeight = 152.5;

/** Device pixels of chord error the outlines of `line` and `strokePath` may have (docs/plan.md §14). */
const STROKE_DEVICE_TOLERANCE = 0.03;

/**
 * The flatness of cgDashPath for the hiking trail: a fit to CoreGraphics' dash ends on this one curve, which is the same
 * on every envelope because it is dashed in motif coordinates. Ends stay within 0.13 mm from 0.43 to 0.47
 * (tests/fixtures/swift/cg-dash-summit-trail.txt); Night Flight's 0.72 gives 0.2 mm and up to twice the worst tile.
 */
const TRAIL_DASH_FLATNESS = 0.45;

const P = (x: number, y: number): Point => ({ x, y });

// Argument order of CGMutablePath.addCurve(to:control1:control2:).
function curve(path: Path, to: Point, control1: Point, control2: Point): void {
  path.cubicTo(control1.x, control1.y, control2.x, control2.y, to.x, to.y);
}

// Argument order of CGMutablePath.addQuadCurve(to:control:).
function quad(path: Path, to: Point, control: Point): void {
  path.quadTo(control.x, control.y, to.x, to.y);
}

/** The CGContext bytes of SummitCableCarArtwork.draw, before the /255 of :468; row 0 is the artwork bottom. */
export function summitCableCarBytes(width: number, height: number, _diameter: number, columns: number, rows: number, radius: (y: number) => number): Uint8Array {
  const reach = width / (2 * PI);
  const sy = height / designHeight;
  const sm = swiftMin(sy, width / designWidth);
  const c: GrayCanvas = artworkCanvas(width, height, columns, rows);
  const pixelsPerMm = swiftMax(columns / width, rows / height);

  // ---- warp machinery ------------------------------------------------------------
  let meridian = 0.0; // panorama position of the current motif
  let local: Affine = IDENTITY; // motif coordinates -> (mm from meridian, mm above bottom)
  const k = (y: number): number => reach / swiftMax(8, radius(y));
  const map = (p: Point): Point => P(meridian * width + p.x * k(p.y), p.y);
  const warp = (path: Path): Path => {
    const source = path.transformed(local);
    const out = new Path();
    let current = P(0, 0);
    let start = P(0, 0);
    const segment = (n: number, f: (t: number) => Point): void => {
      for (let i = 1; i <= n; i++) {
        const q = map(f(i / n));
        out.lineTo(q.x, q.y);
      }
    };
    const dist = (a: Point, b: Point): number => hypot(a.x - b.x, a.y - b.y);
    source.forEach((e) => {
      const p = e.points;
      switch (e.type) {
        case Verb.Move: {
          current = p[0] as Point;
          start = current;
          const q = map(current);
          out.moveTo(q.x, q.y);
          break;
        }
        case Verb.Line: {
          const a = current;
          const b = p[0] as Point;
          segment(swiftMax(1, intCeil(dist(a, b) / 0.8)), (f) => P(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f));
          current = b;
          break;
        }
        case Verb.Quad: {
          const a = current;
          const b = p[0] as Point;
          const d = p[1] as Point;
          segment(swiftMax(4, intCeil((dist(a, b) + dist(b, d)) / 0.6)), (f) => {
            const u = 1 - f;
            return P(u * u * a.x + 2 * u * f * b.x + f * f * d.x, u * u * a.y + 2 * u * f * b.y + f * f * d.y);
          });
          current = d;
          break;
        }
        case Verb.Cubic: {
          const a = current;
          const b = p[0] as Point;
          const q = p[1] as Point;
          const d = p[2] as Point;
          segment(swiftMax(4, intCeil((dist(a, b) + dist(b, q) + dist(q, d)) / 0.6)), (f) => {
            const u = 1 - f;
            return P(u * u * u * a.x + 3 * u * u * f * b.x + 3 * u * f * f * q.x + f * f * f * d.x, u * u * u * a.y + 3 * u * u * f * b.y + 3 * u * f * f * q.y + f * f * f * d.y);
          });
          current = d;
          break;
        }
        case Verb.Close: {
          const a = current;
          const b = start;
          if (dist(a, b) > 1e-6) segment(swiftMax(1, intCeil(dist(a, b) / 0.8)), (f) => P(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f));
          out.close();
          current = start;
          break;
        }
      }
    });
    return out;
  };
  // A motif sits at panorama position u, y mm (classic scale) above the bottom. Sizes follow
  // the motif scale; a stretched motif follows the artwork height instead, like the mountains.
  const motif = (u: number, y: number, options: { readonly scale?: number; readonly rotation?: number; readonly mirror?: boolean; readonly stretch?: boolean }, body: () => void): void => {
    const s = options.scale ?? 1;
    const r = options.rotation ?? 0;
    const mirror = options.mirror ?? false;
    const stretch = options.stretch ?? false;
    const savedLocal = local;
    const savedMeridian = meridian;
    meridian = u;
    local = scaledBy(rotatedBy(translation(0, y * sy), r), (mirror ? -s : s) * sm, s * (stretch ? sy : sm));
    body();
    local = savedLocal;
    meridian = savedMeridian;
  };
  // Nested placement inside a motif, in the motif's own coordinates.
  const place = (x: number, y: number, r: number, body: () => void, s = 1): void => {
    const saved = local;
    local = concat(scaledBy(rotatedBy(translation(x, y), r), s, s), saved);
    body();
    local = saved;
  };
  const fill = (path: Path, level: number): void => {
    c.setFillGray(level);
    c.fillPath(warp(path));
  };
  const scaleOf = (t: Affine): number => Math.sqrt(Math.abs(determinant(t)));
  // SWIFT-DIFF: the outline is many positive polygons instead of CoreGraphics' one contour with curves (raster/stroke.ts).
  // They are warped like any other path, and a mirrored motif (none strokes) would turn all of them alike. The tolerance
  // is in motif space, before `local`; docs/plan.md §14 replaces the 0.02 mm of §7.
  const outlined = (p: Path, cap: LineCap, w: number): Path => strokedPath(p, { width: w, cap, join: 'round', miterLimit: 4 }, STROKE_DEVICE_TOLERANCE / (pixelsPerMm * scaleOf(local)));
  const line = (pts: readonly (readonly [number, number])[], level: number, w: number, cap: LineCap = 'round'): void => {
    const p = new Path();
    const first = pts[0] as readonly [number, number];
    p.moveTo(first[0], first[1]);
    for (let i = 1; i < pts.length; i++) {
      const q = pts[i] as readonly [number, number];
      p.lineTo(q[0], q[1]);
    }
    fill(outlined(p, cap, w), level);
  };
  const strokePath = (p: Path, level: number, w: number): void => {
    fill(outlined(p, 'round', w), level);
  };
  const ellipse = (x: number, y: number, rx: number, ry: number, level: number): void => {
    fill(Path.ellipse({ x: x - rx, y: y - ry, width: 2 * rx, height: 2 * ry }), level);
  };
  const rect = (x: number, y: number, w: number, h: number, r: number, level: number): void => {
    fill(Path.roundedRect({ x, y, width: w, height: h }, swiftMin(r, w / 2 - 0.01), swiftMin(r, h / 2 - 0.01)), level);
  };
  const clip = (path: Path, body: () => void): void => {
    c.save();
    c.clip(warp(path));
    body();
    c.restore();
  };
  const localMapped = (x: number, y: number): Point => map(apply(local, x, y));
  const rounded = (path: Path, cx: number, cy: number, r: number, high: number, low: number): void => {
    const p = localMapped(cx, cy);
    c.save();
    c.clip(warp(path));
    c.translateBy(p.x, p.y);
    c.scaleBy(k(p.y), 1);
    radialGradient(c, P(0, 0), r * scaleOf(local), high, low);
    c.restore();
  };
  const linear = (path: Path, a: readonly [number, number], b: readonly [number, number], from: number, to: number): void => {
    const p = localMapped(a[0], a[1]);
    const q = localMapped(b[0], b[1]);
    c.save();
    c.clip(warp(path));
    c.drawLinearGradient(new GrayGradient([from, to], [0, 1]), p.x, p.y, q.x, q.y, { drawsBeforeStartLocation: true, drawsAfterEndLocation: true });
    c.restore();
  };

  // ---- layout (u relative to each half's hero meridian, y in mm above the bottom) ----
  // Two summits stand 180° apart; the cable hangs between their stations in two swags
  // and each cabin is climbing the rising half of its swag.
  const stationU = 0.07;
  const stationY = 119.0;
  const cabinU = -0.075;
  const cabinScale = 0.84;
  const sag = 36.0;
  const chaletU = -0.175;
  const sideU = -0.19;
  const moonU = -0.125;
  const cloudU = 0.215;
  const cloud2U = -0.25;

  const bump = (d: number, w: number): number => {
    const x = d - 0.5 * roundedHalfAway(d / 0.5);
    return exp(-(x / w) * (x / w));
  };
  const groundPath = (h: number, f: (d: number) => number): Path => {
    const p = new Path();
    p.moveTo(-0.02 * width, 0);
    const n = 700;
    for (let i = 0; i <= n; i++) {
      const u = -0.02 + (1.04 * i) / n;
      p.lineTo(u * width, f(u - h) * sy);
    }
    p.lineTo(1.02 * width, 0);
    p.close();
    return p;
  };
  const groundFill = (path: Path, level: number): void => {
    // Drawn straight onto the panorama; a short ramp keeps the lower edge free of a ledge.
    c.save();
    c.clip(path);
    c.drawLinearGradient(new GrayGradient([0, level], [0, 1]), 0, 0, 0, 7 * sy, { drawsAfterEndLocation: true });
    c.restore();
  };

  const mountain = (h: number): void => {
    motif(h + stationU, 0, { stretch: true }, () => {
      const top = stationY;
      const o = new Path();
      o.moveTo(-96, 14);
      curve(o, P(-36, 42), P(-66, 18), P(-44, 28));
      curve(o, P(-28, 94), P(-30, 56), P(-32, 80));
      curve(o, P(-15, top - 1), P(-25, 104), P(-20, top - 6));
      curve(o, P(15, top - 1), P(-6, top + 2.5), P(6, top + 2.5));
      curve(o, P(28, 98), P(20, top - 6), P(24, 106));
      curve(o, P(50, 58), P(33, 86), P(42, 68));
      curve(o, P(98, 18), P(60, 44), P(78, 26));
      o.lineTo(98, 0);
      o.lineTo(-96, 0);
      o.close();
      // Paper-cut facets: the shaded body, a broad lit face up to a crisp ridge, a deeper
      // shadow face behind a second ridge. Each step casts its own small shadow.
      fill(o, 0.36);
      const lit = new Path();
      lit.moveTo(-120, 0);
      lit.lineTo(-120, top + 10);
      lit.lineTo(1, top + 10);
      curve(lit, P(9, 88), P(3, 108), P(10, 98));
      curve(lit, P(2, 52), P(8, 76), P(1, 64));
      curve(lit, P(-6, 0), P(3, 36), P(-2, 16));
      lit.close();
      clip(o, () => linear(lit, [-40, 50], [0, top], 0.52, 0.58));
      const deep = new Path();
      deep.moveTo(16, top - 2);
      curve(deep, P(30, 80), P(24, 104), P(30, 92));
      curve(deep, P(34, 30), P(30, 62), P(36, 46));
      deep.lineTo(120, 0);
      deep.lineTo(120, top + 10);
      deep.close();
      clip(o, () => fill(deep, 0.27));
      // A buttress leans against the foot of the lit face. Its ridge runs diagonally,
      // so the face above it stays one broad plane instead of a narrow tongue.
      const shoulder = new Path();
      shoulder.moveTo(-120, 0);
      shoulder.lineTo(-120, 60);
      curve(shoulder, P(-36, 50), P(-70, 66), P(-48, 58));
      curve(shoulder, P(-22, 0), P(-28, 36), P(-22, 16));
      shoulder.close();
      clip(o, () => clip(lit, () => fill(shoulder, 0.47)));
      // A lower spur on the shadow side catches a little light as well.
      const spur = new Path();
      spur.moveTo(120, 0);
      spur.lineTo(120, 52);
      curve(spur, P(44, 48), P(90, 58), P(60, 54));
      curve(spur, P(60, 0), P(34, 40), P(48, 18));
      spur.close();
      clip(o, () => clip(deep, () => fill(spur, 0.33)));
      // Snow mantle over the summit with a scalloped hem and a tongue down the ridge.
      const snow = new Path();
      snow.moveTo(-40, top + 20);
      snow.lineTo(-40, top - 22);
      quad(snow, P(-27, top - 34), P(-29, top - 22));
      quad(snow, P(-18, top - 22), P(-21, top - 32));
      quad(snow, P(-9, top - 30), P(-14, top - 21));
      quad(snow, P(0, top - 21), P(-4, top - 30));
      quad(snow, P(10, top - 38), P(8, top - 22));
      quad(snow, P(18, top - 23), P(15, top - 36));
      quad(snow, P(28, top - 30), P(22, top - 21));
      snow.lineTo(44, top - 30);
      snow.lineTo(44, top + 20);
      snow.close();
      clip(o, () =>
        clip(snow, () => {
          fill(o, 0.72);
          clip(deep, () => fill(o, 0.66));
          clip(lit, () => linear(o, [-24, top - 26], [0, top], 0.82, 0.88));
        }),
      );
      // A dashed zigzag climbs the lit face: the family's hiking trail.
      const trail = summitTrail(top);
      clip(o, () => clip(lit, () => strokePath(cgDashPath(trail, 3.4, 2.8, TRAIL_DASH_FLATNESS), 0.32, 1.4)));
    });
  };

  // A lower snow-tipped peak in the saddle, behind the swag's lowest point.
  const sidePeak = (u: number): void => {
    motif(u, 0, { stretch: true }, () => {
      const o = new Path();
      o.moveTo(-70, 14);
      curve(o, P(-24, 46), P(-50, 20), P(-34, 34));
      curve(o, P(0, 74), P(-16, 56), P(-6, 70));
      curve(o, P(26, 48), P(6, 70), P(16, 58));
      curve(o, P(70, 14), P(36, 36), P(52, 20));
      o.lineTo(70, 0);
      o.lineTo(-70, 0);
      o.close();
      fill(o, 0.28);
      const lit = new Path();
      lit.moveTo(-80, 0);
      lit.lineTo(-80, 90);
      lit.lineTo(0, 90);
      curve(lit, P(4, 52), P(2, 70), P(5, 60));
      curve(lit, P(-4, 0), P(3, 40), P(-2, 16));
      lit.close();
      clip(o, () => fill(lit, 0.35));
      const snow = new Path();
      snow.moveTo(-20, 80);
      snow.lineTo(-20, 60);
      quad(snow, P(-8, 62), P(-14, 57));
      quad(snow, P(1, 57), P(-4, 62));
      quad(snow, P(10, 61), P(6, 56));
      quad(snow, P(20, 58), P(15, 62));
      snow.lineTo(20, 80);
      snow.close();
      clip(o, () => {
        fill(snow, 0.44);
        clip(lit, () => fill(snow, 0.5));
      });
    });
  };

  const conifer = (u: number, y: number, size: number, level: number): void => {
    motif(u, y, { scale: size }, () => {
      const p = new Path();
      p.moveTo(0, 20);
      quad(p, P(4.2, 13.5), P(2.6, 17.5));
      p.lineTo(2.6, 13.5);
      quad(p, P(6.2, 7.2), P(4.8, 11));
      p.lineTo(4.2, 7.2);
      quad(p, P(7.8, 1.6), P(6.6, 4.6));
      p.lineTo(-7.8, 1.6);
      quad(p, P(-4.2, 7.2), P(-6.6, 4.6));
      p.lineTo(-6.2, 7.2);
      quad(p, P(-2.6, 13.5), P(-4.8, 11));
      p.lineTo(-4.2, 13.5);
      quad(p, P(0, 20), P(-2.6, 17.5));
      p.close();
      rect(-1.3, -1.5, 2.6, 4, 0.6, level - 0.06);
      rounded(p, -1.5, 12, 16, level + 0.06, level - 0.06);
    });
  };

  const bullwheel = (x: number, y: number, r: number, level: number): void => {
    ellipse(x, y, r, r, level);
    ellipse(x, y, r - 1.4, r - 1.4, level - 0.3);
    for (const a of [0.0, PI / 3, (2 * PI) / 3]) {
      line(
        [
          [x + cos(a) * (r - 1), y + sin(a) * (r - 1)],
          [x - cos(a) * (r - 1), y - sin(a) * (r - 1)],
        ],
        level - 0.06,
        1.0,
      );
    }
    ellipse(x, y, 1.6, 1.6, level + 0.04);
  };

  // Summit station: a timber hall astride the peak; the cable runs through both gables.
  const wheelX = 10.5;
  const wheelR = 4.0;
  const wheelY = 6.0;
  const summitStation = (h: number): void => {
    motif(h + stationU, stationY - 0.5, {}, () => {
      rect(-16, 0, 32, 14, 1.2, 0.92);
      const roofFace = new Path();
      roofFace.moveTo(-19, 13);
      roofFace.lineTo(-8, 21.5);
      roofFace.lineTo(8, 21.5);
      roofFace.lineTo(19, 13);
      roofFace.lineTo(17, 11.4);
      roofFace.lineTo(-17, 11.4);
      roofFace.close();
      linear(roofFace, [0, 21.5], [0, 11], 1.0, 0.95);
      line(
        [
          [-17.8, 12.6],
          [-7.6, 20.6],
          [7.6, 20.6],
          [17.8, 12.6],
        ],
        0.86,
        0.9,
      );
      for (const side of [-1.0, 1.0]) {
        rect(side * wheelX - 5.6, 0.8, 11.2, 10.6, 2, 0.62);
        bullwheel(side * wheelX, wheelY, wheelR, 0.96);
      }
      rect(-2.6, 0, 5.2, 8.5, 1.8, 0.66);
      ellipse(0, 15.6, 2.2, 2.2, 0.72);
      ellipse(0, 15.6, 1.3, 1.3, 1.0);
      line(
        [
          [0, 21.3],
          [0, 30.5],
        ],
        0.94,
        1.2,
      );
      const flag = new Path();
      flag.moveTo(0.4, 30.4);
      curve(flag, P(8, 27.8), P(3, 31.4), P(5.6, 27.2));
      flag.lineTo(0.4, 26.2);
      flag.close();
      fill(flag, 0.96);
    });
  };

  // A chalet in the valley with lit windows.
  const chalet = (u: number, y: number): void => {
    motif(u, y, {}, () => {
      rect(-9, 0, 18, 11, 1, 0.8);
      const roof = new Path();
      roof.moveTo(-12, 10);
      roof.lineTo(0, 19);
      roof.lineTo(12, 10);
      roof.lineTo(10, 8.6);
      roof.lineTo(-10, 8.6);
      roof.close();
      linear(roof, [0, 19], [0, 9], 0.92, 0.82);
      rect(4.5, 13.5, 2.6, 5, 0.5, 0.84);
      rect(-6.5, 4, 5, 4.4, 1, 0.54);
      line(
        [
          [-4, 4],
          [-4, 8.4],
        ],
        0.8,
        0.8,
      );
      rect(2, 0, 4.2, 7, 1.4, 0.58);
      ellipse(0, 13.2, 1.5, 1.5, 0.56);
    });
  };

  const cabin = (u: number, y: number, slope: number): void => {
    motif(u, y / sy, { scale: cabinScale }, () => {
      // y arrives in artwork millimetres from the swag
      // Carriage riding the cable, tilted with it.
      place(0, 0, slope, () => {
        rect(-13, -3.2, 26, 6.4, 3, 0.88);
        for (const x of [-7.0, 7.0]) {
          ellipse(x, 1.6, 3.6, 3.6, 0.97);
          ellipse(x, 1.6, 1.4, 1.4, 0.72);
        }
        for (const x of [-11.0, 0, 11.0]) ellipse(x, -1.6, 0.7, 0.7, 0.7);
      });
      // Hanger, pivot and the yoke on the roof.
      rect(-1.8, -16, 3.6, 15, 1.2, 0.9);
      ellipse(0, -1.5, 2.4, 2.4, 0.95);
      ellipse(0, -1.5, 1, 1, 0.72);
      rect(-8, -17.6, 16, 3, 1.4, 0.9);
      // Roof: a rounded cap overhanging the body, with a lantern at the front.
      const roof = new Path();
      roof.moveTo(-28, -23);
      curve(roof, P(-21, -16), P(-28, -19), P(-25, -16));
      roof.lineTo(21, -16);
      curve(roof, P(28, -23), P(25, -16), P(28, -19));
      roof.close();
      rounded(roof, -4, -17, 32, 0.97, 0.86);
      ellipse(23, -15.2, 2.5, 2.5, 0.98);
      ellipse(23, -15.2, 1.2, 1.2, 0.8);
      // Body: wider at the roof than at the floor, like the classic Swiss cabins.
      const body = new Path();
      body.moveTo(-26, -23);
      body.lineTo(26, -23);
      curve(body, P(20, -58), P(25, -36), P(22.5, -49));
      curve(body, P(12, -64), P(18.8, -62), P(16, -64));
      body.lineTo(-12, -64);
      curve(body, P(-20, -58), P(-16, -64), P(-18.8, -62));
      curve(body, P(-26, -23), P(-22.5, -49), P(-25, -36));
      body.close();
      rounded(body, -7, -33, 50, 0.97, 0.8);
      // Recessed window band following the slanted sides, three panes and passengers.
      const glass = new Path();
      glass.moveTo(-19, -27);
      glass.lineTo(19, -27);
      quad(glass, P(22.2, -30.5), P(22.6, -27));
      glass.lineTo(20.4, -41.5);
      quad(glass, P(17, -44), P(20, -44));
      glass.lineTo(-17, -44);
      quad(glass, P(-20.4, -41.5), P(-20, -44));
      glass.lineTo(-22.2, -30.5);
      quad(glass, P(-19, -27), P(-22.6, -27));
      glass.close();
      fill(glass, 0.5);
      clip(glass, () => {
        ellipse(-13.5, -33.6, 3.3, 3.5, 0.76);
        ellipse(-13.5, -42.5, 6.4, 4.6, 0.72);
        ellipse(0, -35.6, 3.0, 3.1, 0.8);
        ellipse(0, -43.4, 5.2, 4.0, 0.76);
        line(
          [
            [3.2, -40],
            [5.0, -32.6],
          ],
          0.8,
          2.0,
        );
        ellipse(5.3, -31.5, 1.6, 1.6, 0.82);
        ellipse(13.2, -36.4, 3.2, 3.0, 0.76);
        ellipse(16.5, -37.6, 2.3, 1.6, 0.76);
        place(10.8, -36.2, 0.35, () => ellipse(0, 0, 1.3, 2.6, 0.7));
        ellipse(13.6, -43.2, 5.6, 3.6, 0.72);
      });
      line(
        [
          [-6.8, -44],
          [-7.2, -27],
        ],
        0.94,
        2.2,
        'butt',
      );
      line(
        [
          [6.8, -44],
          [7.2, -27],
        ],
        0.94,
        2.2,
        'butt',
      );
      // Waist band, door, edelweiss badge, rivets and a keel rail.
      const band = new Path();
      band.moveTo(-30, -47.5);
      band.lineTo(30, -47.5);
      band.lineTo(30, -50.5);
      band.lineTo(-30, -50.5);
      band.close();
      clip(body, () => fill(band, 0.68));
      strokePath(Path.roundedRect({ x: 7, y: -61, width: 10, height: 10.5 }, 2, 2), 0.66, 0.9);
      ellipse(15, -56, 0.9, 0.9, 0.7);
      place(-8, -56.2, 0, () => {
        for (let i = 0; i < 6; i++) {
          const a = (i * PI) / 3 + PI / 2;
          place(cos(a) * 2.5, sin(a) * 2.5, a - PI / 2, () => ellipse(0, 0, 1.2, 2.4, 0.74));
        }
        ellipse(0, 0, 1.3, 1.3, 0.97);
      });
      // stride(from: -15, through: 3, by: 4.5)
      for (const x of [-15, -10.5, -6, -1.5, 3]) ellipse(x, -61.2, 0.75, 0.75, 0.68);
      rect(-14, -67.2, 28, 4, 2, 0.86);
    });
  };

  const cloud = (u: number, y: number, s: number, mirror = false): void => {
    motif(u, y, { scale: s, mirror }, () => {
      const o = new Path();
      o.moveTo(-20, -7);
      curve(o, P(-21, 8), P(-32, -6), P(-31, 8));
      curve(o, P(-9, 16), P(-24, 19), P(-14, 24));
      curve(o, P(12, 15), P(-9, 32), P(14, 30));
      curve(o, P(23, 6), P(23, 21), P(30, 14));
      curve(o, P(21, -7), P(34, 6), P(33, -7));
      curve(o, P(-20, -7), P(10, -10), P(-9, -10));
      o.close();
      rounded(o, 0, 7, 34, 0.82, 0.66);
    });
  };

  const star = (u: number, y: number, r: number): void => {
    motif(u, y, {}, () => {
      const p = new Path();
      for (let i = 0; i < 10; i++) {
        const a = PI / 2 + (i * PI) / 5;
        const d = i % 2 === 0 ? r : r * 0.46;
        if (i === 0) p.moveTo(cos(a) * d, sin(a) * d);
        else p.lineTo(cos(a) * d, sin(a) * d);
      }
      p.close();
      fill(p, 0.8);
    });
  };

  const moon = (u: number, y: number, r: number): void => {
    motif(u, y, {}, () => {
      // Join the two circle arcs at their exact intersections, as Night Flight does.
      const dx = 0.48;
      const dy = 0.28;
      const inner = 0.89;
      const d = hypot(dx, dy);
      const direction = atan2(dy, dx);
      const half = acos((1 - inner * inner + d * d) / (2 * d));
      const upper = direction + half;
      const lower = direction - half;
      const m = new Path();
      m.addArc(P(0, 0), r, upper, lower + 2 * PI, false);
      m.addArc(P(dx * r, dy * r), inner * r, atan2(sin(lower) - dy, cos(lower) - dx), atan2(sin(upper) - dy, cos(upper) - dx), true);
      m.close();
      fill(m, 0.88);
    });
  };

  const halves: number[] = [];
  for (const h of [0.02, 0.52]) {
    for (let wrap = -1; wrap <= 1; wrap++) halves.push(h + wrap);
  }
  // Back hills: one range all round, rising behind each mountain.
  groundFill(
    groundPath(0.02, (d) => 26 + 5 * cos(4 * PI * d * 3) + 10 * bump(d - stationU, 0.12) + 6 * bump(d - cabinU, 0.05)),
    0.22,
  );
  for (const h of halves) sidePeak(h + sideU);
  for (const h of halves) mountain(h);
  // Front meadow in front of the mountain bases.
  groundFill(
    groundPath(0.02, (d) => 11 + 2.5 * cos(4 * PI * d * 5) + 5 * bump(d - chaletU, 0.05) + 4 * bump(d - stationU - 0.05, 0.05)),
    0.56,
  );
  // The cable: a parabolic swag from one summit station to the next, drawn on the panorama.
  const wheelTop = (stationY - 0.5) * sy + (wheelY + wheelR) * sm;
  const half = 0.25 - (wheelX * sm * k(wheelTop)) / width; // the swag spans ±0.25 minus the stations' wheel offset
  const swagY = (d: number): number => {
    // d: u relative to this half's lowest point
    const f = d / half;
    return wheelTop - sag * sy * (1 - f * f);
  };
  for (const h of halves) {
    const low = h + stationU - 0.25;
    const p = new Path();
    for (let i = 0; i <= 240; i++) {
      const d = -half + (2 * half * i) / 240;
      const qx = (low + d) * width;
      const qy = swagY(d);
      if (i === 0) p.moveTo(qx, qy);
      else p.lineTo(qx, qy);
    }
    c.setStrokeGray(0.88);
    c.setLineWidth(swiftMax(1.2, 2.1 * sm));
    c.setLineCap('round');
    c.setLineJoin('round');
    c.strokePath(p);
  }
  for (const h of halves) {
    summitStation(h);
    for (const [du, y, s, l] of [
      [-0.235, 10.0, 1.1, 0.76],
      [-0.115, 10.0, 1.0, 0.74],
      [0.215, 9.0, 1.05, 0.74],
    ] as const) {
      conifer(h + du, y, s, l);
    }
    chalet(h + chaletU, 12);
    const low = h + stationU - 0.25;
    const d = h + cabinU - low;
    const gy = swagY(d);
    const slopeDrawing = (2 * sag * sy * d) / (half * half) / width; // dy per drawing mm
    cabin(h + cabinU, gy, atan(slopeDrawing * k(gy)));
    moon(h + moonU, 132, 11);
    cloud(h + cloudU, 60, 0.5);
    cloud(h + cloud2U, 126, 0.5, true);
    for (const [du, y, r] of [
      [-0.03, 145.0, 3.6],
      [0.045, 128.0, 2.6],
      [-0.16, 128.0, 3.0],
      [-0.2, 104.0, 2.6],
      [0.19, 138.0, 3.4],
      [0.215, 106.0, 2.6],
      [0.07, 146.0, 2.8],
      [-0.075, 112.0, 2.2],
      [-0.12, 104.0, 2.0],
    ] as const) {
      star(h + du, y, r);
    }
  }
  return c.pixels;
}

/** The hiking trail of `mountain` (:208-212), undashed, in motif coordinates. */
export function summitTrail(top: number): Path {
  const trail = new Path();
  trail.moveTo(-8, 26);
  curve(trail, P(-24, 54), P(8, 36), P(-40, 42));
  curve(trail, P(-8, 72), P(-12, 60), P(2, 66));
  curve(trail, P(-18, top - 28), P(-22, 78), P(-28, 86));
  return trail;
}

/** SummitCableCarArtwork.draw as the seam of core/patterns/raster.ts wants it. */
export const drawSummitCableCar: ReliefArtwork = (width, height, diameter, columns, rows, radius) => fieldFromBytes(summitCableCarBytes(width, height, diameter, columns, rows, radius));
