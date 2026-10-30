// Ported from mac/Sources/BalloonStudio/NightFlight.swift @ 04553ee
//
// NightFlightArtwork.draw (:8-240): one panoramic composition in physical millimetres. Gray values are sculpted
// height, never filament colors. The order of the draw calls is the Swift order, because later layers paint over
// earlier ones and the gradient dither is anchored at each clip.
//
// SWIFT-DIFF: a CGContext has one current path; here strokes build a Path and pass it to GrayCanvas.strokePath, see
// raster/canvas.ts.
import { type ReliefArtwork, fieldFromBytes } from '../patterns/raster';
import { type GrayCanvas } from '../raster/canvas';
import { type Point } from '../raster/affine';
import { Path } from '../raster/path';
import { acos, atan2, cos, hypot, PI, sin } from '../swift/dmath';
import { swiftMax, swiftMin, swiftMin3 } from '../swift/minmax';
import { artworkCanvas, cgDashPath, ellipse, fill, roundedFill, stroke } from './helpers';

const P = (x: number, y: number): Point => ({ x, y });

/** The CGContext bytes of NightFlightArtwork.draw, before the /255 of :239; row 0 is the artwork bottom. */
export function nightFlightBytes(width: number, height: number, diameter: number, columns: number, rows: number): Uint8Array {
  const c = artworkCanvas(width, height, columns, rows);
  const scale = swiftMin(diameter * 0.006, height * 0.0105);

  // Each plane has its own looping trail. Repeat only wrapped copies, so a
  // plane crossing the panorama boundary remains a single continuous object.
  const planeCenters = [0.02, 0.52];
  for (const center of planeCenters) {
    for (let wrap = -1; wrap <= 1; wrap++) {
      c.setStrokeGray(0.62);
      c.setLineWidth(swiftMax(1.1, 2.0 * scale));
      c.setLineCap('round');
      const trail = nightFlightTrail(center + wrap, width, height, scale);
      // SWIFT-DIFF: dashed here instead of through setLineDash, see cgDashPath.
      c.strokePath(cgDashPath(trail, swiftMax(1.8, 3.8 * scale), swiftMax(2, 4.5 * scale)));
    }
  }

  // Each cloud is one continuous silhouette with a gently rounded face.
  // No overlapping puff outlines or engraved marks cross its surface.
  const cloud = (u: number, v: number, size: number, mirror = false): void => {
    c.save();
    c.translateBy(u * width, v * height);
    const s = swiftMin3(size * scale, (height * (0.97 - v)) / 28, (height * (v - 0.03)) / 10);
    c.scaleBy(mirror ? -s : s, s);
    const outline = new Path();
    outline.moveTo(-20, -7);
    outline.cubicTo(-32, -6, -31, 8, -21, 8);
    outline.cubicTo(-24, 19, -14, 24, -9, 16);
    outline.cubicTo(-9, 32, 14, 30, 12, 15);
    outline.cubicTo(23, 21, 30, 14, 23, 6);
    outline.cubicTo(34, 6, 33, -7, 21, -7);
    outline.cubicTo(10, -10, -9, -10, -20, -7);
    outline.close();
    roundedFill(c, outline, P(0, 7), 34, 0.86, 0.7);
    c.restore();
  };
  cloud(0.31, 0.62, 0.9);
  cloud(0.55, 0.81, 0.85, true);
  cloud(0.64, 0.21, 0.88);
  cloud(0.2, 0.68, 0.75, true);
  cloud(0.82, 0.73, 1.0);
  cloud(0.94, 0.15, 0.62, true);

  const moonRadius = swiftMin(height * 0.115, diameter * 0.085);
  const mx = width * 0.4;
  const my = height * 0.87;
  // Join the two circle arcs at their exact intersections. Erasing a second
  // antialiased circle inside a clipped disk leaves a thin, broken outer rim.
  const dx = 0.48;
  const dy = 0.28;
  const innerRadius = 0.89;
  const d = hypot(dx, dy);
  const direction = atan2(dy, dx);
  const halfAngle = acos((1 - innerRadius * innerRadius + d * d) / (2 * d));
  const upper = direction + halfAngle;
  const lower = direction - halfAngle;
  const moon = new Path();
  moon.addArc(P(mx, my), moonRadius, upper, lower + 2 * PI, false);
  moon.addArc(P(mx + dx * moonRadius, my + dy * moonRadius), innerRadius * moonRadius, atan2(sin(lower) - dy, cos(lower) - dx), atan2(sin(upper) - dy, cos(upper) - dx), true);
  moon.close();
  fill(c, moon, 0.9);
  for (const [u, v, size] of STARS) {
    const star = new Path();
    const r = swiftMax(1.8, size * scale);
    for (let i = 0; i < 10; i++) {
      const a = PI / 2 + (i * PI) / 5;
      const d = i % 2 === 0 ? r : r * 0.46;
      const p = P(u * width + cos(a) * d, v * height + sin(a) * d);
      if (i === 0) moveTo(star, p);
      else star.lineTo(p.x, p.y);
    }
    star.close();
    fill(c, star, 0.82);
  }

  for (const center of planeCenters) {
    for (let wrap = -1; wrap <= 1; wrap++) plane(c, width, height, scale, center + wrap);
  }
  return c.pixels;
}

