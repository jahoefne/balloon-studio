// Tests for path.ts against CGPath. Element lists and bounding boxes marked "CoreGraphics" were
// printed by CoreGraphics on macOS 26.6.2 (Swift 6.3.3) for the same calls.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { acos, atan2, cos, hypot, PI, sin } from '../swift/dmath';
import { affine, apply, type Point, rotation } from './affine';
import { fused, Path, type PathElement, type Rect, Verb } from './path';

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

// CoreGraphics' own output for the 16 addArc probes of docs/plan.md §13 at three centres and radii, with and
// without a current point before the arc (tests/fixtures/swift/probes/cg-arcs.swift).
interface ArcProbe {
  s: number;
  e: number;
  cw: boolean;
  cx: number;
  cy: number;
  r: number;
  prefix: boolean;
  elements: number[][];
  current: [number, number];
}
const ARC_PROBES: ArcProbe[] = readFileSync(new URL('../../../tests/fixtures/swift/cg-arcs.jsonl', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as ArcProbe);

function flatElements(p: Path): number[][] {
  const out: number[][] = [];
  p.forEach((e) => out.push([e.type, ...e.points.flatMap((q) => [q.x, q.y])]));
  return out;
}

function probePath(probe: ArcProbe): Path {
  const p = new Path();
  if (probe.prefix) p.moveTo(9, 9);
  p.addArc({ x: probe.cx, y: probe.cy }, probe.r, probe.s, probe.e, probe.cw);
  return p;
}

const ulpOf = (x: number): number => {
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, Math.abs(x));
  bytes.setBigUint64(0, bytes.getBigUint64(0) + 1n);
  return bytes.getFloat64(0) - Math.abs(x);
};

