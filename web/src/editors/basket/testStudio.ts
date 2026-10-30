// For the editor tests: `vi.mock('../../stores', () => import('../basket/testStudio'))` swaps the
// app's stores for a set on fakes, and `answerPreviews()` answers with the stub core's meshes.
// Not imported by the app.

import { act } from '@testing-library/react';
import { core } from '#core';
import { createStudio } from '../../stores/studio';
import { DEBOUNCE_MS } from '../../stores/createPartStore';
import { testDeps } from '../../stores/testKit';
import type { BasketParameters, RingParameters } from '../../core/types';

export const kit = testDeps();
const studio = createStudio(kit.deps);

export const useBalloonStore = studio.balloon;
export const useBasketStore = studio.basket;
export const useRingStore = studio.ring;

let answered = 0;

/** Waits out the debounce, then gives every open basket and ring preview its result. */
export async function answerPreviews(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS.ring + 5));
    for (const call of kit.preview.calls.slice(answered)) {
      if (call.part === 'basket') await call.current(core.basket.preview(call.input as BasketParameters));
      else if (call.part === 'ring') await call.current(core.ring.preview(call.input as RingParameters));
      else await call.superseded();
    }
    answered = kit.preview.calls.length;
  });
}

/** Puts every store back on its defaults, with the first previews answered. */
export async function resetStudio(): Promise<void> {
  await answerPreviews();
  useBalloonStore.getState().apply(core.balloon.defaults);
  useBasketStore.getState().apply(core.basket.defaults);
  useRingStore.getState().apply(core.ring.presets.solid);
  for (const store of [useBasketStore, useRingStore] as const) {
    store.getState().setExporting(false);
    store.getState().setExported(null);
    store.getState().setError(null);
  }
  await answerPreviews();
}
