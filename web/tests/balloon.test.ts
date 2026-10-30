// Ported from mac/Tests/GeometryTests.swift @ cbda68d (lines 80-238). Every `require` is a `check`
// with the same message. FULL=1 (docs/plan.md §10) also runs the export-quality mesh of every case;
// otherwise a case's assertions run on its preview mesh, and only the defaults at export quality.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/balloon/balloonGenerator';
import {
  BalloonDecodeError,
  classic,
  filename,
  fitsPrinter,
  fitsWithBrim,
  fromJSON,
  fromValue,
  makeBalloonParameters,
  normalized,
  openingDiameter,
  round,
  tall,
  toJSON,
  totalHeight,
} from '../src/core/balloon/balloonParameters';
import { BalloonMesh, MeshError } from '../src/core/geometry/mesh';
import { add, cross, length, scale, sub, type Point3 } from '../src/core/geometry/point3';
import { SurfaceQuery } from '../src/core/geometry/surfaceQuery';
import { binarySTL } from '../src/core/io/binaryStl';
import { hypot, PI } from '../src/core/swift/dmath';
import { check } from '../src/core/testing/check';
import { lateralHits, verticalHits } from '../src/core/testing/hits';
import { parseSTL } from '../src/core/testing/stl';
import type { BalloonParameters } from '../src/core/types';
import { fixtureText, probeSection } from './support/swiftProbe';

const FULL = process.env.FULL === '1';
const EXPORT_IN_FAST = new Set(['classic', 'hanger-hollow-tethers']);

const P = makeBalloonParameters;
const cases: [string, BalloonParameters][] = [['classic', classic], ['round', round], ['tall', tall]];
for (const height of [80.0, 250.0]) {
  for (const diameter of [60.0, 240.0]) {
    for (const shoulder of [50.0, 75.0]) {
      cases.push([`bounds-${height}-${diameter}-${shoulder}`, P({ height, diameter, panels: 32, panelDepth: 8, neckDiameter: 80, neckHeight: 20, shoulder })]);
    }
  }
}
cases.push(['smooth', P({ panels: 8, panelDepth: 0 })]);
cases.push(['panel-count-normalization', P({ panels: 17, panelDepth: 7.5 })]);
cases.push(['minimum-neck', P({ neckDiameter: 12, neckHeight: 3 })]);
cases.push(['hollow-classic', P({ hollow: true })]);
cases.push(['hollow-thin-small', P({ height: 80, diameter: 60, panels: 32, panelDepth: 8, neckDiameter: 12, neckHeight: 3, shoulder: 75, hollow: true, wallThickness: 0.8 })]);
cases.push(['hollow-thick-tall', P({ height: 250, diameter: 60, panels: 32, panelDepth: 8, neckDiameter: 12, neckHeight: 3, shoulder: 50, hollow: true, wallThickness: 2.4 })]);
cases.push(['hollow-thick-wide', P({ height: 80, diameter: 240, panels: 32, panelDepth: 8, neckDiameter: 80, neckHeight: 12, shoulder: 75, hollow: true, wallThickness: 2.4 })]);
cases.push(['tethered-classic', P({ hollow: true, stringHoles: true })]);
cases.push(['tethered-small', P({ height: 80, diameter: 60, panels: 32, panelDepth: 8, neckDiameter: 12, neckHeight: 3, shoulder: 75, hollow: true, wallThickness: 0.8, stringHoles: true, cordClearance: 5 })]);
cases.push(['tethered-tall', P({ height: 250, diameter: 60, panels: 32, panelDepth: 8, neckDiameter: 12, neckHeight: 3, shoulder: 50, hollow: true, wallThickness: 2.4, stringHoles: true, cordClearance: 5 })]);
for (const hollow of [false, true]) {
  for (const tethers of [false, true]) {
    cases.push([`hanger-${hollow ? 'hollow' : 'filled'}-${tethers ? 'tethers' : 'plain'}`, P({ hollow, stringHoles: tethers, hangingLoop: true })]);
  }
}
cases.push(['filled-tethers', P({ stringHoles: true })]);
cases.push(['hanger-small', P({ height: 80, diameter: 60, panels: 32, panelDepth: 8, neckDiameter: 12, neckHeight: 3, shoulder: 75, hollow: true, wallThickness: 0.8, stringHoles: true, cordClearance: 5, hangingLoop: true, hangingClearance: 5 })]);
cases.push(['hanger-tall', P({ height: 250, diameter: 60, panels: 8, panelDepth: 8, hollow: true, wallThickness: 2.4, stringHoles: true, hangingLoop: true, hangingClearance: 2 })]);
cases.push(['hanger-wide', P({ height: 80, diameter: 240, panels: 32, panelDepth: 8, shoulder: 75, hollow: true, wallThickness: 2.4, hangingLoop: true, hangingClearance: 5 })]);
// Cross the independent dimensions at their extremes, on the narrowest
// balloon with the deepest grooves. Exercise both filled and hollow crowns.
for (const thickness of [8.0, 16.0]) {
  for (const wall of [4.0, 8.0]) {
    for (const flare of [2.5, 5.0]) {
      cases.push([
        `hanger-adjusted-${thickness}-${wall}-${flare}`,
        P({
          height: thickness === 8 ? 80 : 250,
          diameter: 60,
          panels: 32,
          panelDepth: 8,
          shoulder: 75,
          hollow: wall === 8,
          wallThickness: 0.8,
          stringHoles: true,
          hangingLoop: true,
          hangingClearance: flare === 5 ? 5 : 2,
          hangingThickness: thickness,
          hangingWall: wall,
          hangingFillet: flare,
          hangingCrownThickness: thickness === 8 ? 3.4 : 8,
        }),
      ]);
    }
  }
}
cases.push(['filled-tethers-small', P({ height: 80, diameter: 60, panels: 8, neckDiameter: 12, stringHoles: true, cordClearance: 5 })]);
cases.push(['filled-tethers-wide-neck', P({ height: 80, diameter: 240, panels: 32, neckDiameter: 80, neckHeight: 20, stringHoles: true, cordClearance: 2, hangingLoop: true })]);

