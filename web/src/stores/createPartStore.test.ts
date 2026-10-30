import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { core } from '#core';
import { CoreFailure } from '../core/api';
import { SETTINGS_KEYS, type BasketParameters } from '../core/types';
import { createWorkerClient, type WorkerTransport } from '../worker/client';
import type { WorkerResponse } from '../worker/protocol';
import { routeRequest } from '../worker/route';
import { createBalloonStore } from './balloonStore';
import { createBasketStore } from './basketStore';
import { createClipStore } from './clipStore';
import { createCloudStore } from './cloudStore';
import { DEBOUNCE_MS } from './createPartStore';
import { createFigureStore } from './figureStore';
import { createRingStore } from './ringStore';
import { testDeps } from './testKit';

const key = SETTINGS_KEYS.basket;
const basket = (width: number): BasketParameters => ({ ...core.basket.defaults, width });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  it('turns three quick changes into one preview, 60 ms after the last, for the last parameters', () => {
    const { deps, preview } = testDeps();
    const store = createBasketStore(deps);
    store.getState().apply(basket(70));
    vi.advanceTimersByTime(30);
    store.getState().apply(basket(71));
    vi.advanceTimersByTime(30);
    store.getState().apply(basket(72));
    vi.advanceTimersByTime(59);
    expect(preview.calls).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(preview.calls).toHaveLength(1);
    expect(preview.calls[0]).toMatchObject({ part: 'basket', input: basket(72) });
  });

  it('waits 100 ms for the balloon', () => {
    const { deps, preview } = testDeps();
    const store = createBalloonStore(deps);
    const p = store.getState().parameters;
    store.getState().apply({ ...p, height: 200 });
    store.getState().apply({ ...p, height: 201 });
    store.getState().apply({ ...p, height: 202 });
    vi.advanceTimersByTime(99);
    expect(preview.calls).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(preview.calls).toHaveLength(1);
    expect(preview.calls[0]).toMatchObject({ part: 'balloon', input: { parameters: { height: 202 } } });
  });

  it('uses the Mac delay of each part', () => {
    expect(DEBOUNCE_MS).toEqual({ balloon: 100, basket: 60, ring: 60, cloud: 100, sun: 100, figure: 60, clip: 60 });
    const { deps, preview } = testDeps();
    const cases = [
      [createRingStore(deps), { ...core.ring.presets.solid, diameter: 500 }, 60],
      [createCloudStore('cloud', deps), { ...core.cloud.defaults('cloud'), width: 180 }, 100],
      [createCloudStore('sun', deps), { ...core.cloud.defaults('sun'), width: 180 }, 100],
      [createFigureStore(deps), { ...core.figure.defaults, height: 70 }, 60],
      [createClipStore(deps), { ...core.clip.defaults, cableDiameter: 4 }, 60],
    ] as const;
    for (const [store, parameters, delay] of cases) {
      const before = preview.calls.length;
      (store.getState().apply as (value: unknown) => void)(parameters);
      vi.advanceTimersByTime(delay - 1);
      expect(preview.calls).toHaveLength(before);
      vi.advanceTimersByTime(1);
      expect(preview.calls).toHaveLength(before + 1);
    }
  });
});

