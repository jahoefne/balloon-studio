// Tests for path.ts against CGPath. Element lists and bounding boxes marked "CoreGraphics" were
// printed by CoreGraphics on macOS 26.6.2 (Swift 6.3.3) for the same calls.
import { describe, expect, it } from 'vitest';
import { affine, apply, rotation } from './affine';
import { Path, type PathElement, type Rect, Verb } from './path';

type Pt = [number, number];
type Element = ['M' | 'L', Pt] | ['Q', Pt, Pt] | ['C', Pt, Pt, Pt] | ['Z'];

function build(elements: Element[]): Path {
  const p = new Path();
  for (const e of elements) {
    switch (e[0]) {
      case 'M':
        p.moveTo(...e[1]);
        break;
      case 'L':
        p.lineTo(...e[1]);
        break;
      case 'Q':
        p.quadTo(...e[1], ...e[2]);
        break;
      case 'C':
        p.cubicTo(...e[1], ...e[2], ...e[3]);
        break;
      case 'Z':
        p.close();
        break;
    }
  }
  return p;
}

const LETTER = ['M', 'L', 'Q', 'C', 'Z'] as const;

function elements(p: Path): string[] {
  const out: string[] = [];
  p.forEach((e) => out.push(LETTER[e.type] + e.points.map((q) => `(${q.x},${q.y})`).join('')));
  return out;
}

function expectRect(actual: Rect | null, expected: [number, number, number, number], tol: number): void {
  expect(actual).not.toBeNull();
  const values = [actual!.x, actual!.y, actual!.width, actual!.height];
  values.forEach((v, i) => expect(Math.abs(v - (expected[i] as number))).toBeLessThanOrEqual(tol));
}

// CoreGraphics' element list for NightFlight.swift:84-93 with center (0,0) and moonRadius 1:
// addArc(upper → lower+2π, ccw) then addArc on the inner circle (cw) and closeSubpath.
const MOON: Element[] = [
  ['M', [-0.04452564107981014, 0.999008241851103]],
  ['C', [-0.5962626579786845, 0.9744174093076555], [-1.0235990743945507, 0.5072113758190642], [-0.999008241851103, -0.04452564107981014]],
  ['C', [-0.9744174093076555, -0.5962626579786845], [-0.5072113758190642, -1.0235990743945507], [0.04452564107981014, -0.999008241851103]],
  ['C', [0.37298673351842954, -0.9843687823372304], [0.673265366572041, -0.8092062463892905], [0.8476862628414681, -0.5304978791568027]],
  ['L', [0.8476862628414681, -0.5304978791568026]],
  ['C', [0.4000606444379227, -0.7335653948350997], [-0.12743036347850542, -0.5353118812450134], [-0.3304978791568026, -0.08768626284146802]],
  ['C', [-0.5048033906160255, 0.29653871818251387], [-0.38537900440845124, 0.750351385771296], [-0.04452564107981016, 0.9990082418511032]],
  ['Z'],
];

// CoreGraphics: addArc(center: .zero, radius: 1, startAngle: 1, endAngle: 1+1e-9, clockwise: true).
const NEAR_FULL_ARC: Element[] = [
  ['M', [0.5403023058681399, 0.8414709848078964]],
  ['C', [1.0050338981767286, 0.5430702609951477], [1.1398717086206451, -0.07557071355955124], [0.8414709848078964, -0.5403023058681399]],
  ['C', [0.5430702609951477, -1.0050338981767286], [-0.07557071355955125, -1.1398717086206451], [-0.5403023058681399, -0.8414709848078964]],
  ['C', [-1.0050338981767286, -0.5430702609951477], [-1.1398717086206451, 0.07557071355955124], [-0.8414709848078964, 0.5403023058681399]],
  ['C', [-0.5430702611895112, 1.0050338978740252], [0.07557071272238243, 1.1398717085018524], [0.5403023050266687, 0.8414709853481989]],
];

// CoreGraphics: CGPath(ellipseIn: CGRect(x:0,y:0,width:20,height:10), transform: nil).
const ELLIPSE_20x10: Element[] = [
  ['M', [20, 5]],
  ['C', [20, 7.761423749], [15.522847498, 10], [10, 10]],
  ['C', [4.477152502, 10], [0, 7.761423749], [0, 5]],
  ['C', [0, 2.238576251], [4.477152502, 0], [10, 0]],
  ['C', [15.522847498, 0], [20, 2.238576251], [20, 5]],
  ['Z'],
];