function checkCase(name: string, input: BalloonParameters): void {
  const p = normalized(input);
  const preview = generate(p);
  preview.validate();
  const atExport = FULL || EXPORT_IN_FAST.has(name);
  const full = atExport ? generate(p, 'export') : preview;
  const data = binarySTL(full);
  const parsed = parseSTL(data);
  parsed.validate();
  const dims = parsed.dimensions;
  check(Math.abs(dims.x - p.diameter) < 0.001 && Math.abs(dims.y - p.diameter) < 0.001 && Math.abs(dims.z - totalHeight(p)) < 0.001, `Dimensions changed in export for ${name}`);
  check(Math.abs(preview.maxOverhang - full.maxOverhang) < 0.1, `Preview overhang differs from export for ${name}: ${preview.maxOverhang} / ${full.maxOverhang}`);
  check(parsed.vertices.every((v) => v.z >= 0), 'Model extends below the bed');
  check(fitsPrinter(p) && fitsWithBrim(p), 'Allowed parameters must fit P2S');
  check(parsed.vertices.length - parsed.triangles.length / 2 === (p.stringHoles ? (p.hollow ? -6 : -4) : 2) - (p.hangingLoop ? 2 : 0), 'Unexpected number of balloon attachment holes');
  if (p.hangingLoop) {
    // The lug's round bore is clear, and the lug is its full thickness
    // beside and above the bore, with flat faces for the cord to leave.
    const bore = p.hangingClearance / 2;
    const center = p.height + p.hangingFillet + 2 + bore;
    for (let sample = 0; sample <= 16; sample++) {
      const a = (2 * PI * sample) / 16;
      const offset = sample < 16 ? bore * 0.98 : 0;
      check(lateralHits(parsed, Math.cos(a) * offset, center + Math.sin(a) * offset).length === 0, `Eyelet bore is obstructed for ${name}`);
    }
    const inset = bore + p.hangingWall * 0.4;
    for (const [x, z] of [[0.0, center + inset], [inset, center], [-inset, center]] as const) {
      const faces = lateralHits(parsed, x, z);
      check(faces.length === 2 && Math.abs((faces[0] as number) + p.hangingThickness / 2) < 1e-3 && Math.abs((faces[1] as number) - p.hangingThickness / 2) < 1e-3, `Eyelet is not ${p.hangingThickness} mm thick around its bore for ${name}: ${String(faces)}`);
    }
    // The foot flares into the crown pad instead of meeting it at a corner.
    const flare = lateralHits(parsed, 0, p.height + 0.3);
    check(flare.length === 2 && (flare[0] as number) < -p.hangingThickness / 2 - 1 && (flare[1] as number) > p.hangingThickness / 2 + 1, `Eyelet foot has no fillet for ${name}: ${String(flare)}`);
    const reachX = bore + p.hangingWall + p.hangingFillet;
    const reachY = p.hangingThickness / 2 + p.hangingFillet;
    check(parsed.vertices.filter((v) => v.z > p.height + 1e-6).every((v) => Math.abs(v.x) <= reachX + 1e-5 && Math.abs(v.y) <= reachY + 1e-5), `Eyelet exceeds its footprint for ${name}`);
    check(Math.abs(dims.z - (p.height + p.hangingFillet + 2 + p.hangingClearance + p.hangingWall)) < 0.001, `Adjusted hanger height is incorrect: ${name}`);
    if (p.hollow) {
      const crown = verticalHits(parsed, 0, 0);
      check(Math.abs((crown[0] as number) - (p.height - p.hangingCrownThickness)) < 0.001, `Adjusted crown thickness is incorrect: ${name}`);
    }
    // The crown pad around the foot is stitched flat, without folded triangles.
    let padTriangles = 0;
    for (const t of full.triangles) {
      const a = full.vertices[t.a] as Point3;
      const b = full.vertices[t.b] as Point3;
      const c = full.vertices[t.c] as Point3;
      if (!(Math.abs(a.z - p.height) < 1e-9 && Math.abs(b.z - p.height) < 1e-9 && Math.abs(c.z - p.height) < 1e-9)) continue;
      padTriangles += 1;
      check(cross(sub(b, a), sub(c, a)).z > 1e-9, `Crown pad triangle folded over at ${a.x}, ${a.y} for ${name}`);
    }
    check(padTriangles > 100, `Crown pad is missing for ${name}`);
  }
  if (!p.hollow) {
    let area = 0.0;
    for (const t of parsed.triangles) {
      const a = parsed.vertices[t.a] as Point3;
      const b = parsed.vertices[t.b] as Point3;
      const c = parsed.vertices[t.c] as Point3;
      if (Math.abs(a.z) < 1e-6 && Math.abs(b.z) < 1e-6 && Math.abs(c.z) < 1e-6) area = area + length(cross(sub(b, a), sub(c, a))) / 2;
    }
    check(area > PI * ((p.neckDiameter / 2) * (p.neckDiameter / 2)) * 0.98, `Filled neck must retain its entire flat bottom: ${name}`);
    check(parsed.vertices.some((v) => Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) < 1e-6), 'Filled neck bottom center is missing');
  }
  if (p.hollow) {
    let minBaseRadius = Infinity;
    for (const v of parsed.vertices) {
      if (Math.abs(v.z) < 1e-6) minBaseRadius = Math.min(minBaseRadius, hypot(v.x, v.y));
    }
    check(Math.abs(2 * minBaseRadius - openingDiameter(p)) < 0.001, 'LED opening has the wrong diameter');
    check(
      !parsed.triangles.some((t) => {
        const a = parsed.vertices[t.a] as Point3;
        const b = parsed.vertices[t.b] as Point3;
        const c = parsed.vertices[t.c] as Point3;
        return Math.abs(a.z) + Math.abs(b.z) + Math.abs(c.z) < 1e-6 && hypot((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3) < openingDiameter(p) * 0.48;
      }),
      'The LED opening has been capped',
    );
    const innerRange = full.innerVertexRange as { lowerBound: number; upperBound: number };
    const contains = (i: number): boolean => i >= innerRange.lowerBound && i < innerRange.upperBound;
    const surface = new SurfaceQuery(full.vertices, full.triangles.filter((t) => !contains(t.a) && !contains(t.b) && !contains(t.c)));
    for (let i = innerRange.lowerBound; i < innerRange.upperBound; i += 37) {
      check(!surface.isCloser(p.wallThickness - 0.01, full.vertices[i] as Point3), `Shell thinner than requested for ${name} at ${i}: ${JSON.stringify(full.vertices[i])}`);
    }
    for (let i = Math.trunc(full.triangles.length / 2); i < full.triangles.length; i += 101) {
      const t = full.triangles[i] as { a: number; b: number; c: number };
      if (!(contains(t.a) && contains(t.b) && contains(t.c))) continue;
      const center = scale(add(add(full.vertices[t.a] as Point3, full.vertices[t.b] as Point3), full.vertices[t.c] as Point3), 1.0 / 3.0);
      check(!surface.isCloser(p.wallThickness - 0.03, center), `An inner triangle cuts into the shell for ${name} at ${i}`);
    }
  }
  if (name === 'classic') check(full.maxOverhang < 45, 'Default should have gentle outward overhangs');
}

