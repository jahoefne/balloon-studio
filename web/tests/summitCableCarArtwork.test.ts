// WP-R5: the Summit Cable Car artwork against the CoreGraphics dumps of the reference pack (docs/plan.md §7, §14) and the
// probes of mac/Tests/SummitCableCarTests.swift:9-10, :13-99, read through K3's NightFlightRelief, plus its time budget.
// The hashes are in tests/fixtures/hashes.json, through tests/support/rasterScenes.ts.
//
// The relief is built three times for the probes: over the TS raster with the crest of the TS mesh (always), over the TS
// raster with Swift's crest array, and over Swift's own raster, which proves that the probe code reads it like Swift does.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cgDashPath } from '../src/core/artwork/helpers';
import { designHeight, designWidth, drawSummitCableCar, summitCableCarBytes, summitTrail } from '../src/core/artwork/summitCableCarArtwork';
import { generate } from '../src/core/balloon/balloonGenerator';
import { classic, round, tall } from '../src/core/balloon/balloonParameters';
import type { BalloonMesh } from '../src/core/geometry/mesh';
import type { Point3 } from '../src/core/geometry/point3';
import { makePatternSettings } from '../src/core/patterns/balloonPatterns';
import { NightFlightRelief, smooth } from '../src/core/patterns/nightFlightRelief';
import { fieldFromBytes, type ReliefArtwork } from '../src/core/patterns/raster';
import { GrayCanvas } from '../src/core/raster/canvas';
import { dashPath } from '../src/core/raster/dash';
import { flatten } from '../src/core/raster/flatten';
import { Path, Verb } from '../src/core/raster/path';
import { check } from '../src/core/testing/check';
import { blockMeanDifference, heightfieldStats, pixelAgreement, THRESHOLDS } from './support/compare';
import { hasRasterPack, loadReliefDump, type ReliefDump } from './support/rasterFixtures';

const SETTINGS = makePatternSettings({ style: 'Summit Cable Car' });
const PARAMETERS = { classic, round, tall } as const;
type Shape = keyof typeof PARAMETERS;
const SHAPE_NAMES = Object.keys(PARAMETERS) as Shape[];

const dumps = new Map<Shape, ReliefDump>();
function dump(shape: Shape): ReliefDump {
  let d = dumps.get(shape);
  if (d === undefined) {
    d = loadReliefDump(`relief-summit-${shape}`);
    dumps.set(shape, d);
  }
  return d;
}

const meshes = new Map<Shape, BalloonMesh>();
function mesh(shape: Shape): BalloonMesh {
  let m = meshes.get(shape);
  if (m === undefined) {
    m = generate(PARAMETERS[shape]);
    meshes.set(shape, m);
  }
  return m;
}

function reliefWith(shape: Shape, artwork: ReliefArtwork): NightFlightRelief {
  return new NightFlightRelief(SETTINGS, PARAMETERS[shape], mesh(shape), { artworks: { nightFlight: artwork, summitCableCar: artwork } });
}

const reliefs = new Map<Shape, NightFlightRelief>();
const meshBytes = new Map<Shape, Uint8Array>();

/** The artwork as the app draws it: the crest radius comes from the TS mesh through NightFlightRelief. */
function tsRelief(shape: Shape): NightFlightRelief {
  let r = reliefs.get(shape);
  if (r === undefined) {
    r = reliefWith(shape, (width, height, diameter, columns, rows, radius) => {
      const bytes = summitCableCarBytes(width, height, diameter, columns, rows, radius);
      meshBytes.set(shape, bytes);
      return fieldFromBytes(bytes);
    });
    reliefs.set(shape, r);
  }
  return r;
}

function tsBytes(shape: Shape): Uint8Array {
  tsRelief(shape);
  return meshBytes.get(shape) as Uint8Array;
}

