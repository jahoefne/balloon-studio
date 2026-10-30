// The stub core's parameter half: everything here is real (ported from Swift), only the
// geometry in ./geometry.ts is placeholder. Imported on the main thread via `#core/parameters`.

import type { CoreParameterApi } from '../api';
import { balloonParameters } from './balloon';
import { basketParameters } from './basket';
import { clipParameters } from './clip';
import { cloudParameters } from './cloud';
import { figureParameters } from './figure';
import { lampSettings } from './lampSettings';
import { ringParameters } from './ring';

export const core: CoreParameterApi = {
  implementation: 'stub',
  balloon: balloonParameters,
  basket: basketParameters,
  ring: ringParameters,
  cloud: cloudParameters,
  figure: figureParameters,
  clip: clipParameters,
  stl: { maximumBytes: 150_000_000, maximumTriangles: 2_000_000 },
  lampSettings,
};