function checkRejected(mesh: BalloonMesh, message: string, reason: string): void {
  let error: unknown;
  try {
    mesh.validate();
  } catch (e) {
    error = e;
  }
  check(error instanceof MeshError && error.reason === reason, message);
}

describe('balloon cases (GeometryTests.swift:124-209)', () => {
  it('builds the same 39 cases as Swift', () => {
    expect(cases.length).toBe(39);
  });
  for (const [name, input] of cases) {
    it(name, () => checkCase(name, input), 300_000);
  }
});

describe('normalization, migrations and round-trips (GeometryTests.swift:210-237)', () => {
  it('normalizes invalid input', () => {
    const invalid = normalized(P({ height: NaN, diameter: Infinity, panels: 9223372036854775807, panelDepth: -2, neckDiameter: -5, neckHeight: 500, shoulder: 1000 }));
    check(invalid.height === 220 && invalid.diameter === 180 && invalid.panels === 32 && invalid.neckDiameter === 12 && invalid.neckHeight === 20, 'Input normalization failed');
    generate(invalid).validate();
  });
  it('migrates old settings', () => {
    const migrated = fromJSON('{"height":215,"diameter":175,"panels":24,"panelDepth":5,"neckDiameter":30,"neckHeight":7,"shoulder":67}');
    check(migrated.height === 215 && migrated.diameter === 175 && !migrated.hollow && migrated.wallThickness === 1.2, 'Old settings were not preserved');
    check(migrated.hangingThickness === 12 && migrated.hangingWall === 6 && migrated.hangingFillet === 4 && migrated.hangingCrownThickness === 5, 'Legacy settings did not receive reinforced hanger defaults');
    const oldHanger = normalized(fromJSON('{"height":244,"hangingLoop":true,"hangingClearance":4}'));
    check(oldHanger.height === 240 && totalHeight(oldHanger) === 256 && oldHanger.hangingLoop, 'Legacy hanger must remain enabled and fit the printer');
  });
  it('normalizes hanger dimensions before the height', () => {
    const badHanger = normalized(P({ height: 250, hangingLoop: true, hangingClearance: NaN, hangingThickness: Infinity, hangingWall: 100, hangingFillet: -2, hangingCrownThickness: NaN }));
    check(badHanger.hangingClearance === 4 && badHanger.hangingThickness === 12 && badHanger.hangingWall === 8 && badHanger.hangingFillet === 2.5 && badHanger.hangingCrownThickness === 5 && totalHeight(badHanger) <= 256, 'Invalid hanger dimensions were not normalized before height');
    check(JSON.stringify(normalized(badHanger)) === JSON.stringify(badHanger), 'Hanger normalization is not stable');
  });
  it('round-trips settings', () => {
    const migrated = fromJSON('{"height":215,"diameter":175,"panels":24,"panelDepth":5,"neckDiameter":30,"neckHeight":7,"shoulder":67}');
    const saved = { ...migrated, hollow: true, wallThickness: 0.8 };
    const restored = fromJSON(toJSON(saved));
    expect(restored).toEqual(saved);
    check(JSON.stringify(restored) === JSON.stringify(saved), 'Shell settings did not round-trip');
    const rigged = { ...saved, stringHoles: true, cordClearance: 4.5, hangingLoop: true, hangingClearance: 5, hangingThickness: 14.5, hangingWall: 7, hangingFillet: 3.5, hangingCrownThickness: 6.2 };
    const restoredRig = fromJSON(toJSON(rigged));
    expect(restoredRig).toEqual(rigged);
    check(JSON.stringify(restoredRig) === JSON.stringify(rigged), 'String-hole settings did not round-trip');
  });
  it('validate accepts the classic balloon and rejects open and reversed meshes', () => {
    generate(classic).validate();
    const missing = generate(classic);
    missing.triangles.pop();
    checkRejected(missing, 'Missing face was accepted', 'the surface is not consistently closed');
    const reversed = generate(classic);
    const first = reversed.triangles[0] as { a: number; b: number; c: number };
    reversed.triangles[0] = { a: first.a, b: first.c, c: first.b };
    checkRejected(reversed, 'Reversed face was accepted', 'the surface is not consistently closed');
  });
});