describe('apply', () => {
  it('stores and saves at once, before the debounce, and clears the last export', () => {
    const { deps, memory, preview } = testDeps();
    const store = createBasketStore(deps);
    store.getState().setExported({ filename: 'a.stl', mode: 'saved' });
    store.getState().apply(basket(70));
    const state = store.getState();
    expect(state.parameters.width).toBe(70);
    expect(state.exported).toBeNull();
    expect(state.updating).toBe(true);
    expect(preview.calls).toHaveLength(0);
    expect(memory.writes).toEqual([{ key, value: core.basket.codec.encode(basket(70)) }]);
  });

  it('normalizes what it stores and saves', () => {
    const { deps, memory } = testDeps();
    const store = createBasketStore(deps);
    store.getState().apply(basket(1000));
    expect(store.getState().parameters.width).toBe(100);
    expect(memory.items.get(key)).toBe(core.basket.codec.encode(basket(100)));
  });

  it('does nothing when the normalized parameters are unchanged', () => {
    const { deps, memory, preview } = testDeps();
    const store = createBasketStore(deps);
    store.getState().apply(basket(100));
    vi.runAllTimers();
    const before = { calls: preview.calls.length, writes: memory.writes.length };
    store.getState().setExported({ filename: 'a.stl', mode: 'saved' });
    store.getState().apply(basket(1000)); // clamps to the same 100
    store.getState().apply(basket(100));
    expect(store.getState().exported).toEqual({ filename: 'a.stl', mode: 'saved' });
    expect(store.getState().updating).toBe(true); // still the first rebuild's: nothing new started
    vi.runAllTimers();
    expect({ calls: preview.calls.length, writes: memory.writes.length }).toEqual(before);
  });

  it('compares like Swift `==`: -0 equals 0', () => {
    const { deps, memory } = testDeps();
    const store = createBalloonStore(deps);
    store.getState().setField('panelDepth', 0);
    expect(memory.writes).toHaveLength(1);
    store.getState().setField('panelDepth', -0);
    expect(memory.writes).toHaveLength(1);
  });

  it('setField changes one field through apply', () => {
    const { deps, memory } = testDeps();
    const store = createBasketStore(deps);
    store.getState().setField('height', 50);
    expect(store.getState().parameters).toEqual({ ...core.basket.defaults, height: 50 });
    expect(memory.writes).toHaveLength(1);
  });
});

describe('preview results', () => {
  it('sets the bundle and bumps the revision for the latest request', async () => {
    const { deps, preview } = testDeps();
    const store = createBasketStore(deps);
    store.getState().apply(basket(70));
    vi.advanceTimersByTime(60);
    expect(store.getState().updating).toBe(true);
    await preview.calls[0]!.current('bundle 70');
    expect(store.getState()).toMatchObject({ bundle: 'bundle 70', revision: 1, updating: false });
  });

  it('drops a result that a newer change overtook, even one the client calls current', async () => {
    const { deps, preview } = testDeps();
    const store = createBasketStore(deps);
    store.getState().apply(basket(70));
    vi.advanceTimersByTime(60);
    store.getState().apply(basket(71)); // within the debounce: the client knows nothing of it yet
    await preview.calls[0]!.current('stale');
    expect(store.getState()).toMatchObject({ bundle: null, revision: 0, updating: true });
    vi.advanceTimersByTime(60);
    await preview.calls[1]!.current('fresh');
    expect(store.getState()).toMatchObject({ bundle: 'fresh', revision: 1, updating: false });
  });

  it('ignores superseded and keeps updating while a newer request runs', async () => {
    const { deps, preview } = testDeps();
    const store = createBasketStore(deps);
    store.getState().apply(basket(70));
    vi.advanceTimersByTime(60);
    store.getState().apply(basket(71));
    vi.advanceTimersByTime(60);
    await preview.calls[0]!.superseded();
    expect(store.getState()).toMatchObject({ bundle: null, revision: 0, updating: true });
    await preview.calls[1]!.current('fresh');
    expect(store.getState()).toMatchObject({ bundle: 'fresh', revision: 1, updating: false });
  });

  it('stops updating when the latest request itself ends superseded: the worker stopped', async () => {
    const { deps, preview } = testDeps();
    const store = createBasketStore(deps);
    store.getState().apply(basket(70));
    vi.advanceTimersByTime(60);
    await preview.calls[0]!.superseded();
    expect(store.getState()).toMatchObject({ bundle: null, revision: 0, updating: false, error: null });
  });

  it('reports a failure of the latest request and ignores one that was overtaken', async () => {
    const { deps, preview } = testDeps();
    const store = createBasketStore(deps);
    store.getState().apply(basket(70));
    vi.advanceTimersByTime(60);
    store.getState().apply(basket(71));
    await preview.calls[0]!.fail(new CoreFailure('internal', 'old failure'));
    expect(store.getState().error).toBeNull();
    vi.advanceTimersByTime(60);
    await preview.calls[1]!.fail(new CoreFailure('internal', 'new failure'));
    expect(store.getState()).toMatchObject({ error: 'new failure', updating: false, revision: 0 });
  });
});

