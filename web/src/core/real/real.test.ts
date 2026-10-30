// The wiring of the real core: what the grid in harness/ cannot see. Bytes and normalized settings
// of exports are the harness's job (`VITE_CORE=real npm run test:reference`).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { routeRequest } from '../../worker/route';
import type { ExportRequest, PreviewRequest } from '../../worker/protocol';
import { CoreFailure, INVALID_SETTINGS_MESSAGE, LAMP_SETTINGS_ERROR, MISSING_SETTINGS_MESSAGE, STL_ERRORS, type Codec } from '../api';
import { core as stub } from '../stub/index';
import { FIGURE_STYLES, type CableClipParameters, type MeshBuffers } from '../types';
import { core } from './index';
import { core as parameters } from './parameters';

const fixtureDir = new URL('../../../../references/fixtures/legacy-settings/', import.meta.url);
const fixtures = readdirSync(fixtureDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({ name, text: readFileSync(new URL(name, fixtureDir), 'utf8') }));

const failure = (run: () => unknown): CoreFailure => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(CoreFailure);
    return error as CoreFailure;
  }
  throw new Error('expected a CoreFailure');
};

/** A mesh the preview can draw: whole triangles, indices in range, one color per face. */
const checkMesh = (mesh: MeshBuffers, colored: boolean) => {
  expect(mesh.positions).toBeInstanceOf(Float32Array);
  expect(mesh.indices).toBeInstanceOf(Uint32Array);
  expect(mesh.indices.length % 3).toBe(0);
  expect(mesh.indices.length).toBeGreaterThan(0);
  const vertices = mesh.positions.length / 3;
  expect(mesh.indices.every((i) => i < vertices)).toBe(true);
  expect(mesh.faceColors?.length).toBe(colored ? mesh.indices.length / 3 : undefined);
  expect(mesh.dimensions.x).toBeGreaterThan(0);
};

const snapshot = { parameters: core.balloon.defaults, pattern: core.balloon.pattern.defaults, purge: core.balloon.purge.defaults };

describe('the two halves', () => {
  it('say they are real', () => {
    expect(core.implementation).toBe('real');
    expect(parameters.implementation).toBe('real');
  });
  it('have the STL limits on the parameter half', () => {
    expect(parameters.stl).toEqual({ maximumBytes: 150_000_000, maximumTriangles: 2_000_000 });
  });
});

describe('previews through the worker route', () => {
  const route = (request: PreviewRequest) => {
    const { response, transfer } = routeRequest(core, { type: 'preview', id: 1, request });
    if (!response.ok) throw new Error(response.error.message);
    return { result: response.result as never, transfer };
  };

  it('balloon: mesh, one color per face, an empty estimate for Solid', () => {
    const { result, transfer } = route({ part: 'balloon', input: snapshot });
    const preview = core.balloon.preview(snapshot);
    checkMesh(preview.mesh, true);
    expect(preview.mesh.faceColors!.every((c) => c === 0)).toBe(true);
    expect(preview.mesh.dimensions).toEqual({ x: 180, y: 180, z: 220 });
    expect(preview.estimate).toEqual({ mixedLayers: 0, minimumChanges: 0, maximumChanges: 0, minimumGrams: 0, maximumGrams: 0 });
    expect((result as typeof preview).parameters).toEqual(core.balloon.defaults);
    expect(transfer.length).toBe(3);
  });

  it('basket: mesh without colors', () => {
    const { result } = route({ part: 'basket', input: core.basket.defaults });
    checkMesh((result as ReturnType<typeof core.basket.preview>).mesh, false);
  });

  it('ring, solid: exploded is assembled, no parts', () => {
    const preview = core.ring.preview(core.ring.presets.solid);
    checkMesh(preview.assembled, true);
    expect(preview.exploded).toBe(preview.assembled);
    expect(preview.parts).toEqual([]);
    expect(preview.assembled.faceColors!.some((c) => c === 1)).toBe(true);
  });

  it('ring, segmented: the four print parts with their colors, a transfer list without repeats', () => {
    const { result, transfer } = route({ part: 'ring', input: core.ring.presets.large });
    const preview = result as ReturnType<typeof core.ring.preview>;
    checkMesh(preview.assembled, true);
    checkMesh(preview.exploded, true);
    expect(preview.parts.length).toBe(4);
    for (const part of preview.parts) checkMesh(part, true);
    expect(new Set(transfer).size).toBe(transfer.length);
  });

  it('figure: print view, hanging view with its thread, holes', () => {
    const preview = core.figure.preview({ ...core.figure.defaults, chainHole: true });
    checkMesh(preview.printMesh, false);
    checkMesh(preview.hangingMesh, true);
    expect(preview.hangingMesh.faceColors!.filter((c) => c === 1).length).toBe(12);
    expect(preview.hangingHole).not.toBeNull();
    expect(preview.holesWanted).toBe(2);
    expect(preview.width).toBe(core.figure.derived(preview.parameters).width);
  });

  it('clip: print view, assembly in three colors, derived fields', () => {
    const preview = core.clip.preview(core.clip.defaults);
    checkMesh(preview.printMesh, false);
    checkMesh(preview.assemblyMesh, true);
    expect(new Set(preview.assemblyMesh.faceColors)).toEqual(new Set([0, 2, 3]));
    expect(preview.clip).toEqual(core.clip.clip(core.clip.defaults));
  });

  it('cloud and patterned balloons still come from the stub', () => {
    const patterned = { ...snapshot, pattern: { ...snapshot.pattern, style: 'Hearts' as const } };
    expect(core.balloon.preview(patterned).mesh.positions).toEqual(stub.balloon.preview(patterned).mesh.positions);
    expect(core.cloud.preview).toBe(stub.cloud.preview);
  });
});

