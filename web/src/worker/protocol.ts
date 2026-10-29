// Messages between the UI and the core worker (WP-U2). Two instances of the same worker
// run: `preview` (debounced, latest-wins per part) and `io` (export, STL import, settings).

import type {
  BalloonPreview,
  BalloonSnapshot,
  BasketParameters,
  BasketPreview,
  CableClipParameters,
  ClipPreview,
  CloudParameters,
  CloudPreview,
  CoreError,
  ExportResult,
  FigureParameters,
  FigurePreview,
  ImportedBalloon,
  RingParameters,
  RingPreview,
} from '../core/types';

/** A coalescing channel: cloud and sun are separate parts that share `CloudParameters`. */
export type PartKey = 'balloon' | 'basket' | 'ring' | 'cloud' | 'sun' | 'figure' | 'clip';
export const PART_KEYS: readonly PartKey[] = ['balloon', 'basket', 'ring', 'cloud', 'sun', 'figure', 'clip'];

export interface PreviewInputs {
  balloon: BalloonSnapshot;
  basket: BasketParameters;
  ring: RingParameters;
  cloud: CloudParameters;
  sun: CloudParameters;
  figure: FigureParameters;
  clip: CableClipParameters;
}
export interface PreviewResults {
  balloon: BalloonPreview;
  basket: BasketPreview;
  ring: RingPreview;
  cloud: CloudPreview;
  sun: CloudPreview;
  figure: FigurePreview;
  clip: ClipPreview;
}
export interface ExportInputs extends Omit<PreviewInputs, 'figure'> {
  figure: { parameters: FigureParameters; variant: 'single' | 'set' };
}

export type PreviewRequest = { [K in PartKey]: { part: K; input: PreviewInputs[K] } }[PartKey];
export type ExportRequest = { [K in PartKey]: { part: K; input: ExportInputs[K] } }[PartKey];

export interface InitResult {
  implementation: 'stub' | 'real';
}

export type WorkerRequest =
  | { type: 'init'; id: number }
  | { type: 'preview'; id: number; request: PreviewRequest }
  | { type: 'export'; id: number; request: ExportRequest }
  /** The client transfers `bytes.buffer` when the view spans all of it. */
  | { type: 'importSTL'; id: number; bytes: Uint8Array }
  | { type: 'decodeLampSettings'; id: number; text: string };

export type WorkerRequestType = WorkerRequest['type'];

/** What each request resolves to. */
export interface WorkerResults {
  init: InitResult;
  preview: PreviewResults[PartKey];
  export: ExportResult;
  importSTL: ImportedBalloon;
  decodeLampSettings: CloudParameters;
}

export type WorkerResponse<T = unknown> = { id: number; ok: true; result: T } | { id: number; ok: false; error: CoreError };

/** Every distinct ArrayBuffer under `value` (typed-array views), to post as transferables. */
export const collectTransferables = (value: unknown): ArrayBuffer[] => {
  const found = new Set<ArrayBuffer>();
  const visit = (v: unknown, depth: number): void => {
    if (depth > 8 || typeof v !== 'object' || v === null) return;
    if (ArrayBuffer.isView(v)) {
      if (v.buffer instanceof ArrayBuffer) found.add(v.buffer);
      return;
    }
    for (const child of Array.isArray(v) ? v : Object.values(v)) visit(child, depth + 1);
  };
  visit(value, 0);
  return [...found];
};