/** NightFlightArtwork.draw as the seam of core/patterns/raster.ts wants it; Night Flight ignores `radius`. */
export const drawNightFlight: ReliefArtwork = (width, height, diameter, columns, rows) => fieldFromBytes(nightFlightBytes(width, height, diameter, columns, rows));

const STARS: readonly (readonly [number, number, number])[] = [
  [0.5, 0.93, 5.0],
  [0.69, 0.75, 4.1],
  [0.26, 0.87, 4.5],
  [0.22, 0.5, 3.5],
  [0.56, 0.16, 4.2],
  [0.73, 0.17, 3.5],
  [0.9, 0.83, 4.8],
  [0.06, 0.88, 4.0],
  [0.18, 0.35, 3.0],
  [0.16, 0.43, 3.5],
  [0.86, 0.18, 3.3],
  [0.95, 0.91, 3.8],
];

/** The looping trail of the plane at panorama position u (:42-50), undashed; `scale` is the plane's (:35). */
export function nightFlightTrail(u: number, width: number, height: number, scale: number): Path {
  const position = (x: number, y: number): Point => P(x * width, y * height);
  const tail = position(u + ((-55 * cos(0.25) + 2 * sin(0.25)) * scale) / width, 0.52 + ((-55 * sin(0.25) - 2 * cos(0.25)) * scale) / height);
  const trail = new Path();
  moveTo(trail, position(u - 0.24, 0.36));
  cubicTo(trail, position(u - 0.18, 0.23), position(u - 0.23, 0.2), position(u - 0.2, 0.18));
  cubicTo(trail, position(u - 0.16, 0.39), position(u - 0.12, 0.33), position(u - 0.11, 0.53));
  cubicTo(trail, position(u - 0.2, 0.36), position(u - 0.21, 0.56), position(u - 0.25, 0.41));
  cubicTo(trail, tail, position(u - 0.18, 0.23), P(tail.x - width * 0.05, tail.y - height * 0.07));
  return trail;
}

function moveTo(path: Path, p: Point): void {
  path.moveTo(p.x, p.y);
}

// Argument order of CGMutablePath.addCurve(to:control1:control2:).
function cubicTo(path: Path, to: Point, control1: Point, control2: Point): void {
  path.cubicTo(control1.x, control1.y, control2.x, control2.y, to.x, to.y);
}