describe('addArc (CGMutablePath.addArc)', () => {
  function moon(): Path {
    // NightFlight.swift:84-93 with center (0,0) and moonRadius 1.
    const dx = 0.48;
    const dy = 0.28;
    const innerRadius = 0.89;
    const d = hypot(dx, dy);
    const direction = atan2(dy, dx);
    const halfAngle = acos((1 - innerRadius * innerRadius + d * d) / (2 * d));
    const upper = direction + halfAngle;
    const lower = direction - halfAngle;
    const p = new Path();
    p.addArc({ x: 0, y: 0 }, 1, upper, lower + 2 * PI, false);
    p.addArc({ x: dx, y: dy }, innerRadius, atan2(sin(lower) - dy, cos(lower) - dx), atan2(sin(upper) - dy, cos(upper) - dx), true);
    p.close();
    return p;
  }

  it('reproduces the moon element list of CoreGraphics bit for bit', () => {
    expect(elements(moon())).toEqual(elements(build(MOON)));
  });

  it('has the same element structure as CoreGraphics in all 96 probes', () => {
    const mismatched = ARC_PROBES.filter((probe) => flatElements(probePath(probe)).map((e) => e[0]).join() !== probe.elements.map((e) => e[0]).join());
    expect(mismatched).toEqual([]);
  });

  it('stays within a few ULP of CoreGraphics in all 96 probes', () => {
    let worst = 0;
    for (const probe of ARC_PROBES) {
      const scale = Math.abs(probe.cx) + Math.abs(probe.cy) + probe.r;
      flatElements(probePath(probe)).forEach((element, i) => {
        element.forEach((value, j) => {
          const distance = Math.abs(value - (probe.elements[i]![j] as number)) / ulpOf(scale);
          if (distance > worst) worst = distance;
        });
      });
    }
    expect(worst).toBeLessThanOrEqual(4);
  });

  it('normalises the sweep like CoreGraphics', () => {
    const endOf = (s: number, e: number, cw: boolean): Point => {
      const p = new Path();
      p.addArc({ x: 0, y: 0 }, 1, s, e, cw);
      return p.currentPoint!;
    };
    // 0→−0.5 ccw sweeps 5.783…, three quarters and a remainder, and ends at angle −0.5.
    const short = new Path();
    short.addArc({ x: 0, y: 0 }, 1, 0, -0.5, false);
    expect(short.verbs).toEqual([Verb.Move, Verb.Cubic, Verb.Cubic, Verb.Cubic, Verb.Cubic]);
    expect(endOf(0, -0.5, false).x).toBeCloseTo(Math.cos(0.5), 14);
    expect(endOf(0, -0.5, false).y).toBeCloseTo(-Math.sin(0.5), 14);
    // No clamp above 2π: 0→4π draws two turns.
    const twice = new Path();
    twice.addArc({ x: 0, y: 0 }, 1, 0, 4 * PI, false);
    expect(twice.verbs.filter((v) => v === Verb.Cubic)).toHaveLength(8);
  });

  it('adds only the Move or Line for an empty sweep', () => {
    const alone = new Path();
    alone.addArc({ x: 0, y: 0 }, 1, 0, 0, false);
    expect(elements(alone)).toEqual(['M(1,0)']);
    const after = build([['M', [5, 5]]]);
    after.addArc({ x: 0, y: 0 }, 1, 0, 0, true);
    expect(elements(after)).toEqual(['M(5,5)', 'L(1,0)']);
  });

  it('draws a line to the arc start after a lone Move and after a Close (CoreGraphics: M+arc, MLZ+arc)', () => {
    const lone = build([['M', [5, 5]]]);
    lone.addArc({ x: 0, y: 0 }, 1, 0, PI / 2, false);
    expect(lone.verbs).toEqual([Verb.Move, Verb.Line, Verb.Cubic]);
    const closed = build([['M', [5, 5]], ['L', [6, 5]], ['Z']]);
    closed.addArc({ x: 0, y: 0 }, 1, 0, PI / 2, false);
    expect(closed.verbs).toEqual([Verb.Move, Verb.Line, Verb.Close, Verb.Line, Verb.Cubic]);
  });

  it('is empty for a whole cw turn after a current point, and a full circle without one (CoreGraphics)', () => {
    const after = build([['M', [9, 9]]]);
    after.addArc({ x: 0, y: 0 }, 1, 0, 2 * PI, true);
    expect(after.verbs).toEqual([Verb.Move, Verb.Line]);
    const alone = new Path();
    alone.addArc({ x: 0, y: 0 }, 1, 0, 2 * PI, true);
    expect(alone.verbs).toEqual([Verb.Move, Verb.Cubic, Verb.Cubic, Verb.Cubic, Verb.Cubic]);
  });

  it('maps every point by the transform (CoreGraphics: scale 2,1 → M(2,0) … (1.0806046117362795, 0.84…))', () => {
    const p = new Path();
    p.addArc({ x: 0, y: 0 }, 1, 0, 1, false, affine(2, 0, 0, 1, 0, 0));
    expect(p.currentPoint!.x).toBeCloseTo(1.0806046117362795, 14);
    expect(p.currentPoint!.y).toBeCloseTo(0.8414709848078965, 14);
  });

  it('fused agrees with an exact fused multiply-add', () => {
    const exact = (a: number, b: number, c: number): number => {
      const parts = (x: number): [bigint, number] => {
        if (x === 0) return [0n, 0];
        const bytes = new DataView(new ArrayBuffer(8));
        bytes.setFloat64(0, x);
        const bits = bytes.getBigUint64(0);
        const exponent = Number((bits >> 52n) & 0x7ffn);
        const fraction = bits & ((1n << 52n) - 1n);
        const mantissa = exponent === 0 ? fraction : fraction | (1n << 52n);
        return [bits >> 63n === 1n ? -mantissa : mantissa, (exponent === 0 ? 1 : exponent) - 1075];
      };
      const [ma, ea] = parts(a);
      const [mb, eb] = parts(b);
      const [mc, ec] = parts(c);
      const e = Math.min(ea + eb, ec);
      let m = ((ma * mb) << BigInt(ea + eb - e)) + (mc << BigInt(ec - e));
      if (m === 0n) return 0;
      const negative = m < 0n;
      if (negative) m = -m;
      const shift = m.toString(2).length - 53;
      let exponent = e;
      if (shift > 0) {
        const rest = m & ((1n << BigInt(shift)) - 1n);
        const half = 1n << BigInt(shift - 1);
        m >>= BigInt(shift);
        if (rest > half || (rest === half && (m & 1n) === 1n)) m += 1n;
        exponent += shift;
      }
      const value = Number(m) * Math.pow(2, exponent);
      return negative ? -value : value;
    };
    let seed = 12345;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return (seed / 2147483648 - 0.5) * 16;
    };
    for (let i = 0; i < 20000; i++) {
      const a = next();
      const b = next();
      const c = a * b * (1 + next() * 1e-3);
      expect(Math.abs(fused(a, b, c) - exact(a, b, c))).toBeLessThanOrEqual(ulpOf(exact(a, b, c)));
    }
    expect(fused(0.1, 10, -1)).toBe(exact(0.1, 10, -1));
  });
});

