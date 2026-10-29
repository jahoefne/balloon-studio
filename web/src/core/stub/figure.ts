// Ported from mac/Sources/BalloonStudio/FigureGeometry.swift:39-243 @ 03c9307: FigureOutline,
// FigureOutlines and FigureParameters. The outlines are real so `width`, `fitsP2S` and the
// silhouettes match the Mac app; the stub only fakes the meshes.

import type { FigureDerived, FigureOutlineInfo, FigureParameterApi } from '../api';
import { FIGURE_STYLE_INFO, FIGURE_STYLES, FIGURE_SURFACES, type FigureParameters, type FigureStyle, type Range, type Vec2 } from '../types';
import { acos, atan2, cos, PI, pow, sin } from '../swift/dmath';
import { lampProfile, lampRadius } from './cloud';
import { container, ifPresent, lenientEnum, makeCodec } from './json';
import { intTrunc, rounded, swiftMax, swiftMin } from './swiftCompat';

const v = (x: number, y: number): Vec2 => ({ x, y });

/** FigureOutline.init (FigureGeometry.swift:45-69) */
const makeOutline = (loops: Vec2[][], rounding: number): FigureOutlineInfo => {
  const all = loops.flat();
  const minOf = (values: number[]) => values.reduce((a, b) => (b < a ? b : a));
  const maxOf = (values: number[]) => values.reduce((a, b) => (a < b ? b : a));
  const minX = minOf(all.map((q) => q.x)), maxX = maxOf(all.map((q) => q.x));
  const minY = minOf(all.map((q) => q.y)), maxY = maxOf(all.map((q) => q.y));
  const areas: number[] = [], moments: Vec2[] = [];
  for (const loop of loops) {
    let area = 0.0;
    const moment = v(0, 0);
    loop.forEach((a, i) => {
      const b = loop[(i + 1) % loop.length]!, cross = a.x * b.y - b.x * a.y;
      area += cross / 2;
      moment.x += ((a.x + b.x) * cross) / 6;
      moment.y += ((a.y + b.y) * cross) / 6;
    });
    areas.push(area);
    moments.push(moment);
  }
  // `indices.max { abs(areas[$0]) < abs(areas[$1]) }`: the first of equals.
  let outer = 0;
  areas.forEach((area, i) => {
    if (Math.abs(areas[outer]!) < Math.abs(area)) outer = i;
  });
  let total = 0.0;
  const sum = v(0, 0);
  loops.forEach((_, i) => {
    const sign = areas[i]! >= 0 ? 1.0 : -1.0, weight = i === outer ? 1.0 : -1.0;
    total += weight * Math.abs(areas[i]!);
    sum.x += moments[i]!.x * (sign * weight);
    sum.y += moments[i]!.y * (sign * weight);
  });
  return {
    loops,
    rounding,
    minX,
    maxX,
    minY,
    maxY,
    centroid: v(sum.x / total, sum.y / total),
    rawHeight: maxY - minY + 2 * rounding,
    rawWidth: maxX - minX + 2 * rounding,
  };
};

const bezier = (a: [number, number], b: [number, number], c: [number, number], d: [number, number], t: number): Vec2 => {
  const s = 1 - t;
  return v(
    s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0],
    s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1],
  );
};

