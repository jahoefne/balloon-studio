// The one place raster tests read CoreGraphics and CoreText dumps from (WP-R6; contract in tests/fixtures/README.md).
// Node only (node:fs, node:zlib through swiftProbe); the browser run of tests/hashes.test.ts must not import this file.
//
//   Pack, cases with `rasters` in references/manifest.json (guard with `it.skipIf(!hasRasterPack())`):
//     rasterCaseIds('relief' | 'text'), loadReliefDump(id), loadTextDump(id)
//   Committed, no pack:
//     loadTextDump(id, 'ttf'), primitiveNames(), loadPrimitive(name), loadPrimitiveIndex()
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
  /** `system:<name>` for the Apple fonts, `file:<ttf>` for the bundled ones (references/PACK.md). */
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

function dumpRecord(name: string, id: string): ManifestRaster {
  const c = getCase(id);
  const record = isExported(c) ? c.rasters?.find((r) => r.name === name) : undefined;
  if (record === undefined) throw new Error(`Case ${id} has no raster ${name} in references/manifest.json`);
  return record;
}

function readDumpFile(id: string, suffix: string): Uint8Array {
  const record = dumpRecord(`${id}${suffix}`, id);
  const path = `${rasterPackDir()}${record.name}`;
  if (!existsSync(path)) throw new Error(`${path} is missing: fetch the pack (harness/README.md) and guard the test with it.skipIf(!hasRasterPack())`);
  return verified(new Uint8Array(readFileSync(path)), record, record.name);
}

function readCommittedTextDump(id: string, suffix: string): Uint8Array {
  const record = dumpRecord(`${id}${suffix}`, id);
  const relative = `text/${record.name}${record.kind === 'pgm' ? '.gz' : ''}`;
  // The manifest also lists the tokyo dump, which only the local pack has.
  if (!existsSync(new URL(`../fixtures/${relative}`, import.meta.url))) throw new Error(`tests/fixtures/${relative} is not committed`);
  return verified(fixtureBytes(relative), record, record.name);
}

function dumpMeta<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/** Reads and checks one relief case from the pack; throws without the pack. About 11 MB, so load once per test file. */
export function loadReliefDump(id: string): ReliefDump {
  const meta = dumpMeta<ReliefDumpMeta>(readDumpFile(id, '.json'));
  const raw = decodePGM(readDumpFile(id, '.raw.pgm'));
  if (raw.width !== meta.columns || raw.height !== meta.rows) throw new Error(`${id}: bitmap ${raw.width}×${raw.height}, JSON says ${meta.columns}×${meta.rows}`);
  if (meta.crest.length !== meta.rows) throw new Error(`${id}: ${meta.crest.length} crest values for ${meta.rows} rows`);
  return { meta, raw, field: decodeFloat32LE(readDumpFile(id, '.field.f32'), meta.columns * meta.rows) };
}

/**
 * Reads and checks one text case. `'apple'` (default) is the app's own mask from the pack, the one the 3MF export used; it
 * throws without the pack. `'ttf'` is CoreText drawing the bundled fonts, the comparison material for the TS rasterizer,
 * committed under tests/fixtures/text; it needs no pack and has 20 cases (no `text-rounded-tokyo`).
 */
export function loadTextDump(id: string, fonts: 'apple' | 'ttf' = 'apple'): TextDump {
  const read = fonts === 'apple' ? (suffix: string): Uint8Array => readDumpFile(id, suffix) : (suffix: string): Uint8Array => readCommittedTextDump(id, suffix);
  const metaBytes = read(fonts === 'apple' ? '.json' : '.ttf.json');
  const maskBytes = read(fonts === 'apple' ? '.pgm' : '.ttf.pgm');
  const meta = dumpMeta<TextDumpMeta>(metaBytes);
  const mask = decodePGM(maskBytes);
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
