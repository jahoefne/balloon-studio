// Routes one worker request to the CoreApi. Pure apart from the core call, so tests run it
// without a Worker.

import { toCoreError, type CoreApi } from '../core/api';
import { collectTransferables, type ExportRequest, type PreviewRequest, type WorkerRequest, type WorkerResponse } from './protocol';

const preview = (core: CoreApi, request: PreviewRequest): unknown => {
  switch (request.part) {
    case 'balloon':
      return core.balloon.preview(request.input);
    case 'basket':
      return core.basket.preview(request.input);
    case 'ring':
      return core.ring.preview(request.input);
    case 'cloud':
    case 'sun':
      return core.cloud.preview(request.input);
    case 'figure':
      return core.figure.preview(request.input);
    case 'clip':
      return core.clip.preview(request.input);
  }
};

const exportPart = (core: CoreApi, request: ExportRequest): unknown => {
  switch (request.part) {
    case 'balloon':
      return core.balloon.export(request.input);
    case 'basket':
      return core.basket.export(request.input);
    case 'ring':
      return core.ring.export(request.input);
    case 'cloud':
    case 'sun':
      return core.cloud.export(request.input);
    case 'figure':
      return core.figure.export(request.input.parameters, request.input.variant);
    case 'clip':
      return core.clip.export(request.input);
  }
};

const run = (core: CoreApi, request: WorkerRequest): unknown => {
  switch (request.type) {
    case 'init':
      return { implementation: core.implementation };
    case 'preview':
      return preview(core, request.request);
    case 'export':
      return exportPart(core, request.request);
    case 'importSTL':
      return core.stl.open(request.bytes);
    case 'decodeLampSettings':
      return core.lampSettings.decode(request.text);
  }
};

/** The response to post and the buffers to transfer with it. Never throws. */
export const routeRequest = (core: CoreApi, request: WorkerRequest): { response: WorkerResponse; transfer: ArrayBuffer[] } => {
  try {
    const result = run(core, request);
    return { response: { id: request.id, ok: true, result }, transfer: collectTransferables(result) };
  } catch (error) {
    return { response: { id: request.id, ok: false, error: toCoreError(error) }, transfer: [] };
  }
};