/** `crestRadius` of NightFlight.swift (nightFlightRelief.ts) over a given array. */
function crestRadius(crest: ArrayLike<number>, height: number, rows: number): (y: number) => number {
  return (y) => {
    const f = Math.max(0, Math.min(rows - 1, (y / height) * (rows - 1)));
    const i = Math.min(rows - 2, Math.trunc(f));
    const t = f - i;
    return (crest[i] as number) * (1 - t) + (crest[i + 1] as number) * t;
  };
}

function swiftCrestRadius(shape: Shape): (y: number) => number {
  const { crest, height, rows } = dump(shape).meta;
  return crestRadius(crest, height, rows);
}

const swiftCrestBytes = new Map<Shape, Uint8Array>();
function bytesOverSwiftCrest(shape: Shape): Uint8Array {
  let b = swiftCrestBytes.get(shape);
  if (b === undefined) {
    const { width, height, diameter, columns, rows } = dump(shape).meta;
    b = summitCableCarBytes(width, height, diameter, columns, rows, swiftCrestRadius(shape));
    swiftCrestBytes.set(shape, b);
  }
  return b;
}

/** Pixels within 1 mm of a hiking trail, dashes or not: where dash ends may differ from CoreGraphics. */
function trailMask(shape: Shape): Uint8Array {
  const { width, height, columns, rows } = dump(shape).meta;
  const radius = swiftCrestRadius(shape);
  const reach = width / (2 * Math.PI);
  const sy = height / designHeight;
  const sm = Math.min(sy, width / designWidth);
  const c = new GrayCanvas(columns, rows);
  c.scaleBy(columns / width, rows / height);
  c.setStrokeGray(1);
  c.setLineCap('round');
  c.setLineJoin('round');
  c.setLineWidth(1.4 * sm + 2);
  const line = (flatten(summitTrail(119), 0.01)[0] as { points: readonly number[] }).points;
  for (const hero of [0.02, 0.52]) {
    for (const wrap of [-1, 0, 1]) {
      const p = new Path();
      for (let i = 0; i < line.length; i += 2) {
        const x = (line[i] as number) * sm;
        const y = (line[i + 1] as number) * sy;
        const q = (hero + wrap + 0.07) * width + (x * reach) / Math.max(8, radius(y));
        if (i === 0) p.moveTo(q, y);
        else p.lineTo(q, y);
      }
      c.strokePath(p);
    }
  }
  return c.pixels;
}

/** Largest |mean(a) − mean(b)| over the 8×8 tiles of compare.ts, separately for tiles touching the mask and the rest. */
function blockMeans(a: Uint8Array, b: ArrayLike<number>, mask: Uint8Array, w: number, h: number): { on: number; off: number } {
  const size = THRESHOLDS.blockMean.block;
  const result = { on: 0, off: 0 };
  for (let y0 = 0; y0 < h; y0 += size) {
    for (let x0 = 0; x0 < w; x0 += size) {
      const y1 = Math.min(h, y0 + size);
      const x1 = Math.min(w, x0 + size);
      let sum = 0;
      let touches = false;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * w + x;
          sum += (a[i] as number) - (b[i] as number);
          if ((mask[i] as number) > 0) touches = true;
        }
      }
      const d = Math.abs(sum / ((y1 - y0) * (x1 - x0)));
      if (touches) result.on = Math.max(result.on, d);
      else result.off = Math.max(result.off, d);
    }
  }
  return result;
}