describe('addEllipse (CGPath(ellipseIn:))', () => {
  it('reproduces the 20×10 element list of CoreGraphics exactly', () => {
    const p = Path.ellipse({ x: 0, y: 0, width: 20, height: 10 });
    expect(p.coords[3]).toBe(7.761423749);
    expect(elements(p)).toEqual(elements(build(ELLIPSE_20x10)));
  });

  it('standardises negative rects and replaces a lone Move (CoreGraphics: ellipse-neg, M+ellipse)', () => {
    expect(elements(Path.ellipse({ x: 20, y: 10, width: -20, height: -10 }))).toEqual(elements(build(ELLIPSE_20x10)));
    const p = build([['M', [5, 5]]]);
    p.addEllipse({ x: 0, y: 0, width: 2, height: 2 });
    expect(p.verbs).toEqual([Verb.Move, Verb.Cubic, Verb.Cubic, Verb.Cubic, Verb.Cubic, Verb.Close]);
    expect(p.coords.slice(0, 2)).toEqual([2, 1]);
    expect(p.currentPoint).toEqual({ x: 2, y: 1 });
  });

  it('passes through the 4 extreme points', () => {
    const rect = { x: -3.5, y: 12.25, width: 7.75, height: 2.5 };
    const p = Path.ellipse(rect);
    const ends: Point[] = [];
    p.forEach((e) => {
      if (e.type === Verb.Move) ends.push(e.points[0]!);
      if (e.type === Verb.Cubic) ends.push(e.points[2]!);
    });
    const midX = rect.x + rect.width / 2;
    const midY = rect.y + rect.height / 2;
    const expected = [
      [rect.x + rect.width, midY],
      [midX, rect.y + rect.height],
      [rect.x, midY],
      [midX, rect.y],
      [rect.x + rect.width, midY],
    ];
    ends.forEach((q, i) => {
      expect(Math.abs(q.x - expected[i]![0]!)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(q.y - expected[i]![1]!)).toBeLessThanOrEqual(1e-9);
    });
    const bounds = p.pathBounds()!;
    expect(Math.abs(bounds.x - rect.x)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(bounds.y - rect.y)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(bounds.width - rect.width)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(bounds.height - rect.height)).toBeLessThanOrEqual(1e-9);
  });

  it('maps every point by the transform', () => {
    const m = affine(2, 0, 0, 3, 1, -1);
    const p = Path.ellipse({ x: 0, y: 0, width: 20, height: 10 }, m);
    const q = Path.ellipse({ x: 0, y: 0, width: 20, height: 10 }).transformed(m);
    expect(p.coords).toEqual(q.coords);
  });
});

describe('addRoundedRect (CGPath(roundedRect:))', () => {
  // CoreGraphics: CGPath(roundedRect: (0,0,20,10), cornerWidth: 3, cornerHeight: 2), including its 1e-15 noise.
  const ROUNDED: number[][] = [
    [Verb.Move, 20, 5],
    [Verb.Line, 20, 8],
    [Verb.Cubic, 20, 9.1045694996, 18.656854249400002, 10, 17, 10],
    [Verb.Line, 3, 10.000000000000002],
    [Verb.Cubic, 1.3431457506000002, 10.000000000000002, 1.0145306265907002e-16, 9.104569499600002, 0, 8.000000000000002],
    [Verb.Line, 6.661338147750939e-16, 1.9999999999999998],
    [Verb.Cubic, 8.690399400932339e-16, 0.8954305003999998, 1.3431457506000015, -1.3527075021209336e-16, 3.0000000000000013, 0],
    [Verb.Line, 17, 0],
    [Verb.Cubic, 18.6568542494, 6.763537510604668e-17, 20, 0.8954305004, 20, 2],
    [Verb.Close],
  ];

  it('has the element order of CoreGraphics and its values up to its rotation noise', () => {
    const got = flatElements(Path.roundedRect({ x: 0, y: 0, width: 20, height: 10 }, 3, 2));
    expect(got.map((e) => e[0])).toEqual(ROUNDED.map((e) => e[0]));
    got.forEach((element, i) => element.forEach((value, j) => expect(Math.abs(value - ROUNDED[i]![j]!)).toBeLessThanOrEqual(4e-15)));
  });

  it('degrades to CGPath(rect:) for zero corners (CoreGraphics: M(0,0) L(20,0) L(20,10) L(0,10) Z)', () => {
    expect(elements(Path.roundedRect({ x: 0, y: 0, width: 20, height: 10 }, 0, 0))).toEqual(['M(0,0)', 'L(20,0)', 'L(20,10)', 'L(0,10)', 'Z']);
    expect(elements(Path.roundedRect({ x: 20, y: 10, width: -20, height: -10 }, 0, 0))).toEqual(['M(0,0)', 'L(20,0)', 'L(20,10)', 'L(0,10)', 'Z']);
  });

  it('ends at the start point (CoreGraphics: current (20,5))', () => {
    expect(Path.roundedRect({ x: 0, y: 0, width: 20, height: 10 }, 3, 2).currentPoint).toEqual({ x: 20, y: 5 });
  });
});
