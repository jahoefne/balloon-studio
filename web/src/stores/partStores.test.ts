import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { core } from '#core/parameters';
import { SETTINGS_KEYS, type RingParameters } from '../core/types';
import { roundHalfAwayFromZero } from '../ui/format';
import { createBasketStore } from './basketStore';
import { createClipStore } from './clipStore';
import { createCloudStore } from './cloudStore';
import { createFigureStore } from './figureStore';
import { createRingStore } from './ringStore';
import { testDeps } from './testKit';

const fixtureDir = new URL('../../../references/fixtures/legacy-settings/', import.meta.url);
const fixtures = readdirSync(fixtureDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({ name, text: readFileSync(new URL(name, fixtureDir), 'utf8') }));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('basket', () => {
  it('match rounds half away from zero and goes through apply (BasketEditor.swift:50-56)', () => {
    const { deps, memory, commitEditing } = testDeps();
    const store = createBasketStore(deps);
    // All three products are exact ties: 52.5, 40.5, 28.5.
    const balloon = { ...core.balloon.defaults, diameter: 150, height: 150 };
    expect([balloon.diameter * 0.35, balloon.diameter * 0.27, balloon.height * 0.19]).toEqual([52.5, 40.5, 28.5]);
    store.getState().match(balloon);
    expect(store.getState().parameters).toMatchObject({ width: 53, depth: 41, height: 29 });
    expect(store.getState().parameters.width).toBe(roundHalfAwayFromZero(52.5));
    expect(commitEditing).toHaveBeenCalledTimes(1);
    expect(memory.writes).toHaveLength(1);
  });

  it('match keeps style, walls and texture', () => {
    const { deps } = testDeps();
    const store = createBasketStore(deps);
    store.getState().selectStyle('voyager');
    store.getState().setField('texture', 0.3);
    store.getState().match({ ...core.balloon.defaults, diameter: 200, height: 200 });
    expect(store.getState().parameters).toMatchObject({ style: 'voyager', texture: 0.3, width: 70, depth: 54, height: 38 });
  });

  it('resets to the defaults', () => {
    const { deps } = testDeps();
    const store = createBasketStore(deps);
    store.getState().selectStyle('ribbed');
    store.getState().reset();
    expect(store.getState().parameters).toEqual(core.basket.defaults);
  });
});

describe('ring', () => {
  const key = SETTINGS_KEYS.ring;

  it('starts solid on first launch, not with the codec defaults', () => {
    const { deps } = testDeps();
    expect(createRingStore(deps).getState().parameters).toEqual(core.ring.normalize(core.ring.presets.solid));
  });

  it('lighting(true) forces strip width, clearance and at least a 40 mm band', () => {
    const narrow: RingParameters = { ...core.ring.defaults, reflectedLED: false, stripWidth: 3.5, ledClearance: 0.4, bandWidth: 18 };
    const { deps, commitEditing } = testDeps({ [key]: core.ring.codec.encode(narrow) });
    const store = createRingStore(deps);
    store.getState().lighting(true);
    expect(commitEditing).toHaveBeenCalledTimes(1);
    expect(store.getState().parameters).toMatchObject({ reflectedLED: true, stripWidth: 8, ledClearance: 0.5, bandWidth: 40 });
  });

  it('lighting(true) keeps a wider band', () => {
    const wide = createRingStore(testDeps({ [key]: core.ring.codec.encode({ ...core.ring.presets.solid, reflectedLED: true, bandWidth: 50 }) }).deps);
    wide.getState().lighting(true);
    expect(wide.getState().parameters).toMatchObject({ reflectedLED: true, bandWidth: 50 });
  });

  it('lighting(false) only turns the reflector off', () => {
    const { deps } = testDeps();
    const store = createRingStore(deps);
    const before = store.getState().parameters;
    store.getState().lighting(false);
    const after = store.getState().parameters;
    expect(after.reflectedLED).toBe(false);
    expect(after.stripWidth).toBe(before.stripWidth);
    expect(after.ledClearance).toBe(before.ledClearance);
  });

  it('construction commits and changes nothing for the same value', () => {
    const { deps, memory, commitEditing } = testDeps();
    const store = createRingStore(deps);
    store.getState().construction(false);
    expect(commitEditing).toHaveBeenCalledTimes(1);
    expect(memory.writes).toHaveLength(0);
    store.getState().construction(true);
    expect(store.getState().parameters.segmented).toBe(true);
    expect(memory.writes).toHaveLength(1);
  });

  it('resets to large when segmented and to solid otherwise', () => {
    const { deps } = testDeps();
    const store = createRingStore(deps);
    store.getState().construction(true);
    store.getState().setField('diameter', 500);
    store.getState().reset();
    expect(store.getState().parameters).toEqual(core.ring.normalize(core.ring.presets.large));
    store.getState().construction(false);
    store.getState().setField('diameter', 500);
    store.getState().reset();
    expect(store.getState().parameters).toEqual(core.ring.normalize(core.ring.presets.solid));
  });

  it('reads `segmented` after the commit when resetting', () => {
    const { deps, commitEditing } = testDeps();
    const store = createRingStore(deps);
    commitEditing.mockImplementation(() => store.getState().setField('segmented', true));
    store.getState().reset();
    expect(store.getState().parameters).toEqual(core.ring.normalize(core.ring.presets.large));
  });
});

