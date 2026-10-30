// The one place raster tests read CoreGraphics and CoreText dumps from (WP-R6; contract in tests/fixtures/README.md).
// Node only (node:fs, node:zlib through swiftProbe); the browser run of tests/hashes.test.ts must not import this file.
//
//   Pack, cases with `rasters` in references/manifest.json (guard with `it.skipIf(!hasRasterPack())`):
//     rasterCaseIds('relief' | 'text'), loadReliefDump(id), loadTextDump(id)
//   Tier A, committed:
//     primitiveNames(), loadPrimitive(name), loadPrimitiveIndex()
//   tests/fixtures, gunzipped when the name ends in .gz:
//     fixtureBytes, fixtureText, fixturePGM, fixtureFloat32, probeSection, probeValue
//
// Everything read from the pack or Tier A is checked against the manifest's SHA-256, so a damaged pack cannot look like a
// rasterizer bug. Rows are never flipped: row 0 is the bottom of the artwork or glyphs, as in the Swift bitmaps.
import { existsSync, readFileSync } from 'node:fs';
import { allCases, getCase, isExported, loadManifest, REFERENCES_DIR, type ManifestRaster } from '../../harness/manifest';
import { packDir, sha256Hex } from '../../harness/refs';
import { decodeFloat32LE, decodePGM, type GrayImage } from '../../src/core/raster/pgm';
import { fixtureBytes } from './swiftProbe';

export { decodeFloat32LE, float32BitDifference, rasterHash } from '../../src/core/testing/raster';
export { decodePGM, type GrayImage } from '../../src/core/raster/pgm';
export { fixtureBytes, fixtureText, probeSection, probeValue } from './swiftProbe';

/** `tests/fixtures/<relative>` (optionally .gz) as a PGM image. */
export function fixturePGM(relative: string): GrayImage {
  return decodePGM(fixtureBytes(relative));
}

/** `tests/fixtures/<relative>` (optionally .gz) as little-endian Float32; `expectedCount` is checked if given. */
export function fixtureFloat32(relative: string, expectedCount?: number): Float32Array {
  return decodeFloat32LE(fixtureBytes(relative), expectedCount);
}

/** The directory of the raster dumps: `<REFS_PACK_DIR, else references/pack/<release>>/rasters/` (as in web/harness), with the slash. */
export function rasterPackDir(): string {
  return `${packDir()}rasters/`;
}

/** Whether the dumps are at hand. Tests of pack data take `it.skipIf(!hasRasterPack())`; see harness/README.md for fetching it. */
export function hasRasterPack(): boolean {
  return existsSync(rasterPackDir());
}

/** Ids of the dumped cases in grid order, optionally of one group: 6 `relief`, 21 `text` in refs-v1. */
export function rasterCaseIds(group?: 'relief' | 'text'): string[] {
  return allCases()
    .filter((c) => isExported(c) && c.rasters !== undefined && (group === undefined || c.group === group))
    .map((c) => c.id);
}

/** `<id>.json` of a relief dump (`dumpRasters` in mac/ReferenceExporter/main.swift). */
export interface ReliefDumpMeta {
  readonly case: string;
  readonly style: string;
  /** Artwork size in mm. */
  readonly width: number;
  readonly height: number;
  /** Raster size in pixels. */
  readonly columns: number;
  readonly rows: number;
  readonly bottom: number;
  readonly depth: number;
  readonly diameter: number;
  /** Crest radius per row: `crest[row]`, Swift Doubles. */
  readonly crest: readonly number[];
  readonly blurRadius: { readonly horizontal: number; readonly vertical: number };
  readonly blurVerified: boolean;
  readonly rowOrder: string;
  readonly rawSha256: string;
  readonly fieldSha256: string;
}

/** One relief case. */
export interface ReliefDump {
  readonly meta: ReliefDumpMeta;
  /** The 8-bit CoreGraphics bitmap before the /255 (`<id>.raw.pgm`), `meta.columns` × `meta.rows`. */
  readonly raw: GrayImage;
  /** The height field after the two box blurs (`<id>.field.f32`), `meta.columns · meta.rows` values. */
  readonly field: Float32Array;
}

