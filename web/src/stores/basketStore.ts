// BasketModel (BasketEditor.swift:10-83).

import { SETTINGS_KEYS, type BalloonParameters, type BasketParameters, type BasketStyle } from '../core/types';
import { createPartStore, type PartStore } from './createPartStore';
import type { StoreDeps } from './deps';

export interface BasketExtras {
  selectStyle(style: BasketStyle): void;
  /** "Match balloon": `core.basket.match`, round(d·0.35), round(d·0.27), round(h·0.19). */
  match(balloon: BalloonParameters): void;
}

export type BasketStore = PartStore<'basket', BasketParameters, BasketExtras>;

export const createBasketStore = (deps: StoreDeps): BasketStore => {
  const { basket } = deps.core;
  return createPartStore<'basket', BasketParameters, BasketExtras>(
    {
      part: 'basket',
      key: SETTINGS_KEYS.basket,
      codec: basket.codec,
      normalize: basket.normalize,
      fallback: basket.defaults,
      resetTarget: () => basket.defaults,
      previewInput: (s) => s.parameters,
      extend: ({ edit }) => ({
        selectStyle: (style) => edit((p) => ({ ...p, style })),
        match: (balloon) => edit((p) => basket.match(p, balloon)),
      }),
    },
    deps,
  );
};
