// CoreGraphics CGAffineTransform for the deterministic rasterizer (docs/plan.md, Abschnitt 7, WP-R0).
//
// Reproduces the calls made by mac/Sources/BalloonStudio/SummitCableCar.swift:14-120
// (`CGAffineTransform(translationX:y:).rotated(by:).scaledBy(x:y:)` for `local`,
// `.concatenating(saved)` for `place`, `path.copy(using:&t)`, `CGPoint.applying(local)`,
// `scaleOf` = sqrt(abs(a·d − b·c))) and the CTM calls of NightFlight.swift and
// BalloonText.swift (`translateBy/scaleBy/rotate` on CGContext = translatedBy/scaledBy/rotatedBy here).
//
// Layout and semantics are CoreGraphics' row-vector convention:
//   [x' y' 1] = [x y 1] · | a  b  0 |
//                         | c  d  0 |
//                         | tx ty 1 |
// so apply(t, p) = (a·x + c·y + tx, b·x + d·y + ty) and concat(m1, m2) applies m1 first
// (CGAffineTransformConcat). `t.translatedBy/scaledBy/rotated` (CGAffineTransformTranslate/Scale/Rotate)
// prepend the new operation: concat(translation|scaling|rotation, t), i.e. it acts first on a point,
// in the user space of t. Checked against CoreGraphics on macOS 26.6.2 (affine.test.ts).
//
// Determinism: trig only from ../swift/dmath; every expression keeps the textbook CG order
// (no algebraic shortcuts). CoreGraphics itself may contract a·b + c·d into an FMA on arm64; the raster
// output is tolerance-checked, not byte-checked, so that last-bit difference is accepted.
import { cos, sin } from '../swift/dmath';

/** CGPoint. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** CGAffineTransform: [a b c d tx ty]. */
export interface Affine {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

/** CGAffineTransformMake / CGAffineTransform(a:b:c:d:tx:ty:). */
export function affine(a: number, b: number, c: number, d: number, tx: number, ty: number): Affine {
  return { a, b, c, d, tx, ty };
}

/** CGAffineTransform.identity. */
export const IDENTITY: Affine = Object.freeze(affine(1, 0, 0, 1, 0, 0));

/** CGAffineTransform(translationX:y:) = [1 0 0 1 tx ty]. */
export function translation(tx: number, ty: number): Affine {
  return affine(1, 0, 0, 1, tx, ty);
}

/** CGAffineTransform(scaleX:y:) = [sx 0 0 sy 0 0]. */
export function scaling(sx: number, sy: number): Affine {
  return affine(sx, 0, 0, sy, 0, 0);
}

/** CGAffineTransform(rotationAngle:) = [cos sin −sin cos 0 0]; positive angles turn +x towards +y. */
export function rotation(radians: number): Affine {
  const c = cos(radians);
  const s = sin(radians);
  return affine(c, s, -s, c, 0, 0);
}

/** CGAffineTransformConcat(m1, m2) = m1 · m2: a point is mapped by m1 first, then by m2. */
export function concat(m1: Affine, m2: Affine): Affine {
  return affine(
    m1.a * m2.a + m1.b * m2.c,
    m1.a * m2.b + m1.b * m2.d,
    m1.c * m2.a + m1.d * m2.c,
    m1.c * m2.b + m1.d * m2.d,
    m1.tx * m2.a + m1.ty * m2.c + m2.tx,
    m1.tx * m2.b + m1.ty * m2.d + m2.ty,
  );
}

/** `t.translatedBy(x:y:)` / CGContext.translateBy = concat(translation(tx, ty), t). */
export function translatedBy(t: Affine, tx: number, ty: number): Affine {
  return concat(translation(tx, ty), t);
}

/** `t.scaledBy(x:y:)` / CGContext.scaleBy = concat(scaling(sx, sy), t). */
export function scaledBy(t: Affine, sx: number, sy: number): Affine {
  return concat(scaling(sx, sy), t);
}

/** `t.rotated(by:)` / CGContext.rotate(by:) = concat(rotation(radians), t). */
export function rotatedBy(t: Affine, radians: number): Affine {
  return concat(rotation(radians), t);
}

/** `CGPoint.applying(t)` / CGPointApplyAffineTransform: (a·x + c·y + tx, b·x + d·y + ty). */
export function apply(t: Affine, x: number, y: number): Point {
  return { x: t.a * x + t.c * y + t.tx, y: t.b * x + t.d * y + t.ty };
}

/** a·d − b·c, in the order SummitCableCar.swift `scaleOf` writes it. */
export function determinant(t: Affine): number {
  return t.a * t.d - t.b * t.c;
}

/**
 * `t.inverted()` / CGAffineTransformInvert. Like CoreGraphics, a singular transform (determinant 0)
 * is returned unchanged.
 */
export function invert(t: Affine): Affine {
  const det = determinant(t);
  if (det === 0) return t;
  return affine(
    t.d / det,
    -t.b / det,
    -t.c / det,
    t.a / det,
    (t.c * t.ty - t.d * t.tx) / det,
    (t.b * t.tx - t.a * t.ty) / det,
  );
}

/** CGAffineTransform.isIdentity. */
export function isIdentity(t: Affine): boolean {
  return t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1 && t.tx === 0 && t.ty === 0;
}
