import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { core } from '#core';
import { SETTINGS_KEYS, type BalloonPreview, type ImportedBalloon } from '../core/types';
import { createBalloonStore } from './balloonStore';
import { testDeps } from './testKit';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const { balloon } = core;
const writesOf = (writes: { key: string }[], key: string) => writes.filter((w) => w.key === key).length;

const importedBalloon = (overrides: Partial<ImportedBalloon['parameters']> = {}): ImportedBalloon => {
  const parameters = { ...balloon.defaults, height: 200, diameter: 150, hollow: true, ...overrides };
  const generated = balloon.preview({ parameters, pattern: balloon.pattern.defaults, purge: balloon.purge.defaults });
  return { mesh: generated.mesh, parameters, restoredSettings: true, notes: 'notes', editable: generated.mesh };
};

describe('first launch', () => {
  it('starts from classic, solid, default purge', () => {
    const state = createBalloonStore(testDeps().deps).getState();
    expect(state.parameters).toEqual(balloon.presets.classic);
    expect(state.pattern).toEqual(balloon.pattern.defaults);
    expect(state.purge).toEqual(balloon.purge.defaults);
    expect(state).toMatchObject({ faceColors: null, estimate: null, openedSTLName: null, importRevision: 0 });
  });

  it('restores all three keys and normalizes the pattern against the restored balloon', () => {
    const parameters = { ...balloon.defaults, height: 100, diameter: 100 };
    const { deps } = testDeps({
      [SETTINGS_KEYS.balloon]: balloon.codec.encode(parameters),
      [SETTINGS_KEYS.pattern]: balloon.pattern.codec.encode({ ...balloon.pattern.defaults, style: 'Hearts', size: 40 }),
      [SETTINGS_KEYS.purge]: balloon.purge.codec.encode({ ...balloon.purge.defaults, density: 9 }),
    });
    const state = createBalloonStore(deps).getState();
    expect(state.parameters.height).toBe(100);
    expect(state.pattern.style).toBe('Hearts');
    expect(state.pattern.size).toBe(balloon.pattern.derived(state.pattern, state.parameters).maximumSize);
    expect(state.pattern.size).toBeLessThan(40);
    expect(state.purge.density).toBe(2);
  });

  it('survives broken JSON under each key independently', () => {
    const { deps } = testDeps({
      [SETTINGS_KEYS.balloon]: '{',
      [SETTINGS_KEYS.pattern]: balloon.pattern.codec.encode({ ...balloon.pattern.defaults, style: 'Hearts' }),
      [SETTINGS_KEYS.purge]: '{"density":1}', // purge has no lenient decoding: every key is required
    });
    const state = createBalloonStore(deps).getState();
    expect(state.parameters).toEqual(balloon.presets.classic);
    expect(state.pattern.style).toBe('Hearts');
    expect(state.purge).toEqual(balloon.purge.defaults);
  });
});

describe('apply', () => {
  it('renormalizes the pattern with the new shape without saving it, like the Mac', () => {
    const { deps, memory } = testDeps();
    const store = createBalloonStore(deps);
    store.getState().setPattern({ ...balloon.pattern.defaults, style: 'Text', textHeight: 60 });
    const before = writesOf(memory.writes, SETTINGS_KEYS.pattern);
    const large = store.getState().pattern.textHeight;
    store.getState().apply({ ...store.getState().parameters, height: 100 });
    expect(store.getState().pattern.textHeight).toBeLessThan(large);
    expect(writesOf(memory.writes, SETTINGS_KEYS.pattern)).toBe(before);
    expect(writesOf(memory.writes, SETTINGS_KEYS.balloon)).toBe(1);
  });

  it('sends parameters, pattern and purge together to the preview', () => {
    const { deps, preview } = testDeps();
    const store = createBalloonStore(deps);
    store.getState().setPattern({ ...balloon.pattern.defaults, style: 'Hearts' });
    vi.advanceTimersByTime(100);
    const { parameters, pattern, purge } = store.getState();
    expect(preview.calls[0]!.input).toEqual({ parameters, pattern, purge });
  });

  it('takes face colors and the estimate from the finished preview', async () => {
    const { deps, preview } = testDeps();
    const store = createBalloonStore(deps);
    store.getState().apply({ ...store.getState().parameters, height: 200 });
    vi.advanceTimersByTime(100);
    const bundle: BalloonPreview = balloon.preview(preview.calls[0]!.input as Parameters<typeof balloon.preview>[0]);
    await preview.calls[0]!.current(bundle);
    const state = store.getState();
    expect(state.bundle).toBe(bundle);
    expect(state.faceColors).toBe(bundle.mesh.faceColors ?? null);
    expect(state.estimate).toBe(bundle.estimate);
    expect(state.revision).toBe(1);
  });
});