describe('cloud and sun', () => {
  const sides = (store: ReturnType<typeof createCloudStore>) => core.cloud.derived(store.getState().parameters).cableSides;

  it('start from the kind defaults: a sun is 200 mm wide', () => {
    const { deps } = testDeps();
    const cloud = createCloudStore('cloud', deps).getState();
    const sun = createCloudStore('sun', deps).getState();
    expect(cloud.parameters).toEqual(core.cloud.normalize(core.cloud.defaults('cloud')));
    expect(sun.parameters.kind).toBe('sun');
    expect(sun.parameters.width).toBe(200);
    expect(cloud).toMatchObject({ kind: 'cloud', part: 'cloud' });
    expect(sun).toMatchObject({ kind: 'sun', part: 'sun' });
  });

  it('keep separate keys', () => {
    const { deps, memory } = testDeps();
    createCloudStore('cloud', deps).getState().setField('width', 180);
    createCloudStore('sun', deps).getState().setField('width', 190);
    expect(memory.writes.map((w) => w.key)).toEqual([SETTINGS_KEYS.cloud, SETTINGS_KEYS.sun]);
    expect(JSON.parse(memory.items.get(SETTINGS_KEYS.sun)!)).toMatchObject({ kind: 'sun', width: 190 });
    expect(JSON.parse(memory.items.get(SETTINGS_KEYS.cloud)!).width).toBe(180);
  });

  it('apply forces the kind', () => {
    const { deps } = testDeps();
    const sun = createCloudStore('sun', deps);
    sun.getState().apply({ ...core.cloud.defaults('cloud'), width: 190 });
    expect(sun.getState().parameters).toMatchObject({ kind: 'sun', width: 190 });
    const cloud = createCloudStore('cloud', deps);
    cloud.getState().apply({ ...core.cloud.defaults('sun'), width: 190 });
    expect(cloud.getState().parameters.kind).toBe('cloud');
  });

  it('preview on their own coalescing channels', () => {
    const { deps, preview } = testDeps();
    createCloudStore('cloud', deps).getState().setField('width', 180);
    createCloudStore('sun', deps).getState().setField('width', 190);
    vi.advanceTimersByTime(100);
    expect(preview.calls.map((c) => c.part)).toEqual(['cloud', 'sun']);
  });

  it('reset to the kind defaults', () => {
    const { deps } = testDeps();
    const cloud = createCloudStore('cloud', deps);
    cloud.getState().setField('width', 180);
    cloud.getState().reset();
    expect(cloud.getState().parameters).toEqual(core.cloud.normalize(core.cloud.defaults('cloud')));
    const sun = createCloudStore('sun', deps);
    sun.getState().setField('width', 180);
    sun.getState().reset();
    expect(sun.getState().parameters).toEqual(core.cloud.normalize(core.cloud.defaults('sun')));
    expect(sun.getState().parameters.width).toBe(200);
  });

  it('each action commits, then changes its field', () => {
    const { deps, commitEditing } = testDeps();
    const store = createCloudStore('cloud', deps);
    const actions: [() => void, Partial<ReturnType<typeof store.getState>['parameters']>][] = [
      [() => store.getState().selectStyle('twin'), { style: 'twin' }],
      [() => store.getState().mirror(true), { mirrored: true }],
      [() => store.getState().setStrainRelief(!store.getState().parameters.strainRelief), { strainRelief: !store.getState().parameters.strainRelief }],
      [() => store.getState().setNailInsert(true), { nailInsert: true }],
      [() => store.getState().selectSurface('sculpted'), { surface: 'sculpted' }],
    ];
    for (const [act, expected] of actions) {
      commitEditing.mockClear();
      act();
      expect(commitEditing).toHaveBeenCalledTimes(1);
      expect(store.getState().parameters).toMatchObject(expected);
    }
  });

  it('selectSunStyle sets the sun’s style; a cloud normalizes it away', () => {
    const { deps, commitEditing } = testDeps();
    const sun = createCloudStore('sun', deps);
    sun.getState().selectSunStyle('cones');
    expect(commitEditing).toHaveBeenCalledTimes(1);
    expect(sun.getState().parameters.sunStyle).toBe('cones');
    const cloud = createCloudStore('cloud', deps);
    cloud.getState().selectSunStyle('cones');
    expect(cloud.getState().parameters.sunStyle).toBe('soft-star');
  });

  it('adding outlets follows setCableOutletCount: opposite first, then bottom, top, right, left', () => {
    const { deps } = testDeps();
    const store = createCloudStore('cloud', deps);
    store.getState().selectCableSide('top');
    expect(sides(store)).toEqual(['top']);
    store.getState().setCableOutletCount(2);
    expect(sides(store)).toEqual(['top', 'bottom']); // opposite of top
    store.getState().setCableOutletCount(3);
    expect(sides(store)).toEqual(['top', 'bottom', 'right']); // top taken, so first free of bottom, top, right, left
    store.getState().setCableOutletCount(4);
    expect(sides(store)).toEqual(['top', 'bottom', 'right', 'left']);
    expect(store.getState().parameters).toMatchObject({ cableSide: 'top', secondCableSide: 'bottom', thirdCableSide: 'right', fourthCableSide: 'left' });
  });

  it('removing an outlet drops it and the ones after it, and one always stays', () => {
    const { deps } = testDeps();
    const store = createCloudStore('cloud', deps);
    store.getState().setCableOutletCount(4);
    const all = sides(store);
    store.getState().setCableOutlet(2, false);
    expect(sides(store)).toEqual(all.slice(0, 2));
    expect(store.getState().parameters.thirdCableSide).toBeNull();
    expect(store.getState().parameters.fourthCableSide).toBeNull();
    store.getState().setCableOutlet(1, true); // already there
    expect(sides(store)).toEqual(all.slice(0, 2));
    store.getState().setCableOutlet(2, true);
    expect(sides(store)).toHaveLength(3);
    store.getState().setCableOutletCount(0);
    expect(sides(store)).toEqual(all.slice(0, 1));
  });

  it('omits unused outlets from the saved JSON', () => {
    const { deps, memory } = testDeps();
    const store = createCloudStore('cloud', deps);
    store.getState().setCableOutletCount(2);
    store.getState().setCableOutletCount(1);
    const saved = JSON.parse(memory.items.get(SETTINGS_KEYS.cloud)!);
    expect(saved).not.toHaveProperty('secondCableSide');
    expect(saved).not.toHaveProperty('thirdCableSide');
  });

  it('selectCableSide swaps with a later outlet and refuses an earlier outlet’s side', () => {
    const { deps, commitEditing, memory } = testDeps();
    const store = createCloudStore('cloud', deps);
    store.getState().setCableOutletCount(3);
    const [first, second, third] = sides(store) as [string, string, string];
    store.getState().selectCableSide(third as 'left', 1);
    expect(sides(store)).toEqual([first, third, second]);

    const writes = memory.writes.length;
    commitEditing.mockClear();
    store.getState().selectCableSide(first as 'left', 1); // CloudEditor.swift:65
    expect(commitEditing).toHaveBeenCalledTimes(1);
    expect(sides(store)).toEqual([first, third, second]);
    expect(memory.writes).toHaveLength(writes);
  });

  describe('legacy settings', () => {
    it('finds the fixtures', () => {
      expect(fixtures.length).toBeGreaterThanOrEqual(5);
      expect(fixtures.some((f) => f.name.startsWith('sun-'))).toBe(true);
    });

    it.each(fixtures)('$name loads through its store', ({ name, text }) => {
      const kind = name.startsWith('sun-') ? 'sun' : 'cloud';
      const key = kind === 'sun' ? SETTINGS_KEYS.sun : SETTINGS_KEYS.cloud;
      const { deps, memory } = testDeps({ [key]: text });
      const state = createCloudStore(kind, deps).getState();
      const raw = JSON.parse(text) as Record<string, unknown>;
      expect(state.parameters).toEqual(core.cloud.normalize({ ...core.cloud.codec.decode(text), kind }));
      expect(state.parameters.kind).toBe(kind);
      expect(state.parameters.width).toBe(raw.width);
      expect(memory.writes).toHaveLength(0);
    });

    it('a sun saved under the cloud key still opens as a cloud in the cloud store', () => {
      const sun = fixtures.find((f) => f.name.startsWith('sun-'))!;
      const { deps } = testDeps({ [SETTINGS_KEYS.cloud]: sun.text });
      expect(createCloudStore('cloud', deps).getState().parameters.kind).toBe('cloud');
    });
  });

  it('falls back to the defaults for broken JSON', () => {
    const { deps } = testDeps({ [SETTINGS_KEYS.sun]: '{"width":"wide"}' });
    expect(createCloudStore('sun', deps).getState().parameters.width).toBe(200);
  });
});