describe('parameters beyond the Swift test file', () => {
  it('filename uses the locale format and Int() truncation', () => {
    expect(filename(classic)).toBe('Balloon-180x220mm-20panels.stl');
    expect(filename(P({ diameter: 175.9, hollow: true, wallThickness: 1.25, stringHoles: true, hangingLoop: true }))).toBe('Balloon-175x220mm-20panels-hollow-1.2mm-tethers-hanger.stl');
  });
  it('the fixed presets stay the Swift values', () => {
    expect(round).toMatchObject({ height: 190, diameter: 190, panels: 16, panelDepth: 4, neckDiameter: 34, neckHeight: 6, shoulder: 57 });
    expect(tall).toMatchObject({ height: 245, diameter: 160, panels: 24, panelDepth: 5, neckDiameter: 28, neckHeight: 8, shoulder: 68 });
  });
  it('panels round half away from zero in groups of four', () => {
    expect(normalized(P({ panels: 18 })).panels).toBe(20);
    expect(normalized(P({ panels: 17 })).panels).toBe(16);
    expect(normalized(P({ panels: 22 })).panels).toBe(24);
    expect(normalized(P({ panels: -5 })).panels).toBe(8);
  });
  it('a cancelled generate returns the empty mesh at the inset rings', () => {
    let polls = 0;
    const mesh = generate(P({ hollow: true }), 'preview', () => ++polls > 3);
    expect(mesh.vertices.length).toBe(0);
    expect(mesh.triangles.length).toBe(0);
    expect(mesh.maxOverhang).toBe(0);
    expect(polls).toBe(4);
    // A filled balloon never polls.
    let filledPolls = 0;
    generate(classic, 'preview', () => {
      filledPolls++;
      return true;
    });
    expect(filledPolls).toBe(0);
  });
  it('fromValue reads app objects and rejects what JSONDecoder rejects', () => {
    expect(fromValue({ height: 200, panels: 24, hollow: null })).toMatchObject({ height: 200, panels: 24, hollow: false });
    for (const bad of [{ height: '200' }, { panels: 1.5 }, { hollow: 1 }, { height: Infinity }, [], 1, null]) {
      expect(() => fromValue(bad)).toThrow(BalloonDecodeError);
    }
  });
});