describe('setPattern and setPurge', () => {
  it('normalize, save, clear the export and rebuild, without an equality guard', () => {
    const { deps, memory, preview } = testDeps();
    const store = createBalloonStore(deps);
    store.getState().setExported({ filename: 'a.stl', mode: 'saved' });
    const same = store.getState().pattern;
    store.getState().setPattern({ ...same, bands: 99 });
    expect(store.getState().pattern.bands).toBe(24);
    expect(store.getState()).toMatchObject({ exported: null, updating: true });
    expect(writesOf(memory.writes, SETTINGS_KEYS.pattern)).toBe(1);
    vi.advanceTimersByTime(100);
    expect(preview.calls).toHaveLength(1);

    store.getState().setPattern({ ...store.getState().pattern }); // same value still rebuilds
    expect(writesOf(memory.writes, SETTINGS_KEYS.pattern)).toBe(2);
    vi.advanceTimersByTime(100);
    expect(preview.calls).toHaveLength(2);

    store.getState().setPurge({ ...store.getState().purge, density: 0.1 });
    expect(store.getState().purge.density).toBe(0.5);
    expect(writesOf(memory.writes, SETTINGS_KEYS.purge)).toBe(1);
    vi.advanceTimersByTime(100);
    expect(preview.calls).toHaveLength(3);
  });
});

describe('setPanels', () => {
  it('rounds half away from zero, then normalizes to a multiple of four', () => {
    const store = createBalloonStore(testDeps().deps);
    store.getState().setPanels(13.5); // 14, 14/4 = 3.5 rounds to 4, so 16
    expect(store.getState().parameters.panels).toBe(16);
    store.getState().setPanels(26);
    expect(store.getState().parameters.panels).toBe(28);
  });
});

describe('applyShape', () => {
  it('takes the shape and keeps walls and attachments (BalloonStudioApp.swift:141-156)', () => {
    const { deps, commitEditing } = testDeps();
    const store = createBalloonStore(deps);
    const kept = {
      hollow: true,
      wallThickness: 2,
      stringHoles: true,
      cordClearance: 4,
      hangingLoop: true,
      hangingClearance: 3,
      hangingThickness: 10,
      hangingWall: 5,
      hangingFillet: 3,
      hangingCrownThickness: 4,
    };
    store.getState().apply({ ...store.getState().parameters, ...kept });
    commitEditing.mockClear();
    const shape = balloon.presets.tall;
    store.getState().applyShape(shape);
    expect(commitEditing).toHaveBeenCalledTimes(1);
    expect(store.getState().parameters).toEqual(balloon.normalize({ ...shape, ...kept }));
    expect(store.getState().parameters.diameter).toBe(shape.diameter);
  });
});

describe('addStringHoles', () => {
  it('commits, then turns the holes on at the given clearance', () => {
    const { deps, commitEditing } = testDeps();
    const store = createBalloonStore(deps);
    store.getState().addStringHoles(4);
    expect(commitEditing).toHaveBeenCalledTimes(1);
    expect(store.getState().parameters).toMatchObject({ stringHoles: true, cordClearance: 4 });
  });
});

