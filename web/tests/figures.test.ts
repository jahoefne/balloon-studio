// Ported from mac/Tests/FigureTests.swift @ 04553ee
//
// Figures for the mobile: every style at several settings, their holes, their domes, their drawings
// and their settings. Every Swift `require` is a `check`, or `req` where the message is expensive and
// the condition runs once per vertex.
//
// SWIFT-DIFF: the Swift test writes STLs and the ZIP to .build/test-output for inspection; this one
// writes nothing (the `write:` parameter is gone) and reads the archive back with `zipEntries`.
import { describe, it } from 'vitest';
import {
  defaultFigureParameters,
  Field,
  figureCodec,
  figureDomed,
  figureField,
  figureFilename,
  figureHangingView,
  figureHoles,
  figureOutline,
  figureScale,
  figureSetArchive,
  figureSetEntries,
  figureSetFilename,
  figureSides,
  figureThickness,
  figureWidth,
  generateFigure,
  normalizedFigure,
} from '../src/core/figures/figureGeometry';
import type { BalloonMesh } from '../src/core/geometry/mesh';
import { check } from '../src/core/testing/check';
import { parseSTL } from '../src/core/testing/stl';
import { zipEntries } from '../src/core/testing/zipReader';
import { binarySTL } from '../src/core/io/binaryStl';
import { CoreFailure } from '../src/core/api';
import { FIGURE_STYLE_INFO, FIGURE_STYLES, FIGURE_SURFACES, type FigureParameters, type FigureStyle, type Vec2 } from '../src/core/types';

/** `require` with a lazily built message, for conditions evaluated once per vertex. */
function req(condition: boolean, message: () => string): void {
  if (!condition) check(false, message());
}

const equal = (a: FigureParameters, b: FigureParameters): boolean => figureCodec.encode(a) === figureCodec.encode(b);
const withStyle = (style: FigureStyle): FigureParameters => ({ ...defaultFigureParameters(), style });
const utf8Text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** Whether a line through the figure's plane at (x, y) meets the body. */
function hits(mesh: BalloonMesh, x: number, y: number): boolean {
  for (const t of mesh.triangles) {
    const a = mesh.vertices[t.a]!;
    const b = mesh.vertices[t.b]!;
    const c = mesh.vertices[t.c]!;
    const d1 = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    const d2 = (c.x - b.x) * (y - b.y) - (c.y - b.y) * (x - b.x);
    const d3 = (a.x - c.x) * (y - c.y) - (a.y - c.y) * (x - c.x);
    if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) return true;
  }
  return false;
}

/** Every drawing is a simple polygon: no loop crosses itself or another. */
function checkFigureDrawings(): void {
  const side = (p: Vec2, q: Vec2, r: Vec2): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const crosses = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean => {
    const s1 = side(a, b, c);
    const s2 = side(a, b, d);
    const s3 = side(c, d, a);
    const s4 = side(c, d, b);
    return s1 * s2 < -1e-12 && s3 * s4 < -1e-12;
  };
  for (const style of FIGURE_STYLES) {
    const title = FIGURE_STYLE_INFO[style].title;
    const outline = figureOutline(style);
    const loops = outline.loops;
    loops.forEach((loop, l) => {
      check(loop.length >= 3, `${title} has a degenerate loop`);
      const at = (i: number): Vec2 => loop[i % loop.length]!;
      for (let i = 0; i < loop.length; i++) {
        req(Math.hypot(at(i).x - at(i + 1).x, at(i).y - at(i + 1).y) > 1e-9, () => `${title} repeats a point`);
      }
      // Within a loop, segments that share an end never count as crossing.
      for (let i = 0; i < loop.length; i++) {
        for (let j = i + 2; j < loop.length; j++) {
          if (i === 0 && j === loop.length - 1) continue;
          req(!crosses(at(i), at(i + 1), at(j), at(j + 1)), () => `${title}'s drawing crosses itself`);
        }
      }
      for (const other of loops.slice(l + 1)) {
        for (let i = 0; i < loop.length; i++) {
          for (let j = 0; j < other.length; j++) {
            req(!crosses(at(i), at(i + 1), other[j]!, other[(j + 1) % other.length]!), () => `${title}'s window crosses its outline`);
          }
        }
      }
    });
    check(outline.rawHeight > 0 && outline.rawWidth > 0 && outline.rounding > 0, `${title} has no size`);
    const { field, hanging } = figureField(withStyle(style));
    check(hanging !== null, `${title} has no room for its thread hole at 60 mm`);
    // The centroid lies inside the figure, and the hole hangs over it.
    const scale = figureScale(withStyle(style));
    const centroid: Vec2 = {
      x: (outline.centroid.x - (outline.minX + outline.maxX) / 2) * scale,
      y: (outline.centroid.y - (outline.minY + outline.maxY) / 2) * scale,
    };
    check(Math.abs(hanging.x - centroid.x) < 1e-9, `${title}'s hole is not above its centre of gravity`);
    check(field.distance(centroid) > -field.rounding, `${title}'s centre of gravity lies outside it`);
  }
  check(figureOutline('balloon').loops.length === 2 && FIGURE_STYLES.filter((style) => figureOutline(style).loops.length === 1).length === 6, 'Only the balloon has a window');
}

