// Ported from mac/Tests/STLImportTests.swift @ cbda68d. Every `require` is a `check` with the same
// message.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STL_ERRORS } from '../src/core/api';
import { generate } from '../src/core/balloon/balloonGenerator';
import { classic, filename, makeBalloonParameters, normalized, round, tall } from '../src/core/balloon/balloonParameters';
import { exportSTL, maximumBytes, maximumTriangles } from '../src/core/balloon/balloonStl';
import { centered, open, parse, read, STLImportError, swiftDouble } from '../src/core/balloon/stlImport';
import { basketDefaults, BasketGenerator } from '../src/core/basket/basketGeometry';
import { BalloonMesh } from '../src/core/geometry/mesh';
import { add, type Point3 } from '../src/core/geometry/point3';
import { binarySTL } from '../src/core/io/binaryStl';
import { makePatternSettings, makePurgeSettings, PaintedBalloon } from '../src/core/patterns/balloonPatterns';
import { NO_RASTERIZERS } from '../src/core/patterns/fileRaster';
import { threeMF } from '../src/core/patterns/threeMF';
import { swiftDescription } from '../src/core/swift/format';
import { check } from '../src/core/testing/check';
import type { BalloonParameters } from '../src/core/types';
import { fixtureText, probeSection } from './support/swiftProbe';

const P = makeBalloonParameters;
const close = (a: number, b: number, tolerance = 0.02): boolean => Math.abs(a - b) < tolerance;
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

function rejects(label: string, action: () => unknown): void {
  let error: unknown;
  try {
    action();
  } catch (e) {
    error = e;
  }
  check(error !== undefined, `Expected rejection: ${label}`);
}