describe.skipIf(!hasRasterPack())('against the CoreGraphics bitmaps', () => {
  for (const shape of SHAPE_NAMES) {
    it(`${shape}: the relief of the TS mesh has the size and the crest of the raster JSON`, () => {
      const { width, height, bottom, columns, rows, depth, crest, style } = dump(shape).meta;
      const relief = tsRelief(shape);
      expect(style).toBe('Summit Cable Car');
      expect({ width: relief.width, height: relief.height, bottom: relief.bottom, columns: relief.columns, rows: relief.rows, depth: relief.depth }).toEqual({ width, height, bottom, columns, rows, depth });
      let worst = 0;
      for (let row = 0; row < rows; row++) worst = Math.max(worst, Math.abs((relief.crest[row] as number) - (crest[row] as number)));
      expect(worst).toBeLessThan(1e-11);
    });

    it(`${shape}: pixelAgreement within the plan's thresholds, on Swift's crest and on the crest of the TS mesh`, () => {
      const cg = dump(shape).raw.pixels;
      for (const bytes of [bytesOverSwiftCrest(shape), tsBytes(shape)]) {
        for (const { tolerance, min } of THRESHOLDS.pixelAgreement) expect(pixelAgreement(bytes, cg, tolerance)).toBeGreaterThanOrEqual(min);
      }
    });

    it(`${shape}: blockMeanDifference ≤ 8 everywhere, on the trails too; ≤ 2 off them`, () => {
      const { columns, rows } = dump(shape).meta;
      const cg = dump(shape).raw.pixels;
      expect(blockMeanDifference(tsBytes(shape), cg, columns, rows, THRESHOLDS.blockMean.block)).toBeLessThanOrEqual(THRESHOLDS.blockMean.max);
      const { on, off } = blockMeans(bytesOverSwiftCrest(shape), cg, trailMask(shape), columns, rows);
      expect(on).toBeLessThanOrEqual(THRESHOLDS.blockMean.max);
      // Not a plan threshold: pins that only the dash ends, which are a fit, come near the limit above.
      expect(off).toBeLessThanOrEqual(2);
    });

    it(`${shape}: height field after K3's blur within the plan's thresholds`, () => {
      const { width, height, columns, rows } = dump(shape).meta;
      const ts = smooth(smooth(fieldFromBytes(bytesOverSwiftCrest(shape)), true, columns, rows, width, height), false, columns, rows, width, height);
      const { depthMm, rms, p999, max } = THRESHOLDS.heightfield;
      const stats = heightfieldStats(ts, dump(shape).field, depthMm);
      expect(stats.rms).toBeLessThanOrEqual(rms);
      expect(stats.p999).toBeLessThanOrEqual(p999);
      expect(stats.max).toBeLessThanOrEqual(max);
    });
  }
});