describe('cancellation', () => {
  const always = () => true;

  it('a cancelled preview has empty meshes and the normalized parameters', () => {
    const empty = { isCancelled: always };
    expect(core.balloon.preview(snapshot, empty).mesh.indices.length).toBe(0);
    expect(core.basket.preview(core.basket.defaults, empty).mesh.indices.length).toBe(0);
    expect(core.ring.preview(core.ring.presets.large, empty).assembled.indices.length).toBe(0);
    expect(core.figure.preview(core.figure.defaults, empty).printMesh.indices.length).toBe(0);
    const clip = core.clip.preview(core.clip.defaults, empty);
    expect(clip.printMesh.indices.length).toBe(0);
    expect(clip.clip.problem).toBeNull();
  });

  it('polls before and after generating; the hollow inset polls once per ring in between', () => {
    let solid = 0;
    core.balloon.preview(snapshot, { isCancelled: () => (solid++, false) });
    expect(solid).toBe(2);
    let hollow = 0;
    const parameters = { ...core.balloon.defaults, hollow: true, diameter: 60, height: 80, neckDiameter: 12 };
    core.balloon.preview({ ...snapshot, parameters }, { isCancelled: () => (hollow++, false) });
    expect(hollow).toBeGreaterThan(2);
  }, 60_000);

  it('cancelling mid-generation is the empty mesh too', () => {
    let polls = 0;
    const parameters = { ...core.balloon.defaults, hollow: true, diameter: 60, height: 80, neckDiameter: 12 };
    const preview = core.balloon.preview({ ...snapshot, parameters }, { isCancelled: () => ++polls > 5 });
    expect(preview.mesh.indices.length).toBe(0);
  });

  it('an export never polls (Task.detached has no cancellation handler)', () => {
    const result = core.clip.export(core.clip.defaults, { isCancelled: always });
    expect(result.files[0]!.bytes.length).toBeGreaterThan(84);
    expect(core.balloon.export(snapshot, { isCancelled: always, quality: 'preview' }).files[0]!.bytes.length).toBeGreaterThan(84);
  });

  it('progress does not change the result', () => {
    const seen: number[] = [];
    const a = core.clip.export(core.clip.defaults, { onProgress: (x) => seen.push(x) });
    const b = core.clip.export(core.clip.defaults);
    expect(seen).toEqual([0, 1]);
    expect(a.files[0]!.bytes).toEqual(b.files[0]!.bytes);
  });
});

