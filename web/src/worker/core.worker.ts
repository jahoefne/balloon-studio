/// <reference lib="webworker" />
// The core worker. `#core` resolves to core/stub by default and to core/real when the
// app is built with VITE_CORE=real (see web/package.json "imports" and vite.config.ts),
// so core/real need not exist in stub builds.

import { core } from '#core';
import type { WorkerRequest } from './protocol';
import { createRequestHandler } from './route';

const scope = self as unknown as DedicatedWorkerGlobalScope;

const fetchAsset = async (file: string): Promise<ArrayBuffer> => {
  const response = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  return response.arrayBuffer();
};

const handle = createRequestHandler(core, fetchAsset, (response, transfer) => scope.postMessage(response, transfer));

scope.onmessage = (event: MessageEvent<WorkerRequest>) => handle(event.data);