// mac/Tests/SummitCableCarTests.swift:9-10, :13-84, with `check` as there.
function checkClassicProbes(relief: NightFlightRelief): void {
  const raw = mesh('classic');
  const artworkHeight = (p: Point3): number => relief.artworkHeight(p);
  check(Math.abs(relief.width - designWidth) < 0.1 && Math.abs(relief.height - designHeight) < 0.1, 'The classic artwork no longer matches the canvas the scene was drawn on');
  // Probe points in the artwork's own terms: panorama position u, millimetres above the
  // bottom edge and millimetres sideways from that meridian, warped by the crest radius.
  const rings = new Map<number, number>();
  const inner = raw.innerVertexRange;
  raw.vertices.forEach((v, i) => {
    if ((inner !== undefined && i >= inner.lowerBound && i < inner.upperBound) || !(v.z <= 220)) return;
    rings.set(v.z, Math.max(rings.get(v.z) ?? 0, Math.hypot(v.x, v.y)));
  });
  const profile = [...rings].sort((a, b) => a[0] - b[0]);
  const reach = relief.width / (2 * Math.PI);
  const radius = (y: number): number => {
    const z = relief.bottom + y;
    const j = profile.findIndex(([key]) => key >= z);
    const first = profile[0] as [number, number];
    if (j <= 0) return z <= first[0] ? first[1] : (profile[profile.length - 1] as [number, number])[1];
    const a = profile[j - 1] as [number, number];
    const b = profile[j] as [number, number];
    return a[1] + ((b[1] - a[1]) * (z - a[0])) / (b[0] - a[0]);
  };
  const at = (u: number, y: number, x = 0, r = 80): Point3 => {
    const angle = NightFlightRelief.origin + (u + (x * reach) / Math.max(8, radius(y)) / relief.width - 0.5) * 2 * Math.PI;
    return { x: r * Math.cos(angle), y: r * Math.sin(angle), z: relief.bottom + y };
  };
  const h = (u: number, y: number, x = 0): number => artworkHeight(at(u, y, x));
  const heroes: number[][] = [];
  for (const hero of [0.02, 0.52]) {
    const station = hero + 0.07;
    const low = station - 0.25;
    const cabin = hero - 0.075;
    check(h(station, 132.5, -6) > 2.0, 'Summit station missing');
    check(h(station, 124.5, 10.5) > 2.0, 'Bullwheel missing');
    check(h(station, 124.5, 10.5) > h(station, 125.5, 12.23) + 0.4, 'Bullwheel rim lost its recess');
    check(h(station, 146.5, 0.8) > 1.9, 'Station flag missing');
    check(h(low, 92.5) > 1.6, 'Cable missing at the bottom of its swag');
    check(h(low, 86) < 0.05 && h(low, 99) < 0.05, 'Sky around the cable is not clear');
    check(h(cabin, 94) > 1.9, 'Cabin hanger missing');
    check(h(cabin, 98.6) < h(cabin, 97.3) - 0.4, 'Hanger pivot lost its recess');
    const body = h(cabin, 72.2, -5.9);
    const glass = h(cabin, 75.5, -8.4);
    check(body > 1.9, 'Cabin body missing');
    check(glass < 1.6 && glass < body - 0.4, 'Cabin windows lost their recess');
    check(h(cabin, 100 - 35.6 * 0.84) > glass + 0.4, 'Passenger missing from the middle window');
    check(h(station, 107, -10) > 1.8, 'Snow missing on the lit face');
    check(h(station, 100, 22) > 1.6 && h(station, 100, 22) > h(station, 86, 22) + 0.6, "Snow hem does not step above the summit's body");
    const lit = h(station, 60, -16);
    const shoulder = h(station, 24, -40);
    const deep = h(station, 45, 40);
    const spur = h(station, 40, 56);
    check(lit > 1.1 && lit < 1.6, 'Lit mountain face missing');
    check(shoulder > 0.95 && shoulder < lit - 0.08, 'Buttress does not step below the lit face');
    check(deep > 0.5 && deep < 0.8, 'Shadow face missing');
    check(spur > deep + 0.08 && spur < lit, 'Shadow-side spur missing');
    // The hiking trail is a dashed groove in the lit face; follow its first bend.
    let groove = 10.0;
    for (let i = 1; i <= 19; i++) {
      const f = i / 20;
      const u = 1 - f;
      const x = u * u * u * -8 + 3 * u * u * f * 8 + 3 * u * f * f * -40 + f * f * f * -24;
      const y = u * u * u * 26 + 3 * u * u * f * 36 + 3 * u * f * f * 42 + f * f * f * 54;
      groove = Math.min(groove, h(station, y, x));
    }
    check(groove < 1.05, 'Hiking trail groove missing');
    check(h(hero - 0.125, 132, -7.2) > 1.8, 'Moon missing');
    check(h(hero - 0.125, 135.1, 5.3) < 0.01, 'Crescent cutout filled in');
    check(h(hero - 0.03, 145) > 1.5, 'Star missing');
    check(h(hero + 0.215, 63.5) > 1.5, 'Cloud missing');
    check(h(hero - 0.175, 21.5, -7) > 1.7, 'Chalet missing');
    check(h(hero - 0.235, 21) > 1.4, 'Fir missing');
    heroes.push([h(station, 132.5, -6), h(station, 124.5, 10.5), h(low, 92.5), body, glass, h(station, 107, -10), lit, deep, h(hero - 0.125, 132, -7.2), h(hero - 0.03, 145), h(hero + 0.215, 63.5), h(hero - 0.175, 21.5, -7), h(hero - 0.235, 21)]);
  }
  const [first, second] = heroes as [number[], number[]];
  first.forEach((a, i) => check(Math.abs(a - (second[i] as number)) < 0.12, 'Opposite halves have different detail or scale'));
  // The scene wraps: the ground and the first mountain's foot cross the panorama seam.
  let seamSamples = 0;
  for (let row = 1; row < 200; row++) {
    const v = row / 200;
    const left = artworkHeight(at(1 - 1e-8, v * relief.height));
    const right = artworkHeight(at(1e-8, v * relief.height));
    check(Math.abs(left - right) < 0.001, 'Relief is discontinuous across the seam');
    if (v > 0.03 && v < 0.3 && left > 0.4) seamSamples++;
  }
  check(seamSamples > 10, 'Landscape is missing across the wrap seam');
  const sectors = new Set<number>();
  for (let x = 0; x < 120; x++) {
    for (let y = 1; y < 39; y++) {
      if (artworkHeight(at(x / 120, (y / 40) * relief.height)) > 0.5) sectors.add(Math.floor(x / 15));
    }
  }
  check(sectors.size === 8, 'Panoramic scene does not wrap around the balloon');
  const a = at(0.445, 72.2, 0, 20);
  const b = at(0.445, 72.2, 0, 30);
  check(Math.abs(20 + relief.displacement(a) - 30 - relief.displacement(b)) < 1e-8, 'Grooves still deform the raised cabin');
}

