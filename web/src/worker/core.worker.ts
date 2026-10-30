/// <reference lib="webworker" />
// The core worker. `#core` resolves to core/stub by default and to core/real when the
// app is built with VITE_CORE=real (see web/package.json "imports" and vite.config.ts),
// so core/real need not exist in stub builds.

import { core } from '#core';
import type { WorkerRequest } from './protocol';
import { routeRequest } from './route';

const scope = self as unknown as DedicatedWorkerGlobalScope;

const fetchAsset = async (file: string): Promise<ArrayBuffer> => {
  const response = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  return response.arrayBuffer();
};

// A failed load only costs the Text pattern, which then reports it per request.
const ready = core.prepare(fetchAsset).catch((error: unknown) => {
  console.error(error);
});

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  // The core is synchronous: requests run one after another in arrival order, after the fonts.
  void ready.then(() => {
    const { response, transfer } = routeRequest(core, event.data);
    scope.postMessage(response, transfer);
  });
};
