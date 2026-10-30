// RingModel (RingEditor.swift:43-124).

import { swiftMax } from '../core/swift/minmax';
import { SETTINGS_KEYS, type RingParameters } from '../core/types';
import { createPartStore, type PartStore } from './createPartStore';
import type { StoreDeps } from './deps';

export interface RingExtras {
  construction(segmented: boolean): void;
  lighting(reflected: boolean): void;
}

export type RingStore = PartStore<'ring', RingParameters, RingExtras>;

export const createRingStore = (deps: StoreDeps): RingStore => {
  const { ring } = deps.core;
  return createPartStore<'ring', RingParameters, RingExtras>(
    {
      part: 'ring',
      key: SETTINGS_KEYS.ring,
      codec: ring.codec,
      normalize: ring.normalize,
      fallback: ring.presets.solid,
      resetTarget: (p) => (p.segmented ? ring.presets.large : ring.presets.solid),
      previewInput: (s) => s.parameters,
      extend: ({ edit }) => ({
        construction: (segmented) => edit((p) => ({ ...p, segmented })),
        lighting: (reflected) =>
          edit((p) =>
            reflected
              ? { ...p, reflectedLED: true, stripWidth: 8, ledClearance: 0.5, bandWidth: swiftMax(40, p.bandWidth) }
              : { ...p, reflectedLED: false },
          ),
      }),
    },
    deps,
  );
};
