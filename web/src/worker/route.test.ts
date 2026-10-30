import { describe, expect, it, vi } from 'vitest';
import { CoreFailure, STL_ERRORS, type CoreApi } from '../core/api';
import { core } from '../core/stub/index';
import { CLOUD_VIEWS, type MeshBuffers } from '../core/types';
import type { ExportRequest, PreviewRequest, WorkerRequest } from './protocol';
import { createRequestHandler, needsAssets, routeRequest } from './route';

const snapshot = { parameters: core.balloon.defaults, pattern: core.balloon.pattern.defaults, purge: core.balloon.purge.defaults };

const previews: PreviewRequest[] = [
  { part: 'balloon', input: snapshot },
  { part: 'basket', input: core.basket.defaults },
  { part: 'ring', input: core.ring.presets.large },
  { part: 'cloud', input: core.cloud.defaults('cloud') },
  { part: 'sun', input: core.cloud.defaults('sun') },
  { part: 'figure', input: core.figure.defaults },
  { part: 'clip', input: core.clip.defaults },
];

/** A mesh the preview can draw: whole triangles, indices in range, one color per face. */
const checkMesh = (mesh: MeshBuffers) => {
  expect(mesh.positions).toBeInstanceOf(Float32Array);
  expect(mesh.indices).toBeInstanceOf(Uint32Array);
  expect(mesh.indices.length % 3).toBe(0);
  expect(mesh.indices.length).toBeGreaterThan(0);
  const vertices = mesh.positions.length / 3;
  expect(Math.max(...mesh.indices)).toBeLessThan(vertices);
  if (mesh.faceColors) expect(mesh.faceColors.length).toBe(mesh.indices.length / 3);
};