describe('exports', () => {
  it('have one file named like the export, with the mime of its format', () => {
    const route = (request: ExportRequest) => {
      const { response, transfer } = routeRequest(core, { type: 'export', id: 1, request });
      if (!response.ok) throw new Error(response.error.message);
      const result = response.result as ReturnType<typeof core.clip.export>;
      expect(transfer).toEqual([result.files[0]!.bytes.buffer]);
      expect(result.files.map((f) => f.name)).toEqual([result.filename]);
      return result;
    };
    expect(route({ part: 'balloon', input: snapshot }).mime).toBe('model/stl');
    expect(route({ part: 'clip', input: core.clip.defaults }).mime).toBe('model/stl');
    expect(route({ part: 'basket', input: core.basket.defaults }).filename).toBe('Basket-wicker-64x48x42mm.stl');
    expect(route({ part: 'ring', input: core.ring.presets.solid }).mime).toBe('model/stl');
    expect(route({ part: 'ring', input: core.ring.presets.large }).mime).toBe('application/zip');
    expect(route({ part: 'figure', input: { parameters: core.figure.defaults, variant: 'single' } }).mime).toBe('model/stl');
  });

  it('honor the quality', { timeout: 60_000 }, () => {
    const size = (quality: 'preview' | 'export') => core.basket.export(core.basket.defaults, { quality }).files[0]!.bytes.length;
    expect(size('preview')).toBeLessThan(size('export'));
  });

  it('a clip with a problem is blocked unless told otherwise', () => {
    const p: CableClipParameters = { ...core.clip.defaults, nailDiameter: 3, nailHeadDiameter: 3 };
    const problem = core.clip.clip(p).problem!;
    const error = failure(() => core.clip.export(p));
    expect(error.code).toBe('export-blocked');
    expect(error.message).toBe(problem);
    expect(core.clip.export(p, { ignoreExportProblem: true }).files[0]!.bytes.length).toBeGreaterThan(84);
  });
});

describe('STL import', () => {
  it('restores the settings of its own export and builds the editable preview', () => {
    const parameters = { ...core.balloon.defaults, diameter: 150, height: 170 };
    const [file] = core.balloon.export({ ...snapshot, parameters }, { quality: 'preview' }).files;
    const imported = core.stl.open(file!.bytes);
    expect(imported.restoredSettings).toBe(true);
    // The header holds Float32, so 1.2 comes back as its nearest Float32.
    expect(imported.parameters).toEqual(core.balloon.normalize({ ...parameters, wallThickness: Math.fround(1.2) }));
    checkMesh(imported.mesh, false);
    checkMesh(imported.editable, false);
    expect(imported.mesh.indices.length).toBe(imported.editable.indices.length);
  });

  it('maps STLImportError to invalid-stl with the Mac strings', () => {
    const cases: [Uint8Array, string][] = [
      [new Uint8Array(0), STL_ERRORS.emptyOrTooLarge],
      [new Uint8Array(50), STL_ERRORS.incomplete],
      [new TextEncoder().encode('solid x\nendsolid x\n'), STL_ERRORS.noTriangles],
    ];
    for (const [bytes, message] of cases) {
      const error = failure(() => core.stl.open(bytes));
      expect(error.code).toBe('invalid-stl');
      expect(error.message).toBe(message);
    }
  });
});

describe('codecs read like JSONDecoder', () => {
  const codecs: [string, Codec<never>, string][] = [
    ['balloon', core.balloon.codec as unknown as Codec<never>, 'height'],
    ['ring', core.ring.codec as unknown as Codec<never>, 'height'],
    ['figure', core.figure.codec as unknown as Codec<never>, 'height'],
    ['clip', core.clip.codec as unknown as Codec<never>, 'length'],
  ];

  it.each(codecs)('%s: lenient, the first of two keys, a trailing comma, a BOM', (_, codec, key) => {
    expect(() => codec.decode('{}')).not.toThrow();
    expect(() => codec.decode('{"other":01,}')).not.toThrow();
    expect(() => codec.decode('﻿{}')).not.toThrow();
    expect(codec.decode(`{"${key}":9,"${key}":10}`)).toEqual(codec.decodeValue({ [key]: 9 }));
    expect(codec.decode(`{"${key}":9}`)).not.toEqual(codec.decode('{}'));
    expect(codec.decode(codec.encode(codec.decode('{}')))).toEqual(codec.decode('{}'));
  });

  it.each(codecs)('%s: the format message for a syntax error and a wrong type', (_, codec, key) => {
    for (const text of ['nope', '[]', `{"${key}":"9"}`, `{"${key}":1e400}`]) {
      const error = failure(() => codec.decode(text));
      expect(error.code).toBe('invalid-settings');
      expect(error.message).toBe(INVALID_SETTINGS_MESSAGE);
    }
    expect(failure(() => codec.decodeValue(7)).message).toBe(INVALID_SETTINGS_MESSAGE);
  });

  it.each(codecs)('%s: the missing message for a null document', (_, codec) => {
    expect(failure(() => codec.decode('null')).message).toBe(MISSING_SETTINGS_MESSAGE);
    expect(failure(() => codec.decodeValue(null)).message).toBe(MISSING_SETTINGS_MESSAGE);
  });

  it('basket: synthesized, so a missing key is the other message and the first failure decides', () => {
    expect(failure(() => core.basket.codec.decode('{"style":"ribbed"}')).message).toBe(MISSING_SETTINGS_MESSAGE);
    expect(failure(() => core.basket.codec.decode('{"style":"zebra"}')).message).toBe(INVALID_SETTINGS_MESSAGE);
    expect(failure(() => core.basket.codec.decode('{"width":"x"}')).message).toBe(MISSING_SETTINGS_MESSAGE);
    expect(core.basket.codec.decode(core.basket.codec.encode(core.basket.defaults))).toEqual(core.basket.defaults);
  });

  it('figure and clip: an unknown raw value falls back', () => {
    expect(core.figure.codec.decode('{"style":"comet","surface":3}')).toEqual(core.figure.defaults);
    expect(core.clip.codec.decode('{"mount":"glue"}')).toEqual(core.clip.defaults);
  });

  it('balloon: a panel count must be whole', () => {
    expect(failure(() => core.balloon.codec.decode('{"panels":20.5}')).message).toBe(INVALID_SETTINGS_MESSAGE);
    expect(core.balloon.codec.decode('{"panels":1.6e1}').panels).toBe(16);
  });

  it('lamp settings stay on the stub until WP-K4', () => {
    expect(core.lampSettings.decode('{"width":100,"depth":16,"diffuserThickness":0.8}').width).toBe(100);
    expect(failure(() => core.lampSettings.decode('{"width":100}')).message).toBe(LAMP_SETTINGS_ERROR);
  });
});

