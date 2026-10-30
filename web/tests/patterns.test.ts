// Ported from mac/Tests/PatternTests.swift @ cbda68d (lines 15-87, and the raster-independent parts of
// checkTextPatterns :112-168) and mac/Tests/NightFlightTests.swift (checkReliefShapes :6-78, the settings
// checks :166-181, validateFlightSTL :185-203). Every `check` keeps Swift's message. Rasters are stand-ins
// (tests/support/patternRasters.ts): the artwork and glyph probes belong to WP-R3, R4 and R5.
import { describe, expect, it } from 'vitest';
import { generate, type Quality } from '../src/core/balloon/balloonGenerator';
import { classic, makeBalloonParameters, normalized as normalizedParameters, round, tall, totalHeight } from '../src/core/balloon/balloonParameters';
import { BalloonMesh } from '../src/core/geometry/mesh';
import type { Point3, Triangle } from '../src/core/geometry/point3';
import { binarySTL } from '../src/core/io/binaryStl';
import { baseColor, calculatePurgeEstimate, capBoundary, makePatternSettings, makePurgeSettings, normalized, normalizedPurge, PaintedBalloon, patternFromJSON, patternToJSON, purgeFromJSON, purgeToJSON, PURGE_DEFAULTS } from '../src/core/patterns/balloonPatterns';
import { NightFlightRelief } from '../src/core/patterns/nightFlightRelief';
import { BalloonTextLayout } from '../src/core/patterns/textLayout';
import { threeMF } from '../src/core/patterns/threeMF';
import { JSONDecodeError, JSON_DECODE_FORMAT_MESSAGE, JSON_DECODE_MISSING_MESSAGE } from '../src/core/swift/json';
import { swiftCount } from '../src/core/swift/text';
import { check } from '../src/core/testing/check';
import { motifCount } from '../src/core/testing/motifs';
import { zipEntries } from '../src/core/testing/zipReader';
import { BALLOON_PATTERNS, patternHasRelief, type BalloonParameters, type PatternSettings } from '../src/core/types';
import { STAND_IN_RASTERIZERS, standInO, standInText } from './support/patternRasters';

const FULL = process.env['FULL'] !== undefined && process.env['FULL'] !== '';
const RASTERS = STAND_IN_RASTERIZERS;
const P = makeBalloonParameters;
const S = makePatternSettings;
const make = (mesh: BalloonMesh, p: BalloonParameters, s: PatternSettings): PaintedBalloon => PaintedBalloon.make(mesh, p, s, RASTERS);
const INT_MAX = 9223372036854775807;
const INT_MIN = -9223372036854775808;

const classicExport = generate(classic, 'export');

