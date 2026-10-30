// FigureModel (FigureEditor.swift:5-77).

import { SETTINGS_KEYS, type FigureParameters, type FigureStyle, type FigureSurface } from '../core/types';
import { createPartStore, type PartStore } from './createPartStore';
import type { StoreDeps } from './deps';

export interface FigureExtras {
  selectStyle(style: FigureStyle): void;
  selectSurface(surface: FigureSurface): void;
  setDoubleSided(wanted: boolean): void;
  setChainHole(wanted: boolean): void;
}

export type FigureStore = PartStore<'figure', FigureParameters, FigureExtras>;

export const createFigureStore = (deps: StoreDeps): FigureStore => {
  const { figure } = deps.core;
  return createPartStore<'figure', FigureParameters, FigureExtras>(
    {
      part: 'figure',
      key: SETTINGS_KEYS.figure,
      codec: figure.codec,
      normalize: figure.normalize,
      fallback: figure.defaults,
      resetTarget: () => figure.defaults,
      previewInput: (s) => s.parameters,
      extend: ({ edit }) => ({
        selectStyle: (style) => edit((p) => ({ ...p, style })),
        selectSurface: (surface) => edit((p) => ({ ...p, surface })),
        setDoubleSided: (doubleSided) => edit((p) => ({ ...p, doubleSided })),
        setChainHole: (chainHole) => edit((p) => ({ ...p, chainHole })),
      }),
    },
    deps,
  );
};