describe('routeRequest', () => {
  it.each(previews.map((request) => [request.part, request] as const))('previews %s with transferable buffers', (_, request) => {
    const { response, transfer } = routeRequest(core, { type: 'preview', id: 7, request });
    expect(response.id).toBe(7);
    expect(response.ok).toBe(true);
    expect(transfer.length).toBeGreaterThan(0);
    expect(new Set(transfer).size).toBe(transfer.length);
    // What the worker posts survives structured cloning.
    expect(() => structuredClone(response)).not.toThrow();
  });

  it('builds the bundle each editor expects', () => {
    const run = <T>(request: PreviewRequest) => {
      const { response } = routeRequest(core, { type: 'preview', id: 1, request });
      if (!response.ok) throw new Error(response.error.message);
      return response.result as T;
    };
    const balloon = run<{ mesh: MeshBuffers; estimate: object }>(previews[0]!);
    checkMesh(balloon.mesh);
    expect(balloon.estimate).toHaveProperty('maximumGrams');
    const ring = run<{ assembled: MeshBuffers; exploded: MeshBuffers; parts: MeshBuffers[] }>(previews[2]!);
    expect(ring.parts).toHaveLength(4);
    [ring.assembled, ring.exploded, ...ring.parts].forEach(checkMesh);
    const solid = run<{ parts: MeshBuffers[] }>({ part: 'ring', input: core.ring.presets.solid });
    expect(solid.parts).toEqual([]);
    const cloud = run<{ views: Record<string, MeshBuffers>; printedParts: number; cablesWithoutClamp: string[] }>(previews[3]!);
    expect(Object.keys(cloud.views)).toEqual([...CLOUD_VIEWS]);
    Object.values(cloud.views).forEach(checkMesh);
    expect(cloud.printedParts).toBe(5);
    expect(cloud.cablesWithoutClamp).toEqual([]);
    const figure = run<{ printMesh: MeshBuffers; hangingMesh: MeshBuffers; holes: number }>(previews[5]!);
    [figure.printMesh, figure.hangingMesh].forEach(checkMesh);
    expect(figure.holes).toBe(1);
    const clip = run<{ printMesh: MeshBuffers; assemblyMesh: MeshBuffers; clip: { problem: string | null } }>(previews[6]!);
    [clip.printMesh, clip.assemblyMesh].forEach(checkMesh);
    expect(clip.clip.problem).toBeNull();
  });

  it.each([
    [{ part: 'balloon', input: snapshot }, 'Balloon-180x220mm-20panels.stl', 'model/stl'],
    [{ part: 'balloon', input: { ...snapshot, pattern: { ...snapshot.pattern, style: 'Hearts' } } }, 'Balloon-180x220mm-20panels-pattern.3mf', 'model/3mf'],
    [{ part: 'basket', input: core.basket.defaults }, 'Basket-wicker-64x48x42mm.stl', 'model/stl'],
    [{ part: 'ring', input: core.ring.presets.large }, 'Mobile-Ring-450mm-8mm-uplight-kit.zip', 'application/zip'],
    [{ part: 'ring', input: core.ring.presets.solid }, 'Mobile-Ring-450mm-8mm-uplight-solid.stl', 'model/stl'],
    [{ part: 'cloud', input: core.cloud.defaults('cloud') }, 'Cloud-Lamp-230mm-kit.zip', 'application/zip'],
    [{ part: 'sun', input: core.cloud.defaults('sun') }, 'Sun-Lamp-soft-star-200mm-kit.zip', 'application/zip'],
    [{ part: 'figure', input: { parameters: core.figure.defaults, variant: 'single' } }, 'Mobile-Figure-star-60mm.stl', 'model/stl'],
    [{ part: 'figure', input: { parameters: core.figure.defaults, variant: 'set' } }, 'Mobile-Figures-60mm-set.zip', 'application/zip'],
    [{ part: 'clip', input: core.clip.defaults }, 'Cable-Clip-3.75mm.stl', 'model/stl'],
  ] as [ExportRequest, string, string][])('exports %j as %s', (request, filename, mime) => {
    const { response, transfer } = routeRequest(core, { type: 'export', id: 3, request });
    if (!response.ok) throw new Error(response.error.message);
    const result = response.result as { filename: string; mime: string; files: { name: string; bytes: Uint8Array }[] };
    expect(result.filename).toBe(filename);
    expect(result.mime).toBe(mime);
    expect(result.files.map((f) => f.name)).toEqual([filename]);
    expect(result.files[0]!.bytes.length).toBeGreaterThan(84);
    expect(transfer).toEqual([result.files[0]!.bytes.buffer]);
    // STL and ZIP signatures.
    const head = new TextDecoder().decode(result.files[0]!.bytes.slice(0, 14));
    expect(mime === 'model/stl' ? head.startsWith('Balloon Studio') : head.startsWith('PK')).toBe(true);
  });

  it('names the kit entries like the Mac kits', () => {
    const entries = (request: ExportRequest) => {
      const { response } = routeRequest(core, { type: 'export', id: 1, request });
      if (!response.ok) throw new Error(response.error.message);
      const bytes = (response.result as { files: { bytes: Uint8Array }[] }).files[0]!.bytes;
      // Walk the local headers of the stored ZIP.
      const view = new DataView(bytes.buffer, bytes.byteOffset), names: string[] = [];
      for (let at = 0; view.getUint32(at, true) === 0x04034b50; ) {
        const size = view.getUint32(at + 18, true), nameLength = view.getUint16(at + 26, true);
        names.push(new TextDecoder().decode(bytes.slice(at + 30, at + 30 + nameLength)));
        at += 30 + nameLength + size;
      }
      return names;
    };
    const cloud = core.cloud.withCableSides({ ...core.cloud.defaults('cloud'), nailInsert: true }, ['right', 'top']);
    expect(entries({ part: 'cloud', input: cloud })).toEqual([
      'A-cloud-back-opaque.stl',
      'B-cloud-front-white-PLA.stl',
      'C-cable-seal-TPU-right.stl',
      'D-cable-clamp-bar-right.stl',
      'E-cable-clamp-anvil-right.stl',
      'C-cable-seal-TPU-top.stl',
      'D-cable-clamp-bar-top.stl',
      'E-cable-clamp-anvil-top.stl',
      'F-nail-slot-insert.stl',
      'LED-LAYOUT.svg',
      'ASSEMBLY.md',
      'cloud-settings.json',
    ]);
    expect(entries({ part: 'sun', input: { ...core.cloud.defaults('sun'), strainRelief: false } })).toEqual([
      'A-sun-back-opaque.stl',
      'B-sun-front-diffuser.stl',
      'C-cable-seal-TPU.stl',
      'LED-LAYOUT.svg',
      'ASSEMBLY.md',
      'sun-settings.json',
    ]);
    expect(entries({ part: 'figure', input: { parameters: core.figure.defaults, variant: 'set' } }).slice(-2)).toEqual(['FIGURES.md', 'figure-settings.json']);
  });

  it('answers init, settings files and STL imports', () => {
    const run = (request: WorkerRequest) => routeRequest(core, request).response;
    expect(run({ type: 'init', id: 1 })).toEqual({ id: 1, ok: true, result: { implementation: 'stub' } });
    const settings = run({ type: 'decodeLampSettings', id: 2, text: '{"kind":"sun","width":180,"depth":22,"diffuserThickness":1.2}' });
    expect(settings).toMatchObject({ ok: true, result: { kind: 'sun', width: 180 } });
    expect(run({ type: 'importSTL', id: 3, bytes: new Uint8Array(0) })).toEqual({
      id: 3,
      ok: false,
      error: { code: 'invalid-stl', message: STL_ERRORS.emptyOrTooLarge },
    });
    expect(run({ type: 'importSTL', id: 4, bytes: new Uint8Array(84) })).toMatchObject({ ok: true, result: { restoredSettings: false } });
  });

  it('turns any failure into a structured error response', () => {
    const { response, transfer } = routeRequest(core, { type: 'export', id: 5, request: { part: 'clip', input: { ...core.clip.defaults, nailHeadDiameter: 2.2 } } });
    expect(response).toEqual({
      id: 5,
      ok: false,
      error: { code: 'export-blocked', message: 'A 2.2 mm head is too small for a 1.8 mm nail: it needs a head of 2.4 mm or more to hold the plate.' },
    });
    expect(transfer).toEqual([]);
    const broken = { ...core, basket: { ...core.basket, preview: () => { throw new TypeError('kaputt'); } } };
    expect(routeRequest(broken, { type: 'preview', id: 6, request: { part: 'basket', input: core.basket.defaults } }).response).toEqual({
      id: 6,
      ok: false,
      error: { code: 'internal', message: 'kaputt' },
    });
  });
});