describe('Path building rules (CGMutablePath)', () => {
  it('stores verbs and flat coordinates in element order', () => {
    const p = build([['M', [1, 2]], ['L', [3, 4]], ['Q', [5, 6], [7, 8]], ['C', [9, 10], [11, 12], [13, 14]], ['Z']]);
    expect(p.verbs).toEqual([Verb.Move, Verb.Line, Verb.Quad, Verb.Cubic, Verb.Close]);
    expect(p.coords).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(p.currentPoint).toEqual({ x: 1, y: 2 });
  });

  it('replaces a trailing Move and keeps a trailing lone Move (CoreGraphics: M(2,2) L(3,2) M(50,50))', () => {
    const p = build([['M', [1, 1]], ['M', [2, 2]], ['L', [3, 2]], ['M', [50, 50]]]);
    expect(elements(p)).toEqual(['M(2,2)', 'L(3,2)', 'M(50,50)']);
    expectRect(p.controlBounds(), [2, 2, 48, 48], 0);
    expectRect(p.pathBounds(), [2, 2, 48, 48], 0);
  });

  it('ignores segments and closes without a current point (CoreGraphics: empty path)', () => {
    const p = new Path();
    p.lineTo(3, 3);
    p.quadTo(1, 1, 3, 3);
    p.cubicTo(1, 1, 2, 2, 3, 3);
    p.close();
    expect(p.isEmpty()).toBe(true);
    expect(p.currentPoint).toBeNull();
    expect(p.controlBounds()).toBeNull();
    expect(p.pathBounds()).toBeNull();
  });

  it('ignores a second Close, keeps M Z, and continues after Close without an implicit Move', () => {
    expect(elements(build([['M', [1, 1]], ['Z'], ['Z']]))).toEqual(['M(1,1)', 'Z']);
    // CoreGraphics: M(1,1) L(5,1) L(5,5) Z L(9,9), current point (9,9), bounds (1,1,8,8)
    const p = build([['M', [1, 1]], ['L', [5, 1]], ['L', [5, 5]], ['Z'], ['L', [9, 9]]]);
    expect(elements(p)).toEqual(['M(1,1)', 'L(5,1)', 'L(5,5)', 'Z', 'L(9,9)']);
    expect(p.currentPoint).toEqual({ x: 9, y: 9 });
    expectRect(p.pathBounds(), [1, 1, 8, 8], 0);
    const closed = build([['M', [1, 1]], ['L', [5, 1]], ['Z']]);
    expect(closed.currentPoint).toEqual({ x: 1, y: 1 });
  });

  it('addPath appends raw elements mapped by the transform (CoreGraphics: M(0,0) M(2,3) L(4,6))', () => {
    const p = build([['M', [0, 0]]]);
    p.addPath(build([['M', [1, 1]], ['L', [2, 2]]]), affine(2, 0, 0, 3, 0, 0));
    expect(elements(p)).toEqual(['M(0,0)', 'M(2,3)', 'L(4,6)']);
    expect(p.currentPoint).toEqual({ x: 4, y: 6 });
    const q = build([['M', [0, 0]], ['L', [1, 0]]]);
    q.addPath(build([['M', [1, 1]], ['L', [2, 2]], ['Z']]));
    expect(elements(q)).toEqual(['M(0,0)', 'L(1,0)', 'M(1,1)', 'L(2,2)', 'Z']);
    expect(q.currentPoint).toEqual({ x: 1, y: 1 });
  });
});

describe('Path bounds', () => {
  it('controlBounds (CGPath.boundingBox) contains the control point of a quad', () => {
    const quad = build([['M', [0, 0]], ['Q', [5, 10], [10, 0]]]);
    expectRect(quad.controlBounds(), [0, 0, 10, 10], 0);
    const cubic = build([['M', [0, 0]], ['C', [0, 10], [10, 10], [10, 0]]]);
    expectRect(cubic.controlBounds(), [0, 0, 10, 10], 0);
  });

  it('pathBounds (CGPath.boundingBoxOfPath) is the tight curve bound (CoreGraphics: 10×5 and 10×7.5)', () => {
    expectRect(build([['M', [0, 0]], ['Q', [5, 10], [10, 0]]]).pathBounds(), [0, 0, 10, 5], 0);
    expectRect(build([['M', [0, 0]], ['C', [0, 10], [10, 10], [10, 0]]]).pathBounds(), [0, 0, 10, 7.5], 0);
  });

  it('matches CoreGraphics on the moon path', () => {
    const moon = build(MOON);
    const control = moon.controlBounds()!;
    expect(control.x).toBe(-1.0235990743945507);
    expect(control.y).toBe(-1.0235990743945507);
    expect(control.width).toBe(1.8712853372360188);
    expect(control.height).toBe(2.022607316245654);
    expectRect(moon.pathBounds(), [-1.0000184876376688, -1.0000184876376688, 1.8477047504791368, 1.9990267294887718], 1e-12);
  });

  it('matches CoreGraphics on rotated cubics and on the ellipse', () => {
    const arc = build(NEAR_FULL_ARC);
    expectRect(arc.controlBounds(), [-1.1398717086206451, -1.1398717086206451, 2.2797434172412903, 2.2797434171224973], 1e-15);
    expectRect(arc.pathBounds(), [-1.0001223129992378, -1.0001223129992378, 2.0002446259984756, 2.000244626012405], 1e-12);
    expectRect(build(ELLIPSE_20x10).pathBounds(), [0, 0, 20, 10], 1e-12);
  });
});