function checkFigure(input: FigureParameters, name: string): void {
  const p = normalizedFigure(input);
  const thickness = figureThickness(p);
  const width = figureWidth(p);
  const preview = generateFigure(p);
  preview.mesh.validate();
  const body = generateFigure(p, 'export');
  const data = binarySTL(body.mesh);
  const parsed = parseSTL(data);
  parsed.validate();
  const dims = parsed.dimensions;
  check(Math.abs(dims.y - p.height) < 0.03, `${name}: height ${dims.y} instead of ${p.height}`);
  check(Math.abs(dims.x - width) < 0.03, `${name}: width ${dims.x} instead of ${width}`);
  check(Math.abs(dims.z - thickness) < 0.02, `${name}: thickness ${dims.z} instead of ${thickness}`);
  check(parsed.vertices.every((v) => v.z >= -1e-6), `${name} lies below the bed`);
  check(Math.abs(body.mesh.dimensions.z - preview.mesh.dimensions.z) < 0.02, `${name}: preview and export differ in thickness`);

  const holes = figureHoles(body);
  check(holes === (p.chainHole ? 2 : 1), `${name} has ${holes} holes`);
  check(body.hangingHole !== null, `${name} lacks its thread hole`);
  // Genus: one handle per thread hole and per window in the drawing.
  const handles = holes + figureOutline(p.style).loops.length - 1;
  for (const mesh of [parsed, preview.mesh]) {
    const euler = mesh.vertices.length - mesh.triangles.length / 2;
    check(euler === 2 - 2 * handles, `${name}: ${euler} instead of ${2 - 2 * handles} for ${handles} handles`);
  }
  const r = p.holeDiameter / 2;
  for (const hole of [body.hangingHole, body.chainHole]) {
    if (hole === null) continue;
    // A thread passes straight through, and the material around the hole is at least the margin.
    for (let turn = 0; turn * (Math.PI / 6) < 2 * Math.PI; turn++) {
      const angle = turn * (Math.PI / 6);
      const inside = { x: hole.x + (r - 0.15) * Math.cos(angle), y: hole.y + (r - 0.15) * Math.sin(angle) };
      check(!hits(parsed, inside.x, inside.y), `${name}: hole blocked at ${inside.x}, ${inside.y}`);
      const rim = { x: hole.x + (r + 0.3) * Math.cos(angle), y: hole.y + (r + 0.3) * Math.sin(angle) };
      check(hits(parsed, rim.x, rim.y), `${name}: nothing around the hole at ${rim.x}, ${rim.y}`);
      const margin = { x: hole.x + (r + p.holeMargin - 0.3) * Math.cos(angle), y: hole.y + (r + p.holeMargin - 0.3) * Math.sin(angle) };
      check(hits(parsed, margin.x, margin.y), `${name}: material around the hole thinner than the margin at ${margin.x}, ${margin.y}`);
    }
    check(hole.y + r + p.holeMargin <= p.height / 2 + 1e-6 && hole.y - r - p.holeMargin >= -p.height / 2 - 1e-6, `${name}: hole too close to the top or bottom`);
  }
  if (body.hangingHole !== null && body.chainHole !== null) {
    const { hangingHole: hanging, chainHole: chain } = body;
    check(hanging.y > chain.y && Math.hypot(hanging.x - chain.x, hanging.y - chain.y) >= 2 * r + p.holeMargin, `${name}: holes too close`);
  }

  // The dome: flat back, full height on the thickest part, the edge band
  // at the outline, a rise in between, and nothing beyond the drawing.
  const { field } = figureField(p);
  const top = parsed.vertices.filter((v) => v.z > thickness - 1e-6);
  check(top.length > 0, `${name} never reaches its thickness`);
  const sides = figureSides(p);
  const base = sides === 2 ? p.dome : 0;
  for (const v of parsed.vertices) {
    const d = field.distance({ x: v.x, y: v.y });
    // Across a notch or the hole a chord lies outside the drawing by its
    // sagitta, well under a tenth of a millimetre at the largest size.
    req(d > -0.12, () => `${name}: a vertex lies ${-d} mm outside the drawing at ${v.x}, ${v.y}, ${v.z}`);
    if (p.surface === 'flat') {
      req(Math.abs(v.z) < 1e-6 || Math.abs(v.z - p.edge) < 1e-6, () => `${name}: a flat figure has a vertex at z ${v.z}`);
    } else {
      req(v.z >= -1e-6 && v.z <= thickness + 1e-6, () => `${name}: vertex height ${v.z} out of range`);
      // Only the edge band and the flat back touch the outline; the domes stay inside it.
      const onBand = Math.abs(v.z - base - p.edge) < 1e-6 || Math.abs(v.z - base) < 1e-6 || Math.abs(v.z) < 1e-6;
      if (!onBand) req(d > 0, () => `${name}: a dome vertex lies on the outline at ${v.x}, ${v.y}, ${v.z}`);
      if (v.z > base + p.edge + 1e-6) req(v.z - base - p.edge <= p.dome + 1e-6, () => `${name}: front too high at ${v.x}, ${v.y}, ${v.z}`);
      if (v.z < base - 1e-6) req(sides === 2 && base - v.z <= p.dome + 1e-6, () => `${name}: back too low at ${v.x}, ${v.y}, ${v.z}`);
      if (sides === 1) req(v.z >= -1e-9 && (v.z < 1e-6 || v.z >= p.edge - 1e-6), () => `${name}: a flat-backed figure has material below its edge band`);
    }
  }
  if (p.surface !== 'flat') {
    // Near the outline the front already stands well above the edge band.
    const near = parsed.vertices.filter((v) => {
      const d = field.distance({ x: v.x, y: v.y });
      return d > 0.4 && d < 0.6 && v.z > base + p.edge - 1e-6;
    });
    check(near.length > 0 && near.every((v) => v.z > base + p.edge + 0.25 * p.dome * Math.min(1, 0.5 / (0.4 * p.dome))), `${name}: the dome does not roll up from the edge`);
    // The thickest vertices sit where the figure is widest.
    let deepest = -Infinity;
    for (const v of parsed.vertices) deepest = Math.max(deepest, field.distance({ x: v.x, y: v.y }));
    const limit = Math.min(deepest, p.surface === 'puffy' ? deepest : 1.75 * p.dome) - 0.05;
    check(top.every((v) => field.distance({ x: v.x, y: v.y }) >= limit), `${name}: full height on a thin part`);
  }
  // The hanging view keeps every triangle and adds a thread.
  const view = figureHangingView(body);
  check(view.colors.length === view.mesh.triangles.length && view.colors.filter((color) => color === 1).length === 12, `${name}: hanging view colours`);
  let lowest = Infinity;
  let highest = -Infinity;
  for (const v of view.mesh.vertices.slice(0, body.mesh.vertices.length)) {
    lowest = Math.min(lowest, v.z);
    highest = Math.max(highest, v.z);
  }
  check(Math.abs(lowest) < 0.03 && Math.abs(highest - p.height) < 0.03, `${name}: hanging view is not upright`);
}