describe('first preview', () => {
  it('starts with no bundle and asks for nothing until ensurePreview', async () => {
    const { deps, preview } = testDeps();
    const store = createBasketStore(deps);
    expect(store.getState()).toMatchObject({ bundle: null, revision: 0, updating: false });
    vi.runAllTimers();
    expect(preview.calls).toHaveLength(0);

    store.getState().ensurePreview();
    store.getState().ensurePreview();
    expect(preview.calls).toHaveLength(1);
    expect(store.getState().updating).toBe(true);

    await preview.calls[0]!.current('first');
    store.getState().ensurePreview();
    expect(preview.calls).toHaveLength(1);
    expect(store.getState()).toMatchObject({ bundle: 'first', revision: 1 });
  });

  it('leaves a debounced rebuild alone', () => {
    const { deps, preview } = testDeps();
    const store = createBasketStore(deps);
    store.getState().apply(basket(70));
    store.getState().ensurePreview();
    expect(preview.calls).toHaveLength(0);
  });
});

describe('restoring', () => {
  it('normalizes what it loads and does not write it back', () => {
    const { deps, memory } = testDeps({ [key]: core.basket.codec.encode(basket(1000)) });
    const store = createBasketStore(deps);
    expect(store.getState().parameters.width).toBe(100);
    expect(memory.writes).toHaveLength(0);
  });

  it('falls back to the defaults for broken JSON', () => {
    const { deps } = testDeps({ [key]: 'not json' });
    expect(createBasketStore(deps).getState().parameters).toEqual(core.basket.defaults);
  });
});

describe('reset and export', () => {
  it('commits the field being edited before reading anything', () => {
    const { deps, commitEditing } = testDeps();
    const store = createBasketStore(deps);
    const applied: number[] = [];
    store.subscribe((s) => applied.push(s.parameters.width));
    commitEditing.mockImplementation(() => store.getState().apply(basket(70)));
    const input = store.getState().beginExport();
    expect(input).toEqual(basket(70));
    expect(applied[0]).toBe(70);
  });

  it('beginExport refuses while an export runs, without committing', () => {
    const { deps, commitEditing } = testDeps();
    const store = createBasketStore(deps);
    store.getState().setExporting(true);
    expect(store.getState().beginExport()).toBeNull();
    expect(commitEditing).not.toHaveBeenCalled();
  });

  it('reset commits, then applies the target', () => {
    const { deps, commitEditing } = testDeps({ [key]: core.basket.codec.encode(basket(70)) });
    const store = createBasketStore(deps);
    store.getState().reset();
    expect(commitEditing).toHaveBeenCalledTimes(1);
    expect(store.getState().parameters).toEqual(core.basket.defaults);
  });

  it('holds export errors until they are cleared', () => {
    const { deps } = testDeps();
    const store = createBasketStore(deps);
    store.getState().setError('The model could not be exported: x');
    expect(store.getState().error).toBe('The model could not be exported: x');
    store.getState().setError(null);
    expect(store.getState().error).toBeNull();
  });
});

describe('with the real worker client over a fake transport', () => {
  const stubWorker = () => {
    const responses: (() => void)[] = [];
    let deliver: (response: WorkerResponse) => void = () => undefined;
    const transport: WorkerTransport = {
      post: (message) => void responses.push(() => deliver(routeRequest(core, message).response)),
      listen: (onMessage) => {
        deliver = onMessage;
      },
      terminate: () => undefined,
    };
    return { transport, answerAll: () => responses.splice(0).forEach((answer) => answer()), get waiting() { return responses.length; } };
  };

  it('ends with the bundle of the last parameters', async () => {
    const worker = stubWorker();
    const { deps } = testDeps();
    deps.previewClient = createWorkerClient('preview', { transport: worker.transport });
    worker.answerAll(); // init
    const store = createBasketStore(deps);
    store.getState().apply(basket(70));
    vi.advanceTimersByTime(60); // running
    store.getState().apply(basket(71));
    vi.advanceTimersByTime(60); // waiting behind it
    store.getState().apply(basket(72));
    vi.advanceTimersByTime(60); // replaces the waiting one
    worker.answerAll(); // the running one finishes, superseded; the last one starts
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState()).toMatchObject({ bundle: null, updating: true });
    worker.answerAll();
    await vi.advanceTimersByTimeAsync(0);
    const state = store.getState();
    expect(state.bundle?.parameters).toEqual(basket(72));
    expect(state).toMatchObject({ revision: 1, updating: false });
    expect(worker.waiting).toBe(0);
  });
});
