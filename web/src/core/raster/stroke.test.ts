// Tests for stroke.ts. Expectations marked "CoreGraphics" were measured with
// tests/fixtures/swift/probes/cg-stroke-dash.swift (macOS 26.6.2).
import { describe, expect, it } from 'vitest';
import { flatten } from './flatten';
import { Path } from './path';
import { discSegments, type LineCap, type LineJoin, strokePath } from './stroke';

/** Signed areas of the closed parts of a line-only path. */
function parts(p: Path): number[][] {
  return flatten(p).map((line) => {
    expect(line.closed).toBe(true);
    return line.points;
  });
}

function area(points: number[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length;
    sum += points[i]! * points[j + 1]! - points[j]! * points[i + 1]!;
  }
  return sum / 2;
}

/** Nonzero winding of (x, y) over the parts: what WP-R2's scanline computes. */
function winding(p: Path, x: number, y: number): number {
  let w = 0;
  for (const points of parts(p)) {
    for (let i = 0; i < points.length; i += 2) {
      const j = (i + 2) % points.length;
      const ax = points[i]!;
      const ay = points[i + 1]!;
      const bx = points[j]!;
      const by = points[j + 1]!;
      if (ay <= y && by > y) {
        if ((bx - ax) * (y - ay) - (x - ax) * (by - ay) > 0) w++;
      } else if (ay > y && by <= y) {
        if ((bx - ax) * (y - ay) - (x - ax) * (by - ay) < 0) w--;
      }
    }
  }
  return w;
}

const inside = (p: Path, x: number, y: number): boolean => winding(p, x, y) !== 0;

function polyline(points: [number, number][], closed = false): Path {
  const p = new Path();
  p.moveTo(...points[0]!);
  for (const q of points.slice(1)) p.lineTo(...q);
  if (closed) p.close();
  return p;
}

const CAPS: LineCap[] = ['butt', 'round', 'square'];
const JOINS: LineJoin[] = ['miter', 'round', 'bevel'];

describe('discSegments', () => {
  it('is max(8, ceil(π/acos(1 − tol/r))) ≤ 64', () => {
    expect(discSegments(1, 0.1)).toBe(8);
    expect(discSegments(5, 0.02)).toBe(Math.ceil(Math.PI / Math.acos(1 - 0.02 / 5)));
    expect(discSegments(1000, 0.001)).toBe(64);
    expect(discSegments(0.01, 0.1)).toBe(8);
  });
});

describe('strokePath parts', () => {
  const shapes: [string, Path][] = [
    ['left turn', polyline([[0, 0], [10, 0], [10, 10]])],
    ['right turn', polyline([[0, 0], [10, 0], [10, -10]])],
    ['sharp', polyline([[0, 0], [10, 0], [0, 1]])],
    ['zigzag', polyline([[0, 0], [3, 7], [6, -2], [9, 4], [15, 0]])],
    ['u-turn', polyline([[0, 0], [10, 0], [0, 0]])],
    ['closed square', polyline([[0, 0], [10, 0], [10, 10], [0, 10]], true)],
    ['closed clockwise', polyline([[0, 0], [0, 10], [10, 10], [10, 0]], true)],
    ['rounded rect', Path.roundedRect({ x: 0, y: 0, width: 20, height: 10 }, 3, 3)],
    ['ellipse', Path.ellipse({ x: 0, y: 0, width: 20, height: 10 })],
  ];

  it('are all positively oriented, for every cap and join', () => {
    for (const [, shape] of shapes) {
      for (const cap of CAPS) {
        for (const join of JOINS) {
          const stroked = strokePath(shape, { width: 2, cap, join }, 0.02);
          const list = parts(stroked);
          expect(list.length).toBeGreaterThan(0);
          for (const points of list) expect(area(points)).toBeGreaterThan(0);
        }
      }
    }
  });

  it('use only lines', () => {
    const stroked = strokePath(Path.ellipse({ x: 0, y: 0, width: 20, height: 10 }), { width: 1, join: 'round', cap: 'round' }, 0.05);
    expect(new Set(stroked.verbs)).toEqual(new Set([0, 1, 4]));
  });

  it('cover the band and not more, as a nonzero union', () => {
    const stroked = strokePath(polyline([[0, 0], [10, 0], [10, 10]]), { width: 2, cap: 'butt', join: 'bevel' }, 0.02);
    expect(inside(stroked, 5, 0.9)).toBe(true);
    expect(inside(stroked, 5, -0.9)).toBe(true);
    expect(inside(stroked, 5, 1.1)).toBe(false);
    expect(inside(stroked, 5, -1.1)).toBe(false);
    expect(inside(stroked, 9.5, 5)).toBe(true);
    expect(inside(stroked, -0.1, 0)).toBe(false);
  });
});

