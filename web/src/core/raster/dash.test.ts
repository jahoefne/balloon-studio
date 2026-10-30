// Tests for dash.ts. Expected lists are CoreGraphics' output of CGPath.copy(dashingWithPhase:lengths:), measured
// with tests/fixtures/swift/probes/cg-stroke-dash.swift (macOS 26.6.2).
import { describe, expect, it } from 'vitest';
import { dashPath } from './dash';
import { flatten } from './flatten';
import { Path, Verb } from './path';

type Pieces = number[][];

/** Every dash as flat points. */
function pieces(p: Path): Pieces {
  return flatten(p).map((line) => {
    expect(line.closed).toBe(false);
    return line.points;
  });
}

function expectPieces(actual: Pieces, expected: Pieces): void {
  expect(actual.map((q) => q.length)).toEqual(expected.map((q) => q.length));
  actual.forEach((q, i) => q.forEach((v, j) => expect(Math.abs(v - expected[i]![j]!)).toBeLessThanOrEqual(1e-9)));
}

/** Dashes along the x axis as [start, end]. */
const horizontal = (spans: [number, number][]): Pieces => spans.map(([a, b]) => [a, 0, b, 0]);

const line100 = (): Path => {
  const p = new Path();
  p.moveTo(0, 0);
  p.lineTo(100, 0);
  return p;
};

const square10 = (): Path => Path.roundedRect({ x: 0, y: 0, width: 10, height: 10 }, 0, 0);

describe('dashPath on a line', () => {
  it('gives 8 dashes for a 100 long line with [8, 5]', () => {
    expectPieces(pieces(dashPath(line100(), [8, 5], 0)), horizontal([[0, 8], [13, 21], [26, 34], [39, 47], [52, 60], [65, 73], [78, 86], [91, 99]]));
  });

  it('starts inside the on dash with a phase', () => {
    expectPieces(pieces(dashPath(line100(), [8, 5], 3)), horizontal([[0, 5], [10, 18], [23, 31], [36, 44], [49, 57], [62, 70], [75, 83], [88, 96]]));
  });

  it('starts inside the gap with a larger phase and cuts the last dash at the end', () => {
    expectPieces(pieces(dashPath(line100(), [8, 5], 10)), horizontal([[3, 11], [16, 24], [29, 37], [42, 50], [55, 63], [68, 76], [81, 89], [94, 100]]));
  });

  it('takes the phase modulo the period, negative too', () => {
    expect(pieces(dashPath(line100(), [8, 5], -3))).toEqual(pieces(dashPath(line100(), [8, 5], 10)));
    expect(pieces(dashPath(line100(), [8, 5], 13))).toEqual(pieces(dashPath(line100(), [8, 5], 0)));
  });

  it('repeats an odd pattern with on and off swapped', () => {
    expectPieces(pieces(dashPath(line100(), [30], 0)), horizontal([[0, 30], [60, 90]]));
    expectPieces(pieces(dashPath(line100(), [30, 10, 5], 0)), horizontal([[0, 30], [40, 45], [75, 85], [90, 100]]));
  });

  it('makes a zero-length dash 2⁻¹⁶ long, for its caps', () => {
    const step = 1.52587890625e-5;
    expectPieces(pieces(dashPath(line100(), [0, 25], 0)), horizontal([[0, step], [25, 25 + step], [50, 50 + step], [75, 75 + step]]));
  });

  it('splits at a zero-length gap', () => {
    expectPieces(pieces(dashPath(line100(), [25, 0], 0)), horizontal([[0, 25], [25, 50], [50, 75], [75, 100]]));
  });

  it('returns the path unchanged without lengths', () => {
    expect(dashPath(line100(), [], 0).coords).toEqual([0, 0, 100, 0]);
  });
});

