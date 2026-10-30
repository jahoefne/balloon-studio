// What the stores need from outside. `stores/index.ts` passes the real ones (main-thread
// core parameters, worker clients, localStorage, blur-to-commit); tests pass fakes.

import type { CoreParameterApi } from '../core/api';
import type { SettingsStorage } from '../persistence/settingsStorage';
import { createWorkerClient, type WorkerClient, type WorkerRole } from '../worker/client';

export type PreviewClient = Pick<WorkerClient, 'preview'>;
export type IoClient = Pick<WorkerClient, 'importSTL' | 'decodeLampSettings'>;

export interface StoreDeps {
  core: CoreParameterApi;
  previewClient: PreviewClient;
  ioClient: IoClient;
  settings: SettingsStorage;
  /** `.commitBalloonEditing`: runs before anything reads parameters a focused field may still change. */
  commitEditing: () => void;
}

/** A worker client that starts its worker on first use, so importing the stores spawns nothing. */
export const lazyWorkerClient = (role: WorkerRole): WorkerClient => {
  let client: WorkerClient | undefined;
  const started = (): WorkerClient => (client ??= createWorkerClient(role));
  return {
    role,
    get ready() {
      return started().ready;
    },
    preview: (part, input) => started().preview(part, input),
    export: (part, input) => started().export(part, input),
    importSTL: (bytes) => started().importSTL(bytes),
    decodeLampSettings: (text) => started().decodeLampSettings(text),
    dispose: () => client?.dispose(),
  };
};
