// Tests for flatten.ts: the segment-count formulas of docs/plan.md §7 and the Bernstein order of
// SummitCableCar.swift:50,56.
import { describe, expect, it } from 'vitest';
import { cubicSegments, flatten, quadSegments } from './flatten';
import { Path } from './path';

describe('segment counts', () => {
  it('uses ceil(sqrt(0.75·dd/tol)) for a cubic', () => {
    // Second differences (10,−10) and (−10,−10): dd = 14.14, sqrt(0.75·14.14/0.1) = 10.3.
    expect(cubicSegments(0, 0, 0, 10, 10, 10, 10, 0, 0.1)).toBe(11);
    expect(cubicSegments(0, 0, 0, 10, 10, 10, 10, 0, 0.01)).toBe(33);
  });

  it('uses ceil(sqrt(0.25·dd/tol)) for a quad', () => {
    // Second difference (0,−20): dd = 20, sqrt(0.25·20/0.1) = 7.07.
    expect(quadSegments(0, 0, 5, 10, 10, 0, 0.1)).toBe(8);
    expect(quadSegments(0, 0, 5, 10, 10, 0, 0.5)).toBe(4);
  });

  it('clamps to 1…256', () => {
    expect(cubicSegments(0, 0, 1, 1, 2, 2, 3, 3, 0.1)).toBe(1);
    expect(quadSegments(0, 0, 1, 1, 2, 2, 0.1)).toBe(1);
    expect(cubicSegments(0, 0, 0, 1e7, 1e7, 1e7, 1e7, 0, 0.1)).toBe(256);
    expect(quadSegments(0, 0, 0, 1e7, 1e7, 0, 0.1)).toBe(256);
  });

  it('keeps the chord error of a quarter circle below the tolerance', () => {
    const p = Path.ellipse({ x: 0, y: 0, width: 200, height: 200 });
    for (const tol of [0.1, 0.01]) {
      const [line] = flatten(p, tol);
      const points = line!.points;
      for (let i = 0; i + 3 < points.length; i += 2) {
        const mx = (points[i]! + points[i + 2]!) / 2 - 100;
        const my = (points[i + 1]! + points[i + 3]!) / 2 - 100;
        expect(100 - Math.hypot(mx, my)).toBeLessThanOrEqual(tol);
      }
    }
  });
});

describe('flatten', () => {
  it('evaluates Bernstein form in the Swift order and ends exactly on the end point', () => {
    const p = new Path();
    p.moveTo(0.1, 0.7);
    p.cubicTo(1.3, 2.9, 4.1, -3.3, 5.7, 1.9);
    const [line] = flatten(p, 0.1);
    const points = line!.points;
    const n = cubicSegments(0.1, 0.7, 1.3, 2.9, 4.1, -3.3, 5.7, 1.9, 0.1);
    expect(points).toHaveLength(2 * (n + 1));
    const f = 1 / n;
    const u = 1 - f;
    expect(points[2]).toBe(u * u * u * 0.1 + 3 * u * u * f * 1.3 + 3 * u * f * f * 4.1 + f * f * f * 5.7);
    expect(points[3]).toBe(u * u * u * 0.7 + 3 * u * u * f * 2.9 + 3 * u * f * f * -3.3 + f * f * f * 1.9);
    expect(points.slice(-2)).toEqual([5.7, 1.9]);
  });

  it('evaluates a quad in the Swift order', () => {
    const p = new Path();
    p.moveTo(0.3, 0.1);
    p.quadTo(2.3, 5.9, 7.1, 0.7);
    const [line] = flatten(p, 0.5);
    const n = quadSegments(0.3, 0.1, 2.3, 5.9, 7.1, 0.7, 0.5);
    const f = 2 / n;
    const u = 1 - f;
    expect(line!.points[4]).toBe(u * u * 0.3 + 2 * u * f * 2.3 + f * f * 7.1);
    expect(line!.points[5]).toBe(u * u * 0.1 + 2 * u * f * 5.9 + f * f * 0.7);
  });

  it('gives one polyline per subpath and does not repeat the start of a closed one', () => {
    const p = new Path();
    p.moveTo(0, 0);
    p.lineTo(1, 0);
    p.lineTo(1, 1);
    p.close();
    p.moveTo(5, 5);
    p.lineTo(6, 5);
    expect(flatten(p)).toEqual([
      { points: [0, 0, 1, 0, 1, 1], closed: true },
      { points: [5, 5, 6, 5], closed: false },
    ]);
  });

  it('opens a new polyline at the subpath start after a Close without a Move', () => {
    const p = new Path();
    p.moveTo(1, 1);
    p.lineTo(5, 1);
    p.close();
    p.lineTo(9, 9);
    expect(flatten(p)).toEqual([
      { points: [1, 1, 5, 1], closed: true },
      { points: [1, 1, 9, 9], closed: false },
    ]);
  });

  it('keeps a lone Move and M Z as single points', () => {
    const lone = new Path();
    lone.moveTo(1, 2);
    expect(flatten(lone)).toEqual([{ points: [1, 2], closed: false }]);
    const closed = new Path();
    closed.moveTo(1, 2);
    closed.close();
    expect(flatten(closed)).toEqual([{ points: [1, 2], closed: true }]);
    expect(flatten(new Path())).toEqual([]);
  });

  it('defaults to 0.1', () => {
    const p = Path.ellipse({ x: 0, y: 0, width: 100, height: 100 });
    expect(flatten(p)).toEqual(flatten(p, 0.1));
  });
});