describe('PatternTests.main', () => {
  const p = classic;
  const raw = classicExport;

  it.each(BALLOON_PATTERNS)('style %s', { timeout: 120_000 }, (style) => {
    const settings = S({ style });
    const painted = make(raw, p, settings);
    painted.mesh.validate();
    const e = calculatePurgeEstimate(painted, makePurgeSettings());
    if (style === 'Solid') check(e.maximumChanges === 0, 'Solid must not change filament');
    else {
      check(new Set(painted.colors).size === 2, 'Both filaments must be painted');
      if (patternHasRelief(style)) {
        check(e.minimumChanges === 1 && e.maximumChanges === 1 && e.mixedLayers === 0, `${style} must switch the whole layer once`);
      } else if (style === 'Horizontal stripes') {
        check(e.minimumChanges === 5 && e.maximumChanges === 5 && e.mixedLayers === 0, 'Six stripes should change exactly five times');
        check(Math.abs(e.maximumGrams - 2.48) < 1e-8, 'mm³ to grams conversion failed');
      } else if (style === 'Text') {
        check(e.mixedLayers > 0, 'Text should have mixed layers');
      } else {
        check(e.mixedLayers > 0 && e.minimumChanges > 5, 'Motifs should have mixed layers');
        check(motifCount(painted) === settings.rows * settings.repeats, 'Export lost or joined motifs');
      }
      const archive = zipEntries(threeMF(painted, settings, makePurgeSettings()));
      expect(archive.map((entry) => entry.name)).toEqual(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', 'Metadata/balloon-settings.json', 'Metadata/pattern-settings.json', 'Metadata/balloon-studio.txt']);
    }
  });

  it.each(['Hearts', 'Polka dots', 'Diamonds'] as const)('dense and single %s motifs on a small balloon', { timeout: 120_000 }, (style) => {
    const small = normalizedParameters(P({ height: 80, diameter: 60, panels: 8 }));
    const smallMesh = generate(small);
    const dense = S({ style, repeats: 24, rows: 6, size: 3 });
    const painted = make(smallMesh, small, dense);
    painted.mesh.validate();
    check(motifCount(painted) === 144, `Small preview lost or joined ${style} motifs: ${motifCount(painted)}`);
    const single = make(smallMesh, small, { ...dense, repeats: 1, rows: 1, size: 18 });
    check(motifCount(single) === 1, 'Single motif control failed');
  });

  it.each([false, true])('stripe splitting keeps the attachments, hollow %s', { timeout: 120_000 }, (hollow) => {
    const rig = { ...p, hollow, hangingLoop: true, stringHoles: true };
    const painted = make(generate(rig), rig, S({ style: 'Horizontal stripes', bands: 24 }));
    painted.mesh.validate();
    check(Math.abs(painted.mesh.dimensions.z - totalHeight(rig)) < 1e-8, 'Stripe splitting changed attachments');
  });

  it('schedules purges', { timeout: 120_000 }, () => {
    let settings = S({ style: 'Polka dots', rows: 1 });
    const singleRow = make(raw, p, settings);
    const one = calculatePurgeEstimate(singleRow, makePurgeSettings());
    settings = { ...settings, rows: 3 };
    const three = calculatePurgeEstimate(make(raw, p, settings), makePurgeSettings());
    check(three.maximumChanges > one.maximumChanges, 'More occupied rows must increase waste');
    check(calculatePurgeEstimate(singleRow, makePurgeSettings({ layerHeight: 0.1 })).maximumChanges > one.maximumChanges, 'Finer layers must increase changes');
    const purge = makePurgeSettings({ baseToDetail: 100, detailToBase: 700, multiplier: 0.5 });
    settings = { ...settings, style: 'Horizontal stripes', bands: 6 };
    const directional = calculatePurgeEstimate(make(raw, p, settings), purge);
    check(Math.abs(directional.maximumGrams - ((3 * 100 + 2 * 700) * 0.5 * 1.24) / 1000) < 1e-8, 'Directional flushing or multiplier wrong');
    settings = { ...settings, detail: settings.base };
    check(calculatePurgeEstimate(make(raw, p, settings), purge).maximumChanges === 0, 'Same colors must not purge');
  });

  it('normalizes and persists', () => {
    const settings = S({ style: 'Horizontal stripes', size: Number.NaN, rows: INT_MAX, repeats: INT_MIN, bands: INT_MAX });
    const n = normalized(settings, p);
    check(Number.isFinite(n.size) && n.rows === 6 && n.repeats === 1 && n.bands === 24, 'Normalization failed');
    const restored = patternFromJSON(patternToJSON(n));
    check(JSON.stringify(restored) === JSON.stringify(n), 'Pattern persistence failed');
  });

  it('counts text in Characters and maps whitespace Characters to spaces', () => {
    const text = (input: string): string => normalized(S({ text: input }), p).text;
    const family = '👨‍👩‍👧‍👦';
    expect(text(family.repeat(65))).toBe(family.repeat(64));
    expect(text('é'.repeat(70))).toBe('é'.repeat(64));
    expect(text('e\u0301'.repeat(70))).toBe('e\u0301'.repeat(64));
    expect(text('a\u00a0b\u2028c\r\nd')).toBe('a b c d');
    expect(text('a \u0301b')).toBe('a b');
  });
});

describe('PatternTests.checkTextPatterns, raster-independent', () => {
  const p = classic;
  const raw = generate(p);

  it.each([1, 2, 7, 24])('%i repeats, including the wrap seam', { timeout: 120_000 }, (repeats) => {
    const text = S({ style: 'Text', text: 'F', textRepeats: repeats });
    const layout = BalloonTextLayout.create(text, p, standInText) as BalloonTextLayout;
    for (let copy = 0; copy < repeats; copy++) {
      // Sample one known painted point, including copies crossing the atan2 seam.
      const angle = BalloonTextLayout.origin + copy * layout.step + 0.2 * layout.angularWidth;
      const point = { x: 80 * Math.cos(angle), y: 80 * Math.sin(angle), z: layout.bottom + 0.92 * layout.height };
      check(layout.color(point, point) === 1, `Missing repeated text at ${copy}/${repeats}`);
      check(layout.color(point, { x: -point.x, y: -point.y, z: -point.z }) === 0, 'Text painted the cavity');
    }
    const quality: Quality = repeats === 7 ? 'export' : 'preview';
    const painted = make(generate(p, quality), p, text);
    painted.mesh.validate();
    check(motifCount(painted) === repeats, `Incorrect rendered text repeat count: ${repeats}, got ${motifCount(painted)}`);
  });

  it('keeps glyph counters open', () => {
    const layout = BalloonTextLayout.create(S({ style: 'Text', text: 'O' }), p, () => standInO()) as BalloonTextLayout;
    check(!layout.mask.contains(0.5, 0.5) && layout.mask.contains(0.05, 0.5), 'Glyph counters must remain open');
    check(!layout.mask.contains(-0.01, 0.5) && !layout.mask.contains(0.5, 1), 'A point outside the mask has no ink');
  });

  it.each([false, true])('keeps text off the cavity and hanger, hollow %s', { timeout: 120_000 }, (hollow) => {
    const text = S({ style: 'Text', text: 'Zoë & Léa <3', textFont: 'Serif', textRepeats: 2 });
    const rig = { ...p, hollow, stringHoles: true, hangingLoop: true };
    const painted = make(generate(rig), rig, text);
    painted.mesh.validate();
    check(painted.colors.includes(1), 'Text missing on attached balloon');
    const { vertices, triangles } = painted.mesh;
    triangles.forEach((t, i) => {
      if (painted.colors[i] !== 1) return;
      const a = vertices[t.a] as Point3;
      const b = vertices[t.b] as Point3;
      const c = vertices[t.c] as Point3;
      const center = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 };
      const normalX = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
      const normalY = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
      check(center.z > rig.neckHeight && center.z < rig.height * 0.9 && normalX * center.x + normalY * center.y > 0, 'Text leaked onto cavity, neck or hanger');
    });
  });

  it('handles empty, matching and invalid text settings', { timeout: 120_000 }, () => {
    let text = S({ style: 'Text', text: '   ' });
    const empty = make(raw, p, text);
    check(!empty.colors.includes(1) && empty.mesh.triangles.length === raw.triangles.length, 'Empty text must leave the balloon plain');
    check(calculatePurgeEstimate(empty, makePurgeSettings()).maximumChanges === 0, 'Empty text must not purge');
    text = { ...text, text: 'Hello', detail: text.base };
    check(!make(raw, p, text).colors.includes(1), 'Matching text colors must use one filament');
    text = { ...text, detail: 'Cream', text: `${'Wide message '.repeat(20)}\n`, textRepeats: INT_MAX, textHeight: Number.NaN };
    const n = normalized(text, p);
    check(swiftCount(n.text) === 64 && n.textRepeats === 24 && n.textHeight === 24, 'Invalid text settings not normalized');
    check(normalized({ ...text, text: 'Hello\nworld\t!' }, p).text === 'Hello world !', 'Pasted multiline text must become one line');
    const fitted = BalloonTextLayout.create(n, p, standInText) as BalloonTextLayout;
    check(fitted.angularWidth <= fitted.step * 0.78 + 1e-9, 'Long text copies overlap');
    const small = normalizedParameters(P({ height: 80, diameter: 60, panels: 8 }));
    make(generate(small), small, n).mesh.validate();
    check(JSON.stringify(patternFromJSON(patternToJSON(n))) === JSON.stringify(n), 'Text, font or repeat count failed to persist');
  });

  it('migrates older pattern settings', () => {
    const legacy = patternFromJSON('{"style":"Hearts","bands":10,"repeats":5,"rows":3,"size":12,"base":"Rose","detail":"Cream"}');
    check(legacy.style === 'Hearts' && legacy.repeats === 5 && legacy.rows === 3 && legacy.base === 'Rose' && legacy.size === 12, 'Text upgrade discarded old pattern settings');
    check(legacy.text === 'Hello' && legacy.textRepeats === 3 && legacy.textFont === 'Rounded', 'Text defaults failed to migrate');
  });
});

