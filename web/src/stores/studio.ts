// All stores wired together, as BalloonStudioApp's `@StateObject`s are. `stores/index.ts`
// builds the app's set from the real dependencies; tests build theirs from fakes.

import { createAppStore } from './appStore';
import { createBalloonStore } from './balloonStore';
import { createBasketStore } from './basketStore';
import { createClipStore } from './clipStore';
import { createCloudStore } from './cloudStore';
import type { StoreDeps } from './deps';
import { createFigureStore } from './figureStore';
import { createImportStore } from './importStore';
import { createRingStore } from './ringStore';

export const createStudio = (deps: StoreDeps) => {
  const parts = {
    balloon: createBalloonStore(deps),
    basket: createBasketStore(deps),
    ring: createRingStore(deps),
    cloud: createCloudStore('cloud', deps),
    sun: createCloudStore('sun', deps),
    figure: createFigureStore(deps),
    clip: createClipStore(deps),
    importer: createImportStore(deps),
  };
  return { ...parts, app: createAppStore(parts, deps) };
};

export type Studio = ReturnType<typeof createStudio>;