function rejectsWith(message: string, action: () => unknown): void {
  let error: unknown;
  try {
    action();
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(STLImportError);
  expect((error as Error).message).toBe(message);
}

const legacyDirectory = process.env.LEGACY_STL_DIR === undefined ? new URL('../../mac/output/', import.meta.url) : new URL(`file://${process.env.LEGACY_STL_DIR}/`);
const original = new URL('hot_air_balloon_envelope_180x220mm.stl', legacyDirectory);
const oldAttachments = new URL('Balloon-222x244mm-with-attachments.stl', legacyDirectory);

const ascii = `solid triangle
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1e0 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid triangle`;

describe('saved settings', () => {
  const adjusted = P({ height: 210, diameter: 175, panels: 28, panelDepth: 6.5, neckDiameter: 36, neckHeight: 14, shoulder: 61, hollow: true, wallThickness: 1.4, stringHoles: true, cordClearance: 3.5, hangingLoop: true, hangingClearance: 4.5, hangingThickness: 15.5, hangingWall: 7.5, hangingFillet: 4.5, hangingCrownThickness: 7.2 });
  for (const p of [classic, round, tall, adjusted] as BalloonParameters[]) {
    it(filename(p), () => {
      const mesh = generate(p);
      const data = exportSTL(mesh, p);
      check(data.length === 84 + mesh.triangles.length * 50, 'Metadata changed STL length');
      const imported = read(data);
      const q = imported.parameters;
      check(imported.restoredSettings, 'Lost settings');
      check(close(q.height, p.height) && close(q.diameter, p.diameter) && close(q.panelDepth, p.panelDepth) && close(q.shoulder, p.shoulder), 'Shape settings changed');
      check(close(q.neckHeight, p.neckHeight) && close(q.neckDiameter, p.neckDiameter), 'Neck settings changed');
      check(q.panels === p.panels && q.hollow === p.hollow && q.stringHoles === p.stringHoles && q.hangingLoop === p.hangingLoop, 'Flags changed');
      check(close(q.wallThickness, p.wallThickness) && close(q.cordClearance, p.cordClearance) && close(q.hangingClearance, p.hangingClearance), 'Clearances changed');
      check(close(q.hangingThickness, p.hangingThickness) && close(q.hangingWall, p.hangingWall) && close(q.hangingFillet, p.hangingFillet) && close(q.hangingCrownThickness, p.hangingCrownThickness), 'Hanger adjustments changed');
      imported.mesh.validate();
    }, 60_000);
  }
});

describe('legacy reconstruction', () => {
  for (const p of [classic, round, tall, P({ panelDepth: 0 }), P({ hollow: true, wallThickness: 1.6 }), normalized(P({ stringHoles: true, hangingLoop: true }))] as BalloonParameters[]) {
    it(filename(p), () => {
      const imported = read(binarySTL(generate(p)));
      const q = imported.parameters;
      check(!imported.restoredSettings, 'Old STL should be estimated');
      check(close(q.height, p.height, 0.2) && close(q.diameter, p.diameter) && close(q.shoulder, p.shoulder, 0.2), 'Estimated profile differs');
      check(close(q.neckHeight, p.neckHeight) && close(q.neckDiameter, p.neckDiameter), 'Estimated neck differs');
      check(close(q.panelDepth, p.panelDepth, 0.1) && (p.panelDepth === 0 || q.panels === p.panels), 'Estimated panels differ');
      check(q.hollow === p.hollow, 'Hollow mode differs');
      if (p.hollow) check(close(q.wallThickness, p.wallThickness, 0.05), 'Wall estimate differs');
    }, 60_000);
  }
});

describe.skipIf(!existsSync(original) || !existsSync(oldAttachments))('existing files (set LEGACY_STL_DIR, gitignored mac/output)', () => {
  it('original Blender STL, reopened as an editable hollow balloon', () => {
    const imported = open(new Uint8Array(readFileSync(original)));
    check(close(imported.parameters.height, 220, 0.1) && close(imported.parameters.diameter, 180), 'Original Blender model differs');
    check(imported.parameters.panels === 20 && close(imported.parameters.panelDepth, 4, 0.1), 'Original Blender panels differ');
    // Reopened settings must still produce editable, validated shells, attachments and patterns.
    const edited = normalized({ ...imported.parameters, hollow: true, wallThickness: 1.4, stringHoles: true, hangingLoop: true });
    const editedMesh = generate(edited);
    editedMesh.validate();
    const pattern = makePatternSettings({ style: 'Horizontal stripes' });
    const painted = PaintedBalloon.make(editedMesh, edited, pattern, NO_RASTERIZERS);
    check(threeMF(painted, pattern, makePurgeSettings()).length > 100, 'Pattern export failed');
  }, 60_000);
  it('existing 222 × 244 mm attachment export', () => {
    const imported = open(new Uint8Array(readFileSync(oldAttachments)));
    check(close(imported.parameters.height, 244, 0.2) && close(imported.parameters.diameter, 222, 0.2), 'Existing attachment export differs');
  }, 60_000);
});

describe('ASCII, binary detection, centering, integrity, malformed and unsupported files', () => {
  const mesh = generate(classic);
  const headered = (): Uint8Array => exportSTL(mesh, classic);

  it('version 1 STL metadata migration and adjusted build height', () => {
    // Recreate the original header independently: old exports remain readable
    // and acquire the stronger defaults when next generated.
    const legacyData = binarySTL(mesh);
    const header = new Uint8Array(80);
    header.set(bytes('BSTL0001'));
    header.set([4, 20], 8);
    const view = new DataView(header.buffer);
    [244, 180, 4, 32, 6, 65, 1.2, 3, 4].forEach((value, i) => view.setFloat32(10 + 4 * i, value, true));
    header.set(createHash('sha256').update(header.subarray(0, 46)).update(legacyData.subarray(80)).digest(), 46);
    legacyData.set(header, 0);
    const legacySettings = read(legacyData);
    check(legacySettings.restoredSettings && legacySettings.parameters.hangingLoop && legacySettings.parameters.height === 240 && legacySettings.parameters.hangingThickness === 12, 'Version 1 STL settings did not migrate');
  });
  it('a binary file may start with "solid"', () => {
    const binary = binarySTL(mesh);
    binary.set(bytes('solid'), 0);
    check(parse(binary).triangles.length === mesh.triangles.length, 'Binary solid header misclassified');
  });
  it('translated model', () => {
    const translated = new BalloonMesh(mesh.vertices.map((v) => add(v, { x: 17, y: -22, z: 35 })), mesh.triangles, 0);
    const shifted = read(binarySTL(translated));
    check(close(shifted.parameters.height, 220, 0.1), 'Translated model failed');
  });
  it('metadata integrity', () => {
    let metadata = headered();
    metadata[10] = (metadata[10] as number) ^ 1;
    const corruptHeader = read(metadata);
    check(!corruptHeader.restoredSettings, 'Corrupt metadata trusted');
    metadata = headered();
    metadata[46] = (metadata[46] as number) ^ 1;
    check(!read(metadata).restoredSettings, 'Corrupt hanger metadata trusted');
    metadata = headered();
    metadata[84] = (metadata[84] as number) ^ 1;
    const modifiedPayload = read(metadata);
    check(!modifiedPayload.restoredSettings, 'Modified payload trusted');
  });
  it('ASCII triangle', () => {
    const parsed = parse(bytes(ascii));
    check(parsed.vertices.length === 3 && parsed.triangles.length === 1, 'ASCII triangle not read');
  });
  it('reconstruction through the ASCII path, with independent decimal formatting', () => {
    let text = 'solid balloon\n';
    for (const t of mesh.triangles) {
      text += 'facet normal 0 0 0\nouter loop\n';
      for (const i of [t.a, t.b, t.c]) {
        const p = mesh.vertices[i] as Point3;
        text += `vertex ${swiftDescription(p.x)} ${swiftDescription(p.y)} ${swiftDescription(p.z)}\n`;
      }
      text += 'endloop\nendfacet\n';
    }
    text += 'endsolid balloon\n';
    const asciiBalloon = read(bytes(text));
    check(close(asciiBalloon.parameters.height, 220, 0.1), 'ASCII balloon reconstruction failed');
  }, 60_000);
  it('rejections', () => {
    const binary = binarySTL(mesh);
    binary.set(bytes('solid'), 0);
    rejects('empty', () => read(new Uint8Array(0)));
    rejects('truncated', () => parse(binary.subarray(0, binary.length - 1)));
    rejects('triangle count', () => {
      const bad = binary.slice();
      bad[83] = 127;
      parse(bad);
    });
    rejects('ASCII missing end', () => parse(bytes(ascii.replaceAll('endfacet', ''))));
    rejects('ASCII NaN', () => parse(bytes(ascii.replaceAll('1e0', 'nan'))));
    rejects('degenerate', () => parse(bytes(ascii.replaceAll('1e0', '0'))));
    rejects('non-balloon', () => read(bytes(ascii)));
    rejects('basket', () => read(binarySTL(BasketGenerator.generate(basketDefaults()))));
  });
});

describe('error messages and limits', () => {
  it('match the strings in the frozen API', () => {
    rejectsWith(STL_ERRORS.emptyOrTooLarge, () => parse(new Uint8Array(0)));
    rejectsWith(STL_ERRORS.emptyOrTooLarge, () => parse({ length: maximumBytes + 1 } as unknown as Uint8Array));
    rejectsWith(STL_ERRORS.tooLarge, () => open({ length: maximumBytes + 1 } as unknown as Uint8Array));
    rejectsWith(STL_ERRORS.truncated, () => parse(new Uint8Array([0xc0, 0x80])));
    rejectsWith(STL_ERRORS.incomplete, () => parse(bytes('hello')));
    rejectsWith(STL_ERRORS.emptyOrTooLarge, () => parse(bytes('')));
    rejectsWith(STL_ERRORS.noTriangles, () => parse(bytes('solid\nendsolid')));
    rejectsWith(STL_ERRORS.noTriangles, () => parse(new Uint8Array(84)));
    rejectsWith(STL_ERRORS.invalidCoordinates, () => parse(bytes(ascii.replaceAll('1e0', '0'))));
    rejectsWith(STL_ERRORS.invalidCoordinates, () => parse(bytes(ascii.replaceAll('1e0', 'nan'))));
    rejectsWith(STL_ERRORS.invalidCoordinates, () => parse(bytes(ascii.replaceAll('1e0', '1e7'))));
    rejectsWith(STL_ERRORS.notABalloon, () => read(bytes(ascii)));
    expect(maximumTriangles).toBe(2_000_000);
  });
  it('a binary STL above the triangle limit is not read as binary', () => {
    // Swift's "exceeds the limit" error cannot be reached: a complete ASCII facet takes more than
    // 75 bytes, so 2,000,001 of them are over the 150 MB limit, and a larger binary count fails first.
    const data = new Uint8Array(84 + 50 * (maximumTriangles + 1));
    new DataView(data.buffer).setUint32(80, maximumTriangles + 1, true);
    rejectsWith(STL_ERRORS.truncated, () => parse(data));
  }, 60_000);
  it('a facet normal must be finite but a vertex reaches the coordinate check', () => {
    rejectsWith(STL_ERRORS.incomplete, () => parse(bytes(ascii.replace('normal 0 0 1', 'normal 0 0 inf'))));
    rejectsWith(STL_ERRORS.incomplete, () => parse(bytes(ascii.replace('normal 0 0 1', 'normal 0 0 x'))));
    rejectsWith(STL_ERRORS.incomplete, () => parse(bytes(ascii.replace('1e0', '1_0'))));
    rejectsWith(STL_ERRORS.invalidCoordinates, () => parse(bytes(ascii.replace('1e0', 'inf'))));
  });
});

describe('ASCII text semantics (fixtures/swift/balloonDecode.txt)', () => {
  const dump = fixtureText('swift/balloonDecode.txt');
  const unescape = (s: string): string => s.replace(/\\u([0-9A-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  it('Double(String), for every probed literal', () => {
    const rows = probeSection(dump, 'DOUBLE');
    expect(rows.length).toBeGreaterThan(100);
    const view = new DataView(new ArrayBuffer(8));
    for (const row of rows) {
      const [escaped, expected] = row.split('\t') as [string, string];
      const actual = swiftDouble(unescape(escaped));
      if (expected === 'nil') {
        expect(actual, escaped).toBeUndefined();
        continue;
      }
      expect(actual, escaped).toBeTypeOf('number');
      if (/^[7f]ff[48]/.test(expected)) {
        expect(actual, escaped).toBeNaN();
        continue;
      }
      view.setFloat64(0, actual as number);
      expect(view.getBigUint64(0).toString(16), escaped).toBe(expected);
    }
  });
  const facet = (separator: string, gap = ' '): string =>
    ['solid', `facet${gap}normal${gap}0${gap}0${gap}1`, `outer${gap}loop`, `vertex${gap}0${gap}0${gap}0`, `vertex${gap}1${gap}0${gap}0`, `vertex${gap}0${gap}1${gap}0`, 'endloop', 'endfacet', 'endsolid'].join(separator);
  it('Unicode newlines separate lines', () => {
    for (const separator of ['\n', '\r', '\r\n', '\u000b', '\f', '\u0085', ' ', ' ', '\n\n', ' \r\n ']) {
      expect(parse(bytes(facet(separator))).triangles.length, JSON.stringify(separator)).toBe(1);
    }
  });
  it('Unicode whitespace separates words, by Character', () => {
    for (const gap of ['\t', '  ', ' ', '　', ' ', ' ', ' ́']) {
      expect(parse(bytes(facet('\n', gap))).triangles.length, JSON.stringify(gap)).toBe(1);
    }
    for (const gap of ['​', '﻿', '\u001c', '\u001f']) {
      expect(() => parse(bytes(facet('\n', gap))), JSON.stringify(gap)).toThrow(STLImportError);
    }
  });
  it('keywords are case-insensitive and one BOM is skipped', () => {
    expect(parse(bytes(ascii.toUpperCase())).triangles.length).toBe(1);
    expect(parse(bytes(`﻿${ascii}`)).triangles.length).toBe(1);
    expect(() => parse(bytes(`﻿﻿${ascii}`))).toThrow(STLImportError);
  });
  it('multiple solids and shared vertices weld exactly, -0 with 0', () => {
    const text = `${ascii}\n${ascii.replace('vertex 0 0 0', 'vertex -0 0 -0.0')}`;
    const parsed = parse(bytes(text));
    expect(parsed.vertices.length).toBe(3);
    expect(parsed.triangles.length).toBe(2);
  });
});

describe('centered', () => {
  it('moves the bounding-box center to the axis and the bottom to z = 0', () => {
    const mesh = new BalloonMesh([{ x: 1, y: 2, z: 3 }, { x: 5, y: 8, z: 4 }, { x: 3, y: 2, z: 9 }], [{ a: 0, b: 1, c: 2 }], 7);
    const result = centered(mesh);
    expect(result.vertices).toEqual([{ x: -2, y: -3, z: 0 }, { x: 2, y: 3, z: 1 }, { x: 0, y: -3, z: 6 }]);
    expect(result.maxOverhang).toBe(7);
    expect(mesh.vertices[0]).toEqual({ x: 1, y: 2, z: 3 });
  });
});
