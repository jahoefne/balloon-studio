// The UI side of the core worker (WP-U2).
//
// Previews coalesce per part: at most one request per part is in the worker; a newer
// request replaces the one waiting behind it, and when the running one finishes with a
// newer one waiting, its result is stale and dropped (`superseded`). Exports, STL imports
// and settings files never coalesce. Responses for unknown ids are ignored.

import { CoreFailure } from '../core/api';
import type { CloudParameters, CoreError, ExportResult, ImportedBalloon } from '../core/types';
import type {
  ExportInputs,
  ExportRequest,
  InitResult,
  PartKey,
  PreviewInputs,
  PreviewRequest,
  PreviewResults,
  WorkerRequest,
  WorkerResponse,
} from './protocol';

export type WorkerRole = 'preview' | 'io';

/** The worker as the client sees it; tests substitute a fake. */
export interface WorkerTransport {
  post(message: WorkerRequest, transfer: Transferable[]): void;
  listen(onMessage: (response: WorkerResponse) => void, onError: (message: string) => void): void;
  terminate(): void;
}

/** A coalesced preview either is the latest for its part or was overtaken by a newer one. */
export type Latest<T> = { status: 'current'; value: T } | { status: 'superseded' };

export interface WorkerClient {
  readonly role: WorkerRole;
  /** Resolves once the worker answered `init`; rejects if it could not start. */
  readonly ready: Promise<InitResult>;
  /** Rejects with `CoreFailure` when the core fails for the latest request. */
  preview<K extends PartKey>(part: K, input: PreviewInputs[K]): Promise<Latest<PreviewResults[K]>>;
  export<K extends PartKey>(part: K, input: ExportInputs[K]): Promise<ExportResult>;
  /** Transfers (detaches) `bytes.buffer` when the view covers all of it. */
  importSTL(bytes: Uint8Array): Promise<ImportedBalloon>;
  decodeLampSettings(text: string): Promise<CloudParameters>;
  /** Stops the worker: running previews resolve `superseded`, everything else rejects. After a worker error the client behaves the same. */
  dispose(): void;
}

export const createWorkerTransport = (role: WorkerRole): WorkerTransport => {
  const worker = new Worker(new URL('./core.worker.ts', import.meta.url), { type: 'module', name: `core-${role}` });
  return {
    post: (message, transfer) => worker.postMessage(message, transfer),
    listen(onMessage, onError) {
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => onMessage(event.data);
      worker.onerror = (event: ErrorEvent) => {
        event.preventDefault();
        onError(event.message || 'The core worker failed to start.');
      };
      worker.onmessageerror = () => onError('A message from the core worker could not be read.');
    },
    terminate: () => worker.terminate(),
  };
};

const failure = (error: CoreError): CoreFailure => new CoreFailure(error.code, error.message);
const STOPPED: CoreError = { code: 'internal', message: 'The core worker was stopped.' };

interface Waiter {
  onResponse(response: WorkerResponse): void;
  onAbort(error: CoreError): void;
}
interface QueuedPreview {
  input: unknown;
  resolve(value: Latest<unknown>): void;
  reject(error: unknown): void;
}
interface Channel {
  busy: boolean;
  queued: QueuedPreview | null;
}

export const createWorkerClient = (role: WorkerRole, options: { transport?: WorkerTransport } = {}): WorkerClient => {
  const transport = options.transport ?? createWorkerTransport(role);
  const waiters = new Map<number, Waiter>();
  const channels = new Map<PartKey, Channel>();
  let nextId = 1;
  let stopped: CoreError | null = null;
  let disposed = false;

  const abortAll = (error: CoreError) => {
    const pending = [...waiters.values()];
    waiters.clear();
    for (const waiter of pending) waiter.onAbort(error);
    for (const channel of channels.values()) {
      channel.queued?.resolve({ status: 'superseded' });
      channel.queued = null;
      channel.busy = false;
    }
  };

  transport.listen(
    (response) => {
      const waiter = waiters.get(response.id);
      if (!waiter) return; // stale or unknown id
      waiters.delete(response.id);
      waiter.onResponse(response);
    },
    (message) => {
      // A worker that failed to load or crashed answers nothing more.
      stopped ??= { code: 'internal', message };
      abortAll(stopped);
    },
  );

  const post = (build: (id: number) => WorkerRequest, transfer: Transferable[], waiter: Waiter) => {
    if (stopped) {
      waiter.onAbort(stopped);
      return;
    }
    const id = nextId;
    nextId += 1;
    waiters.set(id, waiter);
    transport.post(build(id), transfer);
  };

  const request = <T>(build: (id: number) => WorkerRequest, transfer: Transferable[] = []): Promise<T> =>
    new Promise<T>((resolve, reject) =>
      post(build, transfer, {
        onResponse: (response) => (response.ok ? resolve(response.result as T) : reject(failure(response.error))),
        onAbort: (error) => reject(failure(error)),
      }),
    );

  const start = (part: PartKey, channel: Channel, entry: QueuedPreview) => {
    channel.busy = true;
    post((id) => ({ type: 'preview', id, request: { part, input: entry.input } as PreviewRequest }), [], {
      onResponse(response) {
        channel.busy = false;
        const next = channel.queued;
        channel.queued = null;
        if (next) {
          entry.resolve({ status: 'superseded' });
          start(part, channel, next);
        } else if (response.ok) entry.resolve({ status: 'current', value: response.result });
        else entry.reject(failure(response.error));
      },
      onAbort: () => entry.resolve({ status: 'superseded' }),
    });
  };

  const ready = request<InitResult>((id) => ({ type: 'init', id }));
  ready.catch(() => undefined);

  return {
    role,
    ready,
    preview<K extends PartKey>(part: K, input: PreviewInputs[K]) {
      return new Promise<Latest<PreviewResults[K]>>((resolve, reject) => {
        let channel = channels.get(part);
        if (!channel) {
          channel = { busy: false, queued: null };
          channels.set(part, channel);
        }
        const entry: QueuedPreview = { input, resolve: resolve as (value: Latest<unknown>) => void, reject };
        channel.queued?.resolve({ status: 'superseded' });
        channel.queued = null;
        if (channel.busy) channel.queued = entry;
        else start(part, channel, entry);
      });
    },
    export<K extends PartKey>(part: K, input: ExportInputs[K]) {
      return request<ExportResult>((id) => ({ type: 'export', id, request: { part, input } as ExportRequest }));
    },
    importSTL(bytes) {
      const whole = bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
      return request<ImportedBalloon>((id) => ({ type: 'importSTL', id, bytes }), whole ? [bytes.buffer] : []);
    },
    decodeLampSettings(text) {
      return request<CloudParameters>((id) => ({ type: 'decodeLampSettings', id, text }));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopped = STOPPED;
      transport.terminate();
      abortAll(STOPPED);
    },
  };
};
