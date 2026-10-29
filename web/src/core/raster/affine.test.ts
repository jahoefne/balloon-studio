// Tests for affine.ts against CGAffineTransform. Expected numbers were printed by CoreGraphics on
// macOS 26.6.2 (Swift 6.3.3) for the same calls; trig there is Apple libm, here dmath, so values are
// compared to 2e-15 instead of bitwise.
import { describe, expect, it } from 'vitest';
import {
  type Affine,
  IDENTITY,
  affine,
  apply,
  concat,
  determinant,
  invert,
  isIdentity,
  rotatedBy,
  rotation,
  scaledBy,
  scaling,
  translatedBy,
  translation,
} from './affine';
import { cos, sin, sqrt } from '../swift/dmath';

const TOL = 2e-15;

function expectAffine(actual: Affine, expected: [number, number, number, number, number, number]): void {
  const values = [actual.a, actual.b, actual.c, actual.d, actual.tx, actual.ty];
  values.forEach((v, i) => expect(Math.abs(v - (expected[i] as number))).toBeLessThanOrEqual(TOL));
}

// SummitCableCar.swift:68-74 `motif`: local = CGAffineTransform(translationX:0,y:y*sy).rotated(by:r)
//   .scaledBy(x:(mirror ? -s:s)*sm,y:s*(stretch ? sy:sm))
function motifLocal(y: number, sy: number, sm: number, s: number, r: number, mirror: boolean, stretch: boolean): Affine {
  return scaledBy(rotatedBy(translation(0, y * sy), r), (mirror ? -s : s) * sm, s * (stretch ? sy : sm));
}

// SummitCableCar.swift:76-81 `place`: CGAffineTransform(translationX:x,y:y).rotated(by:r).scaledBy(x:s,y:s)
//   .concatenating(saved)
function placeLocal(x: number, y: number, s: number, r: number, saved: Affine): Affine {
  return concat(scaledBy(rotatedBy(translation(x, y), r), s, s), saved);
}