describe('JSONDecoder on BalloonParameters fields (fixtures/swift/balloonDecode.txt)', () => {
  const dump = fixtureText('swift/balloonDecode.txt');
  const unescape = (s: string): string => s.replace(/\\u([0-9A-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  const bits = (x: number): string => {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, x);
    return view.getBigUint64(0).toString(16);
  };
  const attempt = <T>(f: () => T): T | 'err' => {
    try {
      return f();
    } catch (error) {
      expect(error).toBeInstanceOf(BalloonDecodeError);
      return 'err';
    }
  };
  it('each number literal, per field type', () => {
    const rows = readFileSync(new URL('fixtures/swift/balloonDecode.txt', import.meta.url), 'utf8').split('\n');
    const start = rows.indexOf('JSON');
    const end = rows.indexOf('TOP');
    expect(end - start).toBeGreaterThan(30);
    for (const row of rows.slice(start + 1, end)) {
      const [literal, d, i, b] = row.split('\t') as [string, string, string, string];
      if (literal === '0e5') continue; // Foundation quirk, see SWIFT-DIFF in decodeDouble
      const double = attempt(() => fromJSON(`{"height":${literal}}`).height);
      expect(double === 'err' ? 'D=err' : d === 'D=nil' ? (double === 220 ? 'D=nil' : '?') : `D=${bits(double)}`, literal).toBe(d);
      const int = attempt(() => fromJSON(`{"panels":${literal}}`).panels);
      // JS numbers cannot hold every Int; the ones they cannot are clamped to 32 anyway.
      const expectedInt = i.startsWith('I=') && i !== 'I=err' && i !== 'I=nil' ? Number(i.slice(2)) : i;
      expect(int === 'err' ? 'I=err' : i === 'I=nil' ? (int === 20 ? 'I=nil' : '?') : int, literal).toBe(expectedInt);
      const bool = attempt(() => fromJSON(`{"hollow":${literal}}`).hollow);
      expect(bool === 'err' ? 'B=err' : b === 'B=nil' ? (bool === false ? 'B=nil' : '?') : `B=${bool}`, literal).toBe(b);
    }
  });
  it('whole documents: BOM, duplicate keys, trailing commas, unread values', () => {
    const rows = dump.split('\n');
    const start = rows.indexOf('TOP');
    const documents = rows.slice(start + 1).filter((row) => row.length > 0);
    expect(documents.length).toBeGreaterThan(40);
    for (const row of documents) {
      const [escaped, outcome] = row.split('\t') as [string, string];
      const text = unescape(escaped).replaceAll('"v"', '"height"').replaceAll('"\\u0076"', '"height"');
      const result = attempt(() => fromJSON(text).height);
      const expected = outcome === 'err' ? 'err' : outcome === 'ok nil' ? 220 : `ok ${outcome.slice(3)}`;
      const actual = result === 'err' ? 'err' : result === 220 && outcome === 'ok nil' ? 220 : `ok ${bits(result)}`;
      expect(actual, escaped).toBe(expected);
    }
  });
  it('the fixture sections parse', () => {
    expect(probeSection(dump, 'DOUBLE').length).toBeGreaterThan(100);
  });
});