// mac/Tests/SummitCableCarTests.swift:85-99: other envelopes keep the station on its summit and the cable between the stations.
function checkScaledProbes(scaled: NightFlightRelief, name: string): void {
  const sy = scaled.height / designHeight;
  const sm = Math.min(sy, scaled.width / designWidth);
  const z = (y: number): number => scaled.bottom + y;
  const probe = (u: number, y: number): number => {
    const angle = NightFlightRelief.origin + (u - 0.5) * 2 * Math.PI;
    return scaled.artworkHeight({ x: 80 * Math.cos(angle), y: 80 * Math.sin(angle), z: z(y) });
  };
  check(probe(0.59, 118.5 * sy + 12.2 * sm) > 2.0, `Summit station missing on the ${name} envelope`);
  check(probe(0.34, 118.5 * sy + 10 * sm - 36 * sy) > 1.6, `Cable missing on the ${name} envelope`);
  check(probe(0.34, 118.5 * sy + 10 * sm - 36 * sy + 6.5 * sm + 2) < 0.05, `Sky above the cable is not clear on the ${name} envelope`);
  check(probe(0.395 - (7.2 * sm) / scaled.width, 132 * sy) > 1.8, `Moon missing on the ${name} envelope`);
}

describe('SummitCableCarTests.swift:9-99', () => {
  it('holds on the TS raster, with the crest of the TS mesh', { timeout: 60_000 }, () => {
    checkClassicProbes(tsRelief('classic'));
    checkScaledProbes(tsRelief('round'), 'round');
    checkScaledProbes(tsRelief('tall'), 'tall');
  });

  it.skipIf(!hasRasterPack())("holds on the TS raster, with Swift's crest arrays", { timeout: 60_000 }, () => {
    const over = (shape: Shape): NightFlightRelief => reliefWith(shape, () => fieldFromBytes(bytesOverSwiftCrest(shape)));
    checkClassicProbes(over('classic'));
    checkScaledProbes(over('round'), 'round');
    checkScaledProbes(over('tall'), 'tall');
  });

  it.skipIf(!hasRasterPack())("holds on Swift's raster, so the probe code reads it like Swift", { timeout: 60_000 }, () => {
    const swift = (shape: Shape): NightFlightRelief => reliefWith(shape, () => fieldFromBytes(dump(shape).raw.pixels as Uint8Array));
    checkClassicProbes(swift('classic'));
    checkScaledProbes(swift('round'), 'round');
    checkScaledProbes(swift('tall'), 'tall');
  });
});