/** FigureOutlines.balloon (FigureGeometry.swift:135-174) */
const balloonOutline = (): FigureOutlineInfo => {
  const right: Vec2[] = [];
  for (let i = 0; i <= 60; i += 1) {
    const t = i / 60;
    const p = t <= 0.25 ? bezier([16, 6], [16, 17], [26, 28], [33, 38], t * 4) : bezier([33, 38], [56, 71], [90, 94], [90, 142], (t - 0.25) / 0.75);
    right.push(v(p.x, 6 + ((p.y - 6) * 137) / 136));
  }
  for (let i = 1; i <= 50; i += 1) right.push(bezier([90, 143], [90, 143 + (77 * 42) / 78], [48, 220], [0, 220], i / 50));
  const neck = 16.0, rope = 10.0, basketTop = -40.0, basketBottom = -78.0;
  const basketHalfTop = 30.0, basketHalfBottom = 26.0, corner = 6.0;
  const outer: Vec2[] = [v(0, basketBottom), v(basketHalfBottom - corner, basketBottom)];
  for (let i = 1; i <= 8; i += 1) {
    const a = -PI / 2 + ((PI / 2) * i) / 8;
    outer.push(v(basketHalfBottom - corner + corner * cos(a), basketBottom + corner + corner * sin(a)));
  }
  outer.push(v(basketHalfTop, basketTop), v(basketHalfTop - 2, basketTop), v(neck, 0), v(neck, 6));
  outer.push(...right.slice(1));
  outer.push(...right.slice(0, -1).reverse().map((q) => v(-q.x, q.y)));
  outer.push(v(-neck, 0), v(-(basketHalfTop - 2), basketTop), v(-basketHalfTop, basketTop));
  for (let i = 0; i < 8; i += 1) {
    const a = PI + ((PI / 2) * i) / 8;
    outer.push(v(-(basketHalfBottom - corner) + corner * cos(a), basketBottom + corner + corner * sin(a)));
  }
  outer.push(v(-(basketHalfBottom - corner), basketBottom));
  const window = [v(-(neck - rope), 0), v(neck - rope, 0), v(basketHalfTop - 2 - rope, basketTop), v(-(basketHalfTop - 2 - rope), basketTop)];
  return makeOutline([outer, window], 1.5);
};

/** FigureOutlines.make (FigureGeometry.swift:79-130) */
const makeFigureOutline = (style: FigureStyle): FigureOutlineInfo => {
  switch (style) {
    case 'star': {
      const points: Vec2[] = [];
      for (let i = 0; i < 10; i += 1) {
        const angle = PI / 2 + (i * PI) / 5, r = i % 2 === 0 ? 1.0 : 0.46;
        points.push(v(r * cos(angle), r * sin(angle)));
      }
      return makeOutline([points], 0.055);
    }
    case 'heart': {
      const points = Array.from({ length: 240 }, (_, i) => {
        const t = (i / 240) * 2 * PI;
        return v(16 * pow(sin(t), 3), 13 * cos(t) - 5 * cos(2 * t) - 2 * cos(3 * t) - cos(4 * t));
      });
      return makeOutline([points], 0.7);
    }
    case 'moon': {
      const r = 0.78, d = 0.42;
      const tipX = (1 - r * r + d * d) / (2 * d), tipY = Math.sqrt(1 - tipX * tipX);
      const outerStart = atan2(tipY, tipX), innerTip = atan2(tipY, tipX - d);
      const points: Vec2[] = [];
      for (let i = 0; i <= 160; i += 1) {
        const a = outerStart + ((2 * PI - 2 * outerStart) * i) / 160;
        points.push(v(cos(a), sin(a)));
      }
      for (let i = 1; i < 120; i += 1) {
        const a = 2 * PI - innerTip - ((2 * PI - 2 * innerTip) * i) / 120;
        points.push(v(d + r * cos(a), r * sin(a)));
      }
      const lean = PI / 6;
      return makeOutline([points.map((q) => v(q.x * cos(lean) - q.y * sin(lean), q.x * sin(lean) + q.y * cos(lean)))], 0.045);
    }
    case 'cloud': {
      const profile = lampProfile({ kind: 'cloud', style: 'classic', mirrored: false });
      const points = Array.from({ length: 240 }, (_, i) => {
        const a = (i * 2 * PI) / 240, r = lampRadius(a, 0, 1, 1, profile);
        return v(r * cos(a), r * sin(a));
      });
      return makeOutline([points], 0.015);
    }
    case 'sun': {
      const profile = lampProfile({ kind: 'sun', sunStyle: 'bold-eight' });
      const points = Array.from({ length: 480 }, (_, i) => {
        const a = (i * 2 * PI) / 480, r = lampRadius(a, 0, 1, 1, profile);
        return v(r * cos(a), r * sin(a));
      });
      return makeOutline([points], 0.014);
    }
    case 'raindrop': {
      const apex = 2.3, touch = acos(1 / apex);
      const points: Vec2[] = [v(0, apex)];
      const start = PI / 2 + touch, end = PI / 2 - touch + 2 * PI;
      for (let i = 0; i <= 140; i += 1) {
        const a = start + ((end - start) * i) / 140;
        points.push(v(cos(a), sin(a)));
      }
      return makeOutline([points], 0.09);
    }
    case 'balloon':
      return balloonOutline();
  }
};

