// Runs one grid case through the CoreApi the way mac/ReferenceExporter/main.swift (`produce`)
// runs it through the Swift core: decode the raw settings, normalize, export.
import type { CoreApi, Quality, RunOptions } from '../src/core/api';
import type { ExportResult } from '../src/core/types';
import type { ReferenceCase } from './manifest';

/**
 * Two things the reference exporter does and the app does not, which `CoreApi.export` has no
 * parameter for yet. `core/real` (WP-K9) has to honor both for the grid to pass:
 * - `quality`: 59 grid cases are exported at preview quality.
 * - `ignoreExportProblem`: `clip-small-head` has a `problem`; the app disables its export, the
 *   reference keeps the geometry.
 */
export interface GridRunOptions extends RunOptions {
  quality: Quality;
  ignoreExportProblem: true;
}

export interface CaseSettings {
  /** The `JSONEncoder` text of the normalized settings, to compare with the manifest. */
  normalized: string;
  normalizedPattern?: string;
  normalizedPurge?: string;
  run(): ExportResult;
}

/** Throws where the decode throws, like `decodeRaw` in the exporter. */
export function prepareCase(core: CoreApi, c: ReferenceCase): CaseSettings {
  const options: GridRunOptions = { quality: c.quality, ignoreExportProblem: true };
  const raw = c.parameters ?? null;
  switch (c.part) {
    case 'balloon':
    case 'pattern': {
      const api = core.balloon;
      const parameters = api.normalize(raw === null ? api.presets.classic : api.codec.decodeValue(raw));
      const pattern = api.pattern.normalize(c.pattern === undefined || c.pattern === null ? api.pattern.defaults : api.pattern.codec.decodeValue(c.pattern), parameters);
      const purge = api.purge.normalize(c.purge === undefined || c.purge === null ? api.purge.defaults : api.purge.codec.decodeValue(c.purge));
      return {
        normalized: api.codec.encode(parameters),
        ...(c.part === 'pattern' ? { normalizedPattern: api.pattern.codec.encode(pattern), normalizedPurge: api.purge.codec.encode(purge) } : {}),
        run: () => api.export({ parameters, pattern, purge }, options),
      };
    }
    case 'basket': {
      const api = core.basket;
      const parameters = api.normalize(raw === null ? api.defaults : api.codec.decodeValue(raw));
      return { normalized: api.codec.encode(parameters), run: () => api.export(parameters, options) };
    }
    case 'ring': {
      const api = core.ring;
      const parameters = api.normalize(raw === null ? api.presets.solid : api.codec.decodeValue(raw));
      return { normalized: api.codec.encode(parameters), run: () => api.export(parameters, options) };
    }
    case 'cloud':
    case 'sun': {
      const api = core.cloud;
      const kind = c.part;
      const decoded = raw === null ? api.defaults(kind) : api.codec.decodeValue(raw);
      const parameters = api.normalize({ ...decoded, kind });
      return { normalized: api.codec.encode(parameters), run: () => api.export(parameters, options) };
    }
    case 'figure':
    case 'figureSet': {
      const api = core.figure;
      const parameters = api.normalize(raw === null ? api.defaults : api.codec.decodeValue(raw));
      const variant = c.part === 'figure' ? 'single' : 'set';
      return { normalized: api.codec.encode(parameters), run: () => api.export(parameters, variant, options) };
    }
    case 'clip': {
      const api = core.clip;
      const parameters = api.normalize(raw === null ? api.defaults : api.codec.decodeValue(raw));
      return { normalized: api.codec.encode(parameters), run: () => api.export(parameters, options) };
    }
  }
}

/** The single file of an export; every Mac export is one file. */
export function exportedFile(result: ExportResult): { name: string; bytes: Uint8Array } {
  const [file] = result.files;
  if (file === undefined || result.files.length !== 1) throw new Error(`${result.filename}: expected exactly one exported file, got ${result.files.length}`);
  return file;
}