describe('Path transform and iteration', () => {
  it('transformed ∘ forEach keeps verbs and order and maps every point', () => {
    const source = build([
      ['M', [1, 2]],
      ['L', [3, -4]],
      ['Q', [5, 6], [-7, 8]],
      ['C', [9, 10], [11, -12], [13, 14]],
      ['Z'],
      ['L', [0.5, 0.25]],
      ['M', [-3, -3]],
      ['C', [1, 1], [2, 2], [3, 0]],
    ]);
    const m = affine(1.5, 0.25, -0.5, 2, 4, -3);
    const before: PathElement[] = [];
    source.forEach((e) => before.push(e));
    const after: PathElement[] = [];
    source.transformed(m).forEach((e) => after.push(e));

    expect(after.map((e) => e.type)).toEqual(before.map((e) => e.type));
    after.forEach((e, i) => {
      const original = before[i]!;
      expect(e.points).toHaveLength(original.points.length);
      e.points.forEach((q, j) => expect(q).toEqual(apply(m, original.points[j]!.x, original.points[j]!.y)));
    });
    // The source is untouched.
    expect(source.coords.slice(0, 4)).toEqual([1, 2, 3, -4]);
  });

  it('forEach reports CGPathElement point counts and runs the Summit warp loop shape', () => {
    // SummitCableCar.swift:30-63: current/start bookkeeping over the element stream.
    const p = build([['M', [0, 0]], ['L', [2, 0]], ['Q', [3, 1], [2, 2]], ['C', [1, 3], [0, 3], [0, 2]], ['Z']]);
    let current = { x: NaN, y: NaN };
    let start = current;
    const visited: string[] = [];
    p.forEach((e) => {
      switch (e.type) {
        case Verb.Move:
          current = e.points[0]!;
          start = current;
          break;
        case Verb.Line:
          current = e.points[0]!;
          break;
        case Verb.Quad:
          current = e.points[1]!;
          break;
        case Verb.Cubic:
          current = e.points[2]!;
          break;
        case Verb.Close:
          current = start;
          break;
      }
      visited.push(`${LETTER[e.type]}${e.points.length}@${current.x},${current.y}`);
    });
    expect(visited).toEqual(['M1@0,0', 'L1@2,0', 'Q2@2,2', 'C3@0,2', 'Z0@0,0']);
  });

  it('copy and transformed by a rotation leave the source alone', () => {
    const p = build(MOON);
    const copy = p.copy();
    expect(elements(copy)).toEqual(elements(p));
    copy.lineTo(5, 5);
    expect(p.verbs).toHaveLength(MOON.length);
    const turned = p.transformed(rotation(0.7));
    expect(turned.verbs).toEqual(p.verbs);
    expect(turned.currentPoint).toEqual(apply(rotation(0.7), -0.04452564107981014, 0.999008241851103));
  });
});

describe('WP-R1 placeholders', () => {
  it('throw until R1 implements them', () => {
    const p = new Path();
    expect(() => p.addArc({ x: 0, y: 0 }, 1, 0, 1, false)).toThrow('WP-R1');
    expect(() => p.addEllipse({ x: 0, y: 0, width: 2, height: 1 })).toThrow('WP-R1');
    expect(() => p.addRoundedRect({ x: 0, y: 0, width: 2, height: 1 }, 0.2, 0.2)).toThrow('WP-R1');
    expect(() => Path.ellipse({ x: 0, y: 0, width: 2, height: 1 })).toThrow('WP-R1');
  });
});