describe('dashPath on other subpaths', () => {
  it('walks a closed subpath including the way back, and leaves it open', () => {
    expectPieces(pieces(dashPath(square10(), [7, 3], 0)), [[0, 0, 7, 0], [10, 0, 10, 7], [10, 10, 3, 10], [0, 10, 0, 3]]);
    expectPieces(pieces(dashPath(square10(), [40, 5], 0)), [[0, 0, 10, 0, 10, 10, 0, 10, 0, 0]]);
    expectPieces(pieces(dashPath(square10(), [6, 6], 2)), [[0, 0, 4, 0], [10, 0, 10, 6], [8, 10, 2, 10], [0, 6, 0, 0]]);
    expect(dashPath(square10(), [7, 3], 0).verbs).not.toContain(Verb.Close);
  });

  it('restarts the pattern at every subpath', () => {
    const p = new Path();
    p.moveTo(0, 0);
    p.lineTo(4, 0);
    p.moveTo(0, 5);
    p.lineTo(4, 5);
    expectPieces(pieces(dashPath(p, [3, 2], 0)), [[0, 0, 3, 0], [0, 5, 3, 5]]);
  });

  it('keeps corners inside a dash', () => {
    const p = new Path();
    p.moveTo(0, 0);
    p.lineTo(4, 0);
    p.lineTo(4, 4);
    expectPieces(pieces(dashPath(p, [6, 1], 0)), [[0, 0, 4, 0, 4, 2], [4, 3, 4, 4]]);
  });

  it('gives nothing for a lone Move or a zero-length subpath', () => {
    const lone = new Path();
    lone.moveTo(5, 5);
    expect(dashPath(lone, [3, 2], 0).isEmpty()).toBe(true);
    const zero = new Path();
    zero.moveTo(5, 5);
    zero.lineTo(5, 5);
    expect(dashPath(zero, [3, 2], 0).isEmpty()).toBe(true);
  });

  it('measures true arc length on a curve, where CoreGraphics drifts by up to 0.31 (SWIFT-DIFF in dash.ts)', () => {
    const p = new Path();
    p.moveTo(0, 0);
    p.cubicTo(0, 10, 10, 10, 10, 0);
    const dashes = pieces(dashPath(p, [3.4, 2.8], 0));
    // CoreGraphics' four dashes: ends of the curve pieces it returned, at arc lengths 0, 3.41 / 6.23, 9.73 /
    // 12.55, 16.00 / 18.91, 19.97 against the nominal 0, 3.4 / 6.2, 9.6 / 12.4, 15.8 / 18.6, 20.
    const expected: [number, number, number, number][] = [
      [0, 0, 0.45587002510671937, 3.369362326338887],
      [1.7443679728108918, 5.855053486302495, 4.725759379855372, 7.489963325424455],
      [7.375476618713606, 6.6904006619006395, 9.354984849400498, 3.9259358620571603],
      [9.95832351508227, 1.0897548962384462, 9.999960293779981, 0.034487082654725054],
    ];
    expect(dashes).toHaveLength(4);
    dashes.forEach((dash, i) => {
      const [ax, ay, bx, by] = expected[i]!;
      expect(Math.hypot(dash[0]! - ax, dash[1]! - ay)).toBeLessThanOrEqual(0.35);
      expect(Math.hypot(dash[dash.length - 2]! - bx, dash[dash.length - 1]! - by)).toBeLessThanOrEqual(0.35);
    });
    // The curve is 20 long; the first three dashes have their nominal length, the last is cut at the end.
    const lengthOf = (dash: number[]): number => {
      let sum = 0;
      for (let i = 0; i + 3 < dash.length; i += 2) sum += Math.hypot(dash[i + 2]! - dash[i]!, dash[i + 3]! - dash[i + 1]!);
      return sum;
    };
    dashes.slice(0, 3).forEach((dash) => expect(Math.abs(lengthOf(dash) - 3.4)).toBeLessThanOrEqual(1e-9));
    expect(Math.abs(lengthOf(dashes[3]!) - 1.4)).toBeLessThanOrEqual(0.01);
  });

  it('defaults to 0.01 and accepts a coarser tolerance', () => {
    const p = new Path();
    p.moveTo(0, 0);
    p.cubicTo(0, 10, 10, 10, 10, 0);
    expect(dashPath(p, [3.4, 2.8], 0).coords).toEqual(dashPath(p, [3.4, 2.8], 0, 0.01).coords);
    expect(dashPath(p, [3.4, 2.8], 0, 0.5).coords.length).toBeLessThan(dashPath(p, [3.4, 2.8], 0).coords.length);
  });
});
