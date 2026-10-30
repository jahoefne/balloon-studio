// Settings persistence (WP-U3): localStorage under the Mac's UserDefaults keys with the
// same JSON the Mac writes, so its `init(from:)` migrations keep applying. The JSON comes
// from and goes to the core's codecs; this module only moves strings.
//
// Mirrors the Mac's `try?` around UserDefaults: nothing here throws. Unreadable settings
// fall back to the defaults and stay in storage until the next save replaces them.

import type { SETTINGS_KEYS } from '../core/types';

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

/** The part of the Web Storage API settings need; tests inject their own. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface SettingsStorage {
  /** The stored value through `decode`, or `defaults` when absent, unreadable or undecodable. */
  loadSetting<T>(key: SettingsKey, decode: (text: string) => T, defaults: T): T;
  saveSetting<T>(key: SettingsKey, encode: (value: T) => string, value: T): void;
}

export interface SettingsStorageOptions {
  /** Default: the browser's `localStorage`. `null`: no storage, loads give defaults and saves do nothing. */
  storage?: StorageLike | null;
  /** Called once per instance, on the first save that hits the storage quota. */
  onQuotaExceeded?: () => void;
}

/** The hint for that callback. New in the web app: UserDefaults has no quota to run into. */
export const STORAGE_FULL_MESSAGE = 'Your settings can’t be saved because this browser’s storage is full.';

// Reading `localStorage` itself throws where site data is blocked.
const browserStorage = (): StorageLike | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const isQuotaExceeded = (error: unknown): boolean => {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
};

export const createSettingsStorage = (options: SettingsStorageOptions = {}): SettingsStorage => {
  const storage = (): StorageLike | null => (options.storage === undefined ? browserStorage() : options.storage);
  let warned = false;
  return {
    loadSetting(key, decode, defaults) {
      try {
        const text = storage()?.getItem(key) ?? null;
        return text === null ? defaults : decode(text);
      } catch {
        return defaults;
      }
    },
    saveSetting(key, encode, value) {
      try {
        storage()?.setItem(key, encode(value));
      } catch (error) {
        if (!isQuotaExceeded(error) || warned) return;
        warned = true;
        options.onQuotaExceeded?.();
      }
    },
  };
};

let quotaExceededHandler: (() => void) | undefined;

/** Who hears about a full storage when the app's default `settingsStorage` hits the quota. */
export const setQuotaExceededHandler = (handler: () => void): void => {
  quotaExceededHandler = handler;
};

/** The browser's `localStorage`; the stores use it unless a test injects another. */
export const settingsStorage: SettingsStorage = createSettingsStorage({ onQuotaExceeded: () => quotaExceededHandler?.() });

export const { loadSetting, saveSetting } = settingsStorage;