describe('the dashes of the trail', () => {
  // tests/fixtures/swift/cg-dash-summit-trail.txt, written by probes/cg-dash-summit-trail.swift.
  function cgEnds(): { x: number; y: number; starts: boolean }[] {
    const text = readFileSync(new URL('fixtures/swift/cg-dash-summit-trail.txt', import.meta.url), 'utf8');
    return text
      .trim()
      .split('\n')
      .map((line) => {
        const [head, ...rest] = line.split(' ');
        const v = rest.map(Number);
        return { x: v[v.length - 2] as number, y: v[v.length - 1] as number, starts: head === 'M' };
      });
  }

  function endsOf(path: Path): { x: number; y: number }[] {
    const ends: { x: number; y: number }[] = [];
    path.forEach((e) => {
      if (e.type !== Verb.Close) ends.push(e.points[e.points.length - 1] as { x: number; y: number });
    });
    return ends;
  }

  const worst = (a: readonly { x: number; y: number }[], b: readonly { x: number; y: number }[]): number => {
    let d = 0;
    a.forEach((p, i) => {
      const q = b[i] as { x: number; y: number };
      d = Math.max(d, Math.hypot(p.x - q.x, p.y - q.y));
    });
    return d;
  };

  it('lands within 0.13 mm of CoreGraphics', () => {
    const cg = cgEnds();
    const model = endsOf(cgDashPath(summitTrail(119), 3.4, 2.8, 0.45));
    expect(model).toHaveLength(cg.length);
    expect(worst(cg, model)).toBeLessThan(0.13);
  });

  it("needs the fit: true arc length is more than 0.4 mm off, Night Flight's flatness almost 0.2 mm", () => {
    const cg = cgEnds();
    const starts = cg.filter((e) => e.starts);
    const trueLength: { x: number; y: number }[] = [];
    dashPath(summitTrail(119), [3.4, 2.8], 0, 0.002).forEach((e) => {
      if (e.type === Verb.Move) trueLength.push(e.points[0] as { x: number; y: number });
    });
    expect(worst(starts, trueLength)).toBeGreaterThan(0.4);
    expect(worst(cg, endsOf(cgDashPath(summitTrail(119), 3.4, 2.8)))).toBeGreaterThan(0.19);
  });
});

describe('the seam of core/patterns/raster.ts', () => {
  it('gives Float(byte)/255, row 0 at the bottom', { timeout: 60_000 }, () => {
    const relief = tsRelief('classic');
    const { width, height, columns, rows } = relief;
    const bytes = tsBytes('classic');
    const field = drawSummitCableCar(width, height, classic.diameter, columns, rows, crestRadius(relief.crest, height, rows));
    expect(field).toHaveLength(columns * rows);
    // pixelAgreement instead of toEqual, which takes seconds on two million values.
    expect(pixelAgreement(field, fieldFromBytes(bytes), 0)).toBe(1);
    // The front meadow at level 0.56 is at the bottom (above its 7 mm ramp), and the sky is empty at the top.
    const x = Math.floor(0.3 * columns);
    expect(bytes[Math.ceil((7.5 * rows) / height) * columns + x]).toBe(Math.floor(0.56 * 255 + 0.5));
    expect(bytes[(rows - 2) * columns + x]).toBe(0);
  });
});

describe('performance', () => {
  // docs/plan.md §7, §14: 0.5 s in Node locally, a hard limit only with PERF=1 (load from other runs is not ours).
  it('draws classic within the budget', { timeout: 60_000 }, () => {
    const relief = tsRelief('classic');
    const { width, height, columns, rows, crest } = relief;
    const radius = crestRadius(crest, height, rows);
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      summitCableCarBytes(width, height, classic.diameter, columns, rows, radius);
      best = Math.min(best, performance.now() - start);
    }
    if (process.env['PERF'] === '1') expect(best).toBeLessThanOrEqual(500);
    else if (best > 500) console.warn(`Summit Cable Car classic took ${best.toFixed(0)} ms (budget 500 ms)`);
  });
});