describe('joins', () => {
  const corner = polyline([[0, 0], [10, 0], [10, 10]]);

  it('reach the miter tip at (11, −1) of a right angle within the limit', () => {
    const stroked = strokePath(corner, { width: 2, join: 'miter', miterLimit: 10 }, 0.02);
    expect(inside(stroked, 10.99, -0.99)).toBe(true);
    expect(inside(stroked, 11.01, -0.99)).toBe(false);
    expect(stroked.controlBounds()).toEqual({ x: 0, y: -1, width: 11, height: 11 }); // CoreGraphics: (0, −1, 11, 11)
  });

  it('put the tip where the outer edges meet on an oblique turn', () => {
    // Turn by 60°: tip at h/cos(30°) from the vertex along the outer bisector.
    const a = Math.PI / 3;
    const stroked = strokePath(polyline([[0, 0], [10, 0], [10 + 10 * Math.cos(a), 10 * Math.sin(a)]]), { width: 2, join: 'miter' }, 0.02);
    const reach = 1 / Math.cos(a / 2);
    const tipX = 10 + reach * Math.sin(a / 2);
    const tipY = -reach * Math.cos(a / 2);
    expect(inside(stroked, tipX - 0.001, tipY + 0.002)).toBe(true);
    expect(inside(stroked, tipX + 0.01, tipY - 0.01)).toBe(false);
  });

  it('bevel above the limit: 1/cos(θ/2) = √2 for a right angle', () => {
    const above = strokePath(corner, { width: 2, join: 'miter', miterLimit: 1.42 }, 0.02);
    const below = strokePath(corner, { width: 2, join: 'miter', miterLimit: 1.41 }, 0.02);
    expect(inside(above, 10.9, -0.9)).toBe(true);
    expect(inside(below, 10.9, -0.9)).toBe(false);
    expect(inside(below, 10.4, -0.4)).toBe(true);
  });

  it('default to miter with limit 10', () => {
    expect(parts(strokePath(corner, { width: 2 }, 0.02))).toEqual(parts(strokePath(corner, { width: 2, cap: 'butt', join: 'miter', miterLimit: 10 }, 0.02)));
  });

  it('are round when asked', () => {
    const stroked = strokePath(corner, { width: 2, join: 'round' }, 0.02);
    expect(inside(stroked, 10.69, -0.69)).toBe(true);
    expect(inside(stroked, 10.75, -0.75)).toBe(false);
  });

  it('on a U-turn: half disc when round, nothing extra otherwise (CoreGraphics: bbox widths 11 and 10)', () => {
    const uTurn = polyline([[0, 0], [10, 0], [0, 0]]);
    expect(strokePath(uTurn, { width: 2, join: 'miter' }, 0.02).pathBounds()!.width).toBe(10);
    expect(strokePath(uTurn, { width: 2, join: 'bevel' }, 0.02).pathBounds()!.width).toBe(10);
    expect(strokePath(uTurn, { width: 2, join: 'round' }, 0.02).pathBounds()!.width).toBeCloseTo(11, 10);
  });
});