// NightFlightTests.validateFlightSTL: welds the float coordinates independently of the writer.
function validateFlightSTL(data: Uint8Array): void {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = view.getUint32(80, true);
  check(data.length === 84 + 50 * count, 'Malformed relief STL');
  const lookup = new Map<string, number>();
  const vertices: Point3[] = [];
  const faces: Triangle[] = [];
  for (let i = 0; i < count; i++) {
    const ids: number[] = [];
    for (let j = 0; j < 3; j++) {
      const o = 84 + i * 50 + 12 + j * 12;
      const key = `${view.getUint32(o, true)},${view.getUint32(o + 4, true)},${view.getUint32(o + 8, true)}`;
      let index = lookup.get(key);
      if (index === undefined) {
        index = vertices.length;
        lookup.set(key, index);
        vertices.push({ x: view.getFloat32(o, true), y: view.getFloat32(o + 4, true), z: view.getFloat32(o + 8, true) });
      }
      ids.push(index);
    }
    faces.push({ a: ids[0] as number, b: ids[1] as number, c: ids[2] as number });
  }
  new BalloonMesh(vertices, faces, 0).validate();
}

// NightFlightTests.checkReliefShapes: every sculpted panorama must behave the same on all nine shapes.
const SHAPES: readonly (readonly [string, BalloonParameters, number, number])[] = [
  ['classic', classic, 2.4, 18],
  ['round', round, 2.4, 18],
  ['wide-with-fine-panels', P({ height: 242, diameter: 239, panels: 32, panelDepth: 4, neckDiameter: 50, neckHeight: 12.86, shoulder: 63, stringHoles: true, hangingLoop: true, hangingClearance: 3.5 }), 2.4, 18],
  ['tall', tall, 1.2, 10],
  ['compact', P({ height: 80, diameter: 60, panels: 8 }), 4, 28],
  ['wide', P({ height: 80, diameter: 240, panels: 8, panelDepth: 8, shoulder: 75 }), 4, 28],
  ['narrow', P({ height: 250, diameter: 60, panels: 8, panelDepth: 0 }), 4, 10],
  ['filled-attachments', P({ stringHoles: true, hangingLoop: true }), 4, 18],
  ['hollow-attachments', P({ hollow: true, wallThickness: 0.8, stringHoles: true, hangingLoop: true }), 2.4, 18],
];
const FAST_SHAPES = new Set(['compact', 'narrow']);