describe('figures', () => {
  const defaults = defaultFigureParameters();

  it('keeps its defaults and catalogue', () => {
    check(
      defaults.style === 'star' && defaults.height === 60 && defaults.surface === 'pillow' && defaults.edge === 1.6 && defaults.dome === 3.2 &&
        !defaults.doubleSided && defaults.holeDiameter === 2 && defaults.holeMargin === 2.5 && !defaults.chainHole,
      'Figure defaults changed',
    );
    check(FIGURE_STYLES.length === 7 && FIGURE_SURFACES.length === 3, 'Figure catalogue changed');
  });

  // Settings: round trip, normalization, old and partial files.
  it('round trips, normalizes and reads old and partial settings', () => {
    const restored = figureCodec.decode(figureCodec.encode(defaults));
    check(equal(restored, defaults), 'Figure settings failed to round trip');
    const bad: FigureParameters = { ...defaults, height: 500, edge: NaN, dome: 0, holeDiameter: -1, holeMargin: 99, surface: 'flat', doubleSided: true };
    const fixed = normalizedFigure(bad);
    check(fixed.height === 120 && fixed.edge === 1.6 && fixed.dome === 0.8 && fixed.holeDiameter === 1.5 && fixed.holeMargin === 6 && !fixed.doubleSided, 'Figure normalization failed');
    check(equal(normalizedFigure(fixed), fixed), 'Figure normalization is not idempotent');
    const partial = figureCodec.decode('{"style":"moon","height":75}');
    check(partial.style === 'moon' && partial.height === 75 && partial.surface === 'pillow' && partial.edge === 1.6, 'Partial figure settings did not fill in');
    const unknown = figureCodec.decode('{"style":"dragon","surface":"velvet"}');
    check(unknown.style === 'star' && unknown.surface === 'pillow', 'Unknown figure names did not fall back');
  });

  // Not in FigureTests.swift: the rest of `init(from:)` (FigureGeometry.swift:192-204).
  it('decodes like JSONDecoder', () => {
    const rejects = (text: string): boolean => {
      try {
        figureCodec.decode(text);
        return false;
      } catch (error) {
        return error instanceof CoreFailure && error.code === 'invalid-settings';
      }
    };
    check(equal(figureCodec.decode('{}'), defaults), 'An empty file did not take the defaults');
    check(equal(figureCodec.decode('{"height":null,"doubleSided":null,"style":null}'), defaults), 'null did not take the defaults');
    check(figureCodec.decode('{"style":7,"surface":[]}').style === 'star', 'A style of the wrong type did not fall back');
    for (const text of ['{"height":"60"}', '{"edge":true}', '{"doubleSided":1}', '{"chainHole":"yes"}', '[]', '3', 'null', '{"dome":1e999}', '{']) {
      check(rejects(text), `${text} should not decode`);
    }
    check(figureCodec.encode(defaults) === '{"chainHole":false,"dome":3.2,"doubleSided":false,"edge":1.6,"height":60,"holeDiameter":2,"holeMargin":2.5,"style":"star","surface":"pillow"}', 'Figure settings changed their layout');
    check(figureDomed(defaults) && !figureDomed({ ...defaults, surface: 'flat' }), 'Only flat figures are not domed');
  });

  it('gives every figure its own filename', () => {
    const filenames = new Set<string>();
    for (const style of FIGURE_STYLES) {
      const p = withStyle(style);
      const name = figureFilename(p);
      check(!filenames.has(name) && name.includes(style) && name.endsWith('.stl'), 'Figures share an export filename');
      filenames.add(name);
      const flat: FigureParameters = { ...p, surface: 'flat' };
      const two: FigureParameters = { ...p, doubleSided: true };
      const chain: FigureParameters = { ...p, chainHole: true };
      check(new Set([name, figureFilename(flat), figureFilename(two), figureFilename(chain)]).size === 4, 'Figure variants share a filename');
      check(figureSetFilename(p).endsWith('.zip') && figureSetFilename(p) === figureSetFilename(defaults), "The set's filename depends on the chosen figure");
    }
  });

  it('draws every figure as a simple polygon', () => {
    checkFigureDrawings();
  });

  // Every figure at the default settings, at both resolutions.
  it.each(FIGURE_STYLES)('%s default', { timeout: 120_000 }, (style) => {
    checkFigure(withStyle(style), `${style}-default`);
  });

  // Extremes and options on a few figures.
  const extremes: [string, FigureParameters][] = [];
  for (const style of ['star', 'balloon', 'moon'] as const) {
    extremes.push([`${style}-small`, { ...withStyle(style), height: 40, edge: 0.8, dome: 0.8, holeDiameter: 1.5, holeMargin: 1.5 }]);
    extremes.push([`${style}-large-chain`, { ...withStyle(style), height: 120, edge: 6, dome: 10, holeDiameter: 4, holeMargin: 6, chainHole: true }]);
  }
  it.each(extremes)('%s', { timeout: 120_000 }, (name, p) => {
    checkFigure(p, name);
  });

  const variants: [string, FigureParameters][] = [];
  for (const style of FIGURE_STYLES) {
    variants.push([`${style}-flat`, { ...withStyle(style), surface: 'flat' }]);
    variants.push([`${style}-puffy-chain`, { ...withStyle(style), surface: 'puffy', chainHole: true }]);
    variants.push([`${style}-two-sided`, { ...withStyle(style), doubleSided: true }]);
  }
  it.each(variants)('%s', { timeout: 120_000 }, (name, p) => {
    checkFigure(p, name);
  });

  // The set holds every figure, the notes and the settings.
  it('builds the set', { timeout: 120_000 }, () => {
    const entries = figureSetEntries(defaults);
    check(entries.length === FIGURE_STYLES.length + 2, `Figure set has ${entries.length} entries`);
    for (const style of FIGURE_STYLES) {
      const entry = entries.find(([name]) => name === figureFilename(withStyle(style)));
      check(entry !== undefined, `Figure set lacks ${FIGURE_STYLE_INFO[style].title}`);
      const parsed = parseSTL(entry[1]);
      parsed.validate();
      check(Math.abs(parsed.dimensions.y - 60) < 0.05, `Set figure ${FIGURE_STYLE_INFO[style].title} is ${parsed.dimensions.y} tall`);
    }
    const notes = utf8Text(entries.find(([name]) => name === 'FIGURES.md')![1]);
    check(notes.includes('flat back down') && notes.includes("out of a baby's reach") && notes.includes('60 mm tall'), 'Figure notes changed');
    const saved = figureCodec.decode(utf8Text(entries.find(([name]) => name === 'figure-settings.json')![1]));
    check(equal(saved, defaults), 'Figure set settings do not reopen');
    // In place of the Swift test's file write: the archive holds the entries, in order.
    const archive = zipEntries(figureSetArchive(defaults));
    check(archive.map((entry) => entry.name).join() === entries.map(([name]) => name).join(), 'The archive does not hold the set');
  });

  // Not in FigureTests.swift: `Field` directly.
  it('measures distance to the edge, positive inside', () => {
    const square: Vec2[] = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }];
    const field = new Field([square], 0.25);
    check(Math.abs(field.distance({ x: 0, y: 0 }) - 1.25) < 1e-12, 'Field: middle of the square');
    check(Math.abs(field.distance({ x: 2, y: 0 }) + 0.75) < 1e-12, 'Field: outside the square');
    field.holes = [{ center: { x: 0, y: 0 }, radius: 0.5 }];
    check(Math.abs(field.distance({ x: 0, y: 0 }) + 0.5) < 1e-12, 'Field: inside a hole');
    const onEdge = field.project({ x: 1.2, y: 0.1 });
    check(Math.abs(field.distance(onEdge)) < 1e-6, `Field: projected point is ${field.distance(onEdge)} from the edge`);
  });
});
