import { describe, expect, it, vi } from 'vitest';
import { core } from '#core/parameters';
import { SETTINGS_KEYS } from '../core/types';
import { createSettingsStorage, type StorageLike } from './settingsStorage';

const memory = (initial: Record<string, string> = {}): StorageLike & { items: Map<string, string> } => {
  const items = new Map(Object.entries(initial));
  return { items, getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) };
};

const quotaStorage = (name = 'QuotaExceededError'): StorageLike => ({
  getItem: () => null,
  setItem: () => {
    throw new DOMException('full', name);
  },
});

describe('settings keys', () => {
  it('are the Mac UserDefaults keys', () => {
    expect(Object.values(SETTINGS_KEYS)).toEqual([
      'BalloonStudio.parameters.v1',
      'BalloonStudio.pattern.v1',
      'BalloonStudio.purge.v1',
      'BalloonStudio.basket.v1',
      'BalloonStudio.ring.v1',
      'BalloonStudio.cloud.v1',
      'BalloonStudio.sun.v1',
      'BalloonStudio.figure.v1',
      'BalloonStudio.cableClip.v1',
    ]);
  });
});

describe('loadSetting', () => {
  const { codec, defaults } = core.basket;
  const load = (storage: StorageLike | null) => createSettingsStorage({ storage }).loadSetting(SETTINGS_KEYS.basket, codec.decode, defaults);

  it('gives the defaults when nothing is stored', () => {
    expect(load(memory())).toBe(defaults);
  });

  it('gives the defaults for broken JSON and for JSON the codec rejects', () => {
    expect(load(memory({ [SETTINGS_KEYS.basket]: '{"style":' }))).toBe(defaults);
    expect(load(memory({ [SETTINGS_KEYS.basket]: '[]' }))).toBe(defaults);
    expect(load(memory({ [SETTINGS_KEYS.basket]: '{"style":"wicker"}' }))).toBe(defaults);
    expect(load(memory({ [SETTINGS_KEYS.basket]: '{"style":"nope","width":1,"depth":1,"height":1,"wallThickness":1,"cordClearance":1,"texture":1}' }))).toBe(defaults);
  });

  it('gives the defaults when the storage throws or is missing', () => {
    const blocked: StorageLike = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => undefined,
    };
    expect(load(blocked)).toBe(defaults);
    expect(load(null)).toBe(defaults);
  });

  it('reads old JSON through the lenient codec', () => {
    const settings = createSettingsStorage({ storage: memory({ [SETTINGS_KEYS.balloon]: '{"height":200}', [SETTINGS_KEYS.pattern]: '{"reliefDepth":1.5}' }) });
    const balloon = settings.loadSetting(SETTINGS_KEYS.balloon, core.balloon.codec.decode, core.balloon.defaults);
    expect(balloon).toEqual({ ...core.balloon.defaults, height: 200 });
    const pattern = settings.loadSetting(SETTINGS_KEYS.pattern, core.balloon.pattern.codec.decode, core.balloon.pattern.defaults);
    // BalloonPatterns.swift:100-121: settings from before composition 3 get at least 2.4 mm.
    expect(pattern.reliefDepth).toBe(2.4);
  });
});

describe('saveSetting', () => {
  it('writes the codec JSON the Mac writes', () => {
    const storage = memory();
    createSettingsStorage({ storage }).saveSetting(SETTINGS_KEYS.basket, core.basket.codec.encode, core.basket.defaults);
    expect(storage.items.get(SETTINGS_KEYS.basket)).toBe('{"cordClearance":3,"depth":48,"height":42,"style":"wicker","texture":0.7,"wallThickness":2.4,"width":64}');
  });

  it('round-trips with loadSetting', () => {
    const settings = createSettingsStorage({ storage: memory() });
    const value = { ...core.ring.presets.large, diameter: 512.5 };
    settings.saveSetting(SETTINGS_KEYS.ring, core.ring.codec.encode, value);
    expect(settings.loadSetting(SETTINGS_KEYS.ring, core.ring.codec.decode, core.ring.defaults)).toEqual(value);
  });

  it('reports a full storage once and never throws', () => {
    const onQuotaExceeded = vi.fn();
    const settings = createSettingsStorage({ storage: quotaStorage(), onQuotaExceeded });
    settings.saveSetting(SETTINGS_KEYS.basket, core.basket.codec.encode, core.basket.defaults);
    settings.saveSetting(SETTINGS_KEYS.ring, core.ring.codec.encode, core.ring.defaults);
    expect(onQuotaExceeded).toHaveBeenCalledTimes(1);
  });

  it('recognizes Firefox’s quota error', () => {
    const onQuotaExceeded = vi.fn();
    createSettingsStorage({ storage: quotaStorage('NS_ERROR_DOM_QUOTA_REACHED'), onQuotaExceeded }).saveSetting(SETTINGS_KEYS.basket, core.basket.codec.encode, core.basket.defaults);
    expect(onQuotaExceeded).toHaveBeenCalledTimes(1);
  });

  it('swallows other storage and encoder failures without the hint', () => {
    const onQuotaExceeded = vi.fn();
    const settings = createSettingsStorage({ storage: quotaStorage('SecurityError'), onQuotaExceeded });
    settings.saveSetting(SETTINGS_KEYS.basket, core.basket.codec.encode, core.basket.defaults);
    const broken = () => {
      throw new Error('cannot encode');
    };
    createSettingsStorage({ storage: memory(), onQuotaExceeded }).saveSetting(SETTINGS_KEYS.basket, broken, core.basket.defaults);
    expect(onQuotaExceeded).not.toHaveBeenCalled();
  });

  it('does nothing without storage', () => {
    expect(() => createSettingsStorage({ storage: null }).saveSetting(SETTINGS_KEYS.basket, core.basket.codec.encode, core.basket.defaults)).not.toThrow();
  });
});
