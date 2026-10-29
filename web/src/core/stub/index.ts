// The stub core (VITE_CORE=stub, the default): real parameter logic from ./parameters,
// placeholder geometry from ./geometry. Imported by the core worker via `#core`.

import type { CoreApi } from '../api';
import { geometry } from './geometry';
import { core as parameters } from './parameters';

export const core: CoreApi = {
  implementation: 'stub',
  balloon: { ...parameters.balloon, ...geometry.balloon },
  basket: { ...parameters.basket, ...geometry.basket },
  ring: { ...parameters.ring, ...geometry.ring },
  cloud: { ...parameters.cloud, ...geometry.cloud },
  figure: { ...parameters.figure, ...geometry.figure },
  clip: { ...parameters.clip, ...geometry.clip },
  stl: geometry.stl,
  lampSettings: parameters.lampSettings,
};
