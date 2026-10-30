// CableClipModel (CableClipEditor.swift:5-72).

import { SETTINGS_KEYS, type CableClipMount, type CableClipParameters } from '../core/types';
import { createPartStore, type PartStore } from './createPartStore';
import type { StoreDeps } from './deps';

export interface ClipExtras {
  selectMount(mount: CableClipMount): void;
  setFlat(wanted: boolean): void;
}

export type ClipStore = PartStore<'clip', CableClipParameters, ClipExtras>;

export const createClipStore = (deps: StoreDeps): ClipStore => {
  const { clip } = deps.core;
  return createPartStore<'clip', CableClipParameters, ClipExtras>(
    {
      part: 'clip',
      key: SETTINGS_KEYS.cableClip,
      codec: clip.codec,
      normalize: clip.normalize,
      fallback: clip.defaults,
      resetTarget: () => clip.defaults,
      previewInput: (s) => s.parameters,
      // The Mac asks the last rendered kit before committing; here the committed parameters
      // decide, because a preview still on its way must not let a blocked clip through.
      canExport: (p) => clip.clip(p).problem === null,
      extend: ({ edit }) => ({
        selectMount: (mount) => edit((p) => ({ ...p, mount })),
        setFlat: (flat) => edit((p) => ({ ...p, flat })),
      }),
    },
    deps,
  );
};