describe('createRequestHandler', () => {
  const text = { ...snapshot, pattern: { ...snapshot.pattern, style: 'Text' as const } };
  const textPreview: WorkerRequest = { type: 'preview', id: 2, request: { part: 'balloon', input: text } };

  /** The stub with a `prepare` the test settles, and a Text preview that needs it to have succeeded. */
  const setup = () => {
    let settle: { resolve(): void; reject(error: Error): void } | undefined;
    const loaded = new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
    });
    let failure: Error | undefined;
    const prepare = vi.fn(() =>
      loaded.catch((error: Error) => {
        failure = error;
        throw error;
      }),
    );
    const fake = {
      ...core,
      prepare,
      balloon: {
        ...core.balloon,
        preview(input: Parameters<CoreApi['balloon']['preview']>[0]) {
          if (failure && input.pattern.style === 'Text') throw new CoreFailure('internal', `The fonts of the Text pattern could not be loaded (${failure.message}).`);
          return core.balloon.preview(input);
        },
      },
    } as CoreApi;
    const posted: { id: number; ok: boolean; message?: string }[] = [];
    const handle = createRequestHandler(fake, vi.fn(), (response) => posted.push(response.ok ? { id: response.id, ok: true } : { id: response.id, ok: false, message: response.error.message }));
    return { handle, posted, prepare, settle: settle! };
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve));

  it('asks only the Text pattern of the balloon to wait', () => {
    expect(needsAssets(textPreview)).toBe(true);
    expect(needsAssets({ type: 'export', id: 1, request: { part: 'balloon', input: text } })).toBe(true);
    expect(needsAssets({ type: 'preview', id: 1, request: { part: 'balloon', input: snapshot } })).toBe(false);
    expect(needsAssets({ type: 'preview', id: 1, request: previews[1]! })).toBe(false);
    expect(needsAssets({ type: 'init', id: 1 })).toBe(false);
  });

  it('loads once at the start, without waiting for a request', () => {
    const { prepare, handle } = setup();
    expect(prepare).toHaveBeenCalledTimes(1);
    handle({ type: 'init', id: 1 });
    handle(textPreview);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('answers everything but Text while the fonts load, and Text once they are there', async () => {
    const { handle, posted, settle } = setup();
    handle({ type: 'init', id: 1 });
    handle(textPreview);
    handle({ type: 'preview', id: 3, request: { part: 'balloon', input: snapshot } });
    expect(posted.map((r) => r.id)).toEqual([1, 3]);
    settle.resolve();
    await flush();
    expect(posted.map((r) => r.id)).toEqual([1, 3, 2]);
    expect(posted.every((r) => r.ok)).toBe(true);
  });

  it('turns a failed load into a failure of the Text request only', async () => {
    const { handle, posted, settle } = setup();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    handle(textPreview);
    settle.reject(new Error('Nunito-Bold.ttf: HTTP 404'));
    await flush();
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
    expect(posted).toEqual([{ id: 2, ok: false, message: 'The fonts of the Text pattern could not be loaded (Nunito-Bold.ttf: HTTP 404).' }]);
    handle({ type: 'preview', id: 3, request: { part: 'balloon', input: snapshot } });
    expect(posted[1]).toEqual({ id: 3, ok: true });
  });
});