function checkReliefShape(style: 'Night Flight' | 'Summit Cable Car', name: string, input: BalloonParameters, depth: number, cap: number, quality: Quality): void {
  const label = style;
  const p = normalizedParameters(input);
  const settings = S({ style, reliefDepth: depth, capHeight: cap });
  const original = generate(p, quality);
  const relief = new NightFlightRelief(settings, p, original, RASTERS);
  for (let x = 0; x < 360; x++) {
    const angle = (x * Math.PI) / 180;
    const edge = { x: 80 * Math.cos(angle), y: 80 * Math.sin(angle), z: relief.bottom + relief.height * 0.999 };
    check(relief.artworkHeight(edge) < 0.01, `Artwork clipped against cap: ${name}`);
  }
  const painted = make(original, p, settings);
  painted.mesh.validate();
  check(painted.mesh.triangles.length < 2_500_000, `Relief refinement created an excessive mesh: ${name}`);
  let changed = 0;
  let originalVolume = 0;
  let newVolume = 0;
  const volume = (a: Point3, b: Point3, c: Point3): number => (a.x * (b.y * c.z - b.z * c.y) + a.y * (b.z * c.x - b.x * c.z) + a.z * (b.x * c.y - b.y * c.x)) / 6;
  for (const t of original.triangles) originalVolume += volume(original.vertices[t.a] as Point3, original.vertices[t.b] as Point3, original.vertices[t.c] as Point3);
  const capZ = capBoundary(normalized(settings, p), p);
  painted.mesh.triangles.forEach((t, i) => {
    const a = painted.mesh.vertices[t.a] as Point3;
    const b = painted.mesh.vertices[t.b] as Point3;
    const c = painted.mesh.vertices[t.c] as Point3;
    newVolume += volume(a, b, c);
    if (painted.colors[i] === 0) check(Math.max(a.z, b.z, c.z) <= capZ + 1e-8, `Body color above cap: ${name}`);
    else check(Math.min(a.z, b.z, c.z) >= capZ - 1e-8, `Cap color below its single layer boundary: ${name}`);
  });
  check(newVolume > originalVolume, `Relief must be actual added material: ${name}`);
  // Refinement retains the original vertex indices. Cavities and attachments
  // must stay exactly where they were, while exterior relief only grows outward.
  const inner = original.innerVertexRange;
  for (let i = 0; i < original.vertices.length; i++) {
    const a = original.vertices[i] as Point3;
    const b = painted.mesh.vertices[i] as Point3;
    check(a.z === b.z, 'Relief changed vertical geometry');
    const delta = Math.hypot(b.x, b.y) - Math.hypot(a.x, a.y);
    check(delta >= -1e-9 && delta <= depth + (p.diameter * p.panelDepth) / 200 + 0.1, 'Relief cut the shell or exceeded its depth');
    if (delta > 1e-6) changed += 1;
    if ((inner !== undefined && i >= inner.lowerBound && i < inner.upperBound) || a.z < relief.bottom || a.z > relief.bottom + relief.height) {
      check(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-10, `Relief moved the cavity, neck or hanger: ${name}`);
    }
  }
  check(changed > 10, `Missing geometric motifs: ${name}`);
  check(Math.abs(painted.mesh.dimensions.z - totalHeight(p)) < 1e-8, 'Relief altered print height');
  check(painted.mesh.dimensions.x <= p.diameter + 2 * depth + 1e-8 && painted.mesh.dimensions.y <= p.diameter + 2 * depth + 1e-8, 'Unexpected relief bounds');
  for (const layerHeight of [0.08, 0.2, 0.32]) {
    const estimate = calculatePurgeEstimate(painted, makePurgeSettings({ layerHeight }));
    check(estimate.minimumChanges === 1 && estimate.maximumChanges === 1 && estimate.mixedLayers === 0, `${label} has unnecessary color changes: ${name}`);
  }
  // A binary STL round trip independently welds float coordinates and validates
  // triangles, catching relief facets that collapse at actual export precision.
  if (quality === 'export') validateFlightSTL(binarySTL(painted.mesh));
}