/** `<id>.json` of a text dump (`dumpRasters` in mac/ReferenceExporter/main.swift). */
export interface TextDumpMeta {
  readonly case: string;
  readonly text: string;
  readonly font: string;
  readonly fontPostScriptName: string;
  /** `system:<name>` for the Apple fonts of refs-v1, `file:<ttf>` for the rerun after WP-R3 (references/PACK.md). */
  readonly fontSource: string;
  readonly antialias: boolean;
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
  /** `CGPath.boundingBoxOfPath`: `Path.pathBounds()`, not `controlBounds()`. */
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly glyphCount: number;
  readonly runs: readonly { readonly font: string; readonly glyphs: readonly number[]; readonly positions: readonly (readonly [number, number])[] }[];
  readonly rowOrder: string;
  readonly sha256: string;
}

/** One text case. */
export interface TextDump {
  readonly meta: TextDumpMeta;
  /** The CoreText mask without antialiasing (`<id>.pgm`): 0 or 255. */
  readonly mask: GrayImage;
}

function verified(bytes: Uint8Array, record: ManifestRaster, what: string): Uint8Array {
  const actual = sha256Hex(bytes);
  if (actual !== record.sha256) throw new Error(`Corrupt raster ${what}: SHA-256 ${actual}, manifest says ${record.sha256}`);
  return bytes;
}

function readDumpFile(id: string, kind: string): Uint8Array {
  const c = getCase(id);
  const record = isExported(c) ? c.rasters?.find((r) => r.kind === kind) : undefined;
  if (record === undefined) throw new Error(`Case ${id} has no ${kind} raster in references/manifest.json`);
  const path = `${rasterPackDir()}${record.name}`;
  if (!existsSync(path)) throw new Error(`${path} is missing: fetch the pack (harness/README.md) and guard the test with it.skipIf(!hasRasterPack())`);
  return verified(new Uint8Array(readFileSync(path)), record, record.name);
}

function dumpMeta<T>(id: string): T {
  return JSON.parse(new TextDecoder().decode(readDumpFile(id, 'json'))) as T;
}

/** Reads and checks one relief case from the pack; throws without the pack. About 11 MB, so load once per test file. */
export function loadReliefDump(id: string): ReliefDump {
  const meta = dumpMeta<ReliefDumpMeta>(id);
  const raw = decodePGM(readDumpFile(id, 'pgm'));
  if (raw.width !== meta.columns || raw.height !== meta.rows) throw new Error(`${id}: bitmap ${raw.width}×${raw.height}, JSON says ${meta.columns}×${meta.rows}`);
  if (meta.crest.length !== meta.rows) throw new Error(`${id}: ${meta.crest.length} crest values for ${meta.rows} rows`);
  return { meta, raw, field: decodeFloat32LE(readDumpFile(id, 'f32'), meta.columns * meta.rows) };
}

/** Reads and checks one text case from the pack; throws without the pack. */
export function loadTextDump(id: string): TextDump {
  const meta = dumpMeta<TextDumpMeta>(id);
  const mask = decodePGM(readDumpFile(id, 'pgm'));
  if (mask.width !== meta.width || mask.height !== meta.height) throw new Error(`${id}: mask ${mask.width}×${mask.height}, JSON says ${meta.width}×${meta.height}`);
  return { meta, mask };
}

/** The manifest declares the primitives, but web/harness has no use for them, so its `Manifest` type leaves them out. */
function primitiveRecords(): ManifestRaster[] {
  return (loadManifest() as unknown as { primitives: ManifestRaster[] }).primitives;
}

function readPrimitiveFile(name: string): Uint8Array {
  const record = primitiveRecords().find((p) => p.name === `primitives/${name}`);
  if (record === undefined) throw new Error(`No primitive file ${name} in references/manifest.json`);
  const path = `${REFERENCES_DIR}files/${record.sha256.slice(0, 2)}/${record.sha256}`;
  return verified(new Uint8Array(readFileSync(path)), record, record.name);
}

/** The 14 calibration canvases, without directory and extension: `circle-r20-gray07`, …, in manifest order. */
export function primitiveNames(): string[] {
  return primitiveRecords()
    .filter((p) => p.kind === 'pgm')
    .map((p) => p.name.slice('primitives/'.length, -'.pgm'.length));
}

/** One 64 × 64 calibration canvas from Tier A (references/files); needs no pack. */
export function loadPrimitive(name: string): GrayImage {
  return decodePGM(readPrimitiveFile(`${name}.pgm`));
}

/** `rasters/primitives/index.json`, every command and number of the canvases; see mac/ReferenceExporter/main.swift for its shape. */
export function loadPrimitiveIndex(): unknown {
  return JSON.parse(new TextDecoder().decode(readPrimitiveFile('index.json')));
}