describe('loadSTL', () => {
  it('replaces parameters and pattern, shows the editable mesh and saves both (BalloonStudioApp.swift:43-59)', () => {
    const { deps, memory, preview, commitEditing } = testDeps();
    const store = createBalloonStore(deps);
    store.getState().setPattern({ ...balloon.pattern.defaults, style: 'Hearts', base: 'Rose' });
    store.getState().setPurge({ ...balloon.purge.defaults, density: 1.5 });
    store.getState().setExported({ filename: 'a.3mf', mode: 'saved' });
    commitEditing.mockClear();

    const imported = importedBalloon();
    store.getState().loadSTL(imported, 'old.stl');

    const state = store.getState();
    expect(commitEditing).toHaveBeenCalledTimes(1);
    expect(state.parameters).toEqual(balloon.normalize(imported.parameters));
    expect(state.pattern).toEqual(balloon.pattern.normalize(balloon.pattern.defaults, state.parameters));
    expect(state.pattern.style).toBe('Solid');
    expect(state.purge.density).toBe(1.5);
    expect(state.openedSTLName).toBe('old.stl');
    expect(state.importRevision).toBe(1);
    expect(state.revision).toBe(1);
    expect(state.updating).toBe(false);
    expect(state.exported).toBeNull();
    expect(state.estimate).toEqual({ mixedLayers: 0, minimumChanges: 0, maximumChanges: 0, minimumGrams: 0, maximumGrams: 0 });
    expect(state.faceColors).toHaveLength(imported.editable.indices.length / 3);
    expect(state.faceColors!.every((color) => color === 0)).toBe(true);
    expect(state.bundle!.mesh.positions).toBe(imported.editable.positions);
    expect(state.bundle!.mesh.faceColors).toBe(state.faceColors);
    expect(state.bundle!.parameters).toBe(state.parameters);

    expect(memory.items.get(SETTINGS_KEYS.balloon)).toBe(balloon.codec.encode(state.parameters));
    expect(memory.items.get(SETTINGS_KEYS.pattern)).toBe(balloon.pattern.codec.encode(state.pattern));

    // The pending rebuild from setPurge was cancelled: nothing overwrites the imported mesh.
    vi.runAllTimers();
    expect(preview.calls).toHaveLength(0);
  });

  it('drops a preview already running', async () => {
    const { deps, preview } = testDeps();
    const store = createBalloonStore(deps);
    store.getState().apply({ ...store.getState().parameters, height: 200 });
    vi.advanceTimersByTime(100);
    store.getState().loadSTL(importedBalloon(), 'a.stl');
    const shown = store.getState().bundle;
    await preview.calls[0]!.current('stale');
    expect(store.getState().bundle).toBe(shown);
    expect(store.getState().revision).toBe(1);
  });

  it('counts imports and the next change rebuilds from the new parameters', () => {
    const { deps, preview } = testDeps();
    const store = createBalloonStore(deps);
    store.getState().loadSTL(importedBalloon(), 'a.stl');
    store.getState().loadSTL(importedBalloon({ height: 190 }), 'b.stl');
    expect(store.getState()).toMatchObject({ importRevision: 2, revision: 2, openedSTLName: 'b.stl' });
    store.getState().apply({ ...store.getState().parameters, shoulder: 60 });
    expect(store.getState().openedSTLName).toBe('b.stl'); // the Mac never clears it
    vi.advanceTimersByTime(100);
    expect(preview.calls[0]).toMatchObject({ input: { parameters: { height: 190, shoulder: 60 } } });
  });
});

describe('uses3MF and exportFormat', () => {
  it('follow the pattern', () => {
    const store = createBalloonStore(testDeps().deps);
    expect(store.getState().uses3MF()).toBe(false);
    expect(store.getState().exportFormat()).toBe('STL');
    store.getState().setPattern({ ...balloon.pattern.defaults, style: 'Polka dots' });
    expect(store.getState().uses3MF()).toBe(true);
    expect(store.getState().exportFormat()).toBe('3MF');
  });
});

describe('reset', () => {
  it('returns to classic and leaves the pattern style alone', () => {
    const { deps } = testDeps({
      [SETTINGS_KEYS.balloon]: balloon.codec.encode(balloon.presets.tall),
      [SETTINGS_KEYS.pattern]: balloon.pattern.codec.encode({ ...balloon.pattern.defaults, style: 'Hearts' }),
    });
    const store = createBalloonStore(deps);
    store.getState().reset();
    expect(store.getState().parameters).toEqual(balloon.presets.classic);
    expect(store.getState().pattern.style).toBe('Hearts');
  });
});

describe('beginExport', () => {
  it('snapshots all three after the commit', () => {
    const { deps, commitEditing } = testDeps();
    const store = createBalloonStore(deps);
    commitEditing.mockImplementation(() => store.getState().setPanels(24));
    const snapshot = store.getState().beginExport();
    const { parameters, pattern, purge } = store.getState();
    expect(snapshot).toEqual({ parameters, pattern, purge });
    expect(snapshot!.parameters.panels).toBe(24);
  });
});