describe('NightFlightTests.checkReliefShapes', () => {
  describe.each(['Night Flight', 'Summit Cable Car'] as const)('%s', (style) => {
    describe.each(SHAPES)('$0', (name, input, depth, cap) => {
      it.skipIf(!FULL && !(FAST_SHAPES.has(name) && style === 'Night Flight'))('preview', { timeout: 300_000 }, () => {
        checkReliefShape(style, name, input, depth, cap, 'preview');
      });
      it.skipIf(!FULL)('export', { timeout: 600_000 }, () => {
        checkReliefShape(style, name, input, depth, cap, 'export');
      });
    });
  });
});

describe('NightFlightTests, settings', () => {
  it('matching colors keep the relief and drop the cap color', { timeout: 120_000 }, () => {
    const raw = generate(classic);
    const settings = S({ style: 'Night Flight', flightCap: 'Cream' });
    const single = make(raw, classic, settings);
    check(single.mesh.triangles.length > raw.triangles.length && !single.colors.includes(1), 'Matching colors lost relief or kept the cap color');
    check(calculatePurgeEstimate(single, makePurgeSettings()).maximumChanges === 0, 'One filament must not purge');
  });

  it('normalizes and persists', () => {
    const n = normalized(S({ style: 'Night Flight', reliefDepth: Number.NaN, capHeight: Number.POSITIVE_INFINITY }), classic);
    check(n.flightCompositionVersion === 3 && n.reliefDepth === 2.4 && n.capHeight === 18, 'Night Flight normalization failed');
    check(JSON.stringify(patternFromJSON(patternToJSON(n))) === JSON.stringify(n), 'Night Flight settings failed to persist');
  });

  it('migrates saved designs', () => {
    const legacy = patternFromJSON('{"style":"Text","text":"Milo","textFont":"Serif","textRepeats":2,"base":"Rose","detail":"Cream"}');
    check(legacy.style === 'Text' && legacy.text === 'Milo' && legacy.textFont === 'Serif' && baseColor(legacy) === 'Rose', 'Night Flight upgrade lost the existing design');
    check(legacy.flightBody === 'Cream' && legacy.flightCap === 'Midnight blue', 'Night Flight colors did not migrate');
    const oldFlight = patternFromJSON('{"style":"Night Flight","flightRepeats":3,"reliefDepth":1.2,"capHeight":22,"flightCap":"Blue"}');
    check(oldFlight.flightCompositionVersion === 3 && oldFlight.reliefDepth === 2.4 && oldFlight.capHeight === 22 && oldFlight.flightCap === 'Blue', 'Old repeated scene did not migrate without losing cap settings');
    const previous = patternFromJSON('{"style":"Night Flight","flightCompositionVersion":2,"reliefDepth":1.6,"capHeight":17,"flightBody":"Cream","flightCap":"Blue"}');
    check(previous.flightCompositionVersion === 3 && previous.reliefDepth === 1.6 && previous.capHeight === 17 && previous.flightCap === 'Blue', 'Two-plane upgrade changed saved relief or cap settings');
  });
});