describe('the stub agrees with the real core on everything but geometry', () => {
  const balloons = [core.balloon.presets.classic, core.balloon.presets.round, core.balloon.presets.tall, { ...core.balloon.defaults, hollow: true, wallThickness: 1.35, stringHoles: true, hangingLoop: true }];

  it('balloon', () => {
    for (const p of balloons) {
      expect(stub.balloon.derived(p)).toEqual(core.balloon.derived(p));
      expect(stub.balloon.normalize({ ...p, panels: 17, height: 1e4 })).toEqual(core.balloon.normalize({ ...p, panels: 17, height: 1e4 }));
      expect(stub.balloon.codec.encode(p)).toBe(core.balloon.codec.encode(p));
    }
  });

  it('basket and ring', () => {
    const baskets = [core.basket.defaults, { ...core.basket.defaults, style: 'ribbed' as const, wallThickness: 3 }];
    for (const p of baskets) expect(stub.basket.derived(p)).toEqual(core.basket.derived(p));
    expect(stub.basket.match(core.basket.defaults, core.balloon.defaults)).toEqual(core.basket.match(core.basket.defaults, core.balloon.defaults));
    const rings = [core.ring.defaults, core.ring.presets.large, core.ring.presets.solid, { ...core.ring.presets.large, stripWidth: 8.25 }];
    for (const p of rings) {
      expect(stub.ring.derived(p)).toEqual(core.ring.derived(p));
      expect(stub.ring.normalize({ ...p, diameter: 1 })).toEqual(core.ring.normalize({ ...p, diameter: 1 }));
    }
  });

  it('figure', () => {
    for (const style of FIGURE_STYLES) {
      const p = { ...core.figure.defaults, style };
      expect(stub.figure.derived(p)).toEqual(core.figure.derived(p));
      expect(stub.figure.outline(style)).toEqual(core.figure.outline(style));
    }
  });

  it('clip: the texts too, now that the stub formats like String(format:locale:)', () => {
    const clips: CableClipParameters[] = [
      core.clip.defaults,
      { ...core.clip.defaults, nailDiameter: 3, nailHeadDiameter: 3.25 },
      { ...core.clip.defaults, nailHeadHeight: 1.35, plate: 1.4 },
      { ...core.clip.defaults, overlap: 1.45, cableDiameter: 2.35 },
      { ...core.clip.defaults, mount: 'adhesive' },
      { ...core.clip.defaults, cableDiameter: 4.15, flat: true },
    ];
    for (const p of clips) {
      expect(stub.clip.clip(p)).toEqual(core.clip.clip(p));
      expect(stub.clip.names(p)).toEqual(core.clip.names(p));
    }
  });

  it('every legacy fixture that holds lamp settings decodes alike', () => {
    expect(fixtures.length).toBeGreaterThan(0);
    for (const { text } of fixtures) expect(core.lampSettings.decode(text)).toEqual(stub.lampSettings.decode(text));
  });
});