describe('caps', () => {
  const line = polyline([[0, 0], [10, 0]]);

  it('butt ends at the end points', () => {
    expect(strokePath(line, { width: 2, cap: 'butt' }, 0.02).controlBounds()).toEqual({ x: 0, y: -1, width: 10, height: 2 });
  });

  it('square extends by half the width (CoreGraphics: corner bbox (−1, −1, 12, 12))', () => {
    expect(strokePath(line, { width: 2, cap: 'square' }, 0.02).controlBounds()).toEqual({ x: -1, y: -1, width: 12, height: 2 });
    const corner = polyline([[0, 0], [10, 0], [10, 10]]);
    expect(strokePath(corner, { width: 2, cap: 'square' }, 0.02).controlBounds()).toEqual({ x: -1, y: -1, width: 12, height: 12 });
  });

  it('round adds discs of half the width', () => {
    const stroked = strokePath(line, { width: 2, cap: 'round' }, 0.02);
    const bounds = stroked.controlBounds()!;
    expect(bounds.x).toBeCloseTo(-1, 10);
    expect(bounds.x + bounds.width).toBeCloseTo(11, 10);
    expect(inside(stroked, -0.9, 0)).toBe(true);
    expect(inside(stroked, -0.72, 0.72)).toBe(false);
  });

  it('are absent on closed subpaths: rounded rect has as many parts with any cap', () => {
    const rect = Path.roundedRect({ x: 0, y: 0, width: 20, height: 10 }, 3, 3);
    const butt = parts(strokePath(rect, { width: 2, cap: 'butt', join: 'miter' }, 0.05));
    expect(parts(strokePath(rect, { width: 2, cap: 'round', join: 'miter' }, 0.05))).toEqual(butt);
    expect(parts(strokePath(rect, { width: 2, cap: 'square', join: 'miter' }, 0.05))).toEqual(butt);
    // CoreGraphics: bbox (−1, −1, 22, 12).
    const bounds = strokePath(rect, { width: 2, cap: 'round', join: 'miter' }, 0.05).pathBounds()!;
    expect(bounds.x).toBeCloseTo(-1, 2);
    expect(bounds.width).toBeCloseTo(22, 2);
    expect(bounds.height).toBeCloseTo(12, 2);
  });
});

describe('degenerate subpaths (CoreGraphics)', () => {
  const lone = (): Path => {
    const p = new Path();
    p.moveTo(5, 5);
    return p;
  };
  const zeroLine = polyline([[5, 5], [5, 5]]);
  const closedPoint = (): Path => {
    const p = new Path();
    p.moveTo(5, 5);
    p.close();
    return p;
  };
  const zeroClosed = polyline([[5, 5], [5, 5]], true);

  it('a lone Move draws nothing with any cap', () => {
    for (const cap of CAPS) expect(strokePath(lone(), { width: 2, cap }, 0.02).isEmpty()).toBe(true);
  });

  it('a single point draws nothing with butt caps', () => {
    for (const p of [zeroLine, closedPoint(), zeroClosed]) expect(strokePath(p, { width: 2, cap: 'butt' }, 0.02).isEmpty()).toBe(true);
  });

  it('a single point with a round cap is a disc', () => {
    for (const p of [zeroLine, closedPoint(), zeroClosed]) {
      const stroked = strokePath(p, { width: 2, cap: 'round' }, 0.02);
      const list = parts(stroked);
      expect(list).toHaveLength(1);
      expect(area(list[0]!)).toBeGreaterThan(0);
      for (let i = 0; i < list[0]!.length; i += 2) {
        expect(Math.hypot(list[0]![i]! - 5, list[0]![i + 1]! - 5)).toBeCloseTo(1, 12);
      }
      // CoreGraphics: bbox (4, 4, 2, 2).
      expect(stroked.controlBounds()!.width).toBeCloseTo(2, 10);
    }
  });

  it('a single point with a square cap is a square on its corner (CoreGraphics: bbox 2.828…)', () => {
    const stroked = strokePath(zeroLine, { width: 2, cap: 'square' }, 0.02);
    const bounds = stroked.controlBounds()!;
    expect(bounds.x).toBeCloseTo(3.5857864376269046, 12);
    expect(bounds.width).toBeCloseTo(2.828427124746191, 12);
    expect(area(parts(stroked)[0]!)).toBeCloseTo(4, 12);
  });

  it('a zero width draws nothing', () => {
    expect(strokePath(polyline([[0, 0], [1, 0]]), { width: 0 }, 0.02).isEmpty()).toBe(true);
  });
});

describe('strokePath on curves', () => {
  it('follows the arc within the tolerance', () => {
    const p = new Path();
    p.addArc({ x: 0, y: 0 }, 10, 0, Math.PI, false);
    const stroked = strokePath(p, { width: 2, cap: 'butt', join: 'round' }, 0.02);
    for (let i = 1; i < 20; i++) {
      const a = (i / 20) * Math.PI;
      expect(inside(stroked, 10.95 * Math.cos(a), 10.95 * Math.sin(a))).toBe(true);
      expect(inside(stroked, 9.05 * Math.cos(a), 9.05 * Math.sin(a))).toBe(true);
      expect(inside(stroked, 11.05 * Math.cos(a), 11.05 * Math.sin(a))).toBe(false);
      expect(inside(stroked, 8.95 * Math.cos(a), 8.95 * Math.sin(a))).toBe(false);
    }
  });
});