describe('decoding as JSONDecoder does', () => {
  it('rejects wrong types and unknown raw values', () => {
    for (const bad of ['{"style":"Zebra"}', '{"bands":1.5}', '{"size":"18"}', '{"base":"Teal"}', '{"textFont":1}', '[]']) {
      expect(() => patternFromJSON(bad), bad).toThrow(JSONDecodeError);
      expect(() => patternFromJSON(bad), bad).toThrow(JSON_DECODE_FORMAT_MESSAGE);
    }
  });

  it('keeps the first of two equal keys and reads null as absent', () => {
    expect(patternFromJSON('{"bands":9,"bands":"x"}').bands).toBe(9);
    expect(patternFromJSON('{"bands":null}').bands).toBe(6);
  });

  it('applies the relief floor only without a composition version', () => {
    expect(patternFromJSON('{"reliefDepth":1.5}').reliefDepth).toBe(2.4);
    expect(patternFromJSON('{"reliefDepth":1.5,"flightCompositionVersion":3}').reliefDepth).toBe(1.5);
    expect(patternFromJSON('{"reliefDepth":3.5}').reliefDepth).toBe(3.5);
    expect(patternFromJSON('{"flightCompositionVersion":1}').flightCompositionVersion).toBe(3);
  });

  it('requires every purge key', () => {
    expect(() => purgeFromJSON('{"layerHeight":0.2,"baseToDetail":400,"detailToBase":400,"multiplier":1}')).toThrow(JSON_DECODE_MISSING_MESSAGE);
    expect(purgeFromJSON(purgeToJSON(PURGE_DEFAULTS))).toEqual(PURGE_DEFAULTS);
  });

  it('normalizes purge settings', () => {
    expect(normalizedPurge({ layerHeight: Number.NaN, baseToDetail: 2000, detailToBase: -1, multiplier: 3, density: 0.1 })).toEqual({ layerHeight: 0.2, baseToDetail: 1500, detailToBase: 0, multiplier: 2, density: 0.5 });
  });
});