// A rounded vintage toy aeroplane: broad elliptical wings, a glazed canopy,
// sculpted cowling, landing wheels, ribbed wings, fasteners and a pilot silhouette.
// SWIFT-DIFF: a nested func in Swift; the captured width, height and scale are arguments here.
function plane(c: GrayCanvas, width: number, height: number, scale: number, u: number): void {
  c.save();
  c.translateBy(width * u, height * 0.52);
  c.rotateBy(0.25);
  c.scaleBy(scale, scale);
  const farWing = new Path();
  farWing.moveTo(-10, 4);
  farWing.cubicTo(-17, 16, -30, 29, -23, 33);
  farWing.cubicTo(-21, 40, -14, 40, -9, 36);
  farWing.cubicTo(2, 29, 14, 16, 19, 9);
  farWing.close();
  fill(c, farWing, 0.65);
  stroke(c, [P(-19, 31), P(4, 15)], 0.49, 1.1);
  c.save();
  c.clip(farWing);
  stroke(c, [P(-22, 28), P(-17, 29.6)], 0.53, 0.9);
  stroke(c, [P(-18, 19), P(-9, 24)], 0.53, 0.9);
  stroke(c, [P(-11, 11), P(-1, 18.5)], 0.53, 0.9);
  c.restore();
  const fin = new Path();
  fin.moveTo(-47, 0);
  fin.cubicTo(-51, 8, -52, 25, -43, 24);
  fin.cubicTo(-35, 24, -35, 10, -25, 3);
  fin.close();
  fill(c, fin, 0.73);
  stroke(c, [P(-43, 7), P(-45, 18)], 0.54, 1.2);
  ellipse(c, -41, 15, 2.6, 3.1, 0.94);
  ellipse(c, -41, 15, 1.3, 1.7, 0.57);
  // Two small wheels and their angled legs sit behind the fuselage and near wing.
  stroke(c, [P(29, -5), P(33, -15)], 0.65, 2.5);
  ellipse(c, 33, -16, 3.8, 4.8, 0.63);
  ellipse(c, 33, -16, 1.8, 2.5, 0.85);
  stroke(c, [P(8, -6), P(22, -20), P(28, -6)], 0.76, 2.5);
  ellipse(c, 22, -21, 5.2, 6.0, 0.78);
  ellipse(c, 22, -21, 3.8, 4.6, 0.55);
  ellipse(c, 22, -21, 2.7, 3.4, 0.98);
  stroke(c, [P(20, -21), P(24, -21)], 0.72, 0.8);
  stroke(c, [P(22, -23.6), P(22, -18.4)], 0.72, 0.8);
  ellipse(c, 22, -21, 1.0, 1.3, 1);
  const body = new Path();
  body.moveTo(-52, -1);
  body.cubicTo(-31, -8, 9, -14, 28, -10);
  body.cubicTo(40, -10, 46, -5, 45, 1);
  body.cubicTo(46, 10, 38, 15, 29, 14);
  body.cubicTo(13, 14, 3, 11, -7, 8);
  body.cubicTo(-28, 5, -57, 6, -52, -1);
  body.close();
  roundedFill(c, body, P(14, 3), 62, 0.96, 0.77);
  const stripe = new Path();
  stripe.moveTo(-45, 0);
  stripe.quadTo(-22, -1, 2, 3);
  stripe.lineTo(5, 6);
  stripe.quadTo(-22, 2, -45, 0);
  stripe.close();
  fill(c, stripe, 0.59);
  // An access hatch and two rows of recessed fasteners give the fuselage scale.
  const hatch = Path.roundedRect({ x: -30, y: -4.5, width: 10, height: 4.5 }, 1, 1);
  c.setStrokeGray(0.61);
  c.setLineWidth(0.9);
  c.strokePath(hatch);
  ellipse(c, -22, -2, 0.85, 0.85, 0.98);
  for (const [x, y] of [
    [-39.0, -2.5],
    [-34, -3.5],
    [-17, -5.5],
    [-12, -6],
    [-26, 4.5],
    [-19, 5.8],
    [-12, 6.8],
  ] as const) {
    ellipse(c, x, y, 0.7, 0.7, 0.57);
  }
  // A curved canopy, with an unbroken rim and a substantial windshield divider.
  const canopy = new Path();
  canopy.moveTo(-5, 8);
  canopy.cubicTo(-2, 19, 1, 23, 9, 21);
  canopy.cubicTo(19, 21, 25, 17, 26, 10);
  canopy.close();
  fill(c, canopy, 0.92);
  const glass = new Path();
  glass.moveTo(-1, 10);
  glass.cubicTo(1, 17, 3, 20, 9, 18);
  glass.cubicTo(16, 18, 20, 16, 22, 12);
  glass.close();
  fill(c, glass, 0.43);
  // A simple head and shoulders stay inside the rear pane of the canopy.
  c.save();
  c.clip(glass);
  ellipse(c, 5.5, 15.3, 1.8, 1.9, 0.85);
  ellipse(c, 5.5, 10.3, 4.1, 3.5, 0.78);
  c.restore();
  stroke(c, [P(12, 11), P(14, 18)], 0.94, 1.5);
  stroke(c, [P(-3, 8), P(25, 10)], 0.98, 1.6);
  const nose = new Path();
  nose.moveTo(30, -9);
  nose.cubicTo(34, -12, 43, -9, 44, -5);
  nose.quadTo(49, 2, 44, 9);
  nose.cubicTo(42, 14, 35, 16, 30, 14);
  nose.quadTo(26, 3, 30, -9);
  nose.close();
  roundedFill(c, nose, P(37, 4), 17, 1, 0.84);
  c.setStrokeGray(0.62);
  c.setLineWidth(1.1);
  c.setLineCap('round');
  const noseLine = new Path();
  noseLine.moveTo(30, -8);
  noseLine.quadTo(27, 3, 30, 13);
  c.strokePath(noseLine);
  // Three broad cooling slots are legible in cream relief at normal print sizes.
  for (const x of [31.5, 35.5, 39.5]) {
    stroke(c, [P(x, -3), P(x - 0.6, 6)], 0.65, 1.25);
  }
  for (const [x, y] of [
    [31.5, -6.5],
    [36, -7.5],
    [41, -5.5],
    [31.5, 10.5],
    [36, 11.5],
    [41, 10],
  ] as const) {
    ellipse(c, x, y, 0.8, 0.8, 0.58);
  }
  const wing = new Path();
  wing.moveTo(-1, 0);
  wing.cubicTo(-8, -8, -25, -23, -22, -32);
  wing.cubicTo(-22, -41, -14, -43, -7, -38);
  wing.cubicTo(4, -30, 18, -17, 21, -5);
  wing.quadTo(26, 5, -1, 0);
  wing.close();
  roundedFill(c, wing, P(2, -9), 40, 1, 0.87);
  c.setStrokeGray(0.68);
  c.setLineWidth(1.15);
  c.setLineCap('round');
  const wingLine = new Path();
  wingLine.moveTo(-9, -34);
  wingLine.quadTo(8, -20, 16, -7);
  c.strokePath(wingLine);
  c.save();
  c.clip(wing);
  stroke(c, [P(-17, -29), P(-8, -30)], 0.77, 0.9);
  stroke(c, [P(-12, -20), P(0, -24)], 0.77, 0.9);
  stroke(c, [P(-6, -11), P(7, -17)], 0.77, 0.9);
  stroke(c, [P(1, -4), P(14, -10)], 0.77, 0.9);
  for (const [x, y] of [
    [-18.0, -33.0],
    [-17, -25],
    [-12, -17],
    [-6, -9],
    [0, -3],
    [8, 0],
  ] as const) {
    ellipse(c, x, y, 0.75, 0.75, 0.63);
  }
  c.restore();
  ellipse(c, -12, -27, 4.2, 4.7, 0.66);
  ellipse(c, -12, -27, 2.5, 2.9, 0.96);
  const tail = new Path();
  tail.moveTo(-44, 0);
  tail.cubicTo(-48, -4, -54, -12, -50, -14);
  tail.cubicTo(-48, -19, -43, -19, -40, -15);
  tail.lineTo(-28, -3);
  tail.close();
  fill(c, tail, 0.94);
  stroke(c, [P(-44, -13), P(-34, -4)], 0.72, 1.1);
  stroke(c, [P(44, 1), P(53, 1)], 0.85, 3);
  c.save();
  c.translateBy(52, 1);
  c.rotateBy(-0.14);
  for (const angle of [0.0, PI]) {
    c.save();
    c.rotateBy(angle);
    const blade = new Path();
    blade.moveTo(-1.8, 1);
    blade.cubicTo(-6, 12, -5, 22, 0, 21);
    blade.cubicTo(5, 21, 5, 16, 3, 9);
    blade.lineTo(1.8, 1);
    blade.close();
    fill(c, blade, 0.87);
    c.save();
    c.clip(blade);
    stroke(c, [P(-0.5, 8), P(0, 17)], 0.65, 0.9);
    c.restore();
    c.restore();
  }
  ellipse(c, 0, 0, 4.4, 3.6, 1);
  ellipse(c, 0, 0, 1.7, 1.5, 0.69);
  c.restore();
  c.restore();
}