describe('affine (CGAffineTransform)', () => {
  it('builds rotation as [cos, sin, -sin, cos] like CGAffineTransform(rotationAngle:)', () => {
    expectAffine(rotation(0.3), [0.955336489125606, 0.29552020666133955, -0.29552020666133955, 0.955336489125606, 0, 0]);
    const p = apply(rotation(Math.PI / 2), 1, 0);
    expect(p.x).toBeCloseTo(0, 15);
    expect(p.y).toBe(1);
  });

  it('applies (a·x + c·y + tx, b·x + d·y + ty)', () => {
    const t = affine(2, 3, 5, 7, 11, 13);
    expect(apply(t, 1, 0)).toEqual({ x: 13, y: 16 });
    expect(apply(t, 0, 1)).toEqual({ x: 16, y: 20 });
  });

  it('concat(m1, m2) maps a point by m1 first', () => {
    const p = apply(concat(translation(1, 0), scaling(2, 2)), 0, 0);
    expect(p).toEqual({ x: 2, y: 0 });
    const q = apply(concat(scaling(2, 2), translation(1, 0)), 0, 0);
    expect(q).toEqual({ x: 1, y: 0 });
  });

  it('translatedBy/scaledBy/rotatedBy prepend the operation like CGAffineTransform', () => {
    // CGAffineTransform(scaleX:2,y:3).translatedBy(x:1,y:1) = [2 0 0 3 2 3]
    expect(translatedBy(scaling(2, 3), 1, 1)).toEqual(affine(2, 0, 0, 3, 2, 3));
    expect(scaledBy(translation(1, 1), 2, 3)).toEqual(affine(2, 0, 0, 3, 1, 1));
    expectAffine(rotatedBy(IDENTITY, 0.3), [0.955336489125606, 0.29552020666133955, -0.29552020666133955, 0.955336489125606, 0, 0]);
  });

  it("reproduces Summit's motif `local`: scale, then rotate, then translate", () => {
    // CoreGraphics: CGAffineTransform(translationX:0,y:7).rotated(by:0.3).scaledBy(x:-2,y:3)
    const local = scaledBy(rotatedBy(translation(0, 7), 0.3), -2, 3);
    expectAffine(local, [-1.910672978251212, -0.5910404133226791, -0.8865606199840186, 2.866009467376818, 0, 7]);

    const sy = 1.13;
    const sm = 0.91;
    for (const [s, r, mirror, stretch] of [
      [1, 0, false, false],
      [0.84, 0.3, false, false],
      [1.2, -0.45, true, false],
      [0.7, 1.1, true, true],
    ] as const) {
      const local2 = motifLocal(119, sy, sm, s, r, mirror, stretch);
      const kx = (mirror ? -s : s) * sm;
      const ky = s * (stretch ? sy : sm);
      for (const [x, y] of [
        [0, 0],
        [3.5, -2],
        [-12, 40],
      ] as const) {
        const scaledX = x * kx;
        const scaledY = y * ky;
        const rotatedX = cos(r) * scaledX - sin(r) * scaledY;
        const rotatedY = sin(r) * scaledX + cos(r) * scaledY;
        const p = apply(local2, x, y);
        expect(Math.abs(p.x - rotatedX)).toBeLessThanOrEqual(1e-13);
        expect(Math.abs(p.y - (rotatedY + 119 * sy))).toBeLessThanOrEqual(1e-13);
      }
    }
  });

  it("reproduces Summit's `place`: the nested transform first, then `.concatenating(saved)`", () => {
    const saved = affine(1.5, 0.25, -0.5, 2, 4, -3);
    // CoreGraphics: CGAffineTransform(translationX:2,y:5).rotated(by:-0.7).scaledBy(x:0.8,y:0.8).concatenating(saved)
    const place = placeLocal(2, 5, 0.8, -0.7, saved);
    expectAffine(place, [1.1754976996364626, -0.877779862123408, 0.46712434977143386, 1.3525910371027199, 4.5, 7.5]);
    const p = apply(place, 1.25, -2);
    expect(Math.abs(p.x - 5.035123425002711)).toBeLessThanOrEqual(TOL * 4);
    expect(Math.abs(p.y - 3.6975930981403002)).toBeLessThanOrEqual(TOL * 4);

    const inner = apply(scaledBy(rotatedBy(translation(2, 5), -0.7), 0.8, 0.8), 1.25, -2);
    const viaInner = apply(saved, inner.x, inner.y);
    expect(Math.abs(viaInner.x - p.x)).toBeLessThanOrEqual(1e-14);
    expect(Math.abs(viaInner.y - p.y)).toBeLessThanOrEqual(1e-14);

    // A place inside a motif: the motif's local is `saved`.
    const motif = motifLocal(119, 1, 1, 0.84, 0, true, false);
    const point = apply(placeLocal(-3, 2, 0.5, 0.2, motif), 1, 1);
    const placed = apply(placeLocal(-3, 2, 0.5, 0.2, IDENTITY), 1, 1);
    const twoStep = apply(motif, placed.x, placed.y);
    expect(Math.abs(point.x - twoStep.x)).toBeLessThanOrEqual(1e-13);
    expect(Math.abs(point.y - twoStep.y)).toBeLessThanOrEqual(1e-13);
  });

  it('determinant gives Summit `scaleOf` = sqrt(abs(a·d − b·c))', () => {
    const local = motifLocal(10, 1, 0.9, 0.84, 0.4, true, false);
    expect(sqrt(Math.abs(determinant(local)))).toBeCloseTo(0.9 * 0.84, 14);
  });

  it('inverts like CGAffineTransformInvert and leaves a singular transform unchanged', () => {
    const saved = affine(1.5, 0.25, -0.5, 2, 4, -3);
    expectAffine(invert(saved), [0.64, -0.08, 0.16, 0.48, -2.08, 1.76]);
    const back = concat(saved, invert(saved));
    expectAffine(back, [1, 0, 0, 1, 0, 0]);
    const singular = affine(1, 2, 2, 4, 5, 6);
    expect(invert(singular)).toBe(singular);
  });

  it('knows the identity', () => {
    expect(isIdentity(IDENTITY)).toBe(true);
    expect(isIdentity(translation(0, 1e-300))).toBe(false);
    expect(Object.isFrozen(IDENTITY)).toBe(true);
  });
});
