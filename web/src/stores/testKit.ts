// Fakes for the store tests. Not imported by the app.

import { vi } from 'vitest';
import { core } from '#core/parameters';
import { createSettingsStorage, type StorageLike } from '../persistence/settingsStorage';
import type { Latest } from '../worker/client';
import type { PartKey } from '../worker/protocol';
import type { IoClient, PreviewClient, StoreDeps } from './deps';

/** A Storage that records every write. */
export const memoryStorage = (initial: Record<string, string> = {}) => {
  const items = new Map(Object.entries(initial));
  const writes: { key: string; value: string }[] = [];
  const storage: StorageLike = {
    getItem: (key) => items.get(key) ?? null,
    setItem(key, value) {
      items.set(key, value);
      writes.push({ key, value });
    },
  };
  return { storage, items, writes };
};

export interface FakePreviewCall {
  part: PartKey;
  input: unknown;
  /** Answers `{status: 'current', value}`. Typed loosely: tests pass marker bundles. */
  current(value: unknown): Promise<void>;
  superseded(): Promise<void>;
  fail(error: unknown): Promise<void>;
}

/** Records preview calls; the test answers each when it likes. */
export const fakePreviewClient = () => {
  const calls: FakePreviewCall[] = [];
  const client: PreviewClient = {
    preview: (part, input) =>
      new Promise((resolve, reject) => {
        const settle = (action: () => void) => {
          action();
          return flushPromises();
        };
        calls.push({
          part,
          input,
          current: (value) => settle(() => resolve({ status: 'current', value } as Latest<never>)),
          superseded: () => settle(() => resolve({ status: 'superseded' })),
          fail: (error) => settle(() => reject(error)),
        });
      }),
  };
  return { client, calls };
};

/** Lets settled promises run their reactions, with real or fake timers. */
export const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

export const fakeIoClient = (): IoClient => ({
  importSTL: () => Promise.reject(new Error('importSTL is not set up in this test')),
  decodeLampSettings: async (text) => core.lampSettings.decode(text),
});

export const testDeps = (initial: Record<string, string> = {}) => {
  const memory = memoryStorage(initial);
  const preview = fakePreviewClient();
  const commitEditing = vi.fn();
  const deps: StoreDeps = {
    core,
    previewClient: preview.client,
    ioClient: fakeIoClient(),
    settings: createSettingsStorage({ storage: memory.storage }),
    commitEditing,
  };
  return { deps, memory, preview, commitEditing };
};
