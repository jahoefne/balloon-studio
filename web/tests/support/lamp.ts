// Test support for the lamp cluster (WP-K4). Test-only: uses node: modules.
import { readFileSync } from 'node:fs';
import { BalloonMesh } from '../../src/core/geometry/mesh';
import { cloudParameters, cloudParametersCodec, encodeCloudParameters } from '../../src/core/lamp/cloudGeometry';
import { LampSurfaceGenerator } from '../../src/core/lamp/lampSurface';
import type { CloudParameters } from '../../src/core/types';

/** Swift `==` on CloudParameters: every field, with Double equality. */
export const sameParameters = (a: CloudParameters, b: CloudParameters): boolean =>
  (Object.keys(a) as (keyof CloudParameters)[]).every((key) => a[key] === b[key]) && Object.keys(a).length === Object.keys(b).length;

/** `JSONDecoder().decode(CloudParameters.self, from:)` */
export const decoded = (json: string): CloudParameters => cloudParametersCodec.decode(json);

/** A round trip through `JSONEncoder` and `JSONDecoder`. */
export const roundTripped = (p: CloudParameters): CloudParameters => decoded(encodeCloudParameters(p));

const references = new URL('../../../references/', import.meta.url);

export const referenceText = (relative: string): string => readFileSync(new URL(relative, references), 'utf8');

export interface ManifestEntry {
  name: string;
  kind: string;
  bytes: number;
  sha256: string;
  crc32: number;
  localHeaderOffset: number;
  tierA: boolean;
  triangles?: number;
}
export interface ManifestCase {
  id: string;
  part: string;
  quality: 'preview' | 'export';
  filename: string;
  normalized: string;
  bytes: number;
  sha256: string;
  durationMs: number;
  entries: ManifestEntry[];
}
export interface GridCase {
  id: string;
  part: string;
  parameters: unknown;
  expect?: Readonly<Record<string, unknown>>;
}

/** The 41 lamp cases of the reference manifest, each with its raw parameters from the grid. */
export const lampCases = (): { manifest: ManifestCase; grid: GridCase }[] => {
  const manifest = JSON.parse(referenceText('manifest.json')) as { cases: ManifestCase[] };
  const grid = JSON.parse(new TextDecoder().decode(readFileSync(new URL('../mac/cases/grid.json', references)))) as { cases: GridCase[] };
  return manifest.cases
    .filter((c) => c.part === 'cloud' || c.part === 'sun')
    .map((c) => ({ manifest: c, grid: grid.cases.find((g) => g.id === c.id)! }));
};

/** The exporter's way in (mac/ReferenceExporter/main.swift:124-128), before `.normalized()`. */
export const decodedCase = (c: GridCase, defaults: (kind: 'cloud' | 'sun') => CloudParameters): CloudParameters => {
  const kind = c.part === 'sun' ? 'sun' : 'cloud';
  const restored = c.parameters === null || c.parameters === undefined ? defaults(kind) : cloudParametersCodec.decodeValue(c.parameters);
  return { ...restored, kind };
};

const stillFrozen = (probe: () => unknown): boolean => {
  try {
    probe();
    return false;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('WP-K4')) return true;
    throw error;
  }
};

/** Which of the frozen signatures (WP-K4a part 1) still throw. A test of a kit skips until they are filled. */
export const waitsFor = {
  k4c: stillFrozen(() => LampSurfaceGenerator.sculpt(new BalloonMesh([], [], 0), cloudParameters(), 'preview')),
};

/**
 * The sculpted fronts where libm noise tips a tie in `refine`, so they are not Swift's triangles
 * (lampSurface.reference.test.ts). Not the rule's `equivalent`: a few vertices differ.
 */
export const LIBM_FLIPPED_FRONTS: Readonly<Record<string, string>> = {
  'cloud-sculpted-classic': 'B-cloud-front-white-PLA.stl',
  'cloud-sculpted-billow-min': 'B-cloud-front-white-PLA.stl',
};