describe('figure', () => {
  it('actions commit and reset returns to the defaults', () => {
    const { deps, commitEditing } = testDeps();
    const store = createFigureStore(deps);
    store.getState().selectStyle('moon');
    store.getState().selectSurface('puffy');
    store.getState().setDoubleSided(true);
    store.getState().setChainHole(true);
    expect(commitEditing).toHaveBeenCalledTimes(4);
    expect(store.getState().parameters).toMatchObject({ style: 'moon', surface: 'puffy', doubleSided: true, chainHole: true });
    store.getState().reset();
    expect(store.getState().parameters).toEqual(core.figure.normalize(core.figure.defaults));
  });

  it('restores from its key', () => {
    const { deps } = testDeps({ [SETTINGS_KEYS.figure]: core.figure.codec.encode({ ...core.figure.defaults, style: 'star' }) });
    expect(createFigureStore(deps).getState().parameters.style).toBe('star');
  });
});

describe('clip', () => {
  it('actions commit and reset returns to the defaults', () => {
    const { deps, commitEditing, memory } = testDeps();
    const store = createClipStore(deps);
    store.getState().selectMount('adhesive');
    store.getState().setFlat(!core.clip.defaults.flat);
    expect(commitEditing).toHaveBeenCalledTimes(2);
    expect(store.getState().parameters.mount).toBe('adhesive');
    expect(memory.writes.at(-1)!.key).toBe(SETTINGS_KEYS.cableClip);
    store.getState().reset();
    expect(store.getState().parameters).toEqual(core.clip.normalize(core.clip.defaults));
  });

  it('beginExport refuses a clip with a problem', () => {
    const { deps } = testDeps();
    const store = createClipStore(deps);
    expect(store.getState().beginExport()).toEqual(store.getState().parameters);
    const blocked = clipWithProblem();
    store.getState().apply(blocked);
    expect(core.clip.clip(store.getState().parameters).problem).not.toBeNull();
    expect(store.getState().beginExport()).toBeNull();
  });
});

/** `CableClip.problem`: a nail head too small for its nail. */
const clipWithProblem = () => {
  const { ranges, defaults, normalize } = core.clip;
  return normalize({ ...defaults, mount: 'nail', nailDiameter: ranges.nail.upper, nailHeadDiameter: ranges.head.lower });
};
