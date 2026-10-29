/// <reference lib="webworker" />
// The core worker. `#core` resolves to core/stub by default and to core/real when the
// app is built with VITE_CORE=real (see web/package.json "imports" and vite.config.ts),
// so core/real need not exist in stub builds.

import { core } from '#core';
import type { WorkerRequest } from './protocol';
import { routeRequest } from './route';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  // The core is synchronous: requests run one after another in arrival order.
  const { response, transfer } = routeRequest(core, event.data);
  scope.postMessage(response, transfer);
};