const outlines = new Map<FigureStyle, FigureOutlineInfo>();
export const figureOutline = (style: FigureStyle): FigureOutlineInfo => {
  let outline = outlines.get(style);
  if (!outline) {
    outline = makeFigureOutline(style);
    outlines.set(style, outline);
  }
  return outline;
};

// --- FigureParameters (FigureGeometry.swift:177-243) -----------------------------

const defaults: FigureParameters = Object.freeze({
  style: 'star',
  height: 60.0,
  surface: 'pillow',
  edge: 1.6,
  dome: 3.2,
  doubleSided: false,
  holeDiameter: 2.0,
  holeMargin: 2.5,
  chainHole: false,
});
const range = (lower: number, upper: number): Range => Object.freeze({ lower, upper });
const ranges = Object.freeze({
  height: range(40.0, 120.0),
  edge: range(0.8, 6.0),
  dome: range(0.8, 10.0),
  hole: range(1.5, 4.0),
  margin: range(1.5, 6.0),
});

const sides = (p: FigureParameters): number => (p.surface !== 'flat' && p.doubleSided ? 2 : 1);
const variantSuffix = (p: FigureParameters): string =>
  `${p.surface === 'pillow' ? '' : `-${p.surface}`}${sides(p) === 2 ? '-two-sided' : ''}${p.chainHole ? '-chain' : ''}`;

export const figureFilename = (p: FigureParameters): string =>
  `Mobile-Figure-${p.style}-${intTrunc(rounded(p.height))}mm${variantSuffix(p)}.stl`;
export const figureSetFilename = (p: FigureParameters): string => `Mobile-Figures-${intTrunc(rounded(p.height))}mm${variantSuffix(p)}-set.zip`;

const derived = (p: FigureParameters): FigureDerived => {
  const outline = figureOutline(p.style);
  const domed = p.surface !== 'flat';
  const scale = p.height / outline.rawHeight;
  const width = outline.rawWidth * scale;
  return {
    domed,
    sides: sides(p),
    thickness: p.edge + (domed ? p.dome * sides(p) : 0),
    scale,
    width,
    fitsP2S: swiftMax(width, p.height) + 16 <= 256,
    displayName: `${FIGURE_STYLE_INFO[p.style].title} · ${intTrunc(rounded(p.height))} mm`,
    filename: figureFilename(p),
    setFilename: figureSetFilename(p),
  };
};

export const normalizeFigure = (input: FigureParameters): FigureParameters => {
  const clamp = (value: number, r: Range, fallback: number): number =>
    Number.isFinite(value) ? swiftMin(r.upper, swiftMax(r.lower, value)) : fallback;
  const p = { ...input };
  p.height = clamp(input.height, ranges.height, 60);
  p.edge = clamp(input.edge, ranges.edge, 1.6);
  p.dome = clamp(input.dome, ranges.dome, 3.2);
  p.holeDiameter = clamp(input.holeDiameter, ranges.hole, 2);
  p.holeMargin = clamp(input.holeMargin, ranges.margin, 2.5);
  if (p.surface === 'flat') p.doubleSided = false;
  return p;
};

/** FigureGeometry.swift:192-204: unknown style or surface names fall back. */
const decode = (value: unknown): FigureParameters => {
  const c = container(value);
  const d = defaults;
  return {
    style: lenientEnum(c, 'style', FIGURE_STYLES) ?? d.style,
    height: ifPresent.double(c, 'height') ?? d.height,
    surface: lenientEnum(c, 'surface', FIGURE_SURFACES) ?? d.surface,
    edge: ifPresent.double(c, 'edge') ?? d.edge,
    dome: ifPresent.double(c, 'dome') ?? d.dome,
    doubleSided: ifPresent.bool(c, 'doubleSided') ?? d.doubleSided,
    holeDiameter: ifPresent.double(c, 'holeDiameter') ?? d.holeDiameter,
    holeMargin: ifPresent.double(c, 'holeMargin') ?? d.holeMargin,
    chainHole: ifPresent.bool(c, 'chainHole') ?? d.chainHole,
  };
};

export const figureParameters: FigureParameterApi = {
  defaults,
  ranges,
  normalize: normalizeFigure,
  codec: makeCodec(decode),
  filename: figureFilename,
  setFilename: figureSetFilename,
  derived,
  outline: figureOutline,
};
