import { describe, expect, it, vi } from 'vitest';
import { core } from '#core';
import { CoreFailure, LAMP_SETTINGS_ERROR, STL_ERRORS } from '../core/api';
import type { ImportedBalloon } from '../core/types';
import type { IoClient } from './deps';
import { createImportStore, type OpenableFile } from './importStore';
import { flushPromises } from './testKit';

const file = (name: string, text = ''): OpenableFile => ({
  name,
  text: async () => text,
  arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer,
});

const imported = { parameters: core.balloon.defaults, notes: 'n' } as ImportedBalloon;

const setup = (io: Partial<IoClient> = {}) => {
  const commitEditing = vi.fn();
  const ioClient: IoClient = {
    importSTL: vi.fn(async () => imported),
    decodeLampSettings: vi.fn(async (text: string) => core.lampSettings.decode(text)),
    ...io,
  };
  return { store: createImportStore({ ioClient, commitEditing }), ioClient, commitEditing, useSettings: vi.fn() };
};

describe('open', () => {
  it('rejects other file types with the Mac message, without touching the worker', async () => {
    const { store, ioClient, useSettings } = setup();
    await store.getState().open(file('photo.png'), useSettings);
    expect(store.getState().error).toBe('Choose a balloon STL or a cloud or sun settings JSON file.');
    expect(store.getState().loading).toBe(false);
    expect(ioClient.importSTL).not.toHaveBeenCalled();
    await store.getState().open(file('.stl'), useSettings); // a hidden file has no extension
    await store.getState().open(file('stl'), useSettings);
    expect(ioClient.importSTL).not.toHaveBeenCalled();
  });

  it('accepts the extension in any case and holds an STL for review', async () => {
    const { store, ioClient, useSettings } = setup();
    const opening = store.getState().open(file('Balloon.STL', 'solid'), useSettings);
    expect(store.getState().loading).toBe(true);
    await opening;
    expect(store.getState()).toMatchObject({ loading: false, error: null, review: { name: 'Balloon.STL', imported } });
    expect(vi.mocked(ioClient.importSTL).mock.calls[0]![0]).toBeInstanceOf(Uint8Array);
    expect(useSettings).not.toHaveBeenCalled();
  });

  it('hands decoded lamp settings to the caller', async () => {
    const { store, useSettings } = setup();
    await store.getState().open(file('sun-settings.json', '{"kind":"sun","width":210,"depth":22,"diffuserThickness":1.2}'), useSettings);
    expect(useSettings).toHaveBeenCalledTimes(1);
    expect(useSettings.mock.calls[0]![0]).toMatchObject({ kind: 'sun', width: 210 });
    expect(store.getState()).toMatchObject({ loading: false, review: null, error: null });
  });

  it('shows core errors with their Mac text and clears them on the next open', async () => {
    const { store, useSettings } = setup({
      importSTL: async () => {
        throw new CoreFailure('invalid-stl', STL_ERRORS.notABalloon);
      },
    });
    await store.getState().open(file('a.stl'), useSettings);
    expect(store.getState()).toMatchObject({ error: STL_ERRORS.notABalloon, loading: false, review: null });
    await store.getState().open(file('b.json', 'not json'), useSettings);
    expect(store.getState().error).toBe(LAMP_SETTINGS_ERROR);
  });

  it('ignores a file while one is loading or under review', async () => {
    let release: (value: ImportedBalloon) => void = () => undefined;
    const importSTL = vi.fn(() => new Promise<ImportedBalloon>((resolve) => (release = resolve)));
    const { store, useSettings } = setup({ importSTL });
    const first = store.getState().open(file('a.stl'), useSettings);
    await store.getState().open(file('b.stl'), useSettings);
    await flushPromises();
    expect(importSTL).toHaveBeenCalledTimes(1);
    release(imported);
    await first;
    expect(store.getState().review?.name).toBe('a.stl');
    await store.getState().open(file('c.stl'), useSettings);
    expect(importSTL).toHaveBeenCalledTimes(1);
    expect(store.getState().review?.name).toBe('a.stl');
  });
});

describe('chooseFile', () => {
  it('commits and allows the panel when idle', () => {
    const { store, commitEditing } = setup();
    expect(store.getState().chooseFile()).toBe(true);
    expect(commitEditing).toHaveBeenCalledTimes(1);
  });

  it('refuses while a review is open, without committing', () => {
    const { store, commitEditing } = setup();
    store.getState().setReview({ name: 'a.stl', imported });
    expect(store.getState().chooseFile()).toBe(false);
    expect(commitEditing).not.toHaveBeenCalled();
    store.getState().setReview(null);
    expect(store.getState().chooseFile()).toBe(true);
  });
});
