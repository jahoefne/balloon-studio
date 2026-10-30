// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { core } from '#core';
import { SETTINGS_KEYS, type ImportedBalloon } from '../core/types';
import { commitEditing as realCommitEditing } from '../ui/commitEditing';
import { STUDIO_PARTS } from './appStore';
import type { IoClient } from './deps';
import { createStudio } from './studio';
import { testDeps } from './testKit';

// A path, not a URL: jsdom's URL class is not the one node:fs accepts.
const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../../../references/fixtures/legacy-settings', name), 'utf8');
const textFile = (name: string, text: string) => ({ name, text: async () => text, arrayBuffer: async () => new ArrayBuffer(0) });

const importedBalloon = (): ImportedBalloon => {
  const parameters = { ...core.balloon.defaults, height: 200 };
  const { mesh } = core.balloon.preview({ parameters, pattern: core.balloon.pattern.defaults, purge: core.balloon.purge.defaults });
  return { mesh, parameters, restoredSettings: true, notes: 'n', editable: mesh };
};

const setup = (initial: Record<string, string> = {}) => {
  const kit = testDeps(initial);
  return { ...kit, studio: createStudio(kit.deps) };
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('tabs', () => {
  it('lists the Mac segments in order', () => {
    expect(STUDIO_PARTS.map((p) => p.title)).toEqual(['Balloon', 'Basket', 'Ring', 'Cloud', 'Sun', 'Figures', 'Cable clip']);
  });

  it('starts on the balloon, asks only for its preview, and persists no tab', () => {
    const { studio, preview, memory } = setup();
    expect(studio.app.getState().part).toBe('balloon');
    expect(preview.calls).toHaveLength(0);
    studio.app.getState().start();
    expect(preview.calls.map((c) => c.part)).toEqual(['balloon']);
    studio.app.getState().selectPart('sun');
    expect(studio.app.getState().part).toBe('sun');
    expect(memory.writes).toHaveLength(0);
  });

  it('commits on a tab switch and builds the new tab’s first preview once', () => {
    const { studio, preview, commitEditing } = setup();
    studio.app.getState().selectPart('ring');
    studio.app.getState().selectPart('balloon');
    studio.app.getState().selectPart('ring');
    expect(commitEditing).toHaveBeenCalledTimes(3);
    expect(preview.calls.map((c) => c.part)).toEqual(['ring', 'balloon']);
  });

  it('keeps the Balloon view toggles across tab switches', () => {
    const { studio } = setup();
    studio.app.getState().setBalloonView({ wireframe: true, colorIndex: 2 });
    studio.app.getState().selectPart('basket');
    studio.app.getState().selectPart('balloon');
    expect(studio.app.getState().balloonView).toEqual({
      showPlate: true,
      wireframe: true,
      resetCamera: 0,
      colorIndex: 2,
      cutaway: false,
      inspectOpening: false,
      inspectTop: false,
    });
  });
});

describe('resetCurrentPart', () => {
  it('commits, then resets the part on screen and only that one', () => {
    const { studio, commitEditing } = setup();
    const widths = () => [studio.cloud.getState().parameters.width, studio.sun.getState().parameters.width];
    studio.cloud.getState().setField('width', 180);
    studio.sun.getState().setField('width', 180);
    commitEditing.mockClear();
    studio.app.getState().selectPart('sun');
    commitEditing.mockClear();
    studio.app.getState().resetCurrentPart();
    expect(commitEditing).toHaveBeenCalledTimes(1);
    expect(widths()).toEqual([180, 200]);
  });

  it.each([
    ['balloon', () => core.balloon.normalize(core.balloon.presets.classic)],
    ['basket', () => core.basket.normalize(core.basket.defaults)],
    ['ring', () => core.ring.normalize(core.ring.presets.solid)],
    ['cloud', () => core.cloud.normalize(core.cloud.defaults('cloud'))],
    ['sun', () => core.cloud.normalize(core.cloud.defaults('sun'))],
    ['figure', () => core.figure.normalize(core.figure.defaults)],
    ['clip', () => core.clip.normalize(core.clip.defaults)],
  ] as const)('%s returns to its target', (part, target) => {
    const { studio } = setup({
      [SETTINGS_KEYS.balloon]: core.balloon.codec.encode(core.balloon.presets.tall),
      [SETTINGS_KEYS.basket]: core.basket.codec.encode({ ...core.basket.defaults, width: 90 }),
      [SETTINGS_KEYS.ring]: core.ring.codec.encode({ ...core.ring.presets.solid, diameter: 500 }),
      [SETTINGS_KEYS.cloud]: core.cloud.codec.encode({ ...core.cloud.defaults('cloud'), width: 180 }),
      [SETTINGS_KEYS.sun]: core.cloud.codec.encode({ ...core.cloud.defaults('sun'), width: 180 }),
      [SETTINGS_KEYS.figure]: core.figure.codec.encode({ ...core.figure.defaults, height: 70 }),
      [SETTINGS_KEYS.cableClip]: core.clip.codec.encode({ ...core.clip.defaults, cableDiameter: 4 }),
    });
    studio.app.getState().selectPart(part);
    expect(studio[part].getState().parameters).not.toEqual(target());
    studio.app.getState().resetCurrentPart();
    expect(studio[part].getState().parameters).toEqual(target());
  });
});

describe('commitEditing with a real field', () => {
  it('a focused field commits on blur before reset reads the store', () => {
    const { deps } = testDeps();
    deps.commitEditing = () => realCommitEditing();
    const studio = createStudio(deps);
    const input = document.createElement('input');
    document.body.append(input);
    input.addEventListener('blur', () => studio.ring.getState().setField('segmented', true));
    input.focus();
    expect(document.activeElement).toBe(input);
    studio.app.getState().selectPart('ring');
    expect(document.activeElement).not.toBe(input);
    expect(studio.ring.getState().parameters.segmented).toBe(true);
    input.remove();
  });
});

describe('opening lamp settings', () => {
  it('routes a sun fixture to the sun store and tab, kind forced to sun', async () => {
    const { studio, preview } = setup();
    await studio.app.getState().openFile(textFile('sun-settings.json', fixture('sun-lamp-200-sun-settings.json')));
    expect(studio.app.getState().part).toBe('sun');
    expect(studio.sun.getState().parameters).toMatchObject({ kind: 'sun', width: 200, depth: 22 });
    expect(studio.cloud.getState().parameters.depth).toBe(core.cloud.normalize(core.cloud.defaults('cloud')).depth);
    await vi.advanceTimersByTimeAsync(100);
    expect(preview.calls.at(-1)).toMatchObject({ part: 'sun' });
  });

  it('routes a cloud fixture to the cloud store and tab', async () => {
    const { studio, commitEditing } = setup();
    await studio.app.getState().openFile(textFile('cloud-settings.json', fixture('cloud-lamp-230-cloud-settings.json')));
    expect(commitEditing).toHaveBeenCalled();
    expect(studio.app.getState().part).toBe('cloud');
    expect(studio.cloud.getState().parameters).toMatchObject({ kind: 'cloud', width: 230 });
  });

  it('shows an unchanged tab’s first preview although apply had nothing to do', async () => {
    const { studio, preview } = setup();
    const same = core.cloud.codec.encode(studio.sun.getState().parameters);
    await studio.app.getState().openFile(textFile('sun-settings.json', same));
    expect(studio.app.getState().part).toBe('sun');
    expect(preview.calls.map((c) => c.part)).toEqual(['sun']);
  });

  it('keeps a broken file’s error in the import store and stays on the tab', async () => {
    const { studio } = setup();
    await studio.app.getState().openFile(textFile('x.json', '{'));
    expect(studio.importer.getState().error).toContain('valid cloud or sun lamp settings');
    expect(studio.app.getState().part).toBe('balloon');
  });
});

describe('acceptReview', () => {
  it('loads the STL, shows the balloon tab, closes the review and resets the balloon view', async () => {
    const kit = testDeps();
    const imported = importedBalloon();
    const ioClient: IoClient = { ...kit.deps.ioClient, importSTL: async () => imported };
    const studio = createStudio({ ...kit.deps, ioClient });
    studio.app.getState().selectPart('ring');
    studio.app.getState().setBalloonView({ cutaway: true, inspectOpening: true, inspectTop: true, wireframe: true });

    await studio.app.getState().openFile(textFile('old.stl', ''));
    expect(studio.importer.getState().review?.name).toBe('old.stl');
    expect(studio.balloon.getState().openedSTLName).toBeNull();

    studio.app.getState().acceptReview();
    expect(studio.balloon.getState()).toMatchObject({ openedSTLName: 'old.stl', importRevision: 1 });
    expect(studio.balloon.getState().parameters.height).toBe(200);
    expect(studio.app.getState().part).toBe('balloon');
    expect(studio.importer.getState().review).toBeNull();
    expect(studio.app.getState().balloonView).toMatchObject({ cutaway: false, inspectOpening: false, inspectTop: false, resetCamera: 1, wireframe: true });
  });

  it('does nothing without a review', () => {
    const { studio, commitEditing } = setup();
    studio.app.getState().acceptReview();
    expect(commitEditing).not.toHaveBeenCalled();
    expect(studio.balloon.getState().importRevision).toBe(0);
  });
});

describe('quota hint', () => {
  it('reaches the app store once through the default wiring', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.resetModules();
    const { useAppStore, useBasketStore } = await import('./index');
    const warnings: (string | null)[] = [];
    useAppStore.subscribe((s) => warnings.push(s.storageWarning));
    useBasketStore.getState().setField('width', 70);
    useBasketStore.getState().setField('width', 71);
    vi.clearAllTimers();
    expect(useAppStore.getState().storageWarning).toContain('storage is full');
    expect(warnings).toHaveLength(1);
    expect(setItem).toHaveBeenCalledTimes(2);
    setItem.mockRestore();
  });
});

describe('the app’s stores', () => {
  it('start without spawning a worker or writing anything', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    vi.resetModules();
    const stores = await import('./index');
    expect(stores.useCloudStore.getState().kind).toBe('cloud');
    expect(stores.useSunStore.getState().kind).toBe('sun');
    expect(stores.useAppStore.getState().part).toBe('balloon');
    expect(setItem).not.toHaveBeenCalled();
    expect(stores.useBalloonStore.getState().parameters).toEqual(core.balloon.normalize(core.balloon.presets.classic));
    setItem.mockRestore();
  });
});
