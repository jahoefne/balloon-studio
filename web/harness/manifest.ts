// Typed access to references/manifest.json (results of the Swift exporter) merged with
// mac/cases/grid.json (its input). Schema: references/PACK.md.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OutputKind } from './result';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const REFERENCES_DIR = `${REPO_ROOT}references/`;

export type Part = 'balloon' | 'pattern' | 'basket' | 'ring' | 'cloud' | 'sun' | 'figure' | 'figureSet' | 'clip';
export type Quality = 'preview' | 'export';
export type Group = 'identity' | 'relief' | 'text';

export interface Bbox {
  min: [number, number, number];
  max: [number, number, number];
}

/** What the manifest records about an STL, enough to fail without the reference body. */
export interface StlFacts {
  triangles?: number;
  bbox?: Bbox;
  /** Hex of the 80 header bytes; only for the `BSTL0002` settings header. */
  header?: string;
}

export interface ManifestEntry extends StlFacts {
  name: string;
  kind: OutputKind;
  bytes: number;
  sha256: string;
  crc32: number;
  localHeaderOffset: number;
  tierA: boolean;
}

export interface ManifestRaster {
  name: string;
  kind: string;
  bytes: number;
  sha256: string;
  tierA: boolean;
}

/** The fields only mac/cases/grid.json has. */
export interface GridFields {
  /** Raw settings JSON; `null` means no saved settings (the model's default). */
  parameters?: unknown;
  pattern?: unknown;
  purge?: unknown;
  /** Values of the normalized settings (`parameters.x`, `pattern.x`, `purge.x`) or the filename. */
  expect?: Record<string, unknown>;
  /** Substring of the export error this case must raise. */
  expectError?: string;
  comment?: string;
}

interface CaseBase extends GridFields {
  id: string;
  part: Part;
  quality: Quality;
  group: Group;
  durationMs: number;
}

export interface ExportedCase extends CaseBase, StlFacts {
  error?: undefined;
  filename: string;
  kind: OutputKind;
  bytes: number;
  sha256: string;
  tierA: boolean;
  /** Sorted `JSONEncoder` of the normalized settings. */
  normalized: string;
  normalizedPattern?: string;
  normalizedPurge?: string;
  entries?: ManifestEntry[];
  rasters?: ManifestRaster[];
  notes?: { note?: string; problem?: string; appExportDisabled?: boolean };
}

/** A case whose export throws in Swift. */
export interface FailingCase extends CaseBase {
  error: string;
}

export type ReferenceCase = ExportedCase | FailingCase;

export interface PackAsset {
  name: string;
  bytes: number;
  sha256: string;
  url: string;
}

export interface Manifest {
  schema: number;
  generatedAt: string;
  generator: { macOS: string; toolchain: { swiftc: string } };
  grid: { cases: number; path: string; sha256: string };
  sourcesSha256: string;
  pack: { release: string; assets: PackAsset[] };
  cases: ReferenceCase[];
}

interface GridFile {
  cases: (GridFields & { id: string })[];
}

let cached: { manifest: Manifest; byId: Map<string, ReferenceCase> } | null = null;

function load(): { manifest: Manifest; byId: Map<string, ReferenceCase> } {
  if (cached !== null) return cached;
  const manifest = JSON.parse(readFileSync(`${REFERENCES_DIR}manifest.json`, 'utf8')) as Manifest;
  if (manifest.schema !== 1) throw new Error(`references/manifest.json has schema ${manifest.schema}, the harness reads schema 1`);
  const grid = JSON.parse(readFileSync(`${REPO_ROOT}mac/cases/grid.json`, 'utf8')) as GridFile;
  const gridById = new Map(grid.cases.map((entry) => [entry.id, entry]));
  const byId = new Map<string, ReferenceCase>();
  for (const record of manifest.cases) {
    const fields = gridById.get(record.id);
    if (fields === undefined) throw new Error(`Case ${record.id} is in the manifest but not in mac/cases/grid.json`);
    const { parameters, pattern, purge, expect, expectError, comment } = fields;
    byId.set(record.id, {
      ...record,
      parameters,
      pattern,
      purge,
      ...(expect === undefined ? {} : { expect }),
      ...(expectError === undefined ? {} : { expectError }),
      ...(comment === undefined ? {} : { comment }),
    });
  }
  cached = { manifest, byId };
  return cached;
}

export function loadManifest(): Manifest {
  return load().manifest;
}

/** Every case in grid order, with the grid fields merged in. */
export function allCases(): ReferenceCase[] {
  return [...load().byId.values()];
}

/** Throws on an unknown id, so a typo in a test cannot pass as "nothing to compare". */
export function getCase(id: string): ReferenceCase {
  const found = load().byId.get(id);
  if (found === undefined) throw new Error(`Unknown reference case "${id}" (see references/manifest.json)`);
  return found;
}

export function isExported(c: ReferenceCase): c is ExportedCase {
  return c.error === undefined;
}

/** Output kind by extension, as the exporter classifies ZIP and 3MF entries. */
export function kindOfName(name: string): OutputKind {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  switch (extension) {
    case 'stl':
    case 'zip':
    case '3mf':
    case 'json':
    case 'svg':
    case 'model':
      return extension;
    default:
      return 'text';
  }
}

/** JSON, text and SVG have to be byte-identical; no tolerance applies to them. */
export function isStrictKind(kind: OutputKind): boolean {
  return kind === 'json' || kind === 'text' || kind === 'svg';
}
